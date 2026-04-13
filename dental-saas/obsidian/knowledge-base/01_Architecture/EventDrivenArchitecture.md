# Event-Driven Architecture

## Purpose
Decouple business operations from side effects using event bus, transactional outbox, and BullMQ queues.

## Components

### Event Bus
- In-memory pub/sub via `eventemitter3`
- Synchronous within same process
- File: `backend/src/core/eventBus.js`

### Transactional Outbox
- Writes events to `EventOutbox` collection inside the same MongoDB transaction
- Guarantees at-least-once delivery even on process crash
- Outbox processor polls and dispatches
- File: `backend/src/core/EventOutbox.model.js`

### BullMQ Queues
- Redis-backed job queues for async work
- Retry with exponential backoff
- Used for: email delivery, heavy processing, scheduled tasks
- Directory: `backend/src/jobs/`

### Domain Events
- Typed event constants
- File: `backend/src/core/domainEvents.js`
- Events: `PATIENT_CREATED`, `PATIENT_DELETED`, `APPOINTMENT_BOOKED`, etc.

## Event Flow
```
Service → emitViaOutbox(EVENT, payload, { session })
    ↓ (same transaction)
EventOutbox.create({ event, payload })
    ↓ (post-commit, outbox processor)
eventBus.emit(EVENT, payload)
    ↓
Listeners/Jobs react
```

## Listeners
- Directory: `backend/src/listeners/`
- Audit log creation
- Notification dispatch
- Counter updates
- Cache invalidation

## Dependencies
- [[DatabaseIsolation]] — Outbox lives in per-org DB
- [[EmailSystem]] — Email delivery via BullMQ
- [[AuditSystem]] — Audit records from event payloads

## Status
**ACTIVE** — Outbox pattern fully deployed

---
#architecture #events #bullmq #outbox
