# 🧠 TDS — DEEP FORENSIC ARCHITECTURE AUDIT
## Module: Orthodontic Domain | Date: 2026-04-11
## Depth: CRITICAL (Production Readiness)

---

## EXECUTIVE SUMMARY

| Section | Title | Verdict |
|---------|-------|---------|
| S1 | Source of Truth Validation | ⚠️ PARTIAL PASS — dual hydration paths, localStorage shadow |
| S2 | Snapshot Determinism | ❌ FAIL — non-deterministic fallback IDs in replay |
| S3 | Event Flow Purity | ⚠️ PARTIAL PASS — debond bypasses dispatcher |
| S4 | Event Schema Consistency | ⚠️ PARTIAL PASS — logEvent fire-and-forget breaks audit guarantee |
| S5 | Undo / Redo Guarantee | ❌ FAIL — TAD undo does not roll back DB; in-memory only |
| S6 | RecordSet Architecture | ❌ FAIL — embedded in case blob, no snapshot linkage, no versioning |
| S7 | Temporal Consistency | ✅ PASS — sequence-based time travel implemented correctly |
| S8 | Visit Lifecycle Integrity | ⚠️ PARTIAL PASS — visits closable without snapshot |
| S9 | Data Lineage Traceability | ✅ PASS — full chain exists across events, snapshots, visits |
| S10 | Multi-Tenant Isolation | ✅ PASS — enforceDbIsolation + req.context consistent |
| S11 | React Architecture Sanity | ❌ FAIL — 4780-line god component, 18+ useEffects |
| S12 | Failure Mode Simulation | ⚠️ PARTIAL PASS — bonding has no reducer rollback on API failure |

**Overall System Grade: NOT PRODUCTION-READY as-is. 3 CRITICAL issues block clinical truth guarantees.**

---

---

## SECTION 1 — SOURCE OF TRUTH VALIDATION

### Verdict: ⚠️ PARTIAL PASS

### What Works
The backend `clinicalReducer.js` is correctly declared pure — no DB calls, no logging, no side effects. The frontend `chartReducer.ts` mirrors this. The `dispatchClinicalAction` pipeline enforces the correct order: duplicate-check → `onApply` (reducer) → `onCommit` (API, fire-and-forget). React Query cache is used for server state; `useState` is not used to hold API response data directly.

### Issues Found

**ISSUE 1-A — DUAL HYDRATION PATHS OVERWRITE REDUCER (MEDIUM)**

File: `frontend/src/org/modules/patients/components/orthodontic-chart/components/SnapshotEditor.tsx`
Lines: 568–613 (HYDRATE_TADS), 614–700 (HYDRATE_TEETH)

Two `useEffect` hooks run whenever React Query delivers fresh data and inject into the reducer via `HYDRATE_TADS` and `HYDRATE_TEETH`. This means **DB changes can overwrite in-progress user edits** if React Query refetches mid-session.

The TAD hydration guard `if (isSnapshotMode) return;` mitigates this during snapshot viewing, but during a live edit session, a background refetch can silently clobber unsaved tooth state. The fingerprint check (`JSON.stringify` diff) reduces noise but doesn't eliminate the race.

```
Root cause: React Query staleTime is 30–60s, not Infinity.
            A mutation that triggers invalidateQueries fires a refetch
            that competes with the in-flight reducer state.
```

**Fix:** Set `staleTime: Infinity` on TAD and bonding queries for the duration of an active visit session. Invalidate only on explicit save, not continuously.

---

**ISSUE 1-B — LOCALSTORAGE AS SHADOW SOURCE OF TRUTH (HIGH)**

File: `SnapshotEditor.tsx`
Lines: 720–740 (notes draft), 754–767 (chart_draft), 840–848 (draft recovery on mount)

Three separate localStorage keys act as a third source of truth:
- `visit_notes_draft_{visitId}` — notes crash recovery
- `chart_draft_{caseId}` — full chart state crash recovery
- Onboarding seen flag

The chart draft restoration path (line 840–848) applies `HYDRATE_SNAPSHOT` from localStorage if no server snapshot exists. This means **a stale browser draft can silently become the clinical starting state for a new session**, bypassing the event replay engine entirely.

```
Fail condition: Doctor opens case on new device → no localStorage draft →
                event replay runs. Same doctor opens on same device →
                localStorage draft overrides event replay.
                → SAME INPUT, DIFFERENT CLINICAL STATE.
```

**Fix:** localStorage crash recovery must be presented as a "draft recovery" modal for explicit user confirmation (similar to the existing `DraftRecoveryModal` component), NEVER applied silently. The current `DraftRecoveryModal` exists but only for `VisitDraft`, not for chart state.

---

**ISSUE 1-C — REDUCER SYNC COMMENT RELIES ON CONVENTION (MEDIUM)**

File: `backend/src/modules/orthodontics/shared/clinicalReducer.js`
Lines: 14–17

The comment states:
> "The frontend mirrors this in `frontend/src/org/.../utils/clinicalReducer.ts`. Any logic change MUST be applied to BOTH files simultaneously. They are kept in sync by **convention** — there is no automated sync mechanism."

Two canonical reducers existing in different runtimes without automated parity checks is a drift risk. A backend event schema change that isn't reflected in the frontend reducer will cause state divergence after replay.

**Fix:** Introduce a shared TypeScript/JSON schema file or an automated test that replays the same event list through both reducers and asserts identical output.

---

---

## SECTION 2 — SNAPSHOT DETERMINISM

### Verdict: ❌ FAIL

### What Works
`ClinicalSnapshot` has `chartStateHash` (SHA-256 fingerprint) for idempotency. `bondingSnapshot` and `tadSnapshot` are captured point-in-time at save. The `eventOffset` enables O(k) replay from checkpoint. `chartState` is stored as `Mixed` for flexibility.

### Critical Issue Found

**ISSUE 2-A — NON-DETERMINISTIC FALLBACK IDs BREAK REPLAY IDEMPOTENCY (CRITICAL)**

File: `backend/src/modules/orthodontics/shared/clinicalReducer.js`
Lines: 202, 222, 240, 256, 271, 285, 296, 311

In every "ADDED/APPLIED/INSERTED" handler, when the payload lacks a stable ID, the reducer falls back to:

```javascript
id: elasticId ?? `replay-${Date.now()}`
id: chainId  ?? `replay-${Date.now()}`
id: accId    ?? `replay-${Date.now()}`
// etc.
```

`Date.now()` is non-deterministic. If the same event is replayed twice (valid under the idempotency contract), each replay generates a **different local ID**. The in-memory idempotency check (`seenEventIds.has(event.eventId)`) in `replayEvents()` prevents double-application within a single replay session, but it does not protect against cross-session divergence.

**Reproduce:**
1. Apply `ELASTIC_APPLIED` event with no `_id` in payload
2. Load snapshot A → replay → elastic gets id `replay-1713808000000`
3. Reload snapshot A in a new session → elastic gets id `replay-1713808000001`
4. Compare states → IDs differ → snapshot is NOT deterministic

**Root cause:** The payload `_id` or `actionId` is the stable identifier. These must be guaranteed to exist for all events persisted to the DB. The `replay-${Date.now()}` fallback should **throw or warn**, never silently assign.

**Fix:** In `clinicalEvent.service.js` (at write time), validate that all "ADDED" event payloads carry a stable `_id` or `actionId` before persistence. Remove the `Date.now()` fallback from the reducer; replace with an explicit error or no-op.

---

**ISSUE 2-B — chartStateHash USES NON-STABLE KEY ORDER (MEDIUM)**

File: `backend/src/modules/orthodontics/core/services/snapshot.service.js`
Lines: ~92–97

```javascript
const sorted = JSON.stringify(chartState, Object.keys(chartState ?? {}).sort());
```

`Object.keys(chartState).sort()` sorts only the top-level keys. Nested objects (e.g., individual tooth objects in `upperTeeth[]`) retain arbitrary insertion-order key ordering. Two semantically identical chart states with different key orders in nested objects will produce **different SHA-256 hashes**, causing false "duplicate snapshot" misses.

**Fix:** Use a deep, recursive key-sorted serializer (e.g., `json-stable-stringify` library) for hash computation.

---

---

## SECTION 3 — EVENT FLOW PURITY

### Verdict: ⚠️ PARTIAL PASS

### What Works
TAD insertion correctly flows through `dispatchClinicalAction` with `onApply` (reducer) running before `onCommit` (API). `dispatchClinicalAction` is the documented single entry point. Duplicate detection is applied at dispatch time.

### Issues Found

**ISSUE 3-A — DEBOND BYPASSES DISPATCHER (HIGH)**

File: `SnapshotEditor.tsx`
Lines: 1682, 1709

```javascript
debondMutation.mutate(...)  // called directly, not via dispatchClinicalAction
```

The debond operation calls `useMutation` directly from UI event handlers without passing through `dispatchClinicalAction`. This means:
- No duplicate-action check
- No structured logging via `logAction`
- Reducer update happens through React Query cache invalidation → HYDRATE_TEETH refetch (DB-driven), not through an explicit reducer dispatch before the API call
- The mutation pattern is: **API first → cache invalidates → reducer is hydrated from DB response**. This is the **inverse** of the required flow (reducer first, API second).

```
Required flow: UI → dispatch → reducer → API → confirm
Actual flow:   UI → API → (success) → invalidateQueries → HYDRATE_TEETH (DB-driven)
```

**Fix:** Wrap debond in `dispatchClinicalAction` with an explicit `SET_TOOTH_STATUS` reducer dispatch in `onApply` and the `debondMutation.mutateAsync()` in `onCommit`.

---

**ISSUE 3-B — BONDING APPLY HAS NO REDUCER ROLLBACK ON API FAILURE (HIGH)**

File: `SnapshotEditor.tsx`
Lines: 1816, 2730, 4327

```javascript
await bondingEngine.applyBonding({ ... }).catch(...)
```

The bonding apply flow updates the reducer optimistically (via `SET_TOOTH_BONDING` dispatches in the bonding action handler) but if `bondingEngine.applyBonding()` fails, there is no rollback dispatch. The reducer retains the "bonded" state while the DB has no record of the bonding. On next session/refresh, DB hydration (HYDRATE_TEETH) will reset the tooth to `healthy`, creating a **silent state divergence** visible only after a reload.

Compare to TAD insertion which correctly does:
```javascript
await createTadMutation.mutateAsync({ ... }).catch((err) => {
  dispatch({ type: 'REMOVE_TAD', payload: tempId }); // ✅ rollback
});
```

**Fix:** Add explicit reducer rollback to bonding apply and debond mutation error handlers.

---

---

## SECTION 4 — EVENT SCHEMA CONSISTENCY

### Verdict: ⚠️ PARTIAL PASS

### What Works
All events carry: `type` (enum-validated), `payload` (object), `eventId` (UUID, unique index), `sequence` (atomic monotonic), `version` (for migration), `createdBy` (actorId), `visitId`, `doctorId`, `organizationId`, `caseId`. Schema is well-typed. `upgradeEvent()` exists for future version migration.

### Issues Found

**ISSUE 4-A — logEvent IS FIRE-AND-FORGET: AUDIT TRAIL NOT GUARANTEED (CRITICAL)**

File: `backend/src/modules/orthodontics/services/clinicalEvent.service.js`
Lines: 45–100

```javascript
// Callers MUST NOT await this function
async function logEvent(req, event) { ... }
```

The non-blocking `logEvent()` path is used for most clinical mutations. If the MongoDB write fails (network blip, disk full, transient error), the function returns `null` silently. The state mutation has already been applied to the DB (bonding, TAD record written), but **the ClinicalEvent audit record is missing**.

This means:
- Event replay will produce incorrect state (missing events)
- Audit trail has silent gaps
- Temporal consistency is broken for cases where logEvent silently failed

The blocking `logEventSync()` path exists and is correct, but it is only used in specific paths. Most mutations use `logEvent`.

**Fix:** For all clinical state mutations (bonding, TAD, archwire, elastic), use `logEventSync()` inside the same transaction as the state write. `logEvent` (fire-and-forget) is only acceptable for informational/non-state events like `NOTE_ADDED`.

---

**ISSUE 4-B — EVENTS ARE NOT REVERSIBLE (MEDIUM)**

The event schema has no inverse-event mechanism. There is no `ELASTIC_REMOVED_UNDO` or event-sourced rollback. The undo system is in-memory state snapshots (`historyRef`), not event-based. This means:

- Events cannot be used to reconstruct undo history after a page reload
- The audit trail shows "what happened" but cannot mechanically derive "what it was before"

This is a design trade-off, not necessarily wrong, but it means **clinical undo is session-scoped only** and the event log cannot serve as a full rollback mechanism.

**Fix (recommendation):** Accept this trade-off but document it explicitly. Alternatively, add `previousState` fields to mutation payloads to enable event-based undo reconstruction.

---

---

## SECTION 5 — UNDO / REDO GUARANTEE

### Verdict: ❌ FAIL

### What Works
In-memory undo (historyRef, capped at 20) exists and works for most chart state. TAD undo intentionally excludes miniscrews because DB is their SSOT — documented correctly. Undo stack is cleared on snapshot hydration to prevent bleed-through.

### Critical Issue Found

**ISSUE 5-A — TAD UNDO DOES NOT ROLL BACK THE DATABASE (CRITICAL)**

File: `SnapshotEditor.tsx`
Lines: 1179–1207

```javascript
const undo = () => {
  const previousState = historyRef.current[historyRef.current.length - 1];
  dispatch({ type: 'HYDRATE_SNAPSHOT', payload: {
    // NOTE: miniscrews intentionally excluded
    upperTeeth, lowerTeeth, elastics, ...
  }});
};
```

When a user:
1. Inserts a TAD → reducer adds it optimistically, DB write fires
2. Immediately presses Undo

The reducer state reverts to pre-TAD state. But the `createTadMutation` API call may have already succeeded, persisting the TAD in MongoDB. The next `useEffect` hydration cycle will **re-add the TAD to the chart** from the DB, undoing the undo.

This is documented as intentional ("DB is SSOT for TADs") but it means **TAD insertion is not undoable from the user's perspective** — a fundamental clinical workflow problem.

**Fix:** `undo()` must fire a delete mutation for the TAD in the DB when undoing a TAD insert. This requires tracking "what was the last TAD action" in the undo stack alongside the chart state snapshot.

---

**ISSUE 5-B — UNDO HISTORY IS NON-PERSISTENT (MEDIUM)**

Undo state lives in `historyRef` (a React ref). On page reload, tab close, or browser crash, the entire undo history is lost. The system then restores from the latest snapshot (correct), but any unsaved intermediate states since the snapshot are unrecoverable.

The localStorage chart draft provides partial crash recovery but is not equivalent to a full undo stack.

**Fix (acceptable trade-off):** This behavior is acceptable if clearly communicated to users. Add a UI indicator showing that undo history resets on reload.

---

---

## SECTION 6 — RECORDSET ARCHITECTURE

### Verdict: ❌ FAIL

### Root Cause

RecordSets are NOT independent aggregates. They are embedded sub-arrays inside the `OrthodonticCase.workflowData` Mixed field.

**File:** `backend/src/modules/orthodontics/models/orthodonticCase.model.js`
```javascript
workflowData: {
    recordSets: { type: [recordSetSchema], default: [] },
}
```

**ISSUE 6-A — RECORDSETS STORED IN CASE BLOB, NOT INDEPENDENT COLLECTION (CRITICAL)**

RecordSets live inside `workflowData.recordSets[]` as a sub-array on the case document. This violates the expected architecture:

- ❌ No independent collection → no independent querying, indexing, or access control
- ❌ No `snapshotId` linkage per RecordSet → no 1:1 baseline relationship with clinical snapshots
- ❌ No versioning → cannot track RecordSet changes over time
- ❌ The `migrateCastAnalysis.js` migration script further embeds `castAnalysis` into `workflowData.recordSets[idx].castAnalysis`, deepening the coupling

The export controller (`exportCase.controller.js` line 65, 137) reads `snapshot.recordSets` which doesn't exist on `ClinicalSnapshot` — RecordSets live on the **case**, not the snapshot. This creates a logical inconsistency: a snapshot's export includes RecordSets that may have been added after the snapshot was taken.

**Fix:** Extract RecordSets to their own MongoDB collection with:
```
RecordSet {
  _id, organizationId, caseId, snapshotId (nullable),
  type: 'PRE' | 'MID' | 'POST',
  version: Number,
  records: PhotoRecord[],
  castAnalysis: {...},
  createdAt, createdBy
}
```

---

---

## SECTION 7 — TEMPORAL CONSISTENCY

### Verdict: ✅ PASS

### What Works

The system has a complete and correct time-travel implementation:

- `buildStateFromEvents(req, caseId, { until })` replays events up to any timestamp
- `getStateAtEvent(req, caseId, eventId)` replays to any specific event by sequence number
- `sequence` is atomically incremented (CaseSequence counter) — no ties, no gaps under concurrency
- `eventOffset` on snapshots enables O(k) delta replay (only events after checkpoint)
- `replayEvents()` is pure, deterministic, and idempotent (seenEventIds set)
- Pre-Phase 5.1 events (`sequence: null`) sort before sequenced events — legacy fallback documented

### Minor Concern

**ISSUE 7-A — createdAt-BASED FALLBACK IS STILL REFERENCED IN DUAL LOCATIONS (LOW)**

`clinicalEvent.service.js` `getEventsAfterSnapshot()` still sorts by `createdAt: 1`, while `eventReplay.service.js` `getEventsAfterSnapshot()` sorts by `sequence: 1`. Two implementations of the same conceptual function exist in different files. The service layer one uses `createdAt`, the replay layer one uses `sequence`. This creates a risk of using the wrong sort in the wrong context.

**Fix:** Deprecate `clinicalEvent.service.js:getEventsAfterSnapshot()`. All replay fetching should go through `eventReplay.service.js`.

---

---

## SECTION 8 — VISIT LIFECYCLE INTEGRITY

### Verdict: ⚠️ PARTIAL PASS

### What Works
- `visitId` REQUIRED on all events (hard guard in both `logEvent` and `logEventSync`) ✅
- Only ONE active visit allowed per case: service guard + partial unique DB index ✅
- Visit lock with heartbeat (30s interval) and auto-expiry (2min) ✅
- Takeover mechanism for admin users ✅
- `visitId` field on `ClinicalSnapshot` links snapshots to visits ✅

### Issues Found

**ISSUE 8-A — VISIT CAN CLOSE WITHOUT SNAPSHOT (HIGH)**

File: `backend/src/modules/orthodontics/services/visitSession.service.js`
Lines: ~155–175

```javascript
if (!hasSnapshot) {
    logger.warn({ ... }, "Visit closed without any linked snapshot");
    // DOES NOT THROW — visit is closed anyway
}
```

A visit can be completed with no clinical data recorded. This creates a `VisitRecord` with `status: "completed"` and `snapshotId: null` (the original placeholder ObjectId). The placeholder is never replaced if no snapshot was saved.

The VisitRecord model allows `snapshotId: null` by design, but a completed visit with null snapshotId is a silent data gap in the clinical record.

**Fix:** At minimum, enforce that `endVisit()` requires either a `snapshotId` parameter OR explicit `{ noSnapshot: true }` acknowledgment flag. For the latter case, log a higher-severity audit event (`severity: "critical"`).

---

**ISSUE 8-B — COMPACTION SNAPSHOTS NOT LINKED TO VISITS (LOW)**

Auto-compaction snapshots (type: `"compaction"`) are created by `autoCompactIfNeeded()` with no `visitId`. They correctly set `isActiveVersion: false` and create no VisitRecord. However, the `ClinicalSnapshot` schema marks `visitId` as optional (`default: null`), meaning any code that assumes all snapshots have a visitId will fail silently for compaction snapshots.

**Fix:** Document compaction as a system-type snapshot and add a guard in any code that joins snapshot → visit that explicitly handles `null` visitId.

---

---

## SECTION 9 — DATA LINEAGE TRACEABILITY

### Verdict: ✅ PASS

### Full Chain Verified

```
PatientId → OrthodonticCase → VisitRecord → ClinicalSnapshot → ClinicalEvent[]
                                                ↓
                                         bondingSnapshot[]
                                         tadSnapshot[]
                                         diagnosticData{}
                                         chartState{}
                                         createdBy (userId)
                                         organizationId
```

Each ClinicalEvent carries: `organizationId`, `caseId`, `visitId`, `doctorId`, `createdBy`, `eventId` (UUID), `sequence`, `version`, `type`, `payload`, `metadata.toothId`.

Each ClinicalSnapshot carries: `organizationId`, `caseId`, `visitId`, `type`, `snapshotDate`, `createdBy`, `version`, `eventOffset`, `chartStateHash`.

### Minor Concern

**ISSUE 9-A — PRE-MIGRATION CastAnalysis ORPHANS MAY EXIST (LOW)**

The `migrateCastAnalysis.js` migration moved standalone `CastAnalysis` collection documents into `workflowData.recordSets[].castAnalysis`. Cases that existed before this migration and were not processed will have orphaned `CastAnalysis` documents in the DB that are no longer accessible through the current read path.

**Fix:** Verify the migration ran for all cases. Add a diagnostic script that checks for orphaned `CastAnalysis` documents not referenced from any case's RecordSet.

---

---

## SECTION 10 — MULTI-TENANT ISOLATION

### Verdict: ✅ PASS

### Verification

All services consistently apply:

```javascript
// Pattern verified in: bonding.service.js, tad.service.js,
// visitSession.service.js, clinicalEvent.service.js,
// eventReplay.service.js, snapshot.service.js

enforceDbIsolation(req);                         // ✅ throws if dbConnection missing
getModel(req.dbConnection, ModelDefinition);     // ✅ per-org connection
organizationId: req.context.organizationId       // ✅ from JWT, never from body
```

The `enforceDbIsolation` guard throws early if `req.dbConnection` is absent, preventing cross-org DB access. The `organizationId` is consistently sourced from `req.context` (JWT-derived) and never from `req.body` or route params — confirmed across all audited controllers and services.

The `bonding.service.js` accepts `context` as a parameter (from `req.context` at controller level) — this is one layer of indirection but is still correctly sourced from the JWT.

No cross-org joins were found.

---

---

## SECTION 11 — REACT ARCHITECTURE SANITY

### Verdict: ❌ FAIL

### Critical Issues Found

**ISSUE 11-A — SNAPSHOTED.TSX IS 4780 LINES — 2.4× THE HARD LIMIT (CRITICAL)**

File: `frontend/src/org/modules/patients/components/orthodontic-chart/components/SnapshotEditor.tsx`

At **4780 lines**, this is the single largest and most complex component in the system. It combines:
- Clinical chart rendering (UI)
- Phase 1 + Phase 2 hydration logic (data fetching)
- Undo/redo management (state engine)
- TAD, bonding, elastic, archwire, IPR, space marker actions (mutation logic)
- Visit session lifecycle (session management)
- Draft auto-save with localStorage (crash recovery)
- Lock management with heartbeat (concurrency)
- Multi-tab detection via BroadcastChannel (real-time)
- Time travel mode (replay engine integration)
- Snapshot history navigation (read-only view)
- Onboarding flow (UX)

This violates the Rules Engine requirement for separation of concerns and is a maintainability and correctness risk. Bugs in any one concern can silently affect others.

**18 `useEffect` hooks** control overlapping state. Multiple effects dispatch `HYDRATE_SNAPSHOT`:
- Phase 1 fast hydration (line ~888)
- Phase 2 derived-state upgrade (line ~907–945)
- Time travel hydration (line ~968)
- Draft recovery on mount (line ~848)
- Snapshot mode toggle (line ~867)
- Restore from snapshot history (line ~2493)
- Multiple action-specific dispatches (lines 3424, 4433, 4530)

**Fix:** Extract into focused modules:
- `useClinicalHydration` — Phases 1 & 2 hydration effects
- `useUndoHistory` — historyRef + undo/redo
- `useVisitSession` — lock, heartbeat, multi-tab
- `useDraftRecovery` — localStorage crash recovery
- `ClinicalActionHandlers` — TAD, bonding, elastic, archwire handlers
- `SnapshotEditor` — UI shell only (< 500 lines)

---

**ISSUE 11-B — BROADCASTCHANNEL CREATED INLINE (RULES ENGINE VIOLATION) (HIGH)**

File: `SnapshotEditor.tsx`
Lines: 799–815

```javascript
channel = new BroadcastChannel(CHANNEL_NAME);  // ❌ new BroadcastChannel() outside singleton
```

**Rules Engine Rule 12.1** explicitly forbids creating `new BroadcastChannel(...)` outside the designated singleton at `@/lib/realtime/planChannel.js`. This pattern creates an unregistered, unsupervised channel that bypasses the Zero-Trust event validation flow (Rule 12.4: `receive → validate type → invalidateQueries → API refetch`).

**Fix:** Extend the BroadcastChannel singleton to support case-scoped channels, or use the existing socket-based `emitToOrg` infrastructure for multi-tab signals.

---

**ISSUE 11-C — OrthoRecordsTab.tsx IS 1793 LINES (MEDIUM)**

File: `frontend/src/.../components/cases/OrthoRecordsTab.tsx`

At 1793 lines, this component is approaching the same god-component anti-pattern. RecordSet management, photo upload, photo editing, compare mode, and print layout are all co-located.

---

---

## SECTION 12 — FAILURE MODE SIMULATION

### Verdict: ⚠️ PARTIAL PASS

### Simulation Results

**Scenario 1 — API Down**
- TAD insert: ✅ Optimistic reducer update proceeds; DB failure triggers rollback dispatch (`REMOVE_TAD`)
- Bonding apply: ❌ Optimistic reducer update proceeds; DB failure is caught but **no reducer rollback** — state diverges until next session refresh
- Notes autosave: ✅ localStorage backup catches unsaved notes via `beforeunload` handler
- Snapshot save: ✅ MongoDB transaction ensures atomic snapshot + VisitRecord creation; failure leaves no partial state

**Scenario 2 — Socket Disconnected**
- `emitToOrg()` is already fire-and-forget with `.catch(() => {})` ✅
- Real-time presence (visit.presence.joined.v1) degrades gracefully ✅
- Multi-tab BroadcastChannel is local-only and unaffected by socket state ✅

**Scenario 3 — Partial Save Failure**
- Snapshot save uses `req.dbConnection.startSession()` (org-scoped transaction) ✅
- `bondingSnapshot` and `tadSnapshot` are read BEFORE the transaction and may be slightly stale if a concurrent mutation occurs between the pre-read and the transaction commit — acceptable window

**Scenario 4 — Duplicate Events**
- DB level: `eventId` unique index rejects duplicates ✅
- Replay level: `seenEventIds` Set in `replayEvents()` skips duplicates ✅
- `logEvent` returns `null` on duplicate (no throw) ✅

---

---

## FINAL FINDINGS REGISTER

| ID | Severity | Section | File | Issue |
|----|----------|---------|------|-------|
| F-01 | 🔴 CRITICAL | S2 | `clinicalReducer.js` | `replay-${Date.now()}` fallback IDs make snapshots non-deterministic |
| F-02 | 🔴 CRITICAL | S4 | `clinicalEvent.service.js` | `logEvent` fire-and-forget silently drops audit events on failure |
| F-03 | 🔴 CRITICAL | S5 | `SnapshotEditor.tsx` | TAD undo does not roll back DB — undo is cosmetically broken for TADs |
| F-04 | 🔴 CRITICAL | S6 | `orthodonticCase.model.js` | RecordSets embedded in case blob — no snapshot linkage, no versioning |
| F-05 | 🔴 CRITICAL | S11 | `SnapshotEditor.tsx` | 4780-line god component — 18+ useEffects control overlapping state |
| F-06 | 🔥 HIGH | S1 | `SnapshotEditor.tsx` | localStorage chart draft silently hydrates chart without user confirmation |
| F-07 | 🔥 HIGH | S3 | `SnapshotEditor.tsx` | `debondMutation.mutate()` bypasses `dispatchClinicalAction` — API-first flow |
| F-08 | 🔥 HIGH | S3 | `SnapshotEditor.tsx` | Bonding apply has no reducer rollback on API failure |
| F-09 | 🔥 HIGH | S8 | `visitSession.service.js` | Visits closable without snapshot — silent clinical record gap |
| F-10 | 🔥 HIGH | S11 | `SnapshotEditor.tsx` | `new BroadcastChannel()` inline violates Rules Engine Rule 12.1 |
| F-11 | ⚠️ MEDIUM | S1 | `clinicalReducer.js` | Dual reducer (backend + frontend) synced by convention only — no parity test |
| F-12 | ⚠️ MEDIUM | S1 | `SnapshotEditor.tsx` | React Query refetch can overwrite in-progress reducer state during live edit |
| F-13 | ⚠️ MEDIUM | S2 | `snapshot.service.js` | `chartStateHash` uses shallow key sort — nested objects produce inconsistent hashes |
| F-14 | ⚠️ MEDIUM | S4 | `ClinicalEvent.model.js` | Events not reversible — undo is session-scoped only, no event-based rollback |
| F-15 | ⚠️ MEDIUM | S11 | `OrthoRecordsTab.tsx` | 1793-line component approaching god-component threshold |
| F-16 | 🔵 LOW | S7 | `clinicalEvent.service.js` | Duplicate `getEventsAfterSnapshot` with different sort — risk of wrong path |
| F-17 | 🔵 LOW | S8 | `ClinicalSnapshot.model.js` | Compaction snapshots have null visitId — consumers must handle explicitly |
| F-18 | 🔵 LOW | S9 | `migrateCastAnalysis.js` | Pre-migration CastAnalysis orphans may exist in older cases |

---

## REFACTOR PRIORITY QUEUE

### P0 — Block Releases (Clinical Truth at Risk)

1. **F-01**: Remove `replay-${Date.now()}` from `clinicalReducer.js`. Enforce stable IDs at event write time in `clinicalEventService`.
2. **F-02**: Convert all clinical state mutations to use `logEventSync()` inside transactions. Reserve `logEvent` for non-state events only.
3. **F-03**: Add DB rollback (TAD delete mutation) to the `undo()` function when the last action was a TAD insert.
4. **F-06**: Gate localStorage chart draft behind `DraftRecoveryModal` — never apply silently.

### P1 — High Priority (Consistency and Correctness)

5. **F-04**: Extract RecordSets to their own MongoDB collection with `snapshotId` linkage and versioning.
6. **F-07**: Wrap `debondMutation` in `dispatchClinicalAction` pattern with reducer-first dispatch.
7. **F-08**: Add explicit reducer rollback dispatch to bonding apply failure handler.
8. **F-09**: Enforce `snapshotId` requirement in `endVisit()` or require explicit `noSnapshot` acknowledgment.
9. **F-10**: Replace inline `new BroadcastChannel()` with org socket infrastructure or registered singleton.

### P2 — Medium Priority (Architecture Debt)

10. **F-05**: Decompose `SnapshotEditor.tsx` into purpose-scoped hooks and sub-components.
11. **F-11**: Introduce automated parity test for backend/frontend `clinicalReducer` — same events → same output.
12. **F-12**: Set `staleTime: Infinity` on TAD/bonding queries during active visit to prevent mid-session clobber.
13. **F-13**: Replace `JSON.stringify(chartState, keys.sort())` with deep key-sorted serializer for `chartStateHash`.

### P3 — Low Priority (Hygiene)

14. **F-14**: Document in-memory-only undo in UI; consider adding `previousState` to event payloads for future event-based rollback.
15. **F-16**: Consolidate duplicate `getEventsAfterSnapshot` implementations — single replay-layer version only.
16. **F-17**: Add null-visitId guard in all snapshot→visit join operations.
17. **F-18**: Run orphan CastAnalysis diagnostic and clean up pre-migration remnants.

---

## SUCCESS CRITERIA REASSESSMENT

| Guarantee | Status | Blocker |
|-----------|--------|---------|
| Same input → same clinical state | ❌ NOT MET | F-01 (non-deterministic IDs), F-06 (localStorage shadow) |
| Snapshots are reproducible | ❌ NOT MET | F-01, F-13 (hash inconsistency) |
| Events are traceable | ⚠️ CONDITIONAL | F-02 (fire-and-forget drops events) |
| Visits define truth timeline | ⚠️ CONDITIONAL | F-09 (visits closable without snapshot) |

---

*Audit conducted against: clinicalReducer.js, clinicalEvent.service.js, eventReplay.service.js, visitSession.service.js, snapshot.service.js, SnapshotEditor.tsx (4780 lines), chartReducer.ts, actionDispatcher.ts, ClinicalSnapshot.model.js, ClinicalEvent.model.js, VisitRecord.model.js, orthodonticCase.model.js, bonding.service.js, bonding.controller.js, useClinicalEvents.ts, useOrthodontics.js*
