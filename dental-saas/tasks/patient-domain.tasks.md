# Patient Domain Tasks
## DentalSaaS v3.2 — Patient Domain — Missing & Incomplete Functionality
**Generated from SpecKit Analysis — 2026-03-12**

---

## LEGEND
- `[ ]` Open / not implemented
- `[~]` Partial / incomplete
- `[x]` Confirmed implemented
- `[!]` Critical gap

---

## CORE AGGREGATE IMPLEMENTATION

- [x] Patient creation with atomic transaction + AuditLog + event
- [x] Patient update (allowlist enforcement) with OAV
- [x] Patient soft delete (kill-switch: PatientUser tokenVersion++)
- [x] Patient status change (isActive) with OAV
- [x] Branch governance (primary + access list) with OAV invariant enforcement
- [x] Medical history update (atomic + event)
- [x] Policy management (org-level, OAV)
- [x] Doctor assignment (audit + event → subscriber handles projection)
- [x] Portal enable/disable (OAV)
- [x] Patient aggregate projection assembly
- [~] **Financial slot in aggregate projection is placeholder (balance: 0, lastInvoice: null) — connect to financialDomain**
- [ ] **Patient duplicate detection via phone or national ID**
- [ ] **Merge duplicate patients**
- [ ] **Patient archive / restore (separate from soft delete)**

---

## DATA MODEL COMPLETENESS

- [x] E164 phone normalization on creation
- [x] Phone digits index for search
- [x] Arabic/English name auto-detection
- [ ] **Secondary phone normalization (currently stored raw)**
- [ ] **nationalId uniqueness within org (no unique index)**
- [ ] **Emergency contact phone normalization to E164**
- [ ] **Insurance policy expiry validation at creation/update**
- [ ] **Date of birth validation (no future dates)**
- [ ] **Country field on patient (referenced in phone normalization but schema review needed)**

---

## CLINICAL RECORD

- [x] ClinicalRecord model (chronicConditions, allergies, medications, smoking, pregnancy)
- [x] Notes with authorId + content
- [x] Risk flags computed in aggregate (SMOKER, PREGNANT)
- [x] Allergy alerts in aggregate
- [ ] **Prescription model exists (`clinical/prescription.model.js`) but not wired to aggregate projection**
- [ ] **Clinical notes do not support editing (append-only) — `[!]` need immutability enforcement**
- [ ] **Voice notes support (roadmap)**
- [ ] **Tooth-level notes (roadmap)**
- [ ] **X-ray attachment to clinical record (roadmap)**

---

## PATIENT POLICY

- [~] PatientPolicy OAV exists — specific policy fields not extracted (audit model structure)
- [ ] **Consent policy enforcement at stage execution**
- [ ] **Data retention policy enforcement (scheduled job)**
- [ ] **Portal registration policy (allow/deny per org)**

---

## PORTAL ACCESS

- [x] PatientUser model (tokenVersion, isActive)
- [x] Portal enabled/disabled toggle
- [x] Portal JWT invalidated on soft delete / deactivation
- [ ] **Portal registration endpoint not implemented (only toggle — no patient self-registration)**
- [ ] **Portal login flow missing from patient domain spec**
- [ ] **Portal session management (separate from staff sessions)**
- [ ] **Portal password reset flow**

---

## VALIDATION RULES

- [x] Phone E164 validation via libphonenumber-js
- [x] OAV expectedVersion enforcement for external mutations
- [ ] **Email format validation rule in service layer**
- [ ] **Gender enum enforcement (`male | female | other | unspecified`)**
- [ ] **maritalStatus enum enforcement**
- [ ] **Max character limits on name fields**
- [ ] **Patient code uniqueness within org indexed (verify index exists)**

---

## SECURITY ENFORCEMENT

- [x] Tenant scoping on all queries (organizationId)
- [x] Branch access scoping (allowedBranches validation)
- [x] Visibility override scoping (ALL | BRANCH | OWN) via permissionMatrix
- [x] Allowlist field enforcement on updatePatient
- [x] Raw Patient documents not exposed (aggregate projection used)
- [ ] **PHI (Protected Health Information) field access logging — allergies, medications etc.**
- [ ] **IP address propagation to audit from HTTP layer verified?**
- [ ] **Bulk patient export access control (no export endpoint currently)**

---

## AUDIT LOGGING

- [x] PATIENT_CREATED — audit within transaction
- [x] PATIENT_UPDATED — audit within transaction (with change diff)
- [x] PATIENT_DELETED — audit within transaction
- [x] PATIENT_STATUS_CHANGED — audit within transaction
- [x] PATIENT_BRANCH_UPDATED — audit within transaction
- [x] PATIENT_MEDICAL_UPDATED — audit within transaction
- [x] PATIENT_POLICY_UPDATED — audit within transaction
- [x] DOCTOR_ASSIGNED_TO_PATIENT — audit within transaction
- [ ] **PATIENT_PORTAL_ENABLED / PATIENT_PORTAL_DISABLED — audit missing (setPortalEnabled has no audit)**
- [ ] **PATIENT_DUPLICATE_MERGED — audit needed when implemented**

---

## EVENT EMISSIONS

- [x] PATIENT_CREATED emitted post-commit
- [x] PATIENT_UPDATED emitted post-commit
- [x] PATIENT_DELETED emitted post-commit
- [x] PATIENT_STATUS_CHANGED emitted post-commit
- [x] PATIENT_BRANCH_UPDATED emitted post-commit
- [x] PATIENT_MEDICAL_UPDATED emitted post-commit
- [x] PATIENT_POLICY_UPDATED emitted post-commit
- [x] patient.doctor.assigned emitted post-commit
- [ ] **All events missing payload schema versioning (no `v`, `schemaVersion` field)**
- [ ] **PATIENT_PORTAL_ENABLED / PATIENT_PORTAL_DISABLED events missing**

---

## DOMAIN ISOLATION

- [~] `patient.aggregate.service.js` imports `ClinicalRecord` directly — this is acceptable as ClinicalRecord is owned by patientDomain
- [ ] **`appointmentDomain/appointment.controller.js` imports Patient model directly — verify no direct mutations occur**
- [ ] **financial projection slot (balance, lastInvoice) needs to be populated via event-driven read from financialDomain, not direct import**

---

## TESTS

- [ ] Add unit test: createPatient with valid E164 phone → patient created
- [ ] Add unit test: createPatient with invalid phone → 400
- [ ] Add unit test: updatePatient with correct OAV version → updated
- [ ] Add unit test: updatePatient with stale OAV version → VersionConflictError
- [ ] Add unit test: softDeletePatient → patient isActive=false, PatientUser tokenVersion++
- [ ] Add unit test: changePrimaryBranch — primary always in allowedBranchIds
- [ ] Add unit test: setPortalEnabled — OAV enforced
- [ ] Add unit test: aggregate projection contains correct alert flags (allergy, chronic)
- [ ] Add unit test: aggregate projection risk flags (SMOKER, PREGNANT)
- [ ] Add unit test: updatePatient missing expectedVersion → VersionConflictError
- [ ] Add integration test: full patient lifecycle (create → update → soft delete)
- [ ] Add integration test: concurrent updates → OAV conflict resolution
- [ ] Add test: AuditLog created within same transaction (if tx fails, no audit record)
- [ ] Add test: event NOT emitted if transaction fails
- [ ] Add test: branch access control (user without branch cannot access patient)

---

## MISSING FEATURES (Per Roadmap)

- [ ] **Patient Digital Twin projection domain assembly (v3.2 roadmap)**
- [ ] **Risk Engine subscriber to PATIENT_MEDICAL_UPDATED (detect Hypertension+Surgery, etc.)**
- [ ] **Patient cohort assignment (periodontal recall, aligners retention)**
- [ ] **Patient communication history (linked to communicationDomain)**
- [ ] **Patient document archive (consent forms, referral letters)**
