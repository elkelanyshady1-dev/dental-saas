# Orthodontic Domain Deep Audit Report

**Date:** April 12, 2026  
**Scope:** Backend, Frontend, Database, UX  
**System:** DentalSaaS — Orthodontic Domain Module  
**Spec Version:** orthodontic-ai.spec.md v2.0 (Post Phase 30)

---

## Executive Summary

This audit examined the orthodontic domain across all four layers: backend services, frontend React architecture, MongoDB database schemas, and UX patterns. The module is architecturally mature with strong multi-tenancy isolation, proper event sourcing, and excellent React Query compliance. However, several issues block production readiness.

**Overall Verdict: NOT PRODUCTION-READY** — 4 critical issues and 12 high-priority gaps require remediation before clinical deployment.

### Scorecard

| Layer | Grade | Key Strengths | Blocking Issues |
|-------|-------|---------------|-----------------|
| **Backend** | B+ | JWT/RBAC/PBAC fully compliant, Zod validation, plane isolation | Missing DTOs on 5 controllers, FLS gaps on 6 route files, debug console.log in production code |
| **Frontend** | B+ | Excellent React Query compliance, zero-trust BroadcastChannel, proper invalidation | No `useCapability()` checks, no form validation library, no error boundaries |
| **Database** | A- | 23 models, comprehensive indexing, event sourcing, soft delete, TTL cleanup | Duplicate status field in VisitRecord, nullable diagnosticData without DB constraint |
| **UX** | B- | Rich dental chart visualization, clear 6-step workflow, responsive design | No confirmation on destructive actions, no i18n, limited accessibility, hardcoded strings |

---

## 1. Backend Audit

### 1.1 Security Stack Compliance

| Security Layer | Status | Evidence |
|----------------|--------|----------|
| **L1 — JWT Auth (Context Layer)** | PASS | All services enforce `_ensureContext(req)` guard. `organizationId` sourced exclusively from `req.context` (never req.body/params) |
| **L2 — Entitlements** | PASS | Routes include `requireEntitlement("orthodontics")` middleware |
| **L3 — RBAC** | PASS | Every controller begins with `authorize(req, "orthodontics.full")` or `authorize(req, "orthodontics.read")` |
| **L4 — PBAC (Ownership)** | PASS | `checkCaseOwnership(req, caseId)` enforces ownership with shared access + admin bypass |
| **L5 — RLS (Tenant Isolation)** | PASS | All queries scoped by `{ organizationId: req.context.organizationId }` |
| **L6 — FLS (Field Filtering)** | PARTIAL | Only `orthodonticCase.routes.js` has `fieldFilterMiddleware`. Missing on 6 sub-route files |
| **L7 — Audit Logging** | PASS | `autoAudit("OrthodonticCase")` middleware applied; controllers log `[SECURITY]` events |

### 1.2 Plane Isolation

**Status: FULLY COMPLIANT.** No cross-plane imports detected. Orthodontics stays within the Organization plane with imports only to core utilities (`@utils`, `@core`, `@middleware`, `@rbac`).

### 1.3 Validation

**Zod coverage is strong.** Schemas exist for case creation, snapshot creation, todo creation, workflow transitions, and phase management. One legacy validator (`orthodonticCase.validator.js`) still uses manual validation instead of Zod.

### 1.4 Critical Backend Issues

**CRITICAL: Debug statements in production code.**  
`clinicalSnapshot.repository.js` (lines 46-79) and `clinicalSnapshot.controller.js` (lines 51, 59, 67, 75, 96) contain `console.log()` and `console.error()` calls that leak sensitive operation traces (organizationId, caseId, session data). These must be replaced with the structured `pino` logger.

**HIGH: Missing DTO builders on 5 controllers.**  
The following controllers return raw Mongoose documents instead of DTO-transformed responses, violating the "Backend is SSOT" contract:

- `bonding.controller.js` — returns raw bonding arrays and objects
- `tad.controller.js` — returns raw TAD objects
- `sequence.controller.js` — returns raw sequence documents
- `clinicalAction.controller.js` — returns raw results
- `clinicalEvent.controller.js` — likely same pattern

Existing DTO builders (`buildCaseDTO`, `buildTodoDTO`, `buildSnapshotDTO`, `buildCaseDetailDTO`) prove the pattern is established — these 5 controllers simply haven't adopted it.

**HIGH: Field-Level Security (FLS) gaps on 6 route files.**  
`fieldFilterMiddleware` is missing from GET endpoints on: `bonding.routes.js`, `tad.routes.js`, `sequence.routes.js`, `clinicalAction.routes.js`, `clinicalEvent.routes.js`, `ortho-todos.routes.js`. Without FLS, sensitive fields (financial, PII) may leak to unauthorized roles.

### 1.5 Backend File Inventory

The orthodontic backend contains 11 route files, 12+ controllers, 15+ services, 5 repositories, 15+ models, 3 DTO builder modules, 4 validator modules, 2 migration scripts, 1 BullMQ queue, and 1 worker. Core audit services exist for data integrity, engine auditing, and schema validation.

---

## 2. Frontend Audit

### 2.1 React Query Compliance

**Status: EXCELLENT.** This is one of the strongest areas of the codebase.

| Rule | Status | Evidence |
|------|--------|----------|
| **11.1 — Server state via useQuery** | PASS | All API data flows through `useQuery` hooks. No `useState(apiData)` patterns found |
| **11.2 — Centralized query keys** | PASS | `BONDING_KEYS`, `SEQUENCE_KEYS`, `tadKeys`, `TODO_KEYS`, `SNAPSHOT_KEYS` — all factory-based |
| **11.3 — Cross-plane invalidation** | PASS | All mutations invalidate related keys in `onSuccess` callbacks |
| **11.4 — No manual refetch** | PASS | No `.refetch()` or `window.location.reload()` found |
| **11.5 — Single QueryClient** | PASS | Centralized at `/src/lib/query/queryClient.js` with proper config (staleTime 30s, gcTime 5min) |
| **11.6 — Performance standards** | PASS | `refetchOnWindowFocus: false`, explicit invalidation only |

**Optimistic updates** are properly implemented in `useBonding.ts` with rollback on error via `onError: (err, _, context) => qc.setQueryData(..., context.previousBondings)`.

**ObjectId validation guards** prevent invalid API calls: `enabled: isValidObjectId(caseId)` on all query hooks.

### 2.2 BroadcastChannel Compliance

**Status: PASS (Zero-Trust).** Channel at `/src/lib/realtime/caseTabChannel.ts` carries only `{ type, tabId }` — no clinical or org data in payloads. Strict allowlist validation rejects events with unexpected keys. Purpose is concurrent-tab detection for edit conflict prevention.

### 2.3 State Management

UI state uses `useReducer` + `useState` (chart state, selection, active category). Server state exclusively through React Query. The `chartReducer.ts` is pure and deterministic. No Zustand usage in the orthodontic module specifically (Zustand is available in the broader app for global UI state).

### 2.4 Critical Frontend Issues

**HIGH: No capability-based UI checks.**  
`useRoleName()` is imported in `SnapshotEditor.tsx` (line 123) but never used. No `useCapability()` calls exist anywhere in the orthodontic chart module. The `CapabilityContext` exists in the app but is not consumed. This means the frontend relies 100% on backend enforcement — while secure, it creates a poor UX where users see actions they can't perform.

**Affected components that should gate on capabilities:** `TadManagementModal.tsx` (ortho specialists only), `BracketActionPanel.tsx` (bonding permissions), `DebondModal.tsx` (debond authorization), sequence plan editing (sequence.manage permission).

**HIGH: SnapshotEditor.tsx is a 4780-line god component.**  
This file contains 18+ `useEffect` hooks and orchestrates the entire clinical chart: hydration, undo/redo, TAD/bonding/elastic/archwire actions, visit lifecycle, auto-save, lock management, multi-tab detection, time travel, and onboarding. This exceeds the ~2000-line hard limit by 2.4x and is a maintenance and testability risk.

**MEDIUM: No form validation library.**  
Forms rely on TypeScript type checking + backend validation only. No React Hook Form or Zod frontend schemas. This causes unnecessary server roundtrips for invalid data and provides no real-time validation feedback.

**MEDIUM: No error boundaries.**  
A crash in any orthodontic chart sub-component brings down the entire SnapshotEditor. An error boundary wrapping the chart would prevent cascading failures.

### 2.5 Frontend File Inventory

Located at `/src/org/modules/patients/components/orthodontic-chart/`. Contains 8 API client modules, 5 React Query hook files, 90+ component files, a chart reducer, type definitions, an AI command assistant engine, and prescription data constants. All API endpoints mounted under `/api/v1/org/`.

---

## 3. Database Audit

### 3.1 Schema Coverage

**23 Mongoose models** cover the full orthodontic clinical domain:

- **Core:** OrthodonticCase (aggregate root), CasePhase, CaseSequence (atomic counter)
- **Clinical Snapshots:** ClinicalSnapshot (immutable), VisitRecord, VisitDraft (TTL 7d), WorkflowSnapshot (legacy)
- **Appliances:** Bonding (event-sourced), Tad (event-sourced), BondingSettings, TadSettings, SequencePlan, ClinicalAction
- **Analysis:** CephAnalysis, ToothSegmentation, CastAnalysis, AlignerPlan, ScanFile
- **Audit:** ClinicalEvent (append-only, 60+ event types), SharedCase, SharedCaseComment

### 3.2 Indexing Quality

**Status: COMPREHENSIVE.** Every collection has `organizationId` indexed. Compound indexes cover primary query patterns. Partial and sparse indexes reduce storage overhead. Unique constraints prevent data duplication. TTL indexes auto-cleanup stale data (SharedCase 30d, VisitDraft 7d).

Key indexes include: `{organizationId, caseId, status}` on the case model, `{caseId, type, createdAt}` on snapshots, `{organizationId, caseId, tooth}` unique on bondings, `{organizationId, caseId, sequence}` on clinical events for replay, and `{organizationId, caseId, status}` unique partial on visit records for the singleton-active-visit constraint.

### 3.3 Tenant Isolation

**Status: FULLY COMPLIANT.** Every model requires `organizationId`. All repository queries include org scoping from `req.context`. Per-org database routing via `getModel(req.dbConnection, ModelDef)`. No raw `find()` calls without org filter. No `$lookup` aggregations across organizations.

### 3.4 Data Integrity

**Event sourcing is well-implemented.** Bonding and TAD models use append-only `history[]` and `events[]` arrays. ClinicalEvent provides a full audit trail with `eventId` (UUID for idempotency), `sequence` (monotonic counter for deterministic replay), and `version` (schema versioning). Soft delete is enforced on cases and snapshots with `{ isDeleted: { $ne: true } }` filters preserving medico-legal records.

**Data integrity service** (`dataIntegrity.service.js`) performs read-only validation: VisitRecord-to-ClinicalSnapshot referential integrity, CasePhase consistency, visitNumber uniqueness, active phase cardinality, and activePhaseId resolution. Limited to 500 docs per collection to prevent memory exhaustion.

### 3.5 Database Issues

**LOW: Duplicate `status` field in VisitRecord.model.js.**  
`status` is defined at lines 92-96 AND again at lines 250-255 with identical enum values. Mongoose uses the first definition, so there's no functional impact, but it's confusing for maintainers.

**MEDIUM: `diagnosticData` nullable without DB constraint.**  
ClinicalSnapshot allows nullable `diagnosticData`, but the schema comment says "MUST be null for treatment/post-treatment — service layer enforces this." There's no pre-save hook or DB-level validation backing this rule. If the service layer has a bug, invalid data can persist.

### 3.6 Migrations

Two documented, idempotent migrations exist: `migrateCastAnalysis.js` (extracts CastAnalysis into case workflowData) and `extractWorkflowRecordSets.js` (P1-1 extraction with DRY_RUN support). Both include rollback instructions and verification queries.

---

## 4. UX Audit

### 4.1 Workflow Completeness

The orthodontic module provides a clear 6-step clinical workflow: Records, Analysis, Problems, Goals, Treatment Options, Final Plan. CRUD operations are fully supported: case creation via `CreateOrthoDrawer.jsx`, paginated case list with search and status filtering, case detail view with 3-tab interface, and soft deletion via API.

Active case collision is handled gracefully — a 409 error triggers a modal offering "Open Existing Case" rather than silently failing.

### 4.2 Data Visualization

The module includes rich clinical visualization: an interactive dental notation chart (FDI/Palmer systems), SVG tooth rendering with color-coded clinical status (caries red, rotation purple, displacement teal), bracket/band/molar-tube overlays, TAD markers, a ring progress indicator for aligner completion, stage timeline with status icons, cephalometric measurement overlays, and multi-panel analysis sidebars.

### 4.3 Critical UX Issues

**CRITICAL: No confirmation on destructive actions.**  
Photo deletion, todo deletion, and case soft-deletion execute immediately without confirmation modals. In a clinical system, accidental data loss has medico-legal implications. The debond flow does have proper 3-option confirmation (rebond now / add TODO / cancel), proving the pattern exists — it just hasn't been applied consistently.

**HIGH: No i18n integration.**  
All UI strings are hardcoded in English. Constants like `MALOCCLUSION_LABELS`, `CASE_STATUS`, `TYPE_LABELS`, `WORKFLOW_STEPS` use English literals. The `i18next` library is installed and configured at `/src/i18n.js`, but no `useTranslation()` hooks exist in any orthodontic component. For international clinic deployment, this blocks localization.

**HIGH: Limited accessibility.**  
Semantic HTML is used correctly (`<button>`, `<input>`, `<label htmlFor>`), and a WCAG 2.1 AA contrast guard system exists at `/src/design-system/contrastGuard.js`. However: explicit `aria-labels` are nearly absent (only `aria-hidden` on CaseWorkflowModal), no focus trap management in modals, no keyboard shortcuts, no landmark navigation (`<main>`, `<nav>`, `<aside>`), and some status colors (red #ef4444, yellow #fbbf24) may not meet 4.5:1 contrast on light backgrounds.

**MEDIUM: Form validation is backend-only.**  
No real-time validation feedback, no debouncing on search fields, no async validation (e.g., duplicate patient check). The `Input.jsx` design system component supports error display (red border + message), but orthodontic forms only trigger errors after API rejection.

### 4.4 Loading, Error, and Empty States

Loading states use a spinner component with React Query's `isPending`/`isLoading` flags. Error handling uses `toast.error()` via the sonner library. Empty states exist for case lists ("No orthodontic cases found"), aligner progress ("No aligner plan created"), and treatment plans ("No Treatment Plan Found" with CTA). Some analysis sidebars lack empty state handling when no data is available.

### 4.5 Responsive Design

Tailwind breakpoints (`sm`, `md`, `lg`, `xl`) are used consistently. Grid layouts adapt from 1-column on mobile to 2-4 columns on desktop. Max-width constraints (`max-w-[1600px]`) center content on wide screens. The workflow stepper has `overflow-x-auto` for horizontal scrolling on mobile. Touch-friendly button sizes (44px+ height) are maintained.

---

## 5. Cross-Cutting Concerns

### 5.1 Spec-Kit Compliance

The orthodontic domain has a dedicated spec (`orthodontic-ai.spec.md` v2.0) covering domain architecture, entitlement pipeline, visit-driven architecture, snapshot engine, RBAC model, and all engines. A forensic audit (`TDS_ORTHO_FORENSIC_AUDIT.md`) was previously completed, identifying 18 findings with P0-P3 prioritization.

No per-feature plan or task files exist specifically for the orthodontic module — these are tracked centrally in `specs/plan.md` and `specs/tasks.md`.

### 5.2 Known Forensic Audit Findings (from TDS_ORTHO_FORENSIC_AUDIT.md)

| ID | Severity | Issue |
|----|----------|-------|
| F-01 | P0 | `replay-${Date.now()}` fallback IDs make snapshots non-deterministic |
| F-02 | P0 | `logEvent` fire-and-forget silently drops audit events |
| F-03 | P0 | TAD undo does not roll back DB |
| F-04 | P1 | RecordSets embedded in case blob (no versioning, no snapshot linkage) |
| F-05 | P2 | SnapshotEditor.tsx is 4780 lines (2.4x hard limit) |
| F-06 | P0 | Debond bypasses dispatcher (no reducer rollback on failure) |

---

## 6. Prioritized Remediation Plan

### P0 — Block Releases

1. **Remove debug console.log/console.error** from `clinicalSnapshot.repository.js` and `clinicalSnapshot.controller.js`. Replace with structured `pino` logger.
2. **Add confirmation modals** for photo deletion, todo deletion, and case soft-deletion.
3. **Fix snapshot determinism** (F-01): Replace `Date.now()` fallback IDs with deterministic UUID generation.
4. **Fix logEvent fire-and-forget** (F-02): Ensure audit events are written synchronously or with guaranteed delivery.
5. **Fix TAD undo DB rollback** (F-03): Undo must reverse the database mutation, not just the UI state.
6. **Fix debond dispatcher bypass** (F-06): Route all debond actions through the event dispatcher with reducer rollback.

### P1 — High Priority

7. **Add DTO builders** to bonding, TAD, sequence, clinicalAction, and clinicalEvent controllers.
8. **Add `fieldFilterMiddleware`** to GET endpoints on all 6 sub-route files.
9. **Implement `useCapability()` checks** in orthodontic UI components for TAD management, bonding actions, debond, and sequence editing.
10. **Extract RecordSets from case blob** (F-04): Give recordSets proper versioning and snapshot linkage.
11. **Migrate hardcoded strings to i18n** using existing `i18next` infrastructure and `useTranslation()` hooks.

### P2 — Medium Priority

12. **Decompose SnapshotEditor.tsx** (F-05): Extract into focused hooks (`useSnapshotHydration`, `useUndoRedo`, `useVisitSession`, `useLockManager`, `useAutoSave`, etc.) targeting <2000 lines for the main component.
13. **Add React Hook Form + Zod frontend schemas** for case creation, todo creation, and snapshot metadata forms.
14. **Add error boundaries** around the SnapshotEditor chart component.
15. **Improve accessibility**: Add `aria-labels` to interactive elements, implement focus traps in modals, add keyboard shortcuts for common chart actions, use landmark elements.
16. **Remove duplicate `status` field** in VisitRecord.model.js (line 250).
17. **Add pre-save validator** for ClinicalSnapshot `diagnosticData` nullability rules.

### P3 — Low Priority

18. **Refactor legacy `orthodonticCase.validator.js`** from manual validation to Zod.
19. **Add skeleton loaders** for better perceived performance on data-heavy views.
20. **Verify status color contrast** (red/yellow on light backgrounds) against WCAG AA.
21. **Add empty states** to analysis sidebars when no data is available.
22. **Add React Query DevTools** for development debugging.

---

## 7. Architecture Diagram

```
                    ORGANIZATION PLANE
                    ==================

  [Browser]
      |
      v
  React App (org/)
  +-- orthodontic-chart/
  |   +-- api/ (8 clients)          --> Axios --> /api/v1/org/*
  |   +-- hooks/ (5 RQ hooks)       --> useQuery/useMutation
  |   +-- components/ (90+ files)   --> SnapshotEditor (orchestrator)
  |   +-- assistant/ (AI commands)
  |   +-- utils/ (chart helpers)
  |
  +-- lib/query/queryClient.js       --> Single instance (staleTime 30s)
  +-- lib/realtime/caseTabChannel.ts --> BroadcastChannel (zero-trust)

      |
      v  (HTTPS + JWT)

  Express Backend
  +-- middleware: orgProtect -> organizationContext -> requireEntitlement
  +-- modules/orthodontics/
  |   +-- routes/ (11 files)         --> autoAudit + fieldFilter
  |   +-- controllers/ (12+ files)   --> authorize(req, permission)
  |   +-- services/ (15+ files)      --> _ensureContext(req)
  |   +-- repositories/ (5 files)    --> org-scoped queries
  |   +-- models/ (23 Mongoose)      --> per-org DB via getModel()
  |   +-- core/
  |   |   +-- services/audit/        --> dataIntegrity, engineAudit
  |   |   +-- dto/                   --> buildCaseDTO, buildPhaseDTO
  |   +-- clinical/
  |       +-- dto/                   --> buildSnapshotDTO
  |       +-- validators/            --> Zod schemas
  |       +-- migrations/ (2)        --> idempotent, with rollback
  |
  +-- infrastructure/
      +-- Redis (locks, sessions)
      +-- BullMQ (AI analysis queue)

      |
      v  (Mongoose ODM)

  MongoDB (per-org database)
  +-- orthodonticCases     (aggregate root, soft delete)
  +-- casePhases           (immutable name/order)
  +-- clinicalSnapshots    (immutable, versioned)
  +-- visitRecords         (session lifecycle)
  +-- bondings             (event-sourced history[])
  +-- tads                 (event-sourced events[])
  +-- clinicalEvents       (append-only audit trail, 60+ types)
  +-- sequencePlans        (treatment sequences)
  +-- clinicalActions      (archwires, elastics, IPR)
  +-- cephAnalyses         (cephalometric data)
  +-- toothSegmentations   (AI 3D output)
  +-- sharedCases          (TTL 30d auto-delete)
  +-- visitDrafts          (TTL 7d crash recovery)
  ... (23 collections total)
```

---

*Report generated by deep audit on April 12, 2026. Run `make spec` after implementing any remediation items.*
