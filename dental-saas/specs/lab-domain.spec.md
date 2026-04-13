# LAB DOMAIN SPECIFICATION

**Document Type:** Technical Design Specification (TDS)
**Version:** 1.2
**Generated From:** Repository Audit — March 2026
**Source Files:**
- `backend/src/modules/labDomain/routes/lab.routes.js`
- `backend/src/modules/labDomain/controllers/lab.controller.js`
- `backend/src/modules/labDomain/services/labWrite.service.js`
- `backend/src/modules/labDomain/services/labRead.service.js`
- `backend/src/modules/labDomain/models/labCase.model.js`
- `backend/src/modules/labDomain/models/labPartner.model.js`
- `backend/src/modules/labDomain/models/labClaim.model.js`
- `backend/src/modules/labDomain/models/labMessage.model.js`
- `backend/src/modules/labDomain/index.js`
- `backend/src/rbac/orgPermissions.js`

---

## SECTION 1 — PURPOSE

The Lab Domain manages the full lifecycle of external orthodontic laboratory interactions within a dental clinic. It covers:

1. **Lab Partner Registry** — Trusted external lab directory with specialties, ratings, turnaround metrics.
2. **Lab Case Management** — Full FSM lifecycle (draft → completed) for orthodontic appliance orders.
3. **Lab Claim Billing** — Financial claims pipeline (pending → approved → paid) with accounting bridge.
4. **Lab Chat** — Per-case append-only messaging between clinic staff and lab technicians.

It operates as a **supplier relationship management (SRM)** subsystem within the Organization Plane.

---

## SECTION 2 — DOMAIN BOUNDARY

**Owns:**
- Lab partner registry (name, location, specialties, ratings, status)
- Lab case lifecycle (creation, status transitions, delivery tracking, prescription)
- Lab billing claims (cost tracking, approval workflow, payment status)
- Per-case chat messages (clinic ↔ lab communication)
- Lab-to-accounting event bridge

**Receives signals from:**
- None (self-contained domain — initiates all interactions)

**Emits events to:**
- EventBus: `lab.case.created.v1`, `lab.case.updated.v1`, `lab.case.completed.v1`
- EventBus: `lab.claim.created.v1`, `lab.claim.approved.v1` (→ `accounting.expense.created.v1`)
- EventBus: `lab.message.sent.v1`

**Does NOT own:**
- Accounting ledger writes (pure event bridge — accounting domain consumes events)
- Patient clinical records (references patientId only)
- Orthodontic case management (owned by OrthodonticDomain)

---

## SECTION 3 — DATA MODELS

### LabPartner (External Lab Registry)
```
LabPartner {
    _id              ObjectId
    name             String (required)
    location         String
    specialties      [String]    // "aligners" | "retainers" | "functional" | "fixed" | "splints"
    turnaroundDays   Number
    rating           Number (0–5, default: 0)
    ratingCount      Number (default: 0)
    contact          {
        phone    String
        email    String
        website  String
    }
    status           Enum: active | inactive | maintenance (default: "active")
    avatar           String     // URL or initials fallback
    verifiedAt       Date
    notes            String
    createdAt        Date
    updatedAt        Date
}
```

### LabCase (External Lab Order)
```
LabCase {
    _id              ObjectId
    caseCode         String (required, unique)      // e.g. "ORD-A1B2C3"
    patientId        ObjectId (ref: Patient)
    patientName      String                         // denormalized for display
    labId            ObjectId (ref: LabPartner, required)
    labName          String                         // denormalized for Kanban display
    applianceType    String (required)              // aligner | essix | twinblock | retainer | herbst | archwire
    status           Enum: draft | sent | accepted | in_production | shipped | delivered | completed
    prescription     Mixed                          // free-form clinical prescription
    notes            String
    expectedDelivery Date
    actualDelivery   Date
    trackingNumber   String
    trackingCarrier  String
    claimId          ObjectId (ref: LabClaim)
    cost             Number (default: 0)
    createdAt        Date
    updatedAt        Date
}
```

### LabClaim (Lab Billing Claim)
```
LabClaim {
    _id              ObjectId
    caseId           ObjectId (ref: LabCase, required)
    caseCode         String                         // denormalized
    labId            ObjectId (ref: LabPartner, required)
    labName          String                         // denormalized
    applianceType    String                         // denormalized
    cost             Number (required, min: 0)
    status           Enum: pending | approved | paid (default: "pending")
    approvedBy       String
    approvedAt       Date
    paidAt           Date
    notes            String
    serviceDate      Date
    createdAt        Date
    updatedAt        Date
}
```

### LabMessage (Per-Case Chat)
```
LabMessage {
    _id              ObjectId
    caseId           ObjectId (ref: LabCase, required)
    sender           String (userId or "lab:<labId>")
    senderName       String
    senderType       Enum: clinic | lab (default: "clinic")
    message          String
    attachments      [String]                       // file URLs
    isSystem         Boolean (default: false)        // auto-generated status messages
    createdAt        Date (immutable)
}
```

---

## SECTION 4 — SERVICE RESPONSIBILITIES

### LabController (`lab.controller.js`)
Thin HTTP layer — delegates all logic to write/read services.

### LabWriteService (`labWrite.service.js`) — CQRS Write Side
- **createPartner** — Creates new lab partner in registry
- **updatePartner** — Updates lab partner details (allowlist: name, location, specialties, turnaroundDays, contact, status, avatar, notes)
- **createCase** — Creates new lab case (auto-generates caseCode if not provided, denormalizes labName, emits `lab.case.created.v1`)
- **updateCaseStatus** — FSM status transition with forward-only enforcement. Backwards allowed only with `forceOverride`. Appends system chat message. Emits `lab.case.updated.v1`. Emits `lab.case.completed.v1` on completion (→ accounting bridge).
- **createClaim** — Creates billing claim for a case (emits `lab.claim.created.v1`)
- **approveClaim** — Approves pending claim (FSM: pending → approved). Emits `accounting.expense.created.v1` directly.
- **markClaimPaid** — Marks approved claim as paid (FSM: approved → paid)
- **postMessage** — Appends chat message to case (emits `lab.message.sent.v1`)

### LabReadService (`labRead.service.js`) — CQRS Read Side
- **listPartners** — Paginated list with status/specialty/search filters, sorted by rating desc
- **getPartner** — Single partner by ID
- **listCases** — Paginated list with status/labId/search filters
- **getCasesKanban** — All active cases grouped by status column (draft → delivered)
- **getCase** — Single case by ID
- **getPriorityCases** — Cases with `expectedDelivery` within 5 days, non-completed statuses
- **listClaims** — Paginated list with aggregated financials (totalExpenses, pendingPayments, approved)
- **getMessages** — Paginated chat messages for a case (chronological order)
- **getDashboard** — KPI aggregation: activeCases, pendingSubmissions, inProduction, monthlyExpenses, recentActivity

### Lab Event Bridge (`index.js`)
- Listens for `lab.case.completed.v1` → emits `accounting.expense.created.v1` (no direct DB writes)

---

## SECTION 5 — API CONTRACTS

### Lab Partner Routes
| Method | Path | Purpose | Guard |
|--------|------|---------|-------|
| GET    | `/api/v1/org/labs` | List lab partners | `orgProtect` + `requireEntitlement("lab")` + `LAB_READ` |
| POST   | `/api/v1/org/labs` | Create lab partner | `orgProtect` + `requireEntitlement("lab")` + `LAB_CREATE` |
| GET    | `/api/v1/org/labs/:id` | Get lab partner | `orgProtect` + `requireEntitlement("lab")` + `LAB_READ` |
| PUT    | `/api/v1/org/labs/:id` | Update lab partner | `orgProtect` + `requireEntitlement("lab")` + `LAB_UPDATE` |

### Lab Case Routes
| Method | Path | Purpose | Guard |
|--------|------|---------|-------|
| GET    | `/api/v1/org/lab-cases/dashboard` | Dashboard KPIs | `LAB_READ` |
| GET    | `/api/v1/org/lab-cases/kanban` | Kanban board | `LAB_READ` |
| GET    | `/api/v1/org/lab-cases/priority` | Priority monitoring | `LAB_READ` |
| GET    | `/api/v1/org/lab-cases` | List cases | `LAB_READ` |
| POST   | `/api/v1/org/lab-cases` | Create case | `LAB_CREATE` |
| GET    | `/api/v1/org/lab-cases/:id` | Get case detail | `LAB_READ` |
| PATCH  | `/api/v1/org/lab-cases/:id/status` | FSM status transition | `LAB_UPDATE` |
| GET    | `/api/v1/org/lab-cases/:id/messages` | Chat history | `LAB_READ` |
| POST   | `/api/v1/org/lab-cases/:id/messages` | Post chat message | `LAB_CREATE` |

### Lab Claim Routes
| Method | Path | Purpose | Guard |
|--------|------|---------|-------|
| GET    | `/api/v1/org/lab-claims` | List claims with summary | `LAB_READ` |
| POST   | `/api/v1/org/lab-claims` | Create claim | `LAB_CREATE` |
| PATCH  | `/api/v1/org/lab-claims/:id/approve` | Approve claim | `LAB_UPDATE` |
| PATCH  | `/api/v1/org/lab-claims/:id/paid` | Mark claim paid | `LAB_UPDATE` |

---

## SECTION 6 — SECURITY RULES

- **Multi-tenant isolation:** All queries use `req.dbConnection` (per-org database). No `organizationId` filter needed inside the org DB.
- **Entitlement gate:** All routes require `requireEntitlement("lab")` — module must be enabled in the org's subscription plan.
- **RBAC enforcement:** All routes require explicit permission: `lab.read`, `lab.create`, `lab.update`, `lab.delete`.
- **FSM enforcement:** Case status transitions are forward-only by default. Backwards transitions require `forceOverride` flag.
- **Append-only chat:** LabMessage schema has `createdAt: immutable: true`. Messages cannot be edited or deleted.
- **Accounting bridge isolation:** Lab domain emits events but never writes directly to accounting DB. Pure event-driven bridge pattern.

---

## SECTION 7 — EVENTS

| Event | When Emitted | Consumers |
|-------|-------------|-----------|
| `lab.case.created.v1` | New case created | Audit log |
| `lab.case.updated.v1` | Case status changed | Socket.io realtime, Audit log |
| `lab.case.completed.v1` | Case status → completed | Accounting bridge (→ `accounting.expense.created.v1`) |
| `lab.claim.created.v1` | New billing claim created | Audit log |
| `lab.claim.approved.v1` | Claim approved | Accounting bridge (→ `accounting.expense.created.v1`) |
| `lab.message.sent.v1` | Chat message posted | Socket.io realtime |

---

## SECTION 8 — INVARIANTS

- Case status transitions MUST follow FSM order: draft → sent → accepted → in_production → shipped → delivered → completed. Backwards transitions require explicit `forceOverride`.
- Claim status transitions MUST follow: pending → approved → paid. No backwards transitions allowed.
- LabMessage is append-only. No update or delete operations exist.
- Accounting bridge MUST NOT write directly to accounting DB. Only event emission is allowed.
- Case `caseCode` is unique per organization database.
- The `approveClaim` operation MUST emit `accounting.expense.created.v1` to bridge to the accounting domain.

---

## SECTION 9 — FAILURE CONDITIONS

| Condition | HTTP Status | Message |
|-----------|-------------|---------|
| Lab partner not found | 404 | Lab partner not found |
| Lab case not found | 404 | Lab case not found |
| Lab claim not found | 404 | Claim not found |
| Invalid status transition | 400 | Invalid status |
| Backwards transition without override | 409 | Cannot move case backwards |
| Claim already processed | 409 | Claim is already {status} |
| Non-approved claim marked paid | 409 | Only approved claims can be marked paid |

---

## SECTION 10 — PERFORMANCE CONSIDERATIONS

- **Indexes:**
  - `LabCase.status + createdAt` (compound, primary listing query)
  - `LabCase.labId + status` (lab-filtered queries)
  - `LabCase.patientId` (patient-linked queries)
  - `LabCase.expectedDelivery` (priority monitoring queries)
  - `LabPartner.status` (active partner listing)
  - `LabPartner.specialties` (specialty-filtered queries)
  - `LabClaim.status + createdAt` (claim listing)
  - `LabClaim.labId + status` (lab-filtered claims)
  - `LabMessage.caseId + createdAt` (chat history)

- **Dashboard:** Performs 5 parallel aggregation queries via `Promise.all`. Consider projection-based caching for high-volume clinics.

- **Kanban:** Loads ALL active cases into memory for client-side grouping. Consider cursor-based pagination for clinics with 500+ cases.

---

## SECTION 11 — FRONTEND ARCHITECTURE

### Pages
| Component | File | Purpose |
|-----------|------|---------|
| `LabDashboard` | `pages/LabDashboard.jsx` | KPI cards, bar chart, activity feed, priority table |
| `LabKanban` | `pages/LabKanban.jsx` | Drag-and-drop Kanban board with status columns |
| `LabDirectory` | `pages/LabDirectory.jsx` | Lab partner directory with specialties, ratings |
| `LabCaseDetail` | `pages/LabCaseDetail.jsx` | Case detail with STL viewer, specs, chat, tracking |
| `LabClaims` | `pages/LabClaims.jsx` | Claims billing dashboard with approve/pay actions |

### Hooks (React Query compliant)
| Hook | Keys | staleTime |
|------|------|----------|
| `useLabDashboard` | `QK.lab.dashboard()` | 30s |
| `useLabPartners` | `QK.lab.labs(params)` | 30s |
| `useLabCases` | `QK.lab.cases(params)` | 30s |
| `useLabKanban` | `QK.lab.kanban()` | 30s |
| `useLabPriority` | `QK.lab.priority()` | 30s |
| `useLabCase` | `QK.lab.caseDetail(id)` | 30s |
| `useLabMessages` | `QK.lab.messages(id)` | 10s |
| `useLabClaims` | `QK.lab.claims(params)` | 30s |

### Mutation Hooks with Invalidation
All mutation hooks invalidate `QK.lab.all` on success (Rule 11.4 compliant).

### Real-Time
- `useLabSocket.js` — Socket.io listener for `lab.case.updated.v1` and `lab.message.sent.v1` → query invalidation (Rule 12.4–12.5 compliant).

### Design System
- `LabDashboard.css` — Full scoped CSS design system (480+ lines) with `.lab-*` class namespace, Inter font, responsive breakpoints at 1100px and 720px.

---

## SECTION 12 — DTO CONTRACT LAYER

### Architecture

The Lab Domain uses the same 5-layer DTO defense stack as the Patient Domain:

```
Layer 1: Backend DTO Builders (lab.dto.js)          ← SSOT
Layer 2: Object.freeze() immutability               ← mutation prevention
Layer 3: Service-level enforcement (read + write)   ← no raw model leak
Layer 4: Frontend DTO assertions (assertLabDTO.js)  ← contract verification
Layer 5: Global dtoEnforcer middleware               ← runtime guard
```

### DTO Builders (`backend/src/dto/lab.dto.js`)

| Builder | Consumer | Purpose |
|---------|----------|---------|
| `buildLabPartnerListDTO` | Partner directory, dropdowns | Minimal partner shape |
| `buildLabPartnerDetailDTO` | Partner profile page | Full partner with contact |
| `buildLabCaseListDTO` | Case list, kanban, priority, dashboard activity | Case summary with display names |
| `buildLabCaseDetailDTO` | Case detail page | Full case with prescription, tracking |
| `buildLabClaimListDTO` | Claims table | Claim with financial data |
| `buildLabMessageDTO` | Chat panel | Chat message shape |
| `buildLabDashboardDTO` | Dashboard page | KPI + activity composite |

### Canonical Helpers

| Helper | Purpose |
|--------|---------|
| `resolveLabDisplayName(raw)` | `raw.name \|\| raw.contact.email \|\| "Unknown Lab"` |
| `resolvePatientDisplayName(raw)` | `raw.patientName \|\| "Patient#" + raw.patientId` |
| `formatCost(val)` | Ensures numeric, returns 0 for NaN/undefined |

### Invariants

- **INV-LAB-DTO-1** — Every lab response includes `displayName` for lab and patient entities
- **INV-LAB-DTO-2** — Every DTO object is `Object.freeze()`'d (immutable after creation)
- **INV-LAB-DTO-3** — Financial fields (`cost`) are always numeric (`typeof === "number"`), never `undefined`/`NaN`

### Frontend Guards (`frontend/src/modules/org/lab/utils/assertLabDTO.js`)

| Guard | Validates | Used In |
|-------|-----------|---------|
| `assertLabCaseDTO(raw, caller)` | `caseCode` present, `cost` numeric | LabDashboard priority table, activity feed |
| `assertLabPartnerDTO(raw, caller)` | `displayName` or `name` present | LabDirectory |
| `assertLabClaimDTO(raw, caller)` | `cost` numeric | LabClaims |

### Input Validation (Write Service)

All mutation entry points validate required fields before DB interaction:
- `createPartner` → requires `name`
- `createCase` → requires `labId`, `applianceType`
- `createClaim` → requires `caseId`, `labId`, positive `cost`
- `postMessage` → requires `message`

---

## SECTION 13 — API CONTRACT AUTOMATION (Phase 10)

### Architecture

```
DTO builders → Zod Response Schemas → OpenAPI 3.0 Spec → Frontend Types → Contract Tests
      ↑              ↑                      ↑                  ↑              ↑
   lab.dto.js    lab.response.schema.js   openapi.js      contracts.json    *.contract.test.js
```

### Response Schemas (`backend/src/schemas/lab.response.schema.js`)

Zod v4 response schemas define the EXACT shape of every API response, mapping 1:1 to DTO builders:

| Zod Schema | DTO Builder |
|------------|-------------|
| `labPartnerListSchema` | `buildLabPartnerListDTO` |
| `labPartnerDetailSchema` | `buildLabPartnerDetailDTO` |
| `labCaseListSchema` | `buildLabCaseListDTO` |
| `labCaseDetailSchema` | `buildLabCaseDetailDTO` |
| `labClaimSchema` | `buildLabClaimListDTO` |
| `labMessageSchema` | `buildLabMessageDTO` |
| `labDashboardSchema` | `buildLabDashboardDTO` |

### Contract Enforcer (`backend/src/schemas/contractEnforcer.js`)

- **DEV mode:** `schema.parse(dto)` — throws on violation (fail fast)
- **PROD mode:** `schema.safeParse(dto)` — logs contract violations, returns data (graceful degradation)

### OpenAPI Generation

| Endpoint | Purpose |
|----------|---------|
| `/api/docs` | Swagger UI (interactive documentation) |
| `/api/docs-json` | Raw OpenAPI 3.0 JSON spec |
| `openapi/contracts.json` | Static export for CI pipelines |

### CI Scripts

| Command | Purpose |
|---------|---------|
| `npm run api:contract-test` | 21 contract tests (no DB, < 1s) |
| `npm run validate:contracts` | Drift detection (schema/DTO/registry) |
| `npm run api:validate-contracts` | Export spec + run tests |

