# **TECHNICAL DESIGN SPECIFICATION (TDS)**

## **Distributed Async & Idempotency Architecture — Dental SaaS Backend**

**Version:** v9.2  
**Status:** Production-Ready  
**Scope:** Backend Infrastructure (Async, Locking, Idempotency, Scaling)

---

# **1. OBJECTIVE**

Design and implement a **Redis-free, horizontally scalable backend** with:

- Deterministic async processing
- Multi-instance safety
- Financial-grade idempotency
- Event-driven architecture
- CI-enforced architectural boundaries

---

# **2. FINAL ARCHITECTURE OVERVIEW**

```
┌──────────────┐
│   HTTP API   │
└──────┬───────┘
       │
       ▼
┌──────────────────────────────┐
│ 1. SYNC (in-request logic)   │
└────────────┬─────────────────┘
             │
             ▼
┌──────────────────────────────┐
│ 2. INTERNAL ASYNC            │
│ EventBus + Outbox (Mongo)    │
└────────────┬─────────────────┘
             │
             ▼
┌──────────────────────────────┐
│ 3. EXTERNAL ASYNC            │
│ QStash (HTTP-based jobs)     │
└──────────────────────────────┘
```

---

# **3. CORE SYSTEM COMPONENTS**

---

## **3.1 Outbox Pattern (Internal Async)**

### Purpose

Guarantee **at-least-once event delivery** across crashes and multi-instance environments.

### Implementation

- Mongo collection: `Outbox`
- Worker: `outbox.worker.js`
- Poll-based (intentional, annotated)

### Key Features

- Atomic claim:

```javascript
await Outbox.findOneAndUpdate(
  { status: "pending" },
  {
    $set: {
      status: "processing",
      lockedBy: INSTANCE_ID,
      lockedAt: new Date()
    }
  },
  { new: true }
);
```

- Crash recovery:

```javascript
reclaimStuckProcessing();
```

- States:

```
pending → processing → processed / failed
```

---

## **3.2 Distributed Lock (Mongo-based)**

### File

```
src/utils/DistributedLock.js
```

### Purpose

Replace Redis locks with **multi-instance safe locking**

### API (unchanged)

```javascript
await acquire(key, ttlMs)
await release(key, token)
await publish(channel, payload)
await subscribeWithTimeout(channel, timeoutMs)
```

### Implementation

#### Lock

```javascript
findOneAndUpdate(
  {
    key,
    $or: [
      { expiresAt: { $lt: now } },
      { expiresAt: { $exists: false } }
    ]
  },
  {
    $set: { token, expiresAt }
  },
  { upsert: true }
);
```

#### Release

```javascript
deleteOne({ key, token });
```

---

## **3.3 Change Streams (Phase C)**

### Purpose

Replace polling for pub/sub with **real-time Mongo streams**

### Behavior

- Primary mode: Change Stream
- Fallback: polling (non-replica environments)

### Example

```javascript
Model.watch([{ $match: { operationType: "insert" } }])
```

### Features

- Lazy initialization
- Auto-recovery on failure
- No API change
- ~70ms latency vs 200ms polling

---

## **3.4 QStash Integration (External Async)**

### Purpose

External job execution without queues

### Publisher

```
async.handler.js
```

### Receiver

```
job.controller.js
```

---

## **3.5 Job Idempotency (Phase E.5)**

### BEFORE ❌

```javascript
const processedMessages = new Map();
```

### AFTER ✅

```javascript
await IdempotencyKey.create({
  key: messageId,
  scope: "qstash",
  status: "in-flight"
});
```

### Flow

```
Receive Job
   ↓
Check IdempotencyKey
   ↓
[exists] → replay OR reject
[not exists] → claim
   ↓
Execute Job
   ↓
Mark completed OR delete on failure
```

---

## **3.6 HTTP Idempotency (Refunds)**

### File

```
refund.service.js
```

### Key Source

```
Idempotency-Key (HTTP header)
```

### Flow

```javascript
const key = req.headers["idempotency-key"];
const existing = await IdempotencyKey.findOne({ key });

if (existing) return existing.response;
```

---

## **3.7 IdempotencyKey Model**

```javascript
{
  key: String (unique),
  scope: String,
  organizationId: String,
  status: ["in-flight", "completed", "failed"],
  response: {
    statusCode: Number,
    body: Object
  },
  createdAt: Date (TTL: 24h)
}
```

---

## **3.8 Optimistic Concurrency (OAV)**

### Used in:

```
ledger.orchestrator.service.js
```

### Pattern

```javascript
updateOne(
  { _id, version: expectedVersion },
  { $inc: { version: 1 } }
);
```

### Guarantee

- Prevents concurrent writes
- Stronger than status-based checks

---

# **4. ARCHITECTURAL GUARANTEES**

---

## **4.1 Multi-Instance Safety**

|Layer|Protection|
|---|---|
|Locks|Mongo CAS|
|Events|Outbox atomic claim|
|Jobs|IdempotencyKey|
|Writes|OAV|

---

## **4.2 Idempotency Coverage**

|Layer|Mechanism|
|---|---|
|HTTP|Idempotency-Key|
|Jobs|QStash message ID|
|Events|Outbox|
|Ledger|OAV|

---

## **4.3 No Redis Dependency**

- All Redis removed
- Boot fails if Redis env detected
- No BullMQ / ioredis

---

# **5. CI ENFORCED RULES**

---

## **5.1 Polling Annotation**

```javascript
// ALLOWED_POLLING: OUTBOX
```

---

## **5.2 Async Boundary**

- Only `async.handler.js` can call QStash

---

## **5.3 Lock Usage**

- Only allowed services can import DistributedLock

---

## **5.4 Idempotency Coverage**

- Critical services must use:
    - `ensureIdempotent`
    - or IdempotencyKey
- New gaps → CI FAIL

---

# **6. DATA FLOW EXAMPLES**

---

## **6.1 Refund Request**

```
Client → POST /refund
       → IdempotencyKey check
       → Process refund (transaction)
       → Store result
```

---

## **6.2 QStash Job**

```
QStash → job.controller
        → IdempotencyKey claim
        → Execute
        → Mark completed
```

---

## **6.3 Event Processing**

```
Service → Outbox
        → Worker polls
        → Claim event
        → Execute
```

---

# **7. KNOWN DEFERRED ITEMS**

|Area|Reason|
|---|---|
|invoice.service|needs DB unique index|
|quotation.orchestrator|uncommitted WIP|
|clinicBillingSettings|uncommitted WIP|
|refund.routes|optional|

---

# **8. NON-GOALS**

- No Redis
- No BullMQ
- No distributed queue system
- No forced global idempotency

---

# **9. RESULT**

The system achieves:

- Stateless horizontal scaling
- Financial-safe operations
- Deterministic async behavior
- Crash-safe processing
- CI-enforced architecture

---

# **10. SUMMARY**

This architecture replaces:

```
Redis + BullMQ + Queue Workers
```

With:

```
Mongo + Outbox + QStash + IdempotencyKey + DistributedLock
```

Resulting in:

- Simpler infra
- Stronger guarantees
- Lower operational cost
- Full scalability

---