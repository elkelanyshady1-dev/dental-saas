# PATIENT DOMAIN SPECIFICATION

**Document Type:** Technical Design Specification (TDS)
**Version:** 1.1 (Phase 9.1 — DTO Contract Layer)
**Generated From:** Repository Audit — March 2026
**Source Files:**
- `backend/src/modules/patientDomain/patientDomain.routes.js`
- `backend/src/modules/patientDomain/core/patient.controller.js`
- `backend/src/modules/patientDomain/core/patient.create.controller.js`
- `backend/src/modules/patientDomain/core/patient.list.controller.js`
- `backend/src/modules/patientDomain/core/patient.aggregate.service.js`
- `backend/src/modules/patientDomain/core/patient.list.service.js`
- `backend/src/modules/patientDomain/clinical/clinical.controller.js`
- `backend/src/modules/patientDomain/financial/financial.controller.js`
- `backend/src/modules/patientDomain/documents/documents.controller.js`
- `backend/src/modules/patientDomain/access/patientAuth.controller.js`
- `backend/src/modules/patientDomain/bookingIntegration/bookingIntegration.controller.js`
- `backend/src/modules/patientDomain/policies/policy.controller.js`
- `backend/src/rbac/orgPermissions.js`

---

## SECTION 1 — PURPOSE

The Patient Domain is the central entity domain of the Organization Plane. It owns all patient identity, clinical, financial, and portal data. Every other org-plane domain (Appointment, Billing, Inventory, Orthodontics) treats the patient as a foreign key reference.

It operates in two modes:
1. **Staff-side internal workflow** — Clinic staff manage patient records through the clinic application.
2. **Patient Portal** — Patients self-serve: view their clinical records, financial summary, submitted booking requests, and activating their portal account.

---

## SECTION 2 — DOMAIN BOUNDARY

**Owns:**
- Patient identity records (name, contact, DOB, health history)
- Clinical records (dental chart, treatment history, diagnosis)
- Patient portal access (activation, login, profile view)
- Patient financial summaries (outstanding balances, payment history — read-only)
- Document management (signed URLs for patient files/photos)
- Patient booking integration (slot lookup and request submission via portal)
- Portal configuration policies (which features are visible in patient portal)
- Family grouping references (via `familyRoutes`)

**Receives signals from:**
- AppointmentDomain — appointment completion events (for patient timeline)
- BillingDomain — invoice updates trigger financial summary refresh
- EventBus — `APPOINTMENT_CREATED`, `PATIENT_BOOKING_REQUESTED`

**Emits events to:**
- EventBus: `patient.created`, `patient.updated`, `patient.deleted`, `patient.portal.activated`, `patient.booking.requested`, `patient.medical.updated`, `patient.policy.updated`, `patient.file.uploaded`, `patient.doctor.assigned`

**Does NOT own:**
- Appointment scheduling logic (owned by AppointmentDomain)
- Invoice creation/collection (owned by BillingDomain/org)
- Inventory management (owned by InventoryDomain)
- Orthodontic case management (owned by OrthodonticDomain)

---

## SECTION 3 — DATA MODELS

### Patient (Derived from code structure — organization/patient/models/)
```
Patient {
  _id              ObjectId
  organizationId   ObjectId (ref: Organization, required — tenant isolation)
  branchId         ObjectId (ref: Branch, required)
  firstName        String (required)
  lastName         String (required)
  name             String (virtual or denormalized: firstName + lastName)
  phone            String
  email            String
  dateOfBirth      Date
  gender           Enum: male | female | other
  nationalId       String (optional)
  address          String
  photo            String (URL path)
  medicalHistory   Object (allergies, conditions, medications)
  status           Enum: active | inactive | archived
  portalEnabled    Boolean (default: false)
  portalPin        String (hashed, for patient portal login)
  doctorId         ObjectId (ref: User — assigned doctor)
  familyId         ObjectId (ref: Family, optional)
  notes            String
  createdBy        ObjectId (ref: User)
  createdAt        Date
  updatedAt        Date
}
```

### ClinicalRecord (Derived from code structure)
```
ClinicalRecord {
  _id              ObjectId
  patientId        ObjectId (ref: Patient, required)
  organizationId   ObjectId (ref: Organization, required)
  dentalChart      Object (FDI tooth map with status per tooth)
  diagnoses        Array<{ code, description, diagnosedAt, diagnosedBy }>
  treatmentHistory Array<{ treatmentId, date, notes }>
  xrayReferences   Array<String> (S3/storage paths)
  updatedAt        Date
}
```

### BookingRequest (Derived from code structure)
```
BookingRequest {
  _id              ObjectId
  organizationId   ObjectId (ref: Organization)
  patientId        ObjectId (ref: Patient, optional — may be anonymous)
  patientName      String
  phone            String
  requestedDate    Date
  notes            String
  status           Enum: pending | approved | rejected
  createdAt        Date
}
```

---

## SECTION 4 — SERVICE RESPONSIBILITIES

### PatientController (`core/patient.controller.js`)
- **list** — Lists patients for the organization with pagination, search, and sort. Accepts query parameters: `search`, `sort`, `page`, `limit`. Forwards `sort` to `PatientListService`.
- **create** — Creates a new patient record (org-isolated)
- **getProfile** — Returns full patient aggregate (profile + clinical summary + financial overview)
- **update** — Updates patient field data
- **delete** — Soft-deletes a patient record (status → archived)

### PatientCreateController (`core/patient.create.controller.js`)
- **create** — Specialized create handler for the v1.7.0 internal workflow. Validates org context, emits `patient.created` event.

### PatientListController (`core/patient.list.controller.js`)
- **list** — Optimized listing with search, filtering by branch and status, pagination.

### PatientAggregateService (`core/patient.aggregate.service.js`)
- Computes the full patient view including: profile, clinical snapshot, appointment history, financial balance, outstanding invoices, and treatment plan status. Used for the patient detail page.

### PatientListService (`core/patient.list.service.js`)
- Provides paginate-and-search capability across patients within an organization. Applies branch-scoping automatically.
- **Sort strategies:** `smart` (priority-based with inline fallback), `name` (A→Z), `recent` (newest by createdAt), `lastvisit` (recent visits). Default: `smart`.
- **Command search:** Supports `balance>X`, `insurance:X`, `tag:X`, `lastvisit>Xm`, `phone:X`, `name:X`.

### ClinicalController (`clinical/clinical.controller.js`)
- **getRecord** — Returns the patient's clinical record
- **update** — Updates clinical record data. Emits `patient.medical.updated`.

### FinancialController (`financial/financial.controller.js`)
- **getSummary** — Returns outstanding balance, last payment date, and invoice count for the patient.

### DocumentsController (`documents/documents.controller.js`)
- **getSignedUrl** — Generates a time-limited signed URL for accessing a patient file from object storage.

### PatientAuthController (`access/patientAuth.controller.js`)
- **activate** — Activates the patient portal account using an activation PIN sent to the patient's phone/email.
- **login** — Authenticates patient with phone + PIN, issues a portal-scoped JWT.

### BookingIntegrationController (`bookingIntegration/bookingIntegration.controller.js`)
- **getSlots** — Returns available appointment slots for the patient to request (public-facing)
- **submitRequest** — Submits a booking request from the patient portal. Emits `patient.booking.requested`.

### PolicyController (`policies/policy.controller.js`)
- **getPortalConfig** — Returns the organization's patient portal configuration (which features are enabled)
- **update** — Updates portal configuration policies

---

## SECTION 5 — API CONTRACTS

### Patient Portal Routes (Public + Patient Auth)
| Method | Path | Purpose | Guard |
|--------|------|---------|-------|
| POST | `/api/v1/patient/domain/portal/activate` | Activate patient portal account | None |
| POST | `/api/v1/patient/domain/portal/login` | Patient portal login | None |
| GET  | `/api/v1/patient/domain/portal/profile` | Get patient profile | `patientProtect` |
| GET  | `/api/v1/patient/domain/portal/clinical` | Get clinical record | `patientProtect` |
| PUT  | `/api/v1/patient/domain/portal/clinical` | Update clinical record | `patientProtect` |
| GET  | `/api/v1/patient/domain/portal/financial/summary` | Get financial summary | `patientProtect` |
| GET  | `/api/v1/patient/domain/portal/documents/signed-url` | Get signed URL for file | `patientProtect` |
| GET  | `/api/v1/patient/domain/portal/booking/slots` | Get available booking slots | `patientProtect` |
| POST | `/api/v1/patient/domain/portal/booking/request` | Submit booking request | `patientProtect` |
| GET  | `/api/v1/patient/domain/portal/config` | Get portal configuration | `patientProtect` |

### Internal Staff Routes (v1.7.0)
| Method | Path | Purpose | Guard |
|--------|------|---------|-------|
| POST | `/api/v1/patient/domain/internal/patients` | Create patient | `orgProtect` + `PATIENTS_CREATE` |
| GET  | `/api/v1/patient/domain/internal/patients` | List patients | `orgProtect` + `PATIENTS_READ` |

### Sovereign Patient Management Routes
| Method | Path | Purpose | Guard |
|--------|------|---------|-------|
| GET    | `/api/v1/patient/domain/` | List patients | `orgProtect` + `PATIENTS_READ` |
| POST   | `/api/v1/patient/domain/` | Create patient | `orgProtect` + `PATIENTS_CREATE` |
| GET    | `/api/v1/patient/domain/:id` | Get patient profile | `orgProtect` + `PATIENTS_READ` |
| PUT    | `/api/v1/patient/domain/:id` | Update patient | `orgProtect` + `PATIENTS_UPDATE` |
| DELETE | `/api/v1/patient/domain/:id` | Delete patient | `orgProtect` + `PATIENTS_DELETE` |
| GET    | `/api/v1/patient/domain/:id/clinical` | Get clinical record | `orgProtect` + `PATIENTS_READ` |
| PUT    | `/api/v1/patient/domain/:id/clinical` | Update clinical record | `orgProtect` + `PATIENTS_UPDATE` |
| PUT    | `/api/v1/patient/domain/policies` | Update portal policies | `orgProtect` + `PATIENTS_UPDATE` |

---

## SECTION 6 — SECURITY RULES

- **Multi-tenant isolation:** Every query is scoped to `organizationId`, injected server-side from the JWT. There is no path for cross-tenant patient data access.
- **Branch scoping:** Patients are further scoped to branches where `organizationContext` middleware is active. Staff with limited branch access can only see patients in their allowed branches.
- **Patient portal isolation:** Patient portal JWT (`patientProtect`) is entirely separate from org staff JWT. A patient token cannot access staff-side routes.
- **RBAC enforcement:** All staff-side patient operations require explicit org permission: `patients.read`, `patients.create`, `patients.update`, `patients.delete`.
- **Signed URL access:** Document signed URLs are time-limited (TTL from storage provider). No unauthenticated permanent file access.
- **Soft delete:** Patient deletion does not remove the record. It sets `status = archived`, preserving audit trail and financial history.
- **clinicalRecord.organizationId:** Clinical records carry their own `organizationId` to enforce isolation even if accessed directly.

---

## SECTION 7 — EVENTS

| Event | When Emitted | Consumers |
|-------|-------------|-----------|
| `patient.created` | New patient created by staff | NotificationEngine (→ "New Patient Added" in-app notification) |
| `patient.updated` | Patient record updated | Audit log |
| `patient.deleted` | Patient soft-deleted | Audit log |
| `patient.portal.activated` | Patient activates portal | Audit log, optional welcome email |
| `patient.booking.requested` | Patient submits booking request | NotificationEngine (→ "New Booking Request" notification to org admin) |
| `patient.medical.updated` | Clinical record updated | Audit log |
| `patient.policy.updated` | Portal policy changed | Audit log |
| `patient.file.uploaded` | Document uploaded for patient | Audit log |
| `patient.doctor.assigned` | Doctor assigned to patient | Notification to doctor (optional) |

---

## SECTION 8 — INVARIANTS

- `organizationId` on the Patient document must always match the authenticated user's `organizationId` from the JWT.
- Patient portal tokens cannot access staff-facing API routes (guarded by separate middleware).
- Deleted (archived) patients must not be permanently removed from the database — financial and clinical history must be preserved.
- The `patientId` referenced by Appointment, Invoice, and OrthodonticCase must point to an existing Patient with the same `organizationId`.
- `clinicCode` used in portal login must resolve to the same organization as the patient's `organizationId`.
- `global.__PATIENT_AGGREGATE_ACTIVE__ = true` is set at routes module load as a runtime architecture certification flag.
- **INV-DTO-1:** Every patient API response MUST include `displayName`, computed by the DTO layer (`patient.dto.js`). No controller may return raw DB models.
- **INV-DTO-2:** All DTO builder return values are `Object.freeze()`'d — immutable. Any downstream mutation attempt throws in strict mode.
- **INV-DTO-3:** Frontend components MUST NOT compute display names. The only allowed pattern is `patient.displayName || "Unknown"`.

---

## SECTION 9 — FAILURE CONDITIONS

| Condition | HTTP Status | Message |
|-----------|-------------|---------|
| Patient not found | 404 | Patient not found |
| Unauthorized branch access | 403 | Branch access denied |
| Missing required fields | 400 | Validation error |
| Organization mismatch | 403 | Forbidden |
| Portal not activated | 401 | Portal access not enabled |
| Invalid portal credentials | 401 | Invalid phone or PIN |
| Feature not enabled | 403 | Feature not available on your plan |
| Signed URL generation fails | 500 | Internal server error |
| DTO contract violation (dev) | 500 | DTO_ENFORCER: contract violation |

---

## SECTION 10 — PERFORMANCE CONSIDERATIONS

- **Indexes:**
  - `Patient.organizationId + branchId` (composite, primary listing query)
  - `Patient.organizationId + status` (for active-patient filtering)
  - `Patient.phone` (for portal login lookup by phone number)
  - `ClinicalRecord.patientId` (unique, one record per patient)

- **PatientAggregateService:** Performs multiple parallel `Promise.all` queries to build the complete patient aggregate view. This is a read-heavy fan-out pattern. Consider Redis caching for frequently accessed patient profiles under high clinic load.

- **PatientListService:** Uses MongoDB `$text` search index if available, or falls back to regex-based search on `name`, `phone`, `email`. `$text` index is strongly recommended in production.

- **Portal sessions:** Patient portal JWTs have a shorter expiry than staff JWTs, reducing the blast radius of a compromised portal session.

---

## SECTION 11 — DTO CONTRACT LAYER (Phase 9.1)

**Version:** 9.1 — Introduced 2026-03-31
**SSOT:** `backend/src/dto/patient.dto.js`

### Purpose

The DTO layer is the **single source of truth** for all patient response shapes. It enforces deterministic, immutable data contracts between the backend API and all frontend consumers.

### Architecture: 5-Layer Defense Stack

| Layer | File | Trigger | Behavior |
|-------|------|---------|----------|
| L1: Schema Validation | `validation/patient.schema.js` | Patient write (create/update) | Zod `.superRefine()` blocks write if no name field present |
| L2: DTO Builder | `dto/patient.dto.js` | Every response | `resolveDisplayName()` fallback chain: nameEnglish → nameArabic → fullNameNormalized → patientCode → "—" |
| L3: Immutability | `dto/patient.dto.js` | Every response | `Object.freeze()` on all DTO outputs, including nested objects |
| L4: Runtime Enforcer | `middleware/dtoEnforcer.js` | JSON response on `/patient/domain` and `/command/search` | Dev: throw. Prod: structured log. |
| L5: Frontend Assert | `utils/assertDTO.js` | Component render | Dev: throw. Prod: console.error. |

### DTO Builders

| Builder | Shape | Consumer |
|---------|-------|----------|
| `buildPatientListDTO(p)` | List/directory rows | `patient.list.service.js` |
| `buildPatientSearchDTO(p, matchType)` | Search results with `_matchType` | `patient.search.controller.js` |
| `buildPatientCoreDTO(p)` | Detail/profile view (`core` sub-object) | `patient.aggregate.service.js` |
| `buildPatientSummaryDTO(p)` | Minimal (intake, notifications) | `intake.controller.js` |

### Frontend Components with assertPatientDTO

| Component | File |
|-----------|------|
| `PatientRow` | `PatientsPage.jsx` |
| `PatientRowCard` | `PatientWorkspace.jsx` |
| `LargeAvatar` | `WorkspaceContextPanel.jsx` |
| `WorkspaceContextPanel` | `WorkspaceContextPanel.jsx` |
| `PatientContextPanel` | `PatientContextPanel.jsx` |
| `PatientExpandedRow` | `PatientExpandedRow.jsx` |

### Contract Tests

- `backend/tests/dto/patient.dto.test.js` — Jest: resolveDisplayName, all 4 builders, freeze, mutation safety
- `backend/tests/dto/smoke.js` — Lightweight Node.js smoke test (zero-dependency)

