# DENTAL SAAS — IMPLEMENTATION ROADMAP

**Document Type:** Technical Design Specification (TDS) — Execution Plan
**Version:** 1.1
**Generated From:** Compliance & Architecture Audit — 2026-03-12
**Spec Reference:** `specs/spec.md` v3.0 (2026-03-31)
**Audit Reference:** Full System Architecture Audit Report — 2026-03-12

---

## PRIORITY CLASSIFICATION

| Level | Label | Definition | SLA |
|-------|-------|-----------|-----|
| **P0** | Critical | Compliance or security gap that must be resolved before next release | Immediate |
| **P1** | High | Architecture or governance gap with significant operational risk | Within current sprint |
| **P2** | Medium | Feature or infrastructure improvement with moderate impact | Within next 2 sprints |
| **P3** | Low | Enhancement or optimization with minimal operational risk | Backlog — scheduled as capacity allows |

---

## SECTION 1 — GAP REMEDIATION PLAN

### 1.1 Patient Anonymization Service

**Priority:** P0 — Critical
**Spec Reference:** spec.md §21
**Compliance Driver:** GDPR Article 17 (Right to Erasure), regional health privacy laws

#### Architecture

```
Anonymization Request (org admin UI or API)
    │
    ▼
Eligibility Check
    ├── No pending appointments
    ├── No outstanding unpaid invoices
    └── Minimum retention period satisfied
    │
    ▼
MongoDB Transaction
    ├── Scrub Patient PII fields
    ├── Delete PatientUser (portal access)
    ├── Delete PortalInvite
    ├── Queue S3 document deletion (async via BullMQ)
    └── Set patient.isActive = false, deletedAt = now
    │
    ▼
AuditLog Entries
    ├── PATIENT_ANONYMIZATION_REQUESTED
    └── PATIENT_ANONYMIZED (irreversible)
    │
    ▼
Return confirmation with timestamp
```

#### Implementation

| Component | File | Description |
|-----------|------|-------------|
| Service | `backend/src/modules/patient/services/anonymizePatient.service.js` | Core anonymization logic within MongoDB session |
| Controller | `backend/src/modules/patient/controllers/patientAnonymization.controller.js` | API endpoint handler |
| Route | `DELETE /api/v1/org/patients/:id/anonymize` | Guarded by `orgProtect` + `requireOrgPermission(P.PATIENTS_DELETE)` |
| Validator | `backend/src/modules/patient/validators/anonymizePatient.validator.js` | Eligibility pre-checks |
| S3 Cleanup Worker | `backend/src/infrastructure/workers/documentCleanup.worker.js` | Async S3 object deletion via BullMQ |
| Frontend | Patient Settings panel → "Anonymize Patient" button with confirmation dialog | `frontend/src/org/modules/patients/components/AnonymizePatientDialog.jsx` |

#### PII Field Scrub Map

```javascript
const ANONYMIZATION_MAP = {
    nameArabic:         "[ANONYMIZED]",
    nameEnglish:        "[ANONYMIZED]",
    fullNameNormalized: "[ANONYMIZED]",
    nameTokens:         [],
    email:              null,
    phone:              "[REDACTED]",
    phoneRaw:           "[REDACTED]",
    phoneE164:          "[REDACTED]",
    phoneDigits:        "000000000000",
    secondaryPhone:     null,
    address:            null,
    nationality:        null,
    nationalId:         null,
    photo:              null,           // S3 object queued for deletion
    "insurance.provider":     null,
    "insurance.policyNumber": null,
    "emergencyContact.name":  null,
    "emergencyContact.phone": null,
    "emergencyContact.relation": null,
};
```

#### Guard Rules

- Must run inside a MongoDB session (multi-document atomicity)
- `AuditLog` entries written within the same transaction
- S3 deletion is fire-and-forget via BullMQ `documentCleanupQueue` (eventual consistency acceptable)
- PatientUser deletion must invalidate all portal tokens (`tokenVersion` increment)
- Irreversible — no undo endpoint exists

#### Swagger

```
DELETE /api/v1/org/patients/:id/anonymize
Guard: orgProtect + requireOrgPermission(P.PATIENTS_DELETE)
Response 200: { success: true, anonymizedAt: "ISO8601" }
Response 400: { success: false, error: "INELIGIBLE", reason: "..." }
Response 403: { success: false, error: "PERMISSION_DENIED" }
```

#### Dependencies
- `Patient` model (existing)
- `PatientUser` model (existing)
- `AuditLog` model (existing)
- `documentCleanupQueue` (new — BullMQ queue for S3 object deletion)
- S3 client with `deleteObject` capability

#### Estimated Effort
- Backend: 3–4 days
- Frontend: 1–2 days
- Testing: 2 days
- **Total: ~7 days**

---

### 1.2 AI Training Consent Flag

**Priority:** P0 — Critical
**Spec Reference:** spec.md §20, Safeguard 3
**Compliance Driver:** GDPR Article 22, EU AI Act, patient consent requirements

#### Implementation

| Component | File | Change |
|-----------|------|--------|
| Model | `backend/src/modules/patient/models/PatientPolicy.model.js` | Add `consentForAITraining: { type: Boolean, default: false }` |
| Migration | `backend/scripts/migrations/addConsentForAITraining.js` | Backfill existing records with `false` |
| API | `PATCH /api/v1/org/patients/:id/policy` | Accept `consentForAITraining` field |
| Audit | `auditService.createAuditRecord()` | Log `PATIENT_AI_CONSENT_CHANGED` event |
| Dataset Pipeline | `python-ai-engine/dataset/generate_dataset.py` | Filter: exclude cases where patient consent is not granted |
| Frontend | Patient Settings → "AI Data Usage" toggle | `frontend/src/org/modules/patients/components/PatientPolicySettings.jsx` |

#### Dataset Pipeline Enforcement

```python
# python-ai-engine/dataset/generate_dataset.py

def should_include_case(case_metadata):
    """
    Enforce AI training consent before including a case in the dataset.
    Cases without explicit consent are excluded.
    """
    if not case_metadata.get("consentForAITraining", False):
        logger.info(f"Excluding case {case_metadata['caseId']}: no AI consent")
        return False
    return True
```

#### Guard Rules

- Default is `false` — no patient data used for AI training unless explicitly consented
- Consent changes must be recorded in `AuditLog` with before/after values
- Dataset export pipeline must enforce consent check before including any case
- Backend API must validate that `consentForAITraining` is a boolean (Zod schema)

#### Dependencies
- `PatientPolicy` model (existing)
- `AuditLog` model (existing)
- Dataset generation pipeline (existing)

#### Estimated Effort
- Backend: 1 day
- Dataset pipeline: 1 day
- Frontend: 1 day
- Migration: 0.5 day
- **Total: ~3.5 days**

---

### 1.3 AuditLog Archival Cron

**Priority:** P1 — High
**Spec Reference:** spec.md §9 (AuditLog Retention Strategy), §17 (Row 6)
**Driver:** Database performance — 17 indexes on append-only collection cause write latency at scale

#### Architecture

```
Nightly Cron (02:00 UTC)
    │
    ▼
CronLock Acquisition (idempotency)
    │
    ▼
Query: AuditLog.find({ createdAt: { $lt: now - 12 months } })
    │ (batch: 1000 documents per iteration)
    │
    ▼
Bulk Insert → auditlogs_archive collection
    │ (reduced index set: organizationId + createdAt + action only)
    │
    ▼
Verify: insertedCount === sourceCount
    │
    ▼
Delete from active collection
    │ (exception to immutability — archival only)
    │
    ▼
Release CronLock
    │
    ▼
Log: archived count, duration, errors
```

#### Implementation

| Component | File | Description |
|-----------|------|-------------|
| Cron Job | `backend/src/infrastructure/cron/archiveAuditLogs.js` | Main archival job |
| Model | `backend/src/shared/models/AuditLogArchive.js` | Archive collection model (reduced indexes) |
| Scheduler | `backend/src/infrastructure/cron/scheduler.js` | Register job in cron schedule |
| Lock | `CronLock` model (existing) | Prevent duplicate execution |

#### Archive Collection Indexes (Reduced Set)

```javascript
// AuditLogArchive — only 3 indexes (vs. 17 on active collection)
auditLogArchiveSchema.index({ organizationId: 1, createdAt: -1 });
auditLogArchiveSchema.index({ action: 1, createdAt: -1 });
auditLogArchiveSchema.index({ entityId: 1, entity: 1 });
```

#### Configuration

| Parameter | Default | Description |
|-----------|---------|-------------|
| `AUDIT_ARCHIVE_RETENTION_MONTHS` | 12 | Entries older than this are archived |
| `AUDIT_ARCHIVE_BATCH_SIZE` | 1000 | Documents processed per iteration |
| `AUDIT_ARCHIVE_CRON_SCHEDULE` | `0 2 * * *` | Daily at 02:00 UTC |
| `AUDIT_ARCHIVE_DRY_RUN` | `false` | When true, counts but does not move |

#### Dependencies
- `AuditLog` model (existing)
- `CronLock` model (existing)
- MongoDB bulk operations

#### Estimated Effort
- Backend: 2–3 days
- Testing: 1–2 days (including large-dataset simulation)
- **Total: ~4 days**

---

### 1.4 Configurable Data Retention

**Priority:** P1 — High
**Spec Reference:** spec.md §17 (Data Sovereignty)
**Driver:** Regional healthcare regulations require different retention periods per jurisdiction

#### Data Model

```javascript
// backend/src/platform/models/RetentionPolicy.model.js

const retentionPolicySchema = new mongoose.Schema({
    regionCode: {
        type: String,
        required: true,
        unique: true,
        uppercase: true,
        enum: ["EU", "US", "MEA", "APAC", "DEFAULT"]
    },
    patientRecordsYears:    { type: Number, required: true, default: 7 },
    appointmentsYears:      { type: Number, required: true, default: 5 },
    auditLogsMonths:        { type: Number, required: true, default: 12 },
    financialRecordsYears:  { type: Number, required: true, default: 10 },
    communicationMonths:    { type: Number, required: true, default: 24 },
    aiScanYears:            { type: Number, required: true, default: 7 },
    documentsYears:         { type: Number, required: true, default: 7 },
    isActive:               { type: Boolean, default: true },
}, { timestamps: true });
```

#### Resolution Logic

```
1. Lookup RetentionPolicy by Organization.regionCode
2. Fallback to RetentionPolicy with regionCode = "DEFAULT"
3. If not found → use hardcoded defaults (current behavior)
```

#### Implementation

| Component | File | Description |
|-----------|------|-------------|
| Model | `backend/src/platform/models/RetentionPolicy.model.js` | Retention policy per region |
| Service | `backend/src/platform/services/retentionPolicy.service.js` | Resolution logic with fallback |
| Seed | `backend/scripts/seedRetentionPolicies.js` | Seed default policies for known regions |
| Admin API | `GET/PUT /api/platform/v1/retention-policies` | Platform admin CRUD |
| Guard | `authorizePlatformPermission(MANAGE_PLATFORM_SETTINGS)` | Access control |
| Frontend | Platform Settings → Data Retention tab | Configuration UI |

#### Dependencies
- `Organization.regionCode` field (existing)
- Platform admin UI (existing)

#### Estimated Effort
- Backend: 2 days
- Frontend: 1 day
- Seed + migration: 0.5 day
- **Total: ~3.5 days**

---

### 1.5 Object Storage Encryption

**Priority:** P1 — High
**Spec Reference:** spec.md §22 (Compliance Summary — S3 encryption pending)
**Driver:** SOC 2, ISO 27001 — data at rest encryption requirement

#### Configuration

| Bucket | Encryption | Key Management |
|--------|-----------|---------------|
| `scans` | SSE-S3 or SSE-KMS | AWS-managed key (SSE-S3) or customer-managed KMS key |
| `documents` | SSE-S3 or SSE-KMS | Same |
| `exports` | SSE-S3 or SSE-KMS | Same |
| `logos` | SSE-S3 | AWS-managed key (lower sensitivity) |

#### Implementation

```json
// S3 bucket policy — enforce encryption on upload
{
    "Version": "2012-10-17",
    "Statement": [{
        "Sid": "DenyUnencryptedUploads",
        "Effect": "Deny",
        "Principal": "*",
        "Action": "s3:PutObject",
        "Resource": "arn:aws:s3:::dental-saas-*/*",
        "Condition": {
            "StringNotEquals": {
                "s3:x-amz-server-side-encryption": "AES256"
            }
        }
    }]
}
```

#### Backend Changes

| File | Change |
|------|--------|
| S3 upload utilities | Add `ServerSideEncryption: 'AES256'` to all `PutObject` calls |
| Infrastructure docs | Document encryption configuration |
| Health check | Verify bucket encryption policy on startup (optional) |

#### Estimated Effort
- Infrastructure: 1 day
- Backend: 0.5 day
- Verification: 0.5 day
- **Total: ~2 days**

---

### 1.6 Patient Data Export API

**Priority:** P2 — Medium
**Spec Reference:** spec.md §21 (GDPR Data Subject Request Handling — Art. 15, Art. 20)
**Driver:** GDPR right to access and right to portability

#### Endpoint

```
GET /api/v1/org/patients/:id/export
Guard: orgProtect + requireOrgPermission(P.PATIENTS_READ)
Response: application/json
```

#### Export Payload Structure

```json
{
    "exportedAt": "2026-03-12T13:00:00Z",
    "exportVersion": "1.0",
    "patient": { /* Patient document (PII included) */ },
    "clinicalRecords": [ /* ClinicalRecord documents */ ],
    "appointments": [ /* Appointment documents */ ],
    "invoices": [ /* PatientInvoice documents */ ],
    "payments": [ /* PatientPayment documents */ ],
    "documents": [
        {
            "filename": "consent_form.pdf",
            "uploadedAt": "2026-01-15T10:00:00Z",
            "downloadUrl": "https://s3.../presigned-url?..."
        }
    ],
    "orthodonticCases": [ /* OrthodonticCase documents (scan metadata, analysis results) */ ],
    "prescriptions": [ /* Prescription documents */ ]
}
```

#### Implementation

| Component | File | Description |
|-----------|------|-------------|
| Service | `backend/src/modules/patient/services/patientExport.service.js` | Aggregates all patient data |
| Controller | `backend/src/modules/patient/controllers/patientExport.controller.js` | Endpoint handler |
| Route | Patient routes file | `GET /patients/:id/export` |

#### Guard Rules

- Export must be org-scoped (only own patients)
- Must produce AuditLog entry: `PATIENT_DATA_EXPORTED`
- Presigned URLs for documents must have short TTL (15 minutes)
- Export must not include internal fields (`_id`, `__v`, `version`, hashes)

#### Estimated Effort
- Backend: 2–3 days
- Testing: 1 day
- **Total: ~3.5 days**

---

## SECTION 2 — SECURITY HARDENING PLAN

### 2.1 JWT Migration (HS256 → RS256)

**Priority:** P1 — High
**Spec Reference:** spec.md §5 (JWT Strategy — Audit Recommendation)
**Driver:** Asymmetric keys eliminate shared-secret risk; enable JWKS verification

#### Migration Architecture

```
Phase 1 — Separate Symmetric Keys + Centralized JWT Manager (COMPLETE ✅)
    JWT_PLATFORM_SECRET (platform plane)
    JWT_ORG_SECRET (org plane)

Phase 2 — Asymmetric Key Pairs (TARGET)
    Platform: RS256 private key (signing) + public key (verification)
    Org: RS256 private key (signing) + public key (verification)

Phase 3 — JWKS Endpoint (FUTURE)
    /.well-known/jwks.json → serves public keys
    Enables external API consumers to verify tokens
    Supports key rotation with overlapping validity
```

#### Implementation Plan

| Step | Component | Change |
|------|-----------|--------|
| 1 | Key generation | Generate RSA-2048 key pairs for each plane |
| 2 | Signing | Replace `jwt.sign(payload, secret, { algorithm: 'HS256' })` with `jwt.sign(payload, privateKey, { algorithm: 'RS256' })` |
| 3 | Verification | Replace `jwt.verify(token, secret)` with `jwt.verify(token, publicKey, { algorithms: ['RS256'] })` |
| 4 | Dual-mode period | Accept both HS256 and RS256 tokens for 2 weeks during migration |
| 5 | Deprecate HS256 | Remove HS256 support after migration window |
| 6 | JWKS endpoint | `GET /.well-known/jwks.json` serving public keys |
| 7 | Key rotation | Implement overlapping key rotation (new key signs, both keys verify) |

#### Files Affected

| `backend/src/core/auth/jwtManager.js` (new) | Centralized JWT signing/verification — single authority |
| `backend/src/middleware/authMiddleware.js` | Deterministic type-based verification via `verifyByType()` |
| `backend/src/services/authService.js` | All `jwt.sign()` replaced with `signOrgToken()`/`signPlatformToken()` |
| `backend/src/platform/controllers/platformAuthController.js` | `jwt.sign()` replaced with `signPlatformToken()` |
| `backend/src/tests/auth/jwtManager.test.js` (new) | Cross-plane isolation tests, migration fallback tests |
| Environment variables | `JWT_ORG_SECRET`, `JWT_PLATFORM_SECRET` (with `JWT_SECRET` fallback) |

#### Rollback Strategy

- Feature flag `JWT_ALGORITHM=HS256|RS256|DUAL` controls active mode
- `DUAL` mode accepts both algorithms during migration
- Rollback: set `JWT_ALGORITHM=HS256` and restart

#### Estimated Effort
- Backend: 3–4 days
- Testing: 2 days (including dual-mode verification)
- Migration coordination: 1 day
- **Total: ~6 days**

---

### 2.2 Secrets Management

**Priority:** P2 — Medium
**Driver:** Environment variables are visible in process listings, container inspection, and CI logs

#### Architecture

```
Application Boot
    │
    ▼
SecretsLoader (new)
    ├── AWS Secrets Manager  → production
    ├── HashiCorp Vault      → self-hosted production
    └── .env file            → development (unchanged)
    │
    ▼
Inject into process.env
    │
    ▼
Application continues normal boot
```

#### Secrets Inventory

| Secret | Current Location | Target |
|--------|-----------------|--------|
| `JWT_PLATFORM_SECRET` / private key | `.env` | Secrets Manager |
| `JWT_ORG_SECRET` / private key | `.env` | Secrets Manager |
| `MONGO_URI` | `.env` | Secrets Manager |
| `REDIS_URL` | `.env` | Secrets Manager |
| `STRIPE_SECRET_KEY` | `.env` | Secrets Manager |
| `SMTP_PASSWORD` | `.env` | Secrets Manager |
| `AWS_SECRET_ACCESS_KEY` | `.env` | IAM Role (no key needed) |
| `MODULE_REGISTRY_HASH` | `.env` | ConfigMap (non-secret) |

#### Implementation

| Component | File | Description |
|-----------|------|-------------|
| Loader | `backend/src/infrastructure/secrets/secretsLoader.js` | Abstract secrets provider |
| AWS Provider | `backend/src/infrastructure/secrets/providers/awsSecretsManager.js` | AWS SDK integration |
| Vault Provider | `backend/src/infrastructure/secrets/providers/vaultProvider.js` | HashiCorp Vault integration |
| Config | `SECRETS_PROVIDER=env|aws|vault` | Environment variable selecting provider |

#### Estimated Effort
- Backend: 3 days
- Infrastructure: 1 day
- Testing: 1 day
- **Total: ~5 days**

---

### 2.3 Platform Login Rate Limiter

**Priority:** P1 — High
**Spec Reference:** spec.md §10 (Rate Limiting — platform rate limiter not yet implemented)
**Driver:** Architecture audit finding — platform admin login has no brute-force protection

#### Implementation

```javascript
// backend/src/middleware/platformRateLimiter.js

const rateLimit = require("express-rate-limit");
const RedisStore = require("rate-limit-redis");
const redisClient = require("../infrastructure/redis/redisClient");

const platformLoginLimiter = rateLimit({
    store: new RedisStore({ sendCommand: (...args) => redisClient.call(...args) }),
    windowMs: 15 * 60 * 1000,   // 15 minutes
    max: 5,                      // 5 attempts per window
    keyGenerator: (req) => req.ip,
    message: {
        success: false,
        error: { code: "RATE_LIMITED", message: "Too many login attempts. Try again later." }
    },
    standardHeaders: true,
    legacyHeaders: false,
});

const platformApiLimiter = rateLimit({
    store: new RedisStore({ sendCommand: (...args) => redisClient.call(...args) }),
    windowMs: 60 * 1000,        // 1 minute
    max: 200,                    // 200 requests per minute per IP
    keyGenerator: (req) => `${req.ip}:${req.platformUser?._id || 'anon'}`,
    standardHeaders: true,
    legacyHeaders: false,
});
```

#### Route Attachment

```javascript
// In platform auth routes
router.post("/auth/login", platformLoginLimiter, platformAuthLogin);
router.post("/auth/2fa/verify", platformLoginLimiter, platformAuth2FA);

// General platform API limiter
router.use("/api/platform", platformApiLimiter);
```

#### Estimated Effort
- Backend: 0.5 day
- Testing: 0.5 day
- **Total: ~1 day**

---

## SECTION 3 — DATA GOVERNANCE IMPLEMENTATION

### 3.1 PII Masking in Logs

**Priority:** P2 — Medium
**Driver:** Prevent PII leakage into log aggregation systems

#### Implementation

| Component | File | Description |
|-----------|------|-------------|
| Utility | `backend/src/utils/piiMask.js` | `maskEmail()`, `maskPhone()`, `maskName()` |
| Logger integration | `backend/src/utils/logger.js` | Pino serializer that auto-masks known PII field names |

#### Masking Rules

```javascript
// backend/src/utils/piiMask.js

function maskEmail(email) {
    if (!email) return null;
    const [local, domain] = email.split("@");
    return `${local[0]}***@${domain}`;
}

function maskPhone(phone) {
    if (!phone) return null;
    return phone.replace(/\d(?=\d{4})/g, "*");
}

function maskName(name) {
    if (!name) return null;
    return name[0] + "***";
}
```

#### Pino Serializer

```javascript
// Auto-mask PII fields in all structured log output
const PII_FIELDS = ["email", "phone", "name", "firstName", "lastName", "nationalId"];

const piiSerializer = (obj) => {
    const masked = { ...obj };
    PII_FIELDS.forEach(field => {
        if (masked[field]) masked[field] = maskField(field, masked[field]);
    });
    return masked;
};
```

#### Estimated Effort
- Backend: 1.5 days
- Testing: 0.5 day
- **Total: ~2 days**

---

### 3.2 Patient Record Read Auditing

**Priority:** P2 — Medium
**Driver:** Compliance requirement — all access to patient medical records must be logged

#### Architecture

```
GET /api/v1/org/patients/:id
    │
    ▼
orgProtect + requireOrgPermission
    │
    ▼
Controller: getPatientById
    │
    ▼
Fire-and-forget AuditLog
    action: "PATIENT_RECORD_ACCESSED"
    entityType: "Patient"
    entityId: patientId
    actorId: req.user._id
    │
    ▼
Return patient data
```

#### Implementation

| Component | File | Change |
|-----------|------|--------|
| Middleware | `backend/src/middleware/readAuditMiddleware.js` (new) | Generic read-audit middleware factory |
| Patient routes | Patient route file | Attach `readAudit("Patient")` to GET endpoints |

```javascript
// readAuditMiddleware.js
function readAudit(entityType) {
    return (req, res, next) => {
        const entityId = req.params.id || req.params.patientId;
        if (entityId) {
            auditService.createAuditRecord({
                actorId: req.user._id,
                actorType: "org_user",
                action: `${entityType.toUpperCase()}_RECORD_ACCESSED`,
                entityType,
                entityId,
                organizationId: req.organizationId,
                branchId: req.branchId || SYSTEM_ID,
                ipAddress: req.ip,
                correlationId: req.requestId,
                success: true,
            }).catch(() => {}); // Non-blocking
        }
        next();
    };
}
```

#### Estimated Effort
- Backend: 1 day
- Testing: 0.5 day
- **Total: ~1.5 days**

---

## SECTION 4 — ORGANIZATION PLANE FEATURE COMPLETION

### 4.1 Patient Portal

**Priority:** P2 — Medium
**Spec Reference:** spec.md §3 (Domain Map — Patient Portal)

#### Feature Checklist

| Feature | Status | Description |
|---------|--------|-------------|
| Portal Login | ✅ Implemented | `PortalLoginPage`, `PatientUser` model, JWT auth |
| Portal Dashboard | ✅ Implemented | `PortalDashboard` component |
| Appointment Booking | ✅ Implemented | `BookingPage` — slot selection + booking request |
| Invoice Viewing | ✅ Implemented | `InvoicesPage` — view and download invoices |
| Treatment Progress | ⚠️ Partial | Read-only view of clinical records needed |
| Orthodontic Stage Viewer | ⚠️ Partial | 3D viewer integration for patient-facing view |
| Scan Upload (Patient) | ❌ Not implemented | Patient-initiated scan upload workflow |
| Prescription History | ❌ Not implemented | Read-only view of prescriptions |
| Document Download | ❌ Not implemented | Download shared documents (consent forms, reports) |

#### Remaining Work

| Component | Effort | Dependencies |
|-----------|--------|-------------|
| Treatment Progress Tab | 2 days | Clinical record read API (existing) |
| Orthodontic Stage Viewer | 3 days | 3D viewer component (existing), public-facing scan data endpoint |
| Scan Upload | 3 days | S3 upload pipeline, file validation |
| Prescription History | 1 day | Prescription read API (existing) |
| Document Download | 1 day | Document engine signed URL API (existing) |

**Total Estimated Effort: ~10 days**

---

### 4.2 Orthodontic Module

**Priority:** P2 — Medium
**Spec Reference:** spec.md §3 (Domain Map — Orthodontic Domain)

#### Feature Checklist

| Feature | Status | Description |
|---------|--------|-------------|
| OrthodonticCase Model | ✅ Implemented | Case creation, scan metadata, treatment stages |
| Scan Upload + Processing | ✅ Implemented | STL upload → dataset generation → AI pipeline |
| 3D Viewer | ✅ Implemented | Three.js viewer with segmentation overlay |
| Treatment Stages | ⚠️ Partial | Basic stage CRUD exists; progression tracking needed |
| Aligner Tracking | ❌ Not implemented | Aligner production status, delivery tracking |
| Comparison Views | ❌ Not implemented | Before/after scan comparison |
| Progress Photos | ❌ Not implemented | Photo timeline for treatment progress |
| Arch Curve Overlay | ✅ Implemented | B-spline arch curve visualization |

#### Remaining Work

| Component | Effort | Dependencies |
|-----------|--------|-------------|
| Stage Progression Engine | 3 days | OrthodonticCase model update, FSM |
| Aligner Tracking Module | 4 days | New model: `AlignerSet`, production workflow |
| Before/After Comparison | 2 days | Dual 3D viewer with sync controls |
| Progress Photo Timeline | 2 days | Photo upload + timeline UI |

**Total Estimated Effort: ~11 days**

---

### 4.3 Inventory Engine

**Priority:** P2 — Medium
**Spec Reference:** spec.md §3, `inventory-engine.spec.md`

#### Feature Checklist

| Feature | Status | Description |
|---------|--------|-------------|
| Stock Item CRUD | ✅ Implemented | Items with OAV, categories, suppliers |
| Stock Transactions | ✅ Implemented | Append-only inventory ledger |
| Case Cost Snapshots | ✅ Implemented | Cost calculation per patient case |
| Stock Alerts | ❌ Not implemented | Low-stock threshold notifications |
| Auto-Deduction | ❌ Not implemented | Automatic stock decrease from completed procedures |
| Expiry Tracking | ❌ Not implemented | Batch expiry dates, FIFO alerts |
| Reorder Suggestions | ❌ Not implemented | Consumption-based reorder point calculation |

#### Remaining Work

| Component | Effort | Dependencies |
|-----------|--------|-------------|
| Stock Alert System | 2 days | Notification engine integration |
| Auto-Deduction from Procedures | 3 days | Procedure → material mapping model |
| Batch Expiry Tracking | 2 days | `InventoryBatch` model, FIFO logic |
| Reorder Suggestions | 2 days | Consumption history analysis |

**Total Estimated Effort: ~9 days**

---

### 4.4 Treatment Protocol Engine

**Priority:** P3 — Low
**Spec Reference:** spec.md §3 (Domain Map — Clinical Protocol Domain)

#### Features

| Feature | Description | Effort |
|---------|-------------|--------|
| Protocol Templates | Define reusable treatment protocols with stages, materials, and durations | 3 days |
| Stage Templates | Standard stage definitions (impression, bonding, adjustment, debond) | 2 days |
| Protocol Assignment | Assign protocol to patient treatment case, auto-create stages | 2 days |
| Workflow Automation | Auto-schedule follow-up appointments based on protocol stages | 3 days |
| Protocol Analytics | Completion rates, average duration, deviation tracking | 2 days |

**Total Estimated Effort: ~12 days**

---

### 4.5 Clinical Imaging Integration

**Priority:** P3 — Low
**Spec Reference:** spec.md §14 (2D Imaging — X-ray / CBCT References)

#### Features

| Feature | Description | Effort |
|---------|-------------|--------|
| Image Gallery | Patient-scoped image gallery with upload, tagging, and annotation | 3 days |
| DICOM Viewer | Embedded DICOM viewer (Cornerstone.js or OHIF integration) | 5 days |
| CBCT Viewer | 3D volume rendering from CBCT data | 5 days |
| Image Comparison | Side-by-side image comparison with measurement tools | 3 days |

**Total Estimated Effort: ~16 days**

---

## SECTION 5 — AI PIPELINE PRODUCTIONIZATION

### 5.1 Dedicated Inference Server

**Priority:** P1 — High
**Spec Reference:** spec.md §13 (AI Compute Plane — Mode B)
**Driver:** Architecture audit — CLI child process invocation does not scale

#### Architecture

```
Node.js API
    │
    ▼
BullMQ inferenceQueue
    │ Job: { organizationId, caseId, scanPath, modelVersion }
    │
    ▼
FastAPI Inference Server
    ├── /infer     → run inference on scan
    ├── /health    → GPU status, model version, queue depth
    └── /models    → list loaded models
    │
    ▼
ONNX Runtime GPU Workers
    ├── Model loaded from registry
    ├── Pre-request VRAM check
    └── Result → S3 + MongoDB update
    │
    ▼
WebSocket progress event → frontend
```

#### Implementation Plan

| Step | Component | Effort |
|------|-----------|--------|
| 1 | FastAPI server scaffold | 2 days |
| 2 | ONNX Runtime inference endpoint | 3 days |
| 3 | Model registry (S3-backed, versioned) | 2 days |
| 4 | GPU memory manager | 1 day |
| 5 | BullMQ `inferenceQueue` integration (Node.js side) | 1 day |
| 6 | Result writeback (S3 + MongoDB) | 1 day |
| 7 | WebSocket progress events | 1 day |
| 8 | Health check endpoint | 0.5 day |
| 9 | Docker containerization | 1 day |
| 10 | Integration testing | 2 days |

**Total Estimated Effort: ~14.5 days**

---

### 5.2 Dataset Versioning

**Priority:** P2 — Medium
**Driver:** Reproducibility — training results must be traceable to exact dataset version

#### Implementation

| Component | Description | Effort |
|-----------|-------------|--------|
| Dataset manifest file | JSON manifest recording: sample count, consent status, split ratios, generation timestamp | 1 day |
| Version tagging | Git tag or S3 versioned prefix per dataset generation run | 0.5 day |
| Training metadata | Record `datasetVersion` in model checkpoint metadata | 0.5 day |

**Total Estimated Effort: ~2 days**

---

### 5.3 Training Automation

**Priority:** P3 — Low
**Driver:** Streamline model retraining with new scan data

#### Implementation

| Component | Description | Effort |
|-----------|-------------|--------|
| Training trigger | API endpoint or scheduled job to trigger retraining | 2 days |
| Evaluation gate | Auto-evaluate new model; promote only if mIoU > threshold | 2 days |
| Model promotion | Automatic deployment of approved models to inference server | 1 day |
| Notification | Alert platform admins when new model is promoted or fails evaluation | 1 day |

**Total Estimated Effort: ~6 days**

---

## SECTION 6 — INFRASTRUCTURE HARDENING

### 6.1 Disaster Recovery

**Priority:** P1 — High

#### Targets

| Metric | Target | Implementation |
|--------|--------|---------------|
| **RTO** (Recovery Time Objective) | 30 minutes | Pre-provisioned standby infrastructure, automated failover |
| **RPO** (Recovery Point Objective) | 5 minutes | Continuous MongoDB oplog replication, Redis AOF persistence |

#### Backup Strategy

| Service | Strategy | Frequency | Retention |
|---------|----------|-----------|-----------|
| MongoDB | Atlas continuous backup / mongodump to S3 | Continuous (oplog) + daily snapshots | 30 days (snapshots), 72 hours (point-in-time) |
| Redis | AOF persistence + RDB snapshots | AOF: everysec, RDB: hourly | 7 days |
| Object Storage (S3) | Cross-region replication (CRR) | Real-time | Same as source |
| AI Model Checkpoints | S3 versioned storage | Per training run | Indefinite |

#### Recovery Procedures

```
Database Recovery:
  1. Identify failure timestamp
  2. Restore MongoDB from point-in-time backup (Atlas) or latest snapshot
  3. Replay oplog to T-5min
  4. Verify AuditLog hash chain integrity
  5. Restart API servers

Redis Recovery:
  1. Sentinel promotes replica to primary (automatic)
  2. Verify queue state via BullBoard
  3. Retry any stalled jobs

S3 Recovery:
  1. Cross-region replica serves reads (automatic with CRR)
  2. Verify bucket encryption policy
```

---

### 6.2 Search Infrastructure

**Priority:** P2 — Medium

#### Phased Approach

```
Phase 1 — Current (MongoDB Text Indexes)
  Patient: { name: "text", email: "text" }
  Organization: { name: "text" }
  Adequate for <10K patients per org

Phase 2 — Future (OpenSearch / Elasticsearch)
  Sync MongoDB → OpenSearch via Change Streams
  Full-text search with fuzzy matching, Arabic tokenization
  Faceted search for patient discovery
  Required when: >50K patients per org or multi-field search needed
```

---

### 6.3 Webhook System

**Priority:** P3 — Low
**Driver:** External integrations (EHR systems, practice management tools)

#### Architecture

```
Domain Event (EventBus)
    │
    ▼
WebhookDispatcher
    │ Lookup registered webhook URLs for event type + organizationId
    │
    ▼
BullMQ webhookQueue
    │ Payload: { url, event, data, signature }
    │ Retry: exponential backoff × 5
    │
    ▼
HTTP POST to registered URL
    │ Headers: X-Webhook-Signature (HMAC-SHA256)
    │
    ▼
Log delivery status
```

#### Supported Events (Initial)

| Event | Payload |
|-------|---------|
| `invoice.paid` | `{ invoiceId, amount, currency, organizationId }` |
| `appointment.created` | `{ appointmentId, patientId, date, doctorId }` |
| `appointment.completed` | `{ appointmentId, patientId, completedAt }` |
| `analysis.completed` | `{ caseId, modelVersion, status }` |
| `patient.created` | `{ patientId, organizationId }` |

#### Estimated Effort
- Backend: 5 days
- Admin UI: 2 days
- Testing: 2 days
- **Total: ~9 days**

---

## SECTION 7 — OBSERVABILITY AND OPERATIONS

### 7.1 Distributed Tracing

**Priority:** P2 — Medium
**Spec Reference:** spec.md §8 (Request Correlation)

#### Stack

```
OpenTelemetry SDK (Node.js + Python)
    │
    ▼
OTLP Exporter
    │
    ▼
Jaeger / Grafana Tempo
    │
    ▼
Grafana Dashboard
```

#### Implementation

| Component | Description | Effort |
|-----------|-------------|--------|
| OpenTelemetry SDK integration (Node.js) | Auto-instrument Express, Mongoose, BullMQ | 2 days |
| OpenTelemetry SDK integration (Python) | Instrument FastAPI inference server | 1 day |
| Trace propagation | W3C `traceparent` header between Node.js ↔ Python | 0.5 day |
| Grafana dashboards | Request latency, error rates, queue processing time | 1 day |
| Alerting | PagerDuty / Slack alerts for error rate spikes | 1 day |

**Total Estimated Effort: ~5.5 days**

---

### 7.2 Custom Business Metrics

**Priority:** P2 — Medium

#### New Prometheus Metrics

| Metric | Type | Labels | Description |
|--------|------|--------|-------------|
| `ai_inference_duration_seconds` | Histogram | `model_version`, `status` | AI inference processing time |
| `patient_anonymization_total` | Counter | `organizationId`, `status` | Anonymization operations |
| `refund_processing_total` | Counter | `type`, `status` | Refund lifecycle events |
| `subscription_cache_hit_total` | Counter | — | Redis subscription cache hits |
| `subscription_cache_miss_total` | Counter | — | Redis subscription cache misses |
| `audit_log_archival_total` | Counter | `status` | Audit log archival batch counts |
| `webhook_delivery_total` | Counter | `event`, `status` | Webhook delivery results |

**Estimated Effort: ~2 days**

---

## SECTION 8 — RELEASE ROADMAP

### Phase 1 — Compliance Stabilization

**Duration:** 2–4 weeks
**Goal:** Close all P0 compliance gaps and critical P1 items

| # | Task | Priority | Effort | Dependencies |
|---|------|----------|--------|-------------|
| 1.1 | Patient Anonymization Service | P0 | 7 days | Patient model, AuditLog, S3 |
| 1.2 | AI Training Consent Flag | P0 | 3.5 days | PatientPolicy model, dataset pipeline |
| 1.3 | AuditLog Archival Cron | P1 | 4 days | CronLock, AuditLog model |
| 1.4 | S3 Encryption Configuration | P1 | 2 days | S3 bucket access |
| 1.5 | Platform Login Rate Limiter | P1 | 1 day | Redis, rate-limit library |
| | **Phase Total** | | **~17.5 days** | |

**Exit Criteria:**
- Patient anonymization functional and tested
- AI consent flag enforced in dataset pipeline
- Audit archival running in staging
- S3 encryption verified
- Platform login rate-limited

---

### Phase 2 — Security Hardening

**Duration:** 4–6 weeks
**Goal:** Harden authentication, secrets management, and data governance

| # | Task | Priority | Effort | Dependencies |
|---|------|----------|--------|-------------|
| 2.1 | JWT RS256 Migration | P1 | 6 days | Key generation, auth refactor |
| 2.2 | Secrets Management Integration | P2 | 5 days | AWS SDK or Vault client |
| 2.3 | PII Masking in Logs | P2 | 2 days | Logger refactor |
| 2.4 | Patient Record Read Auditing | P2 | 1.5 days | AuditLog, middleware |
| 2.5 | Configurable Data Retention | P1 | 3.5 days | RetentionPolicy model |
| 2.6 | Patient Data Export API | P2 | 3.5 days | Multi-model aggregation |
| | **Phase Total** | | **~21.5 days** | |

**Exit Criteria:**
- RS256 tokens in production
- Secrets no longer in `.env` files
- PII masked in all log output
- Patient read access audited
- Retention policies configurable per region
- GDPR export endpoint functional

---

### Phase 3 — Organization Plane Completion

**Duration:** 6–8 weeks
**Goal:** Complete missing org-plane features

| # | Task | Priority | Effort | Dependencies |
|---|------|----------|--------|-------------|
| 3.1 | Patient Portal Completion | P2 | 10 days | Existing portal, S3, 3D viewer |
| 3.2 | Orthodontic Module Completion | P2 | 11 days | 3D viewer, OrthodonticCase model |
| 3.3 | Inventory Engine Completion | P2 | 9 days | Notification engine, procedure mapping |
| 3.4 | Treatment Protocol Engine | P3 | 12 days | Stage model, appointment integration |
| | **Phase Total** | | **~42 days** | |

**Exit Criteria:**
- Patient portal feature-complete
- Orthodontic module with stage progression and aligner tracking
- Inventory with alerts, auto-deduction, and expiry tracking
- Treatment protocols assignable to patient cases

---

### Phase 4 — AI Production Deployment

**Duration:** 8–12 weeks
**Goal:** Deploy production-grade AI inference system

| # | Task | Priority | Effort | Dependencies |
|---|------|----------|--------|-------------|
| 4.1 | FastAPI Inference Server | P1 | 14.5 days | ONNX Runtime, GPU cluster |
| 4.2 | Dataset Versioning | P2 | 2 days | S3, dataset pipeline |
| 4.3 | Training Automation | P3 | 6 days | Inference server, evaluation pipeline |
| 4.4 | Distributed Tracing | P2 | 5.5 days | OpenTelemetry, Grafana |
| 4.5 | Disaster Recovery Setup | P1 | 3 days | MongoDB Atlas, Redis Sentinel, S3 CRR |
| 4.6 | Custom Business Metrics | P2 | 2 days | Prometheus |
| | **Phase Total** | | **~33 days** | |

**Exit Criteria:**
- FastAPI inference server handling production traffic
- GPU workers with memory management
- Model registry with versioning
- Distributed tracing operational
- DR tested with failover drill
- Business metrics in Grafana dashboards

---

### Timeline Summary

```
Week 1–4:   Phase 1 — Compliance Stabilization
Week 5–10:  Phase 2 — Security Hardening
Week 7–14:  Phase 3 — Org Plane Completion (overlaps with Phase 2)
Week 11–22: Phase 4 — AI Production Deployment (overlaps with Phase 3)
```

```
            W1  W2  W3  W4  W5  W6  W7  W8  W9  W10 W11 W12 W13 W14 ... W22
Phase 1:    ████████████████
Phase 2:                    ████████████████████████
Phase 3:                            ████████████████████████████████
Phase 4:                                            ████████████████████████████████
```

### Total Effort Estimate

| Phase | Effort (days) | Team Size | Calendar Duration |
|-------|--------------|-----------|------------------|
| Phase 1 | 17.5 | 2 engineers | 2–3 weeks |
| Phase 2 | 21.5 | 2 engineers | 3–4 weeks |
| Phase 3 | 42 | 3 engineers | 4–5 weeks |
| Phase 4 | 33 | 2 engineers + 1 ML engineer | 5–6 weeks |
| **Total** | **114 days** | | **~22 weeks (with overlap)** |

---

### Risk Register

| Risk | Impact | Probability | Mitigation |
|------|--------|------------|-----------|
| RS256 migration causes token invalidation | High | Medium | Dual-mode period (accept both HS256 + RS256) |
| AuditLog archival deletes active entries | Critical | Low | Dry-run mode, count verification before delete |
| GPU OOM during concurrent inference | High | Medium | Pre-request VRAM check, queue-based serialization |
| S3 encryption breaks existing signed URLs | Medium | Low | Test in staging first; re-sign existing URLs |
| Patient anonymization misses related entities | High | Medium | Comprehensive entity map, integration tests |
| Redis failover loses in-flight queue jobs | Medium | Low | BullMQ persistence, Redis AOF everysec |

---

## SECTION 9 — ORG PLANE MILESTONES

### Phase 1 — Access & Org Identity Layer ✅ COMPLETE

| Component | Status | Spec Reference |
|-----------|--------|----------------|
| Org Authentication (JWT isolation) | ✅ Complete | spec.md §5 |
| User Management (CRUD + RBAC) | ✅ Complete | spec.md §6 |
| Branch System | ✅ Complete | spec.md §4 |
| JWT Plane Isolation Hardening | ✅ Complete | spec.md §5 (JWT Manager) |

### Phase 2 — Clinical Core ✅ COMPLETE

| Component | Status | Spec Reference |
|-----------|--------|----------------|
| Patient Model (172 lines, multi-branch schema) | ✅ Complete | spec.md §23.1 |
| Patient Aggregate Service (690 lines, transactional DDD) | ✅ Complete | spec.md §23.1 |
| Patient Controllers (CRUD + search + visibility governance) | ✅ Complete | spec.md §23.1 |
| Patient Routes (RBAC-guarded, staff + portal) | ✅ Complete | spec.md §23.1 |
| Patient Swagger Docs | ✅ Complete | /api/docs |
| Appointment Model (134 lines, 8-state FSM) | ✅ Complete | spec.md §23.2 |
| Appointment Controller (803 lines, dual overlap, calendar) | ✅ Complete | spec.md §23.2 |
| Appointment Service (sovereign, event-driven) | ✅ Complete | spec.md §23.2 |
| Status FSM Engine (validated transitions) | ✅ Complete | spec.md §23.2 |
| Overlap Detection (dentist cross-branch + chair in-branch) | ✅ Complete | spec.md §23.2 |
| Slot Scheduling (configurable per org) | ✅ Complete | spec.md §23.2 |
| Event Bus Integration (4 events) | ✅ Complete | spec.md §23.2 |
| Appointment Routes (RBAC + feature-gated) | ✅ Complete | spec.md §23.2 |
| Appointment Swagger Docs | ✅ Complete | /api/docs |

### Phase 3 — Clinical Operations ✅ COMPLETE
**Completed:** 2026-03-12
**Spec Reference:** Section 24

| Component | Status | Notes |
|-----------|--------|-------|
| RBAC Extension (16 permissions) | ✅ COMPLETE | procedures.*, treatments.*, invoices.*, payments.* across 5 roles |
| Procedure Catalog Engine | ✅ COMPLETE | Model + Service + Controller + Routes + Swagger (5 endpoints) |
| Treatment Domain + FSM | ✅ COMPLETE | Model + Service + Controller + Routes + Swagger (4 endpoints) |
| Treatment Plan Engine | ✅ COMPLETE | Model + Service + Controller + Routes + Swagger (3 endpoints) |
| Patient Invoice Engine | ✅ COMPLETE (pre-existing orchestrator) | Routes + Swagger wrapping FinancialOrchestrator (4 endpoints) |
| Patient Payment Engine | ✅ COMPLETE (pre-existing orchestrator) | Routes + Swagger wrapping FinancialOrchestrator (3 endpoints) |
| Financial Ledger | ✅ COMPLETE (pre-existing) | Append-only, v8.2 precision |
| Domain Events | ✅ COMPLETE | treatment.created, treatment.completed, treatment.status_changed |
| Swagger Documentation | ✅ COMPLETE | 19 new endpoint annotations across 4 tags |
| Finance Plane Separation | ✅ VERIFIED | Platform ≠ Organization finance — no cross-plane imports |

---

### Phase 4 — Orthodontic Intelligence ✅ COMPLETE
**Completed:** 2026-03-12
**Spec Reference:** Section 25

| Component | Status | Notes |
|-----------|--------|-------|
| OrthodonticCase Service Layer | ✅ COMPLETE | FSM (draft→diagnosis→treatment_planning→active→completed) |
| ScanFile Model + Storage Pipeline | ✅ COMPLETE | 7 file types, S3 path convention, processing status FSM |
| ToothSegmentation Model | ✅ COMPLETE | FDI-numbered, per-tooth confidence/centroid/bbox, Bolton analysis |
| CephAnalysis Model | ✅ COMPLETE | 10+ angles, landmarks, skeletal classification, growth pattern |
| AlignerPlan Model | ✅ COMPLETE | 6DOF per-tooth movements, IPR, attachments, auto-totals |
| AI Analysis Queue (BullMQ) | ✅ COMPLETE | aiAnalysisQueue — segmentation + ceph analysis jobs |
| Domain Events | ✅ COMPLETE | scan.uploaded, analysis.started, analysis.completed, aligner.plan_created |
| Orthodontic Routes (14 endpoints) | ✅ COMPLETE | Cases, Scans, AI Analysis, Aligner Plans |
| Swagger Documentation | ✅ COMPLETE | 4 new tags, 14 endpoint annotations |
| Pre-existing Integration | ✅ VERIFIED | orthodonticTeeth.controller + landmarks.controller retained |

---

### Phase 5 — Advanced Clinical (NEXT)

| Component | Status | Priority |
|-----------|--------|----------|
| Recall & Follow-up System | 🔲 Not Started | P2 |
| Diagnostic Code System (ICD/CDT) | 🔲 Not Started | P2 |
| Clinical Notes & Attachments | 🔲 Not Started | P2 |
| Patient Communication Workflows | 🔲 Not Started | P3 |

---

### Phase 5 — Patient Portal & Remote Monitoring ✅ COMPLETE
**Completed:** 2026-03-12
**Spec Reference:** Section 26

| Component | Status | Notes |
|-----------|--------|-------|
| Portal Auth Service (password + magic link + OTP) | ✅ COMPLETE | Wraps pre-existing PatientUser + PortalInvite |
| AlignerProgress Model + Service | ✅ COMPLETE | 4-state FSM, pain/compliance tracking |
| PatientPhoto Model + Queue | ✅ COMPLETE | 6 types, S3 virtual path, AI analysis |
| MonitoringSession Model + FSM | ✅ COMPLETE | 4-state FSM, doctor review, revision flow |
| PatientMessage Model | ✅ COMPLETE | Bidirectional messaging, read tracking |
| photoAnalysisQueue (BullMQ) | ✅ COMPLETE | 2-min timeout, exponential backoff |
| Portal Routes (15+ endpoints) | ✅ COMPLETE | Auth, Progress, Photos, Monitoring, Messages |
| Swagger Documentation | ✅ COMPLETE | 5 new tags |
| Domain Events | ✅ COMPLETE | 4 new Phase 5 events |
| RBAC Extensions | ✅ COMPLETE | portal.read, portal.manage, monitoring.review |

---

### Phase 6 — Recall & Advanced Clinical (NEXT)

| Component | Status | Priority |
|-----------|--------|----------|
| Recall & Follow-up System | 🔲 Not Started | P2 |
| Diagnostic Code System (ICD/CDT) | 🔲 Not Started | P2 |
| Clinical Notes & Attachments | 🔲 Not Started | P2 |

---

### Frontend Architecture Validation ✅ COMPLETE
**Completed:** 2026-03-12
**Spec Reference:** Section 27

| Check | Result |
|-------|--------|
| Repository Structure | ✅ 8/10 |
| Module Isolation | ⚠️ 6/10 — split across 3 locations |
| Routing Centralization | ✅ 9/10 |
| Layout System | ✅ 8/10 |
| Design System | ⚠️ 7/10 — legacy duplicates |
| API Layer | ⚠️ 5/10 — 3/8+ services |
| Tenant Isolation | ✅ 9/10 — no organizationId in payloads |
| Plane Separation | ✅ 10/10 — zero cross-imports |
| RBAC Compliance | ⚠️ 6/10 — 1 inline role check |
| State Management | ⚠️ 6/10 — no React Query |
| **Overall Score** | **7.4 / 10 — COMPATIBLE** |

Remediation tasks: TASK-FE-AUDIT-001 through 005

---

### Frontend Architecture Normalization ✅ COMPLETE
**Completed:** 2026-03-12
**Spec Reference:** Section 28

| Deliverable | Status |
|-------------|--------|
| Design system: Input, FeatureItem, StatsBadge added | ✅ DONE |
| Design system barrel export v2.1 | ✅ DONE |
| Legacy `components/ui/` → re-exports (platform compat) | ✅ DONE |
| Org imports migrated: LoginPage, SignupPage | ✅ DONE |
| Domain API services (6 new): treatments, invoices, orthodontics, portalAuth, portalMonitoring, portalMessages | ✅ DONE |
| `RequireOrgPermission` guard created | ✅ DONE |
| Route guards applied to 8 org routes | ✅ DONE |
| RBAC fix: `roleName === "doctor"` → `usePermission("calendar.selfFilterOnly")` | ✅ DONE |
| Backend: `calendar.selfFilterOnly` permission added to doctor role | ✅ DONE |
| Tenant isolation re-verified | ✅ PASS |
| Plane isolation re-verified | ✅ PASS |

---

### Frontend Phase 1 — Org Runtime + Governance + Profile ✅ COMPLETE
**Completed:** 2026-03-12
**Spec Reference:** Section 29

| Module | Files | Status |
|--------|:-----:|--------|
| Users Management | 5 | ✅ DONE — CRUD + table + create/edit modals + branch access |
| Branch Management | 4 | ✅ DONE — CRUD + table + editor + working hours |
| RBAC Role Viewer | 1 | ✅ DONE — 5×10 permission matrix |
| Profile System | 3 | ✅ DONE — tabs (profile/security/sessions) |
| API Services | 3 | ✅ DONE — users, branches, auth |
| Router Updates | — | ✅ DONE — 4 new routes with guards |
| Sidebar Updates | — | ✅ DONE — admin section with separator |
| Header Dropdown | — | ✅ DONE — profile link + role badge |
| Tenant Isolation | — | ✅ PASS |
| Plane Isolation | — | ✅ PASS |

---

### Frontend Phase 2 — Patient Domain UI ✅ COMPLETE
**Completed:** 2026-03-12
**Spec Reference:** Section 30

| Component | Files | Status |
|-----------|:-----:|--------|
| Patient API Service | 1 | ✅ DONE — CRUD + clinical + documents + appointments + treatments |
| Patient List Page | 1 | ✅ DONE — table/card toggle, search, pagination, RBAC |
| Patient Search Bar | 1 | ✅ DONE — reusable search component |
| Patient Table | 1 | ✅ DONE — avatars, code badges, gender, status |
| Create Patient Modal | 1 | ✅ DONE — quick inline registration |
| Patient Profile Entry | 1 | ✅ DONE — re-exports PatientLayout |
| Treatments Tab (NEW) | 1 | ✅ DONE — fetches treatment records from API |
| Appointments Tab | 1 | ✅ ENHANCED — real API data, status badges |
| Documents Tab | 1 | ✅ ENHANCED — upload/view/delete, file type icons |
| PatientLayout Updated | — | ✅ DONE — Treatments tab added to navigation |
| Router Updated | — | ✅ DONE — treatments route, PatientsPage wired |
| Tenant Isolation | — | ✅ PASS |
| Plane Isolation | — | ✅ PASS |

---

### Frontend Phase 3 — Appointment & Calendar UI ✅ COMPLETE
**Completed:** 2026-03-12
**Spec Reference:** Section 31

| Component | Files | Status |
|-----------|:-----:|--------|
| Appointments API Service | 1 | ✅ DONE — CRUD + status + calendar + availability + doctors |
| Calendar Page | 1 | ✅ DONE — daily schedule, date nav, filters, RBAC |
| Calendar View (Grid) | 1 | ✅ DONE — time axis, chair columns, now indicator |
| Appointment Card | 1 | ✅ DONE — time-positioned, 10 status colors |
| Status Badge | 1 | ✅ DONE — 10 statuses, 3 sizes (xs/sm/lg) |
| Create Drawer | 1 | ✅ DONE — slots, duration, notes, conflicts |
| Edit Drawer | 1 | ✅ DONE — details, status transitions, history |
| Doctor Filter | 1 | ✅ DONE — dropdown from API |
| Branch Filter | 1 | ✅ DONE — dropdown from API |
| Router Updated | — | ✅ DONE — CalendarPage wired |
| Tenant Isolation | — | ✅ PASS |
| Plane Isolation | — | ✅ PASS |

---

---

### Frontend Phase 4 — Clinical Core UI ✅ COMPLETE
**Completed:** 2026-03-12
**Spec Reference:** Section 32

| Component | Files | Status |
|-----------|:-----:|--------|
| Treatments API Service | 1 | ✅ DONE — CRUD + procedures + notes + documents |
| Treatments Page | 1 | ✅ DONE — search, filter, table, pagination, RBAC |
| Treatment Status Badge | 1 | ✅ DONE — 5 statuses (planned/in_progress/completed/cancelled/pending) |
| Treatment Timeline | 1 | ✅ DONE — vertical, chronological, icons, cost/tooth/notes |
| Procedure Selector | 1 | ✅ DONE — 14 defaults, searchable, grouped by category |
| Create Treatment Drawer | 1 | ✅ DONE — procedure, FDI tooth, status, cost, notes |
| Clinical Notes | 1 | ✅ DONE — add/view, RBAC-gated (clinical.update) |
| X-ray Viewer | 1 | ✅ DONE — zoom, rotate, fullscreen, thumbnails |
| TreatmentsTab Enhanced | 1 | ✅ DONE — now embeds Timeline + XrayViewer |
| Router Updated | — | ✅ DONE — /org/treatments added |
| Sidebar Updated | — | ✅ DONE — Treatments nav item added |
| Tenant Isolation | — | ✅ PASS |
| Plane Isolation | — | ✅ PASS |

---

### Frontend Phase 5 — Finance & Billing UI ✅ COMPLETE
**Completed:** 2026-03-12
**Spec Reference:** Section 33

| Component | Files | Status |
|-----------|:-----:|--------|
| Finance API Service | 1 | ✅ DONE — CRUD + recordPayment + refund + summary + breakdown |
| Invoices Page | 1 | ✅ DONE — stats cards, chart, table, search, filters, pagination |
| Payment Status Badge | 1 | ✅ DONE — 6 statuses (pending/paid/partial/refunded/voided/overdue) |
| Invoice Viewer | 1 | ✅ DONE — line items, totals, history, void/pay/refund, print |
| Record Payment Modal | 1 | ✅ DONE — amount, 8 methods, reference, notes |
| Revenue Chart | 1 | ✅ DONE — Recharts AreaChart, daily/monthly, billed vs collected |
| Treatment Billing Panel | 1 | ✅ DONE — invoice from treatment (clinical module) |
| Router Updated | — | ✅ DONE — /org/invoices added |
| Sidebar Updated | — | ✅ DONE — Finance nav → /org/invoices |
| Legacy /org/finance | — | ✅ PRESERVED unchanged |
| Tenant Isolation | — | ✅ PASS |
| Plane Isolation | — | ✅ PASS |

---

### Frontend Phase 6 — Orthodontics & AI Module UI ✅ COMPLETE
**Completed:** 2026-03-12
**Spec Reference:** Section 34

| Component | Files | Status |
|-----------|:-----:|--------|
| Orthodontics API Service | 1 | ✅ DONE — case CRUD + scan upload + AI trigger + aligner plans |
| Orthodontic Cases Page | 1 | ✅ DONE — search, status filter, table, pagination, create drawer |
| Orthodontic Case Detail | 1 | ✅ DONE — 3-tab: overview + scans & AI + notes |
| Case Status Badge | 1 | ✅ DONE — 7 statuses |
| Create Ortho Drawer | 1 | ✅ DONE — patient ID, malocclusion class, duration, notes |
| 3D Scan Viewer | 1 | ✅ DONE — Canvas 2D dental arch, FDI arcs, rotation/zoom/fullscreen |
| Scan Uploader | 1 | ✅ DONE — drag-and-drop STL/PLY, progress bar, AI analysis trigger |
| Segmentation Overlay | 1 | ✅ DONE — tooth grid, FDI, type badges, confidence, measurements |
| Stage Timeline | 1 | ✅ DONE — vertical done/current/upcoming, advance stage action |
| Aligner Progress | 1 | ✅ DONE — SVG ring, stats, mark complete, remaining time |
| Case Notes | 1 | ✅ DONE — add/view notes (RBAC: orthodontics.update) |
| Router Updated | — | ✅ DONE — /org/orthodontics + /:caseId added |
| Sidebar Updated | — | ✅ DONE — Orthodontics nav item (SparklesIcon) added |
| Import Collision Fixed | — | ✅ DONE — OrgInvoicesPage alias |
| Tenant Isolation | — | ✅ PASS |
| Plane Isolation | — | ✅ PASS |

---

### Frontend Phase 7 — Orthodontic Hardening & Bonding Engine Integration ✅ COMPLETE
**Completed:** April 6, 2026
**Spec Reference:** Section 36 (Dual-Layer UX Architecture)

| Component | Status | Notes |
|-----------|--------|-------|
| OPG Modal Interaction Hardening | ✅ COMPLETE | Decoupled OPG/Bracket states, ref-based outside-click, z-index [1100] |
| Bonding Engine DB Sync Layer | ✅ COMPLETE | Asynchronous persistence via `useBondingEngine`, OPG group sync |
| Dual-Layer UX (Diagnostic + Action) | ✅ COMPLETE | OPG stays open as reference while bracket panel operates on top |
| Event Propagation Safety | ✅ COMPLETE | StopPropagation enforced across all internal charting elements |


---

### Frontend Phase 7 — Orthodontic Hardening & Bonding Engine Integration ✅ COMPLETE
**Completed:** April 6, 2026
**Spec Reference:** Section 36 (Dual-Layer UX Architecture)

| Component | Status | Notes |
|-----------|--------|-------|
| OPG Modal Interaction Hardening | ✅ COMPLETE | Decoupled OPG/Bracket states, ref-based outside-click, z-index [1100] |
| Bonding Engine DB Sync Layer | ✅ COMPLETE | Asynchronous persistence via `useBondingEngine`, OPG group sync |
| Dual-Layer UX (Diagnostic + Action) | ✅ COMPLETE | OPG stays open as reference while bracket panel operates on top |
| Event Propagation Safety | ✅ COMPLETE | StopPropagation enforced across all internal charting elements |


---

### Frontend Phase 7 — Patient Portal UI ✅ COMPLETE
**Completed:** 2026-03-12
**Spec Reference:** Section 35

| Component | Status | Notes |
|-----------|--------|-------|
| Portal canonical API service (`portal.api.js`) | ✅ DONE | Aggregates all patient endpoints |
| Portal auth hook (`usePortalAuth.js`) | ✅ DONE | Manual JWT decode, type enforcement |
| PortalLoginPage | ✅ UPGRADED | Real API, dual-mode (password + OTP tabs) |
| PortalAppointmentsPage | ✅ DONE | Card view, upcoming/past/all filter |
| PortalTreatmentsPage | ✅ DONE | Collapsible cards, stage timeline, aligner bar |
| AlignerPhotoUploader | ✅ DONE | Multi-photo, drag-drop, preview grid, progress |
| PortalMessages | ✅ DONE | Chat bubbles, auto-poll, Enter-to-send |
| PortalMessagesPage | ✅ DONE | Route wrapper |
| PortalLayout (Treatments + Messages nav) | ✅ UPGRADED | 2 new nav items |
| Router (`/portal/appointments,treatments,messages`) | ✅ DONE | Inside PortalAuthGuard |
| Tenant isolation (no organizationId) | ✅ PASS | |
| Plane isolation (no modules/org/* imports) | ✅ PASS | |

---

### Backend Import Alias Standardization ✅ VALIDATED
**Audited:** 2026-03-12
**Spec Reference:** Section 36

**Audit Summary:**

| Finding | Detail |
|---------|--------|
| module-alias version | v2.3.4 |
| Bootstrap position | ✅ First line of server.js |
| Defined aliases | 10 (focused on platform plane) |
| Missing org-plane aliases | `@modules`, `@middleware`, `@rbac`, `@infra`, `@events`, `@config` |
| Files using aliases | ~6 files (platform plane only) |
| Org plane alias usage | 0 files — clean slate |
| Deepest relative import | 5 levels (`../../../../../`) |
| Depth-4 offenders | 9 files (billingDomain services, governance validators) |
| Compatibility verdict | PARTIAL — safe to standardize with conditions |

**Next Actions (TODO):**
- TASK-BE-ARCH-ALIAS-001 — Add 6 new aliases to `package.json`
- TASK-BE-ARCH-ALIAS-002 — Org Plane route import refactor (10 files)
- TASK-BE-ARCH-ALIAS-003 — Platform Plane incremental refactor

---

### Architecture Hardening ✅ VALIDATED
**Date:** 2026-03-12
**Spec Reference:** Section 38

**Objective:** Fix remaining tenant isolation vulnerability, add automated ESLint architecture guard, and enforce patient portal isolation rules.

**Tasks:**

| Task | Scope | Status |
|------|-------|--------|
| TASK-BE-ARCH-SEC-001 | Portal Tenant Isolation Fix | ✅ DONE |
| TASK-BE-ARCH-SEC-002 | ESLint Architecture Guard (Backend) | ✅ DONE |
| TASK-FE-ARCH-SEC-003 | Patient Portal Isolation (Frontend ESLint) | ✅ DONE |

**Deliverables:**
- `patientAuth.controller.js` — `organizationId` stripped from request body
- `patientAuth.service.js` — parameter removed, tokenHash-only DB lookup
- `backend/eslint.config.js` — plane isolation guard (3 rules)
- `frontend/eslint.config.js` — portal isolation guard (2 rules + tenant check)

---

---

### Organization Finance Engine ✅ COMPLETE
**Date:** 2026-03-12
**Spec Reference:** Section 40

| Task | Scope | Status |
|------|-------|--------|
| TASK-BE-FINANCE-ORG-001 | PatientInvoice Model | ✅ DONE (pre-existing) |
| TASK-BE-FINANCE-ORG-002 | PatientPayment + Wallet + Ledger Models | ✅ DONE (pre-existing) |
| TASK-BE-FINANCE-ORG-003 | Ledger Orchestrator Service | ✅ DONE (pre-existing) |
| TASK-BE-FINANCE-ORG-004 | Invoice + Payment Routes | ✅ DONE (pre-existing) |
| TASK-BE-FINANCE-ORG-005 | Finance Summary Service + Routes | ✅ DONE (new) |
| TASK-BE-FINANCE-ORG-006 | FINANCE_* Permission Aliases | ✅ DONE (new) |

**New deliverables:**
- `financeDomain/services/financeSummary.service.js` — daily/monthly analytics, outstanding rankings
- `financeDomain/routes/finance.routes.js` — 3 endpoints, ACCOUNTING_READ guarded
- `app.js` — `/api/v1/finance` registered
- `orgPermissions.js` — `FINANCE_READ`, `FINANCE_CREATE`, `FINANCE_MANAGE` aliases

---

### Billing Hardening — Contract Timeline Integrity ✅ COMPLETE
**Date:** 2026-03-12
**Spec Reference:** Section 41

| Task | Scope | Status |
|------|-------|--------|
| TASK-BE-BILLING-015 | Contract overlap migration fix | ✅ DONE |
| TASK-BE-BILLING-016 | Transactional contract lifecycle (root cause fix) | ✅ DONE |
| TASK-BE-BILLING-017 | Contract timeline invariant enforcement | ✅ DONE |

**Deliverables:**
- `scripts/fixContractOverlap.js` — one-time migration to align overlapping contracts
- `contractActivation.service.js` — root cause fix: `effectiveTo = contract.effectiveFrom`
- `contractEngine.service.js` — `CONTRACT_TIMELINE_OVERLAP` pre-creation guard
- `OrgContract.model.js` — timeline compound index `{ organizationId, effectiveFrom, effectiveTo }`
- `guardianAutoRepair.js` — `repairContractTimeline()` auto-repair function (dev-only)
- `startup.guardian.js` — wired timeline auto-repair into guardian phase 2

### Billing Hardening — Contract Gap Integrity ✅ COMPLETE
**Date:** 2026-03-12
**Spec Reference:** Section 41.5

| Task | Scope | Status |
|------|-------|--------|
| TASK-BE-BILLING-018 | Contract Gap Integrity Invariant | ✅ DONE |

**Deliverables:**
- `startup.guardian.js` — `checkContractGapIntegrity()` guardian check
- `guardianAutoRepair.js` — `repairContractGaps()` auto-repair (adjusts successor.effectiveFrom)
- `scripts/fixContractGaps.js` — one-time migration script with DRY_RUN support

---

### Platform Stability Validation ✅ RESOLVED
**Date completed:** 2026-03-12
**Spec Reference:** Section 42, 42.5

| Task | Scope | Status |
|------|-------|--------|
| TASK-PLATFORM-AUDIT-001 | API response normalization (frontend safe arrays) | ✅ DONE |
| TASK-PLATFORM-AUDIT-002 | Admin debug endpoint security hardening | ✅ DONE |
| TASK-PLATFORM-AUDIT-003 | Bull Board route guard | ✅ DONE |

**All findings remediated:**
- `/admin/debug/email` now requires `platformProtect + superAdminOnly` and is disabled in production
- `/admin/queues` now requires `platformProtect + superAdminOnly`
- `OrganizationUsersPage.jsx` + `PlatformUsersPage.jsx` use `Array.isArray` normalization

*End of implementation plan.*

---

### Phone-Based Geo Routing + OTP Signup Pricing Gate ✅ DONE
**Date completed:** 2026-03-13
**Spec Reference:** Section 42.6 (Geo Routing Architecture)

| Task | Scope | Status |
|------|-------|--------|
| TASK-FEATURE-GEO-OTP-001 | Phone-based OTP, pricing gate, regionCode auto-assignment, signup wizard | ✅ DONE |

**Deliverables:**
- `backend/src/core/geo/phoneCountryExtractor.js` — Phone → ISO country extraction
- `backend/src/organization/controllers/otpController.js` — OTP request/verify + pricing token lifecycle
- `backend/src/shared/routes/platformPublicRoutes.js` — v22.0 with OTP routes
- `backend/src/organization/controllers/publicController.js` — v22.0 with pricing gate + regionCode assignment
- `backend/src/shared/models/User.js` — v26.0 with phone verification fields
- `frontend/src/modules/public-site/SignupPage.jsx` — 4-step signup wizard
- `frontend/src/modules/public-site/Pricing.jsx` — Pricing gate UI

**Architecture impact:**
- Zero guardian invariant changes
- Zero sovereign guard changes
- `organization.regionCode` now set at creation from verified phone country (was null until provisioning)
- Pricing gated behind OTP verification (`X-Pricing-Token` header)
- OTP infrastructure re-enabled (was disabled in Phase 1)

---

### Development Authentication Mode (DEV_AUTH_MODE) ✅ DONE
**Date completed:** 2026-03-13
**Spec Reference:** Section 42.7
**Category:** Developer Experience — Infrastructure

| Task | Scope | Status |
|------|-------|--------|
| TASK-DEV-AUTH-001 | Centralized dev bypass for OTP, rate limits, signup | ✅ DONE |

**Deliverables:**
- `backend/src/config/authConfig.js` — Centralized `DEV_AUTH_MODE` flag (follows `platformMode.js` pattern)
- `backend/dev.env.example` — Developer environment setup reference

**Behaviour summary:**

| Env Config | Result |
|------------|--------|
| `NODE_ENV=development` + `DEV_AUTH_MODE=true` | All external service dependencies bypassed |
| `NODE_ENV=development` + `DEV_AUTH_MODE=false` | Full production flow in dev (integration testing) |
| `NODE_ENV=production` (any) | Bypass dead — `DEV_AUTH_MODE` can never activate |

**Architecture note:** All bypass logic is gated through `authConfig.js`. Raw `process.env.NODE_ENV` checks in auth/signup flows are prohibited — this follows the same centralized config pattern as `platformMode.js`.

---

### Security System Rollout & Monitoring

**Priority:** P1 — High
**Spec Reference:** spec.md §6 (Phase 10 — Security Rollout & Monitoring)
**Status:** ✅ COMPLETE (2026-03-22)

| Phase | Feature | Status |
|-------|---------|--------|
| Phase 1 | Shadow Mode (POLICY_SHADOW_MODE env flag) | ✅ DONE |
| Phase 2 | Denial Monitoring Dashboard (denialTracker + API endpoints) | ✅ DONE |
| Phase 3 | Frontend RBAC Sync (CapabilityProvider, \<Can\> component) | ✅ DONE |
| Phase 4 | Bulk Operation Safety (bulkPolicyChecker) | ✅ DONE |
| Phase 5 | Performance Optimization (minimal .select(), cache invalidation) | ✅ DONE |
| Phase 6 | Frontend Hardening (EmptyState, SafeDataRenderer, optional chaining) | ✅ DONE |

**Files Created:**
- `backend/src/rbac/shadowMode.js`
- `backend/src/rbac/denialTracker.js`
- `backend/src/rbac/bulkPolicyChecker.js`
- `frontend/src/org/guards/CapabilityProvider.jsx`
- `frontend/src/org/guards/Can.jsx`
- `frontend/src/design-system/components/EmptyState.jsx`

**Files Modified:**
- `backend/src/rbac/policyMiddleware.js` — shadow mode + denial tracking integration (v4.0)
- `backend/src/organization/security/security.controller.js` — denial stats + shadow status endpoints
- `backend/src/organization/security/security.routes.js` — denial + shadow routes with Swagger
- `backend/.env` — added `POLICY_SHADOW_MODE=true`
- `backend/.env.example` — documented `POLICY_SHADOW_MODE`
- `frontend/src/org/modules/patients/PatientLayout.jsx` — \<Can\> guards + optional chaining hardening

---

### Security Analytics + Alerting + Resilience System (v4.0)

**Status:** ✅ DONE
**Date:** 2026-03-22
**Priority:** P1 — High

| Phase | Description | Status |
|-------|-------------|--------|
| Phase 1 | Security Alerting System (threshold-based alerts, deduplication) | ✅ DONE |
| Phase 2 | Anomaly Detection (suspicious access patterns, brute force, privilege escalation) | ✅ DONE |
| Phase 3 | Event-Driven Cache Invalidation (semantic hooks: onPolicyChange, onFieldChange, onRoleChange) | ✅ DONE |
| Phase 4 | Policy Versioning (append-only PolicyVersion model, history endpoint) | ✅ DONE |
| Phase 5 | System Metrics (SLO dashboard: policy eval latency, cache hit rate, denial ratio) | ✅ DONE |
| Phase 6 | Frontend Alert Panel (SecurityAlertsTab with severity badges, acknowledge/resolve) | ✅ DONE |

**Files Created:**
- `backend/src/organization/security/models/SecurityAlert.js` — Alert model with dedup key
- `backend/src/organization/security/models/PolicyVersion.js` — Append-only policy version history
- `backend/src/organization/security/securityAlerts.service.js` — Alerting + anomaly detection engine
- `backend/src/organization/security/securityMetrics.service.js` — SLO metrics collector
- `frontend/src/modules/org/security/tabs/SecurityAlertsTab.jsx` — Alert panel UI

**Files Modified:**
- `backend/src/organization/security/securityCache.js` — Added event-driven invalidation hooks
- `backend/src/organization/security/security.controller.js` — Added 6 new controller functions
- `backend/src/organization/security/security.routes.js` — Added 7 new routes with Swagger
- `backend/src/rbac/denialTracker.js` — Integrated alert threshold evaluation on each denial
- `frontend/src/modules/org/security/api/security.api.js` — Added 6 new API methods
- `frontend/src/modules/org/security/hooks/useSecurity.js` — Added 6 new React Query hooks
- `frontend/src/modules/org/security/pages/SecurityPage.jsx` — Added Alerts tab to navigation

**New Endpoints:**
- `GET /api/v1/org/security/alerts` — Paginated alerts (status, severity filters)
- `GET /api/v1/org/security/alerts/summary` — Active alert count by severity
- `PATCH /api/v1/org/security/alerts/:id/acknowledge` — Acknowledge alert
- `PATCH /api/v1/org/security/alerts/:id/resolve` — Resolve alert
- `GET /api/v1/org/security/policies/history` — Policy version timeline
- `GET /api/v1/org/security/metrics` — System metrics (SLO dashboard)

---

## FRONTEND RBAC v2 — COMPLETED

**Priority:** P1 — High
**Status:** ✅ DONE (2026-03-22)
**Task:** TASK-FE-RBAC-V2-001

### Objective
Upgrade frontend RBAC from pure capability checks to a three-layer architecture:
1. Resource-level permissions (PBAC-aware) via `ResourceCapabilityContext`
2. Subscription-aware feature/module gating via `FeatureContext`
3. Safe loading states with skeleton UIs
4. Developer debug tools (`CapabilityDebugger`)

### Architecture
```
/auth/profile → { user, organization: { modules, features, subscription } }
                                    ↓
        AuthProvider → FeatureProvider → CapabilityProvider
                           ↓                      ↓
                   hasModule("orthodontics")    useCapability("patients.update")
                   hasFeature("AI_SEG")         <Can permission="...">
                   <FeatureGate module="...">
                   <SubscriptionGate>
```

### Deliverables
| Deliverable | Status |
|-------------|--------|
| `FeatureContext.jsx` — Module + feature + subscription provider | ✅ |
| `FeatureGate.jsx` — `<FeatureGate>`, `<FeatureHidden>`, `<SubscriptionGate>` | ✅ |
| `useFeatureGate.js` — Composable hooks | ✅ |
| `ResourceCapabilityContext.jsx` — PBAC-aware resource capabilities | ✅ |
| `CapabilityDebugger.jsx` — Dev-only debug panel (Ctrl+Shift+D) | ✅ |
| Backend `/auth/profile` expansion (modules + subscription.status) | ✅ |
| Sidebar module gating (7 nav items with `module` keys) | ✅ |
| PatientLayout tab gating (Orthodontic tab) | ✅ |
| Skeleton loading states (PatientLayout) | ✅ |
| Behavioral contract tests (54 tests, all passing) | ✅ |
| Spec update (spec.md Phase 12 section) | ✅ |
| Task update (tasks.md TASK-FE-RBAC-V2-001) | ✅ |

---

## PERMISSION AUTO-SYNC ENGINE — COMPLETED

**Priority:** P1 — High
**Status:** ✅ DONE (2026-03-22)
**Phase:** 16
**Tasks:** TASK-RBAC-AUTOSYNC-001 through TASK-RBAC-AUTOSYNC-006

### Objective
Eliminate schema drift by generating Mongoose Role Schema, Role Seeds, Permission Types, and Runtime Validators from a single source of truth (`orgPermissions.js`). Make permission drift structurally impossible instead of merely detected.

### Architecture
```
orgPermissions.js (SSOT: P enum + ORG_ROLE_PERMISSIONS + ORG_ROLES)
        ↓
permissionRegistry.js (computational core)
   ├── deriveModuleMap()           → module→actions mapping
   ├── generateSchemaDefinition()  → Mongoose schema fields
   ├── generateRoleSeed()          → per-role permission objects
   ├── generateAllRoleSeeds()      → all system role seeds
   ├── flattenPermissions()        → Set<string> for O(1) auth checks
   ├── flattenPermissionsToObject() → { "mod.action": bool } for API
   └── generatePermissionKeys()    → flat key array for frontend
        ↓
Consumers:
   Role.js (schema)  |  roleInitializer.js (seeds)  |  CI scripts  |  Frontend JSON
```

### Deliverables
| Deliverable | Status |
|-------------|--------|
| `permissionRegistry.js` — SSOT derivative engine (8 exported functions) | ✅ |
| `Role.js` — Auto-generated Mongoose schema from registry | ✅ |
| `roleInitializer.js` — Auto-generated seeds from registry | ✅ |
| `validatePermissionSync.js` — CI validation (7 end-to-end checks) | ✅ |
| `checkPermissionDrift.js` — Live DB drift detection with --fix | ✅ |
| `migrateRolePermissions.js` v2 — SSOT-driven DB migration with --dry-run | ✅ |
| `generatePermissionKeys.js` — Frontend JSON export | ✅ |
| npm scripts (5 new: validate, check, generate, migrate, migrate:dry) | ✅ |
| spec.md Phase 16 section | ✅ |
| tasks.md TASK-RBAC-AUTOSYNC-001 through 006 | ✅ |

---

## PHASE 17 — AUTH SYSTEM HARDENING — COMPLETED

**Priority:** P1 — Critical
**Status:** ✅ DONE (2026-03-22)
**Phase:** 17
**Tasks:** TASK-AUTH-HARDEN-001 through TASK-AUTH-HARDEN-005

### Objective
Transform Phase 16 Auto-Sync Engine into a self-healing, runtime-safe, fully observable authorization system. Prevent invalid permission usage, ensure entitlement sync, enable boot-time auto-healing, introduce role versioning, and provide real-time permission debug visibility.

### Architecture
```
orgPermissions.js (SSOT: P enum + ORG_ROLE_PERMISSIONS + ORG_ROLES)
        ↓
permissionRegistry.js (PERMISSION_VERSION + computational core)
   ├── permissionValidator.js  → boot-time + frontend SSOT validation
   ├── autoFixPermissions.js   → self-healing on every server boot
   ├── Role.js (permissionVersion) → version tracking
   ├── validateEntitlementSync.js → cross-layer plan module check
   └── permissionDebug API     → real-time RBAC × Entitlement matrix
```

### Deliverables
| Deliverable | Status |
|-------------|--------|
| `permissionValidator.js` (backend) — Boot-time SSOT assertion | ✅ |
| `requireOrgPermission.js` — Validator integration | ✅ |
| `validateEntitlementSync.js` — Entitlement plan module sync | ✅ |
| `autoFixPermissions.js` — Boot-time self-healing engine | ✅ |
| `server.js` — Auto-heal wired into boot sequence | ✅ |
| `permissionRegistry.js` — PERMISSION_VERSION + deriveModules() | ✅ |
| `Role.js` — permissionVersion field | ✅ |
| `permissionDebug.controller.js` — Debug API controller | ✅ |
| `permissionDebug.routes.js` — Debug API route (security.manage) | ✅ |
| `orgV1Routes.js` — Debug route mounted at /debug | ✅ |
| `permissionValidator.js` (frontend) — Render-time SSOT validation | ✅ |
| `Can.jsx` + `useCapability.js` — Validator integration | ✅ |
| `CapabilityDebugger.jsx` — v3.0 with permission matrix tab | ✅ |
| `permissionKeys.json` — Generated, 17 modules, 57 keys | ✅ |
| spec.md Phase 17 section | ✅ |
| plan.md Phase 17 section | ✅ |
| tasks.md TASK-AUTH-HARDEN-001 through 005 | ✅ |

---

## PHASE 15 — PBAC ENGINE + FIELD-LEVEL ACCESS + BOOT VALIDATORS — COMPLETED

**Priority:** P1 — Critical
**Status:** ✅ DONE (2026-03-22)
**Phase:** 15
**Tasks:** TASK-RBAC-PBAC-001 through TASK-RBAC-PBAC-005

### Objective
Implement fine-grained, resource-level Policy-Based Access Control (PBAC) that operates on top of base RBAC. Add field-level response filtering per role, and boot-time validators that guarantee 100% policy and field-access coverage before the server accepts requests.

### Architecture
```
orgPermissions.js (P enum — write permissions)
        ↓
policyRegistry.js (per-permission policy rules)
        ↓
policyMiddleware.js (evaluate policies after requireOrgPermission)
        ↓
fieldAccessRegistry.js (role → resource → field whitelist)
        ↓
fieldFilter.js (strip unauthorized fields from responses)
        ↓
Boot-Time Validators:
   policyCoverageValidator.js  → assert 100% write policy coverage
   fieldAccessValidator.js     → assert all roles × resources have definitions
```

### Deliverables
| Deliverable | Status |
|-------------|--------|
| `policyRegistry.js` — 15 modules, all CUD+manage permissions covered | ✅ |
| `policyMiddleware.js` — context-aware policy evaluation engine | ✅ |
| `fieldAccessRegistry.js` — 9 resources × 5 roles field whitelists | ✅ |
| `fieldFilter.js` — whitelist-based response filtering + middleware factory | ✅ |
| `fieldWriteGuard.js` — write-side field protection (9 resources × 5 roles) + middleware factory | ✅ |
| Route integration: fieldWriteGuardMiddleware applied to 8 route files (28 write endpoints) | ✅ |
| `policyCoverageValidator.js` — boot-time write policy assertion | ✅ |
| `fieldAccessValidator.js` — boot-time field access completeness check | ✅ |
| Bug fix: `policyCoverageValidator.js` import (`{ policies: policyRegistry }`) | ✅ |
| Bug fix: alias deduplication in validator (prevent false positives from P aliases) | ✅ |
| Missing policy: `P.TREATMENTS_DELETE` added to policyRegistry | ✅ |
| Missing policy: `P.PAYMENTS_DELETE` added to policyRegistry (with status guard) | ✅ |
| spec.md Phase 15 section (3 new subsections in Section 6) | ✅ |
| plan.md Phase 15 section | ✅ |
| tasks.md TASK-RBAC-PBAC-001 through 005 | ✅ |

### Bug Fixes Applied
1. **policyCoverageValidator.js import** — was `{ policyRegistry }` but module exports `{ policies }`. Fixed to `{ policies: policyRegistry }`.
2. **Alias deduplication** — the `P` enum has aliases (e.g., `FINANCE_READ === ACCOUNTING_READ`) that caused duplicate entries in write permission lists, leading to false "missing policy" warnings. Fixed by deduplicating with `new Set(Object.values(P))`.
3. **Missing policies** — `treatments.delete` and `payments.delete` had no policyRegistry entries, meaning policyMiddleware would strict-deny all delete operations even for org_admin. Both now have policy definitions with appropriate guards.

---

## PHASE 19 — AUTHORIZATION OBSERVABILITY LAYER — COMPLETED

**Priority:** P1 — High
**Status:** ✅ DONE (2026-03-22)
**Phase:** 19
**Tasks:** TASK-AUTH-OBS-001 through TASK-AUTH-OBS-005

### Objective
Instrument every authorization layer with per-request tracing, structured audit logging, and policy simulation capabilities. Provide full visibility into RBAC × Entitlement × PBAC × Field Access decisions for debugging, compliance, and drift detection.

### Architecture
```
authTraceMiddleware (init req.authTrace)
        ↓
Each auth layer calls req.addAuthTrace({ layer, result, ... })
        ↓
res.on("finish") → authAuditLogger emits structured AUTH_TRACE log
        ↓
(DEV only) AUTH_DEBUG=true → injects _authTrace into JSON responses
```

### Deliverables
| Deliverable | Status |
|-------------|--------|
| `authTraceMiddleware.js` — Per-request trace context + DEV debug injection | ✅ |
| `authAuditLogger.js` — Structured AUTH_TRACE logger (INFO/WARN levels) | ✅ |
| `requireOrgPermission.js` — RBAC layer trace instrumentation | ✅ |
| `requireEntitlement.js` — Entitlement layer trace instrumentation | ✅ |
| `policyMiddleware.js` — PBAC layer trace instrumentation (ALLOW/DENY) | ✅ |
| `fieldWriteGuard.js` — v2.0 strict mode + FIELD_WRITE trace instrumentation | ✅ |
| `fieldFilter.js` — FIELD_READ trace instrumentation | ✅ |
| `policyDebugger.js` — Multi-layer policy simulation engine | ✅ |
| `permissionDebug.routes.js` — POST /simulate + GET /full-matrix endpoints | ✅ |
| `permissionDriftCheck.js` — Frontend/Backend drift detection CLI tool | ✅ |
| spec.md Phase 19 section | ✅ |
| plan.md Phase 19 section | ✅ |
| tasks.md TASK-AUTH-OBS-001 through 005 | ✅ |

### Field Write Guard v2.0 (Strict Mode Upgrade)
| Fix | Before | After |
|-----|--------|-------|
| FIX-1 | Silent stripping (defense-in-depth) | 403 FIELD_WRITE_DENIED with invalidFields[] |
| FIX-2 | Top-level field check only | Deep field validation via flattenFieldPaths() |
| FIX-3 | Undefined role = passthrough | Undefined role = denied |
| FIX-4 | No trace | FIELD_WRITE auth trace step |

---

## PHASE 20 — AUTHORIZATION INTELLIGENCE & CONTROL PLANE — COMPLETED

**Priority:** P1 — High
**Status:** ✅ DONE (2026-03-22)
**Phase:** 20
**Tasks:** TASK-AUTH-INT-001 through TASK-AUTH-INT-008

### Objective
Upgrade the Phase 19 observability layer from ephemeral logging to persistent intelligence. Store auth traces in MongoDB, analyze for anomalies, surface aggregated analytics through APIs, and provide resource-level auditability and safe enforcement controls.

### Architecture
```
res.on("finish")
    ↓
persistTraceAsync(req)          — non-blocking (setImmediate)
    ↓
shouldPersist(hasDenial)        — sampling gate
    ↓
AuthTrace.create(doc)           — MongoDB write
    ↓
postPersistHooks[]              — anomaly detection
    ↓
authAnalytics.service.js        — aggregation queries for dashboard
    ↓
security.routes.js              — API exposure (auth/analytics, auth/traces)
    ↓
authTraceCleanup.job.js         — daily retention enforcement
```

### Deliverables
| Deliverable | Status |
|-------------|--------|
| `AuthTrace.js` — MongoDB model with indexes and TTL | ✅ |
| `authTracePersistence.service.js` — Async non-blocking persistence with sampling + hooks | ✅ |
| `authTraceMiddleware.js` — Resource context injection via `req.setAuthResource()` | ✅ |
| `authAnomalyDetector.js` — 3 anomaly detectors (denial burst, cross-org, role deviation) | ✅ |
| `authIntelligenceBootstrap.js` — Boot-time hook registration | ✅ |
| `fieldWriteGuard.js` — v2.1 configurable enforcement mode (strict/warn) | ✅ |
| `authAnalytics.service.js` — Aggregated analytics from persisted traces | ✅ |
| `security.routes.js` — 3 new API endpoints (analytics, traces, trace-by-id) | ✅ |
| `security.controller.js` — 3 new controller methods | ✅ |
| `authTraceCleanup.job.js` — Daily retention enforcement cron job | ✅ |
| `jobs/index.js` — Cleanup job registered in job registry | ✅ |
| `authTraceMiddleware.js` — Debug hardening (role gate, X-Auth-Debug header) | ✅ |
| spec.md Phase 20 section | ✅ |
| plan.md Phase 20 section | ✅ |
| tasks.md TASK-AUTH-INT-001 through 008 | ✅ |

### Environment Variables Added
| Variable | Default | Purpose |
|----------|---------|---------|
| `AUTH_TRACE_ENABLED` | `true` | Master switch for trace persistence |
| `AUTH_TRACE_SAMPLE_RATE` | `1.0` | Sampling rate (0.0–1.0) |
| `AUTH_TRACE_DENY_ALWAYS` | `true` | Always persist denials |
| `AUTH_TRACE_RETENTION_DAYS` | `30` | Trace retention period |
| `FIELD_WRITE_GUARD_MODE` | `strict` | Enforcement mode |
| `CRON_AUTH_TRACE_CLEANUP` | `30 2 * * *` | Cleanup job schedule |
| `JOB_AUTH_TRACE_CLEANUP` | (enabled) | Disable cleanup job |

---

## PHASE 21 — Authorization Analytics Frontend (2026-03-22)

**Status:** ✅ COMPLETE
**Phase Type:** Frontend Feature
**Plane:** Org (security.manage)
**Route:** /org/auth-analytics

### Objective
Build a production-ready Authorization Analytics dashboard UI that visualizes the auth decision pipeline (RBAC → ENTITLEMENT → PBAC → FIELD_WRITE → FIELD_READ) with real-time metrics, denial tracking, risk user identification, and developer-facing auth trace inspection.

### Deliverables

| Component | Status |
|-----------|--------|
| `AuthSummaryCard.jsx` — 4 KPI cards (Total, Allow%, Deny%, Duration) | ✅ |
| `AuthLineChart.jsx` — Timeline area chart (allow/deny over time) | ✅ |
| `AuthDonutChart.jsx` — Distribution donut (allow vs deny ratio) | ✅ |
| `AuthBarChart.jsx` — Horizontal bar chart (top denied permissions) | ✅ |
| `AuthDenialsTable.jsx` — Recent denial logs with role badges | ✅ |
| `AuthRiskUsersTable.jsx` — Risk users ranked by denial count | ✅ |
| `AuthLayerPerformance.jsx` — AVG/P99/PASS metrics per auth layer | ✅ |
| `AuthFieldViolations.jsx` — Protected field violation attempts | ✅ |
| `AuthInspectorPanel.jsx` — Full auth trace timeline with JSON debug | ✅ |
| `AuthAnalyticsPage.jsx` — Dashboard page composing all components | ✅ |
| `authAnalytics.api.js` — Centralized API layer | ✅ |
| `mockData.js` — Comprehensive mock data for all sections | ✅ |
| `useAuthAnalytics.js` — TanStack Query hooks (10 endpoints, tiered polling) | ✅ |
| `App.jsx` — Route registered at /org/auth-analytics | ✅ |

### Phase 21.1 — Live Data Integration (2026-03-22)

| Feature | Status |
|---------|--------|
| React Query hooks for all 10 analytics endpoints | ✅ |
| Tiered auto-polling (15s/30s/60s by data volatility) | ✅ |
| Shimmer loading skeletons for all sections | ✅ |
| ErrorBanner with retry mechanism | ✅ |
| LiveIndicator (Live/Offline/Mock status) | ✅ |
| Polling toggle (Live/Paused) | ✅ |
| Manual refresh with animated icon | ✅ |
| Graceful degradation to mock data | ✅ |
| Date range + role filter propagation to queries | ✅ |
| Queue health metrics in footer | ✅ |
| Cache key hierarchy with `invalidateQueries` | ✅ |
| `keepPreviousData` for flicker-free filter changes | ✅ |

### Architecture Compliance
- Module placement: `modules/org/security/analytics/` ✓
- API layer: centralized ✓
- RBAC: security.manage guard ✓
- Tenant isolation: no organizationId sent ✓
- Plane isolation: no platform imports ✓
- RTL support: logical properties ✓
- React Query for server state ✓
- No direct axios/fetch in components ✓

### Next Steps (Phase 22)
1. ~~Connect mock data to live backend endpoints~~ ✅ DONE (Phase 21.1)
2. ~~Add React Query hooks for data fetching + caching~~ ✅ DONE (Phase 21.1)
3. Add sidebar navigation link for auth-analytics
4. ~~Real-time WebSocket updates for live denial streaming~~ ✅ DONE (Phase 22)

---

## PHASE 22 — Data, Realtime & Intelligence Layer (2026-03-22)

**Status:** ✅ COMPLETE
**Phase Type:** Frontend Feature — Intelligence Layer
**Plane:** Org (security.manage)
**Depends on:** Phase 21 (UI), Phase 21.1 (React Query)

### Objective
Upgrade the authorization analytics dashboard from a data-display tool to a **live, reactive, intelligent security monitoring center** with real-time streaming, anomaly alerts, smart insights, drill-down navigation, and full RTL support.

### Deliverables

| Component | Status |
|-----------|--------|
| **TASK-FE-AUTH-INT-002** — AuthAnalyticsContext (central state via useReducer) | ✅ |
| **TASK-FE-AUTH-INT-003** — Socket.IO real-time streaming (auth:denial, auth:alert, auth:batch, auth:trace) | ✅ |
| **TASK-FE-AUTH-INT-004** — Drill-down navigation (clickable bars + rows + prefetch-on-hover) | ✅ |
| **TASK-FE-AUTH-INT-005** — AuthAlertsPanel (expandable severity-coded alerts with acknowledge/investigate) | ✅ |
| **TASK-FE-AUTH-INT-006** — AuthInsights (smart insights engine: trends, slowest layers, risk users) | ✅ |
| **TASK-FE-AUTH-INT-007** — Cache optimization (tiered staleTime, prefetch, keepPreviousData) | ✅ |
| **TASK-FE-AUTH-INT-008** — RTLToggle (EN/AR with localStorage persistence) | ✅ |

### Files Created (Phase 22)
| File | Purpose |
|------|---------|
| `context/AuthAnalyticsContext.jsx` | Central state provider |
| `hooks/useAuthRealtime.js` | Socket.IO event listener + cache invalidation |
| `components/AuthAlertsPanel.jsx` | Security anomaly alerts panel |
| `components/AuthInsights.jsx` | Smart insights engine |
| `components/RTLToggle.jsx` | EN/AR direction toggle |

### Files Modified (Phase 22)
| File | Changes |
|------|---------|
| `api/authAnalytics.api.js` | Added getAlerts, acknowledgeAlert, getUserDenials, getPermissionBreakdown |
| `hooks/useAuthAnalytics.js` | Added useAuthAlerts, useUserDenials, usePermissionBreakdown, useAuthPrefetch |
| `data/mockData.js` | Added mockAlerts data |
| `pages/AuthAnalyticsPage.jsx` | Integrated all Phase 22 components, drill-down handlers, real-time hook |

### Dashboard Section Flow (Complete)
```
┌─────────────────────────────────────────────┐
│  HEADER: Title + Date/Role Filters + RTL    │
│          Live/Paused + Refresh + Settings    │
├─────────────────────────────────────────────┤
│  SECTION 1: Summary KPI Cards (4)           │
│  SECTION 2: Timeline Area Chart             │
│  SECTION 2.5: Smart Insights ← NEW          │
│  SECTION 3: Donut + Bar Chart (clickable)   │
│  SECTION 4: Denials + Risk Users (clickable)│
│  SECTION 5: Layer Perf + Field Violations   │
│  SECTION 5.5: Security Alerts ← NEW         │
│  SECTION 6: Auth Inspector (DEV)            │
├─────────────────────────────────────────────┤
│  FOOTER: Live Indicator + Queue Health      │
└─────────────────────────────────────────────┘
```

### Architecture Compliance
- Module placement: `modules/org/security/analytics/` ✓
- API layer: centralized ✓
- RBAC: security.manage guard ✓
- Tenant isolation: no organizationId ✓
- Plane isolation: no platform imports ✓
- React Query for server state ✓
- Socket.IO via existing SocketContext ✓
- No direct axios/fetch in components ✓
- No role === "..." comparisons ✓
- RTL: CSS logical properties + document.dir ✓

### Next Steps (Phase 23)
1. Add sidebar navigation link for auth-analytics
2. Build dedicated drill-down pages (/auth-analytics/permission/:id, /users/:id)
3. Add date picker component for custom ranges
4. Backend: emit auth:denial and auth:alert Socket.IO events from authTraceMiddleware

---

## PHASE 23 — Auth System Hardening (2026-03-22)

**Status:** ✅ COMPLETE
**Phase Type:** Security Hardening — Cross-cutting (Backend + Frontend)
**Plane:** Org
**Depends on:** Phase 15 (RBAC Schema Sync), Phase 16 (Permission Auto-Sync), Phase 17 (Auth System Hardening)

### Objective
Close all remaining authorization gaps: unguarded routes, missing RBAC permissions, frontend capability leaks, dead context code, and missing settings UI. Deliver a fully unified, verified, and controllable authorization system.

### Deliverables

| # | Sub-Phase | Status |
|---|-----------|--------|
| 1 | Route Guard Enforcement — 5 unguarded route mounts in `orgV1Routes.js` | ✅ |
| 2 | RBAC SSOT Expansion — 15 new permissions (inventory, lab, communication, analytics, dashboard) | ✅ |
| 3 | Capability Contract Verification — All platform routes validated | ✅ |
| 4 | Feature Flag System Verification — Full infrastructure confirmed mature | ✅ |
| 5 | Frontend: EntitlementContext → thin shim delegating to FeatureContext | ✅ |
| 6 | Frontend: Sidebar RBAC — `usePermission` + `useFeatures` per item | ✅ |
| 7 | Frontend: Settings.jsx — RBAC-aware navigation cards (3 sections, 6 cards) | ✅ |
| 8 | SpecKit: spec.md Phase 18, plan.md Phase 23, tasks.md entries | ✅ |

### Files Changed

| File | Change |
|------|--------|
| `backend/src/routes/orgV1Routes.js` | Added `requireOrgPermission` to 5 route mounts |
| `backend/src/rbac/orgPermissions.js` | Added 15 permission constants (5 new modules) |
| `backend/src/rbac/permissionRegistry.js` | Bumped `PERMISSION_VERSION` 2 → 3 |
| `frontend/src/context/EntitlementContext.jsx` | Deprecated → thin shim to FeatureContext |
| `frontend/src/components/dashboard/Sidebar.jsx` | RBAC + entitlement gating per nav item |
| `frontend/src/pages/org/Settings.jsx` | New — RBAC-aware settings navigation page |

### Architecture Compliance
- Route guard enforcement: ALL org routes guarded ✓
- RBAC SSOT: 20 modules / 63+ permissions ✓
- Capability contract: all platform routes validated ✓
- Feature flags: full infrastructure operational ✓
- EntitlementContext: deprecated (FeatureContext is canonical) ✓
- Sidebar: RBAC + entitlement dual-gating ✓
- Settings UI: per-card permission checks ✓
- PERMISSION_VERSION: auto-healing on boot ✓

### Next Steps (Phase 24)
1. Run `npm run validate:permissions` CI check to verify full SSOT alignment
2. Run `npm run check:permission-drift` to verify zero drift in live MongoDB
3. Generate updated `permissionKeys.json` for frontend type safety
4. Add sidebar link for Settings page
5. Implement remaining "Configuration" section cards in Settings

---

## PHASE 24 — Features & Modules Control Center (System Intelligence Panel) — COMPLETED

**Priority:** P2 — Medium
**Status:** ✅ DONE (2026-03-23)
**Phase:** 24
**Tasks:** TASK-FE-FCC-001 through TASK-FE-FCC-003

### Objective
Build a production-ready "Features & Modules Control Center" — a system intelligence panel providing full visibility into module states, feature flags, RBAC permissions, entitlement layers, and route guard coverage. Design inspired by Stripe, Dentroin, and Notion patterns.

### Deliverables

| Deliverable | Status |
|-------------|--------|
| `moduleRegistry.js` — SSOT for module/feature metadata (15 modules) | ✅ |
| `FeaturesControlCenter.jsx` — Page orchestrator with computed states | ✅ |
| `ControlCenterHeader.jsx` — Title, plan badge, system health indicator | ✅ |
| `SystemWarningBanner.jsx` — Configuration conflict detection + alerts | ✅ |
| `SystemInsightCards.jsx` — 4 KPI insight cards (modules, flags, roles, guards) | ✅ |
| `ModulesGrid.jsx` — Module card grid with state indicators + toggles | ✅ |
| `FeaturesTable.jsx` — Feature table (status, control source, risk, inspect) | ✅ |
| `FeatureInspectorDrawer.jsx` — Auth decision chain visualizer | ✅ |
| `EntitlementMatrix.jsx` — Interactive role × permission matrix | ✅ |
| `features-control-center.css` — Complete design system (1057 lines) | ✅ |
| `App.jsx` — Route `/org/features-control` with `security.manage` guard | ✅ |

### Files Created (Phase 24)

| File | Purpose |
|------|---------|
| `frontend/src/modules/org/features/data/moduleRegistry.js` | Module/feature metadata SSOT |
| `frontend/src/modules/org/features/pages/FeaturesControlCenter.jsx` | Page orchestrator |
| `frontend/src/modules/org/features/components/ControlCenterHeader.jsx` | Header with plan badge |
| `frontend/src/modules/org/features/components/SystemWarningBanner.jsx` | Configuration alerts |
| `frontend/src/modules/org/features/components/SystemInsightCards.jsx` | KPI insight cards |
| `frontend/src/modules/org/features/components/ModulesGrid.jsx` | Module card grid |
| `frontend/src/modules/org/features/components/FeaturesTable.jsx` | Feature control table |
| `frontend/src/modules/org/features/components/FeatureInspectorDrawer.jsx` | Auth chain visualizer |
| `frontend/src/modules/org/features/components/EntitlementMatrix.jsx` | Permission matrix |
| `frontend/src/modules/org/features/styles/features-control-center.css` | Complete CSS design system |

### Files Modified (Phase 24)

| File | Change |
|------|--------|
| `frontend/src/App.jsx` | Added import + route at `/org/features-control` with `security.manage` guard |

### Architecture Compliance
- Module placement: `modules/org/features/` ✓
- API layer: data from FeatureContext + CapabilityContext ✓
- RBAC: security.manage guard on route ✓
- Tenant isolation: no organizationId sent ✓
- Plane isolation: no platform imports ✓
- Capability checks: `capabilities.includes()` pattern ✓
- No role === "..." comparisons ✓
- RTL support: CSS logical properties ✓
- Design system: dedicated `fcc-*` prefixed CSS ✓

## PHASE 25 — Features Control Center Live Integration — COMPLETED

**Priority:** P2 — Medium
**Status:** ✅ DONE (2026-03-23)
**Phase:** 25
**Tasks:** TASK-FE-FCC-004 through TASK-FE-FCC-008
**Depends on:** Phase 24 (UI Shell)

### Objective
Upgrade the Phase 24 Features & Modules Control Center from static/mock data to a fully live, reactive, real-time system intelligence panel. Connect all UI sections to backend API endpoints, add React Query server-state management, implement Socket.IO real-time cache invalidation, and enable interactive module toggling and auth simulation.

### Architecture
```
Backend API (/api/v1/org/features-control)
    ├── GET  /modules       → module states + usage stats
    ├── GET  /features      → feature decisions + auth chains
    ├── GET  /permissions   → live role × permission matrix
    ├── GET  /conflicts     → smart conflict detection
    ├── POST /simulate      → auth decision simulation
    └── PATCH /modules/:key → toggle module on/off
         ↓
Frontend React Query Hooks (useFeaturesControl.js)
    ├── useModules()          → 30s staleTime
    ├── useFeatureDecisions() → 30s staleTime
    ├── useLivePermissions()  → 2min staleTime
    ├── useConflicts()        → 60s staleTime
    ├── useSimulateAccess()   → mutation
    └── useToggleModule()     → mutation + invalidateQueries
         ↓
Socket.IO Real-Time (useFeaturesRealtime.js)
    ├── module.updated     → invalidate FCC_KEYS.all
    ├── feature.changed    → invalidate FCC_KEYS.all
    └── permission.changed → invalidate permissions + conflicts
         ↓
FeaturesControlCenter.jsx (live data consumer)
    ├── Loading skeletons per section
    ├── Error banners with retry
    ├── Real-time connection indicator
    └── Interactive module toggle + simulation
```

### Deliverables

| Deliverable | Status |
|-------------|--------|
| `featuresControl.routes.js` — Backend routes (6 endpoints, RBAC guarded) | ✅ |
| `orgV1Routes.js` — Mounted at `/api/v1/org/features-control` | ✅ |
| `featuresControl.api.js` — Frontend API service (6 methods) | ✅ |
| `useFeaturesControl.js` — React Query hooks (4 queries + 2 mutations) | ✅ |
| `useFeaturesRealtime.js` — Socket.IO real-time hook (3 events) | ✅ |
| `FeaturesControlCenter.jsx` — Upgraded to live data consumer | ✅ |
| `features-control-center.css` — Loading skeleton, error banner, RT indicator styles | ✅ |
| spec.md — Phase 25 section | ✅ |
| plan.md — Phase 25 completion | ✅ |
| tasks.md — TASK-FE-FCC-004 through 008 | ✅ |

### Files Created (Phase 25)

| File | Purpose |
|------|---------|
| `backend/src/organization/featuresControl/featuresControl.routes.js` | Backend route definitions |
| `frontend/src/modules/org/features/api/featuresControl.api.js` | Centralized API layer |
| `frontend/src/modules/org/features/hooks/useFeaturesControl.js` | React Query hooks |
| `frontend/src/modules/org/features/hooks/useFeaturesRealtime.js` | Socket.IO real-time hook |

### Files Modified (Phase 25)

| File | Change |
|------|--------|
| `backend/src/routes/orgV1Routes.js` | Mounted features-control routes |
| `frontend/src/modules/org/features/pages/FeaturesControlCenter.jsx` | Refactored from mock → live data |
| `frontend/src/modules/org/features/styles/features-control-center.css` | Added loading/error/RT indicator CSS |

### New API Endpoints

| Method | Path | Guard | Purpose |
|--------|------|-------|---------|
| GET | `/api/v1/org/features-control/modules` | SECURITY_READ | Module states + usage |
| GET | `/api/v1/org/features-control/features` | SECURITY_READ | Feature decisions + auth chains |
| GET | `/api/v1/org/features-control/permissions` | SECURITY_READ | Live role × permission matrix |
| GET | `/api/v1/org/features-control/conflicts` | SECURITY_READ | Smart conflict detection |
| POST | `/api/v1/org/features-control/simulate` | SECURITY_MANAGE | Auth decision simulation |
| PATCH | `/api/v1/org/features-control/modules/:key` | SECURITY_MANAGE | Toggle module on/off |

### Architecture Compliance
- Module placement: `modules/org/features/` ✓
- API layer: centralized `featuresControl.api.js` ✓
- RBAC: SECURITY_READ/SECURITY_MANAGE guards ✓
- Tenant isolation: no organizationId sent ✓
- Plane isolation: no platform imports ✓
- React Query for server state ✓
- Socket.IO via existing SocketContext ✓
- No direct axios/fetch in components ✓
- No role === "..." comparisons ✓
- RTL support: CSS logical properties ✓
- Design system: `fcc-*` prefixed CSS ✓

### Phase 26 — Features Control Center Backend Refactor ✅ COMPLETE

**Date:** 2026-03-23
**Objective:** Refactor monolithic `featuresControl.controller.js` (31KB) into modular production-grade backend.

#### Completed
1. ✅ **Service Extraction** — 5 services: modules, features, permissions, conflictEngine, inspector
2. ✅ **Controller Splitting** — 5 thin HTTP controllers (one per domain)
3. ✅ **Validator Creation** — `featuresControl.validators.js` with 4 validators
4. ✅ **Routes File** — `featuresControl.routes.js` with 8 endpoints, RBAC guards
5. ✅ **Barrel Export** — `index.js` re-exports all layers for clean imports
6. ✅ **Route Mounting** — Routes mounted at `/api/v1/org/features-control` in `orgV1Routes.js`
7. ✅ **Audit Logging Fix** — Migrated from `AuditLog.create()` to `auditService.createAuditRecord()`
8. ✅ **Path Alias Fix** — All require paths use `@utils`, `@services`, `@shared` aliases
9. ✅ **Swagger Documentation** — All 8 endpoints annotated with OpenAPI 3.0 JSDoc
10. ✅ **Swagger Config** — `Features Control` tag added, API path registered
11. ✅ **SpecKit Updated** — spec.md Phase 26 section added

#### File Map
| File | Path |
|------|------|
| `featuresControl.routes.js` | `organization/featuresControl/` |
| `modules.controller.js` | `organization/featuresControl/controllers/` |
| `features.controller.js` | `organization/featuresControl/controllers/` |
| `permissions.controller.js` | `organization/featuresControl/controllers/` |
| `conflicts.controller.js` | `organization/featuresControl/controllers/` |
| `inspector.controller.js` | `organization/featuresControl/controllers/` |
| `modules.service.js` | `organization/featuresControl/services/` |
| `features.service.js` | `organization/featuresControl/services/` |
| `permissions.service.js` | `organization/featuresControl/services/` |
| `conflictEngine.service.js` | `organization/featuresControl/services/` |
| `inspector.service.js` | `organization/featuresControl/services/` |
| `featuresControl.validators.js` | `organization/featuresControl/validators/` |
| `index.js` | `organization/featuresControl/` |

### Next Steps (Phase 27)
1. Add sidebar navigation link for Features Control Center
2. Backend: emit `module.updated` Socket.IO event from controller on toggle
3. Build dedicated Settings → Features Control Center navigation
4. Implement module dependency validation on toggle (prevent disabling required modules)
5. Add E2E tests for Features Control Center API endpoints
6. Connect frontend panels to live API (replace demo data)

---

## PHASE A — Authorization Stabilization ✅ COMPLETE

**Date:** 2026-03-23
**Priority:** P0 — Critical
**Spec Reference:** spec.md §6 (Entitlement Middleware, Rollout Control)
**Status:** ✅ COMPLETE

### Objective
Stabilize the authorization system by enforcing a Single Source of Truth (SSOT) for capabilities, mounting missing middleware, fixing unguarded routes, and activating production enforcement for entitlements and PBAC.

### Deliverables

| Deliverable | Status |
|-------------|--------|
| **SSOT Enforcement** — `requireEntitlement.js` uses `req.capabilities.modules` only (legacy fallbacks removed) | ✅ |
| **SSOT Enforcement** — `requireFeature.js` uses `req.capabilities.features` only (legacy fallback removed) | ✅ |
| **SSOT Enforcement** — `moduleGuard.js` migrated to `req.capabilities.modules` | ✅ |
| **Critical Bug Fix** — `unifiedCapabilityMiddleware.js` now consumes `req.featureFlags` from `featureFlagMiddleware` | ✅ |
| **Middleware Mount** — `featureFlagMiddleware` mounted in `app.js` org chain (before `unifiedCapabilityMiddleware`) | ✅ |
| **RBAC Hardening** — 3 new permissions: `support.read`, `support.create`, `storage.read` | ✅ |
| **RBAC Hardening** — Support ticket routes and storage usage route guarded with `requireOrgPermission` | ✅ |
| **Production Enforcement** — `POLICY_SHADOW_MODE=false`, `ENTITLEMENT_AUDIT_MODE=false` | ✅ |
| **Startup Guard** — `validateSecurityModes.js` validates security env vars on boot | ✅ |
| **Startup Guard** — Mounted in `server.js` before app initialization | ✅ |
| **Spec Updated** — spec.md §6 updated with SSOT-only resolution, rollout complete, new permissions | ✅ |
| **Tasks Updated** — TASK-AUTH-STAB-001 | ✅ |

### Files Created
- `backend/src/config/validateSecurityModes.js` — Startup security mode validator

### Files Modified
- `backend/src/middleware/requireEntitlement.js` — SSOT-only resolution
- `backend/src/middleware/requireFeature.js` — SSOT-only resolution
- `backend/src/middleware/moduleGuard.js` — SSOT-only resolution
- `backend/src/middleware/unifiedCapabilityMiddleware.js` — Bug fix (req.featureFlags consumption)
- `backend/app.js` — featureFlagMiddleware mounted in org chain
- `backend/src/rbac/orgPermissions.js` — 3 new permissions + role assignments
- `backend/src/routes/orgV1Routes.js` — RBAC guards added to support + storage routes
- `backend/server.js` — validateSecurityModes integrated
- `backend/.env` — Enforcement flags activated

### Architecture Impact
- **SSOT Chain:** `featureFlagMiddleware → unifiedCapabilityMiddleware → req.capabilities` is now the sole source of truth
- **No more legacy fallbacks:** All entitlement and feature checks go through the unified capability pipeline
- **Production safety:** Startup guard prevents accidental deployment with audit/shadow modes enabled
- **Zero unguarded routes:** All org-plane routes now have RBAC guards

---

## PHASE A+ — Authorization Hardening ✅ COMPLETE

**Date:** 2026-03-23
**Priority:** P0 — Critical
**Spec Reference:** spec.md §27 (Phase A+ Authorization Hardening)
**Depends on:** Phase A — Authorization Stabilization
**Status:** ✅ COMPLETE

### Objective
Extend Phase A stabilization with fail-fast guarantees, improved observability of capabilities, elimination of latent inconsistency risks, and preparation for the runtime module engine.

### Deliverables

| Deliverable | Status |
|-------------|--------|
| **Fail-Fast Layer** — `assertCapabilities.js` middleware returns 500 if `req.capabilities` is missing | ✅ |
| **Auth Trace Enhancement** — `authTraceMiddleware.js` includes capability snapshot (modules + features) | ✅ |
| **Feature Flag Dev Visibility** — `featureFlagMiddleware.js` logs resolved flags in development | ✅ |
| **Admin Route Review** — Infrastructure routes keep RBAC-only access (no plan-gating) | ✅ |
| **Auth Health Endpoint** — `GET /api/internal/auth-health` exposes enforcement state | ✅ |
| **Organization Schema Deprecation** — `modules` and `features` fields annotated as soft-deprecated | ✅ |
| **Middleware Integrity Guard** — `validateSecurityModes.js` validates middleware loadability at boot | ✅ |
| **Spec Updated** — spec.md §27, Middleware Chain Order updated | ✅ |
| **Tasks Updated** — TASK-AUTH-STAB-002 | ✅ |

### Files Created
- `backend/src/middleware/assertCapabilities.js` — Fail-fast capability assertion middleware
- `backend/src/routes/internal/authHealth.routes.js` — Internal auth health monitoring endpoint

### Files Modified
- `backend/src/middleware/authTraceMiddleware.js` — Added capability snapshot to trace data
- `backend/src/platform/flags/featureFlagMiddleware.js` — Added dev-only flag logging
- `backend/src/shared/models/Organization.js` — Soft deprecation annotations on modules/features fields
- `backend/src/config/validateSecurityModes.js` — Added middleware integrity check
- `backend/app.js` — Mounted assertCapabilities + auth health routes

### Architecture Impact
- **Fail-fast guarantee:** If `unifiedCapabilityMiddleware` fails to resolve capabilities, the request is immediately rejected (500) instead of proceeding with undefined authorization data
- **Boot-time safety:** Server startup validates that critical middleware modules are loadable, catching deployment issues before first request
- **Observability:** Auth traces now include exact capability state, enabling forensic debugging of entitlement issues
- **Schema clarity:** Organization-level capability fields are formally annotated as deprecated, directing new code to `req.capabilities`

---

## PHASE A++ — Authorization Elite Hardening ✅ COMPLETE

**Date:** 2026-03-23
**Priority:** P0 — Critical
**Spec Reference:** spec.md §28 (Phase A++ Authorization Elite Hardening)
**Depends on:** Phase A+ — Authorization Hardening
**Status:** ✅ COMPLETE

### Objective
Upgrade the authorization system to enterprise-grade reliability with capability hashing, trace sampling, performance instrumentation, internal endpoint security, cache observability, and enhanced boot-time middleware integrity checks. Prepares the system for Phase B (Runtime Module Engine).

### Deliverables

| Deliverable | Status |
|-------------|--------|
| **Capability Hashing** — `capabilityHash.js` generates SHA-256 fingerprint of capabilities | ✅ |
| **Capability Versioning** — `req.capabilitiesVersion = 1` injected by `unifiedCapabilityMiddleware` | ✅ |
| **Auth Trace Sampling** — 100% denials, 20% success rate (configurable) | ✅ |
| **Trace Performance** — `durationMs` + `routeGroup` added to auth traces | ✅ |
| **Feature Flag Cache Metrics** — `getCacheStats()` exposed by `featureFlagMiddleware` | ✅ |
| **Auth Health Security** — `x-internal-key` header validation when `INTERNAL_API_KEY` is set | ✅ |
| **Auth Health Enrichment** — `authTraceEnabled` flag + `featureFlagCache` stats in response | ✅ |
| **Middleware Integrity Expansion** — Boot-time checks expanded to 4 middleware (was 2) | ✅ |
| **Spec Updated** — spec.md §28, plan.md, tasks.md | ✅ |

### Files Created
- `backend/src/utils/capabilityHash.js` — SHA-256 capability fingerprint utility

### Files Modified
- `backend/src/middleware/unifiedCapabilityMiddleware.js` — Injects `req.capabilityHash` + `req.capabilitiesVersion`
- `backend/src/middleware/authTraceMiddleware.js` — Sampling, durationMs, routeGroup, capabilityHash/version in traces
- `backend/src/platform/flags/featureFlagMiddleware.js` — Cache hit/miss counters + `getCacheStats()` export
- `backend/src/routes/internal/authHealth.routes.js` — `x-internal-key` security, `authTraceEnabled`, `featureFlagCache` stats
- `backend/src/config/validateSecurityModes.js` — Expanded middleware integrity to 4 middleware

### Architecture Impact
- **Deterministic fingerprinting:** Capabilities are hashed for efficient comparison, logging, and cache invalidation
- **Scalable tracing:** Sampling reduces database pressure by ~80% for successful requests while retaining 100% denial coverage
- **Production security:** Internal health endpoint is no longer openly accessible when `INTERNAL_API_KEY` is configured
- **Full pipeline integrity:** All 4 critical auth middleware validated at boot (assertCapabilities, unifiedCapabilityMiddleware, authTraceMiddleware, featureFlagMiddleware)
- **Cache observability:** Feature flag cache hit/miss ratio visible in health check for performance tuning

### Phase B Readiness
The system is now prepared for Phase B (Runtime Module Engine) with:
- Capability hash enables efficient cache invalidation on module changes
- Capability version enables backward-compatible schema evolution
- Trace sampling prevents database overload as request volume scales
- Enhanced middleware integrity ensures all pipeline components survive deployments

---

## PHASE B — RUNTIME MODULE ENGINE ✅ COMPLETE

**Date:** 2026-03-23
**Priority:** P0 — Critical
**Spec Reference:** spec.md §29 (Phase B: Runtime Module Engine)
**Depends on:** Phase A++ — Authorization Elite Hardening
**Status:** ✅ COMPLETE

### Objective
Transform the backend from a static route-mounting architecture to a dynamic, registry-driven module execution engine. `MODULE_REGISTRY` (v2.0) becomes the Single Source of Truth (SSOT) for all org-plane business modules. All modules are mounted unconditionally at boot time, with access control enforced at request time via `requireModule()`.

### Architecture
```
MODULE_REGISTRY (20 modules, 5 categories)
    ↓ Boot-time
moduleLoader.js
    ├── validateDependencies()      → throws on invalid refs
    ├── validateMountPaths()        → throws on collisions
    └── for each module:
        router.use(mountPath, requireModule(key), routes)
    ↓ Request-time
requireModule(registryKey)
    ├── Core modules → pass through
    └── Plan-gated  → check org.modules[key]
    ↓ Admin API
moduleLifecycle.service.js
    ├── enableModule()   + dep validation
    ├── disableModule()  + reverse dep validation
    ├── getModuleStatus()
    └── bulkSetModules() for plan upgrades
```

### Deliverables

| Deliverable | Status |
|-------------|--------|
| **moduleRegistry.js v2.0** — 20 modules, entitlementKey, category, selfContained, dependencies | ✅ |
| **moduleLoader.js v1.0** — Boot-time execution engine with dependency + mount path validation | ✅ |
| **moduleLifecycle.service.js** — enable/disable/status/bulk with plan + dependency governance | ✅ |
| **orgV1Routes.js v3.0** — Static mounts replaced by `loadOrgModules(router)` | ✅ |
| **Runtime diagnostic endpoints** — `/runtime/manifest` (AUTH_ONLY), `/runtime/health` (DASHBOARD_READ) | ✅ |
| **app.js deprecation markers** — 8 legacy paths with structured warning logging | ✅ |
| **Spec Updated** — spec.md §29, plan.md, tasks.md | ✅ |

### Files Created
- `backend/src/orgRuntime/moduleLoader.js` — Boot-time module execution engine
- `backend/src/orgRuntime/moduleLifecycle.service.js` — Module state management service

### Files Modified
- `backend/src/orgRuntime/moduleRegistry.js` — Upgraded to v2.0 (20 modules, new fields)
- `backend/src/routes/orgV1Routes.js` — v3.0 (dynamic loading + diagnostic endpoints)
- `backend/app.js` — Deprecation markers on 8 legacy static mounts

### Architecture Impact
- **SSOT enforcement:** `MODULE_REGISTRY` is the single authority for module existence, mount paths, plan eligibility, and dependency chains
- **Zero-downtime migration:** Legacy paths preserved with deprecation warnings — no frontend breakage
- **Boot integrity:** Dependency validation and mount path collision detection prevent broken deployments
- **Request-time enforcement:** `requireModule()` middleware gates access per request, not per boot
- **Admin governance:** Module toggling requires platform-admin authority, validates plan eligibility and dependency chains
- **Scalability:** New modules are added by editing `moduleRegistry.js` — one file change, zero routing changes

### Next Steps (Phase C)
1. Frontend integration: consume `/runtime/manifest` endpoint for FeatureGate alignment
2. Remove `registerOrgRoutes.js` (now superseded by `moduleLoader.js`)
3. Plan and execute removal of 8 legacy static mounts in `app.js` after frontend migration
4. Add E2E tests for module loading and lifecycle service
5. Integrate `moduleLifecycle.service.js` with Features Control Center backend for live toggling

---

## PHASE B.1 — UNIFIED REGISTRY CONSOLIDATION (SSOT)

**Status:** COMPLETE ✅
**Completed:** 2026-03-23
**Depends on:** Phase B (§29 — Org Runtime Module Engine)
**Spec Reference:** spec.md §30

### Objective

Eliminate the dual-registry architecture (separate `featureRegistry.js` + `moduleRegistry.js`) by consolidating all module definitions into a single `FEATURE_REGISTRY`. All runtime properties are now defined inline with entitlement properties, and `MODULE_REGISTRY` is dynamically derived.

### Architecture

```
FEATURE_REGISTRY (featureRegistry.js) — SINGLE SOURCE OF TRUTH
├── 27 entries (13 canonical modules + 6 runtime-only sub-mounts + 8 governance/admin)
├── Entitlement pipeline: normalizeModules(), buildFeatureCapabilities(), CORE_MODULES
├── Runtime engine: basePath, routeFactory, selfContained, category, dependencies
└── Generates at require-time:
    ├── MODULE_REGISTRY  (20 routable modules, frozen)
    ├── CORE_MODULE_KEYS, PLAN_GATED_KEYS, SELF_CONTAINED_KEYS
    ├── MODULE_CATEGORIES
    └── Accessor functions (getModule, listModuleKeys, getModulesByCategory, etc.)

moduleRegistry.js → COMPATIBILITY SHIM (re-exports from featureRegistry.js)
requireModule.js  → CAPABILITY-FIRST (reads req.capabilities.modules SSOT)
registryValidator.js → BOOT-TIME INTEGRITY (validates FEATURE_REGISTRY before traffic)
```

### Deliverables

| Deliverable | Status |
|-------------|--------|
| **FEATURE_REGISTRY extended** — runtime fields (basePath, routeFactory, selfContained, category, dependencies) added to all entries | ✅ |
| **MODULE_REGISTRY dynamically generated** — derived from FEATURE_REGISTRY at require-time, frozen | ✅ |
| **moduleRegistry.js → thin shim** — re-exports all symbols from featureRegistry.js | ✅ |
| **requireModule.js v2.0** — capability-first access control (req.capabilities.modules SSOT) | ✅ |
| **registryValidator.js** — boot-time structural validation (6 checks) | ✅ |
| **featureRegistrySeeder.js updated** — skips runtime-only entries (registry key ≠ module key) | ✅ |
| **moduleLoader.js updated** — imports FEATURE_REGISTRY, runs validateRegistry() at boot | ✅ |
| **orgRuntimeGate.js deprecated** — consumers directed to requireModule() | ✅ |
| **Spec Updated** — spec.md §30, plan.md Phase B.1, tasks.md TASK-ENTITLEMENT-SYSTEM-003 | ✅ |

### Files Created
- `backend/src/core/registryValidator.js` — Boot-time FEATURE_REGISTRY structural validator

### Files Modified
- `backend/src/platform/featureRegistry.js` — Extended with runtime fields + MODULE_REGISTRY generation
- `backend/src/orgRuntime/moduleRegistry.js` — Converted to compatibility shim
- `backend/src/orgRuntime/requireModule.js` — v2.0 capability-first rewrite
- `backend/src/orgRuntime/moduleLoader.js` — Added FEATURE_REGISTRY import + boot validation
- `backend/src/platform/domain/services/featureRegistrySeeder.js` — Skip runtime-only entries
- `backend/src/middleware/orgRuntimeGate.js` — Deprecated

### Architecture Impact
- **SSOT enforcement:** `FEATURE_REGISTRY` is the single authority — `MODULE_REGISTRY` is derived, never manually maintained
- **Zero drift:** Adding a module is a single-file edit to `featureRegistry.js` — entitlement, runtime, and capability all update automatically
- **Capability-first access:** `requireModule()` resolves access from `req.capabilities.modules` (merged plan + org result), eliminating the old 3-step check
- **Boot integrity:** `registryValidator` catches configuration errors (duplicate paths, missing routes, broken deps) before traffic

### Next Steps (Phase C)
1. Remove `moduleRegistry.js` shim after confirming all consumers migrated
2. Remove deprecated `orgRuntimeGate.js`
3. Frontend integration: consume `/runtime/manifest` for dynamic FeatureGate alignment
4. Remove 8 legacy static mounts in `app.js` after frontend migration
5. Add E2E tests for registry validation + capability-first module gating

---

## Phase B.2 — Module Runtime Maturity & Architecture Optimization

**Priority:** P1 — High
**Status:** ✅ COMPLETE
**Completed:** 2026-03-23
**Depends on:** Phase B.1 (Unified Registry Consolidation)
**Spec Reference:** spec.md §31

### Objective

Extend the Phase B.1 registry system with:
1. **Module Lifecycle Management** — formal enable/disable lifecycle with extensible hooks
2. **Module State Tracking** — persistent state tracking for platform analytics
3. **Event-Driven Decoupling** — domain events for module lifecycle transitions
4. **Auth Trace Intelligence** — decision summaries and timing breakdowns in auth traces
5. **Global Queue Observability** — unified health metrics across all BullMQ queues
6. **Billing Domain Pre-Split** — boundary manifest for planned bounded context decomposition
7. **Guard Usage Documentation** — ADR for authorization guard architecture

### Architecture

```
Module Lifecycle Flow:
    enableModule(orgId, key)
        ↓
    Organization.modules[key] = true
        ↓
    lifecycleHooks.triggerHook(key, "onEnable")
        ↓
    eventBus.emit("module.enabled")
        ↓
    moduleState.subscriber → OrganizationModuleState.upsert

Request-Time State Sync:
    unifiedCapabilityMiddleware
        ↓
    req.capabilities resolved
        ↓
    syncModuleState(orgId, modules) — TTL-gated (5min)
        ↓
    OrganizationModuleState.bulkWrite (upsert)

Auth Trace Intelligence:
    authTraceMiddleware → res.on("finish")
        ↓
    Decision Summary (per-layer verdicts, denial reasons)
        ↓
    Timing Breakdown (per-layer latency)
        ↓
    persistTraceAsync (BullMQ)

Queue Observability:
    bootQueueMetrics()
        ↓
    registerQueue(name, healthFn) × N
        ↓
    getAllQueueMetrics() → parallel collection → aggregate summary
```

### Deliverables

| Deliverable | Status |
|-------------|--------|
| **lifecycleHooks.js** — extensible hook registry for module lifecycle side effects | ✅ |
| **moduleLifecycle.service.js updated** — triggers hooks + emits domain events | ✅ |
| **OrganizationModuleState.model.js** — persistent module state tracking | ✅ |
| **moduleStateSync.service.js** — TTL-gated request-time sync | ✅ |
| **moduleState.subscriber.js** — EventBus listener for lifecycle events | ✅ |
| **unifiedCapabilityMiddleware.js updated** — hooked syncModuleState | ✅ |
| **domainEvents.js updated** — MODULE_ENABLED, MODULE_DISABLED, MODULE_INSTALLED | ✅ |
| **schemaRegistry.js updated** — lifecycle event schemas + emitter authorization | ✅ |
| **authTraceMiddleware.js updated** — decision summary + timing breakdown | ✅ |
| **queueMetrics.service.js** — global queue health aggregator | ✅ |
| **queueMetrics.boot.js** — boot-time queue registration | ✅ |
| **billingDomain/index.js** — boundary manifest for pre-split | ✅ |
| **ADR-001** — authorization guard architecture documentation | ✅ |
| **Spec Updated** — spec.md §31, plan.md Phase B.2, tasks.md Phase B.2 tasks | ✅ |

### Files Created

| File | Purpose |
|------|---------|
| `backend/src/orgRuntime/lifecycleHooks.js` | Module lifecycle hook registry |
| `backend/src/orgRuntime/models/OrganizationModuleState.model.js` | Module state tracking model |
| `backend/src/orgRuntime/moduleStateSync.service.js` | TTL-gated state sync service |
| `backend/src/orgRuntime/subscribers/moduleState.subscriber.js` | Event-driven state sync subscriber |
| `backend/src/infrastructure/queues/queueMetrics.service.js` | Global queue metrics aggregator |
| `backend/src/infrastructure/queues/queueMetrics.boot.js` | Boot-time queue registration |
| `backend/src/modules/billingDomain/index.js` | Billing domain boundary manifest |
| `docs/architecture/ADR-001-authorization-guard-architecture.md` | Guard architecture ADR |

### Files Modified

| File | Change |
|------|--------|
| `backend/src/orgRuntime/moduleLifecycle.service.js` | Added lifecycle hook triggering + event emission |
| `backend/src/middleware/unifiedCapabilityMiddleware.js` | Added syncModuleState integration |
| `backend/src/middleware/authTraceMiddleware.js` | Added decision summary + timing breakdown |
| `backend/src/core/domainEvents.js` | Added 3 module lifecycle events |
| `backend/src/eventContracts/schemaRegistry.js` | Added 3 lifecycle event schemas |

### Architecture Impact

- **Module lifecycle is now a first-class concept** — enable/disable operations trigger hooks, emit events, and persist state
- **Platform analytics enabled** — OrganizationModuleState provides module adoption, churn, and enablement history
- **Auth pipeline observability upgraded** — every traced request now includes structured decision summaries and per-layer latency
- **Queue health is unified** — single `getAllQueueMetrics()` call provides health for all system queues
- **Billing domain has formal boundaries** — pre-split manifest prevents further coupling before decomposition
- **Guard architecture is documented** — ADR-001 serves as the canonical reference for all authorization decisions

### Next Steps (Phase C)
1. Frontend integration: consume OrganizationModuleState for dynamic module toggle UI
2. Complete billing domain split into independent engines (invoice, payment, ledger)
3. Add queue metrics API endpoint for platform admin dashboard
4. Implement lifecycle hooks for existing modules (orthodontics, analytics, portal)
5. Add auth trace summary to security analytics dashboard
6. E2E tests for module lifecycle + state sync + event emission

---

## PHASE 1 — AUTHORIZATION PIPELINE STABILIZATION

**Status:** ✅ COMPLETE
**Completed:** 2026-03-23
**Priority:** P0 — Critical
**Scope:** Backend authorization middleware standardization, legacy cleanup, deterministic pipeline enforcement

### Objective

Refactor the backend authorization system to enforce a single, deterministic pipeline. Remove legacy middleware, standardize execution order of authorization guards, and create a centralized `authorize()` wrapper for route-level usage.

### Problem Statement

The authorization system had accumulated multiple legacy middleware files (`permissionMiddleware`, `roleMiddleware`, `moduleGuard`, `moduleMiddleware`, `orgRuntimeGate`, `requireModule`) that were partially deprecated but still imported in various route files. This created:
- Inconsistent authorization enforcement across routes
- Multiple code paths for the same authorization decision
- Drift between the intended pipeline and actual execution order
- Risk of silent authorization bypass

### Deliverables

| # | Deliverable | Status |
|---|-------------|--------|
| 1 | Create `authorize.js` centralized wrapper | ✅ DONE |
| 2 | Create `ssotEnforcer.js` development detector | ✅ DONE |
| 3 | Create `validateAuthPipeline.js` boot-time validator | ✅ DONE |
| 4 | Migrate `requireModule` → `requireEntitlement` in moduleLoader | ✅ DONE |
| 5 | Migrate `permissionMiddleware` → `requireOrgPermission` in routes | ✅ DONE |
| 6 | Migrate `roleMiddleware` → `requireOrgPermission` in routes | ✅ DONE |
| 7 | Delete 5 legacy middleware files | ✅ DONE |
| 8 | Mount `ssotEnforcer` in app.js org chain | ✅ DONE |
| 9 | Mount `validateAuthPipeline` in server.js boot | ✅ DONE |
| 10 | Update spec.md with new pipeline docs | ✅ DONE |

### Files Created

| File | Purpose |
|------|---------|
| `backend/src/middleware/authorize.js` | Deterministic auth chain builder: `requireEntitlement` → `requireFeature` → `requireOrgPermission` |
| `backend/src/middleware/ssotEnforcer.js` | Dev-only Proxy-based detector for legacy `req.organization.modules` access |
| `backend/src/config/validateAuthPipeline.js` | Boot-time pipeline order logging + legacy file existence check |

### Files Deleted

| File | Reason |
|------|--------|
| `backend/src/middleware/permissionMiddleware.js` | Superseded by `requireOrgPermission` |
| `backend/src/middleware/moduleGuard.js` | Superseded by `requireEntitlement` |
| `backend/src/middleware/moduleMiddleware.js` | Orphaned — no imports |
| `backend/src/middleware/orgRuntimeGate.js` | Superseded by `requireEntitlement` |
| `backend/src/orgRuntime/requireModule.js` | Superseded by `requireEntitlement` |

### Files Modified

| File | Change |
|------|--------|
| `backend/src/routes/recallRoutes.js` | `permissionMiddleware` → `requireOrgPermission` |
| `backend/src/routes/familyRoutes.js` | `permissionMiddleware` → `requireOrgPermission` |
| `backend/src/routes/appointmentRoutes.js` | `permissionMiddleware` → `requireOrgPermission` |
| `backend/src/routes/organizationRoutes.js` | `roleMiddleware` → `requireOrgPermission` with `P.*` constants |
| `backend/src/routes/addOnRoutes.js` | `roleMiddleware` → `requireOrgPermission` with `P.*` constants |
| `backend/src/orgRuntime/moduleLoader.js` | `requireModule` → `requireEntitlement` |
| `backend/src/orgRuntime/registerOrgRoutes.js` | Updated to use `requireEntitlement`, marked deprecated |
| `backend/app.js` | Mounted `ssotEnforcer` in org middleware chain |
| `backend/server.js` | Added `validateAuthPipeline` boot-time call |
| `backend/src/middleware/assertCapabilities.js` | Comment updated (removed `moduleGuard` reference) |

### Canonical Auth Pipeline (Post-Stabilization)

```
orgProtect → organizationContext → subscriptionGuard → featureFlagMiddleware
    → unifiedCapabilityMiddleware → assertCapabilities (fail-fast) → ssotEnforcer (dev)
    → requireEntitlement(key) → requireFeature(subFeatureKey)
    → requireOrgPermission(P.XXX) → policyMiddleware → handler
```

### Remaining Work (Phase 2)

1. Migrate remaining routes to `authorize()` wrapper where beneficial
2. ~~Complete `req.organization.modules` elimination from controller logic~~ ✅ Audit confirmed zero runtime business logic reads (2026-03-23)
3. ~~Investigate plane violation in `organizationRoutes.js` (`createOrganization`)~~ ✅ DONE — route removed, canonical endpoint at `POST /api/platform/organizations` (2026-03-23)
4. ~~Add `roleMiddleware.js` to legacy file deletion~~ ✅ DONE — file deleted (2026-03-23)
5. E2E auth pipeline integration tests

---

## PHASE B CLEANUP — Critical Cleanup Before Registry Enforcement ✅ COMPLETE

**Date:** 2026-03-23
**Priority:** P0 — Critical
**Depends on:** Phase 1 (Authorization Pipeline Stabilization), Phase B.1 (Unified Registry Consolidation)
**Status:** ✅ COMPLETE

### Objective

Eliminate remaining architectural violations before completing Phase B registry enforcement. Four cleanup tasks targeting legacy data paths, plane violations, dead middleware, and authorization consistency.

### Deliverables

| # | Task | Status |
|---|------|--------|
| 1 | **Remove `req.organization.modules`** — Audit all reads/writes of the legacy data path | ✅ CLEAN — No runtime business logic uses it |
| 2 | **Fix plane violation** — `createOrganization` route in org plane | ✅ DONE — Route removed from `organizationRoutes.js` |
| 3 | **Delete dead middleware** — `roleMiddleware.js` | ✅ DONE — File deleted |
| 4 | **Authorization consistency scan** — Verify all new routes use `authorize()` and no entitlements are skipped | ✅ CLEAN — All routes consistent |

### Task 1 — `req.organization.modules` Audit

**Result:** CLEAN — No code changes required.

Codebase scan found only 2 occurrences:
1. `ssotEnforcer.js` — Detection middleware (reads for warning purposes only, not business logic)
2. `requireEntitlement.js` — Inline comment reference only

All runtime business logic already uses `req.capabilities.modules` (the SSOT path).

### Task 2 — Plane Violation Fix

**Problem:** `POST /api/v1/org/organizations` exposed `createOrganization` — a PLATFORM-level action — in the ORG plane.

**Fix:** Removed `createOrganization` import and route from `organizationRoutes.js`. The canonical endpoint already exists at `POST /api/platform/organizations` via `createOrganizationProvisioned` with proper platform guards (`platformProtect`, `authorizePlatformPermission("organizations.create")`).

### Task 3 — Dead Middleware Deletion

**File deleted:** `backend/src/middleware/roleMiddleware.js`

Verified zero imports and zero references in the entire codebase before deletion. This file was superseded by `requireOrgPermission` in Phase 1 route migration.

### Task 4 — Authorization Consistency Scan

**Result:** CLEAN — No issues found.

Scan confirmed:
- All new route files use `requireOrgPermission` or `authorize()` wrapper
- No routes skip entitlement checks when a module guard exists
- Authorization system remains deterministic

### Files Modified

| File | Change |
|------|--------|
| `backend/src/routes/organizationRoutes.js` | Removed `createOrganization` import and `POST /` route definition |

### Files Deleted

| File | Reason |
|------|--------|
| `backend/src/middleware/roleMiddleware.js` | Dead middleware — no imports, superseded by `requireOrgPermission` |

### Architecture Impact

- **Plane isolation enforced:** Organization creation is now exclusively a platform-plane operation
- **Zero legacy data paths:** `req.organization.modules` confirmed absent from all runtime business logic
- **Dead code eliminated:** `roleMiddleware.js` removed, preventing accidental re-adoption
- **Authorization deterministic:** All routes verified to use standardized guards

---

## PHASE D — POLICY-BASED ACCESS CONTROL (PBAC) COMPLETION ✅ COMPLETE

**Date:** 2026-03-24
**Priority:** P0 — Critical
**Depends on:** Phase B Cleanup (Authorization Stabilization), Phase 1 (Auth Pipeline)
**Status:** ✅ COMPLETE (shadow mode — enforcement pending)
**Spec Reference:** spec.md §34

### Objective

Implement and wire a complete Policy-Based Access Control (PBAC) engine across all organization-plane routes. PBAC adds resource-level, ownership-based, branch-scoped, and status-based access control on top of the existing RBAC permission system.

### Problem Solved

RBAC alone was insufficient for:
- Cross-branch access isolation (receptionist at Branch A modifying Branch B data)
- Resource ownership enforcement (doctor updating another doctor's treatments)
- Status-based immutability (editing paid invoices or completed payments)
- Role escalation prevention (user escalating their own role)

### Deliverables

| # | Task | Status |
|---|------|--------|
| D-1 | **Policy Registry** — Define policies for all 60+ permissions across 23 modules | ✅ DONE |
| D-2 | **Policy Evaluator Enhancement** — Strict-deny for writes, `.send`/`.export` suffixes | ✅ DONE |
| D-3 | **Route Middleware Wiring** — Wire `policyMiddleware` into all org-plane routes | ✅ DONE |
| D-4 | **Coverage Validator** — Boot-time policy coverage validation ("write" + "all" modes) | ✅ DONE |
| D-5 | **SpecKit Documentation** — Create spec.md §34 with full PBAC architecture | ✅ DONE |
| D-6 | **Shadow Mode Testing** — Deploy with `POLICY_SHADOW_MODE=true`, observe logs | ⏳ Pending deployment |
| D-7 | **Enforcement Cutover** — Set `POLICY_SHADOW_MODE=false` | ⏳ After D-6 validation |
| D-8 | **CI/CD Integration** — `policyCoverageValidator` in build pipeline | ✅ DONE |

### Route Files Modified

| File | Change |
|------|--------|
| `modules/patientDomain/patientDomain.routes.js` | Added `policyMiddleware` to `POST /intelligence/run` (was missing) |
| `modules/analyticsDomain/analytics.routes.js` | Wired `policyMiddleware(P.ACCOUNTING_READ)` |
| `modules/audit/routes/auditTimeline.routes.js` | Wired `policyMiddleware(P.SECURITY_READ)` on 7 endpoints |
| `modules/authorization/authorization.routes.js` | Wired `policyMiddleware(P.STAFF_MANAGE)` on 4 endpoints |
| `modules/financeDomain/routes/finance.routes.js` | Wired `policyMiddleware(P.ACCOUNTING_READ)` on 3 endpoints |
| `modules/patientPortal/routes/portalMonitoring.routes.js` | Wired `policyMiddleware` on 6 staff-facing endpoints |
| `rbac/policyEvaluator.js` | Added `.send`, `.export` to WRITE_SUFFIXES |
| `rbac/validators/policyCoverageValidator.js` | v2.0 rewrite — 5 invariant checks, 3 modes (writes/all/ci) |
| `scripts/checkPolicyCoverage.js` | v2.0 rewrite — zero-exclusion CI gate |
| `package.json` | Added `validate:policies` and `validate:policies:strict` npm scripts |

### Canonical Auth Pipeline (Post-Phase D)

```
orgProtect → organizationContext → subscriptionGuard → featureFlagMiddleware
    → unifiedCapabilityMiddleware → assertCapabilities (fail-fast) → ssotEnforcer (dev)
    → requireEntitlement(key) → requireFeature(subFeatureKey)
    → requireOrgPermission(P.XXX) → policyMiddleware(P.XXX, getResource?) → handler
```

### Remaining Work

1. Deploy with `POLICY_SHADOW_MODE=true` in staging/production
2. Monitor shadow mode logs for >48h observation window
3. Fix any false denials identified in logs
4. Set `POLICY_SHADOW_MODE=false` to activate enforcement
5. Integrate `policyCoverageValidator` into CI pipeline (build-fail on missing policies)
6. E2E tests covering PBAC deny scenarios

---

## Phase E — Field-Level Security (FLS) Completion

**Status:** ✅ COMPLETE
**Date:** 2026-03-24
**Depends on:** Phase D (PBAC Complete)
**Spec Section:** §35

### Objective

Achieve 100% module coverage for field-level read/write security, close route enforcement gaps, enable the frontend visibility pipeline, and establish boot-time CI enforcement.

### Completed Components

| Component | Status | Impact |
|-----------|--------|--------|
| Field access registry expansion (7 new types) | ✅ | 100% module coverage (15/15) |
| Field write guard expansion (5 new types) | ✅ | Write-side protection parity |
| Booking route FLS hardening | ✅ | Closed P0 data exposure gap |
| Branch read filter | ✅ | Closed P1 read-side gap |
| capabilities.visibleFields pipeline | ✅ | Backend → Frontend field metadata |
| Frontend hook + context (useFieldVisibility) | ✅ | Scalable frontend FLS pattern |
| PatientsPage FieldVisible integration | ✅ | First consumer of FLS frontend pipeline |
| fieldAccessValidator v2.0 | ✅ | Boot-time + CI coverage enforcement |
| ENV configuration | ✅ | FIELD_WRITE_GUARD_MODE + FIELD_ACCESS_STRICT |
| SpecKit synchronization (§35) | ✅ | Documented in spec.md + tasks.md |

### Canonical Auth Pipeline (Post-Phase E)

```
orgProtect → organizationContext → subscriptionGuard → featureFlagMiddleware
    → unifiedCapabilityMiddleware → assertCapabilities (fail-fast) → ssotEnforcer (dev)
    → requireEntitlement(key) → requireFeature(subFeatureKey)
    → requireOrgPermission(P.XXX) → policyMiddleware(P.XXX, getResource?)
    → fieldFilterMiddleware(resourceType) [READ]
    → fieldWriteGuardMiddleware(resourceType) [WRITE]
    → handler
    → Response + capabilities.visibleFields [injected by fieldFilterMiddleware]
```

### Remaining Work

1. Expand `<FieldVisible>` integration to remaining pages (Invoices, Treatments, Users, etc.)
2. Enable `FIELD_ACCESS_STRICT=true` in CI/CD pipeline
3. Add E2E tests for field filtering (role-based response shape assertions)
4. Monitor `FIELD_WRITE_GUARD_MODE=strict` for false positives in staging

---

## Phase F — Query-Level Security (RLS) — Zero-Trust Data Access

> ⚠️ **SUPERSEDED (2026-03-28):** The RLS system (Phases F through F.10) has been fully decommissioned.
> `src/core/rls/` deleted (~4,200 LOC). Replaced by DB-per-org isolation + Guard System V2.
> See `system-architecture.spec.md` §6.7 for the current architecture.
> Content below is **historical reference only**.

**Status:** ✅ Phase F.1 COMPLETE → ⚠️ DECOMMISSIONED (2026-03-28)
**Date:** 2026-03-24 → Removed 2026-03-28
**Depends on:** Phase D (PBAC), Phase E (FLS)
**Spec Section:** §36, §37

### Objective

Enforce automatic, non-bypassable query scoping at the database query level. Eliminate the requirement for developers to manually add `organizationId` filters, structurally preventing cross-tenant data leakage.

### Security Lineage (4-Layer Stack — COMPLETE)

```
WHO can act       → RBAC   (requireOrgPermission, Phase 1)          ✅
WHAT they can see → FLS    (fieldFilter + fieldWriteGuard, Phase E) ✅
WHICH records     → RLS    (secureModel + queryScoper, Phase F.1)   ✅
WHEN they can act → PBAC   (policyMiddleware, Phase D)              ✅
```

### Phase F.0 — Infrastructure (COMPLETE)

| Component | Status | Impact |
|-----------|--------|--------|
| `rlsContext.js` — frozen RLS context middleware | ✅ | Tamper-proof security context on every request |
| `queryScoper.js` — query injection engine | ✅ | Auto `organizationId` + branch/owner scoping |
| `secureModel.js` — Mongoose model wrapper | ✅ | Drop-in replacement for all 13 CRUD operations |
| App.js pipeline integration | ✅ | rlsContext in canonical middleware chain |
| `rlsValidator.js` — boot-time static scanner | ✅ | Detects raw Mongoose queries in codebase |
| CI scripts (`validate:rls`, `validate:rls:strict`) | ✅ | Advisory + strict enforcement modes |
| `checkRLSCompliance.js` — standalone CI gate | ✅ | Zero-violation enforcement ready |
| Treatments service migration (exemplar) | ✅ | Pattern established for remaining services |
| orgV1Routes /roles migration | ✅ | Inline query patterns eliminated |
| SpecKit (§36) | ✅ | Complete documentation |

### Phase F.1 — P0 Module Migration + Strict Enforcement (COMPLETE)

**Date:** 2026-03-24

| Component | Status | Impact |
|-----------|--------|--------|
| `users.service.js` → SecureUser/SecureRole/SecureBranch | ✅ | All user queries RLS-protected |
| `branches.service.js` → SecureBranch/SecureUser | ✅ | All branch queries RLS-protected |
| `procedures.service.js` → SecureProcedure | ✅ | All procedure queries RLS-protected |
| `appointment.service.js` → SecureAppointment (dual-path) | ✅ | HTTP uses RLS; events use @rls-exempt |
| `slot.service.js` → SecureBranch/SecureAppointment | ✅ | Slot queries RLS-protected; transactions @rls-exempt |
| `patient.list.service.js` → SecurePatient | ✅ | Patient list queries RLS-protected |
| Controller layer updates (users, branches, procedures) | ✅ | `req` propagated for RLS context |
| `scripts/auditRLS.js` — CI enforcement script | ✅ | Advisory + strict modes, module-grouped violations |
| `npm run audit:rls` / `audit:rls:strict` | ✅ | CI pipeline integration |
| `tests/security/tenantIsolation.e2e.test.js` | ✅ | 7 suites, 30+ tests for tenant isolation |
| `RLS_STRICT=true` in `.env` | ✅ | Boot-time crash on raw query violations |
| SpecKit (§37) | ✅ | Complete documentation |

### Canonical Auth Pipeline (Post-Phase F.1)

```
orgProtect → organizationContext → subscriptionGuard → featureFlagMiddleware
    → branchContextMiddleware → unifiedCapabilityMiddleware → assertCapabilities
    → ssotEnforcer
    → rlsContext                                              ← Phase F
    → requireEntitlement → requireFeature
    → requireOrgPermission(P.XXX) → policyMiddleware(P.XXX)
    → fieldFilterMiddleware(resourceType) [READ]              ← Phase E
    → fieldWriteGuardMiddleware(resourceType) [WRITE]         ← Phase E
    → handler
    → secureModel(Model).find(query, req)                     ← Phase F
    → Response + capabilities.visibleFields                   ← Phase E
```

### Remaining Work (Phase F.2+)

1. ~~**P0 Module Migration:** patients, appointments, procedures, users, branches~~ ✅ DONE
2. **P0 Remaining:** invoices (invoice.service.js, invoiceStatus.service.js)
3. **P1 Module Migration:** orthodontics, inventory, finance, booking
4. **P2 Module Migration:** documents, analytics, communication, clinical, aligner
5. ~~Enable `RLS_STRICT=true` in development~~ ✅ DONE
6. ~~CI audit script (`auditRLS.js`)~~ ✅ DONE
7. ~~E2E tenant isolation tests~~ ✅ DONE
8. Enable `RLS_STRICT=true` in staging → 7-day observation → production

---

### Phase F.3+++ — RLS Distributed Hardening & Observability (COMPLETE ✅)

**Priority:** P0 — Critical
**Spec Reference:** spec.md §38
**Driver:** Production certification for horizontal scaling (k8s / PM2 cluster mode)

Phase F.3+++ transitions the RLS system from a single-instance security model to a distributed, production-hardened architecture with compliance-grade observability.

#### Deliverables

| Component | Status | File |
|-----------|--------|------|
| Redis-Backed Metrics | ✅ | `core/rls/rlsMetricsStore.js` |
| Persistent Violation Audit | ✅ | `core/rls/RLSViolation.model.js` |
| Distributed Hash Consistency | ✅ | `core/rls/rlsDistributedHash.js` |
| Circuit Breaker | ✅ | `core/rls/rlsCircuitBreaker.js` |
| Queue RLS Guard | ✅ | `core/rls/rlsQueueGuard.js` |
| Snapshot Signing (HMAC) | ✅ | `core/rls/rlsSnapshotSigner.js` |
| Audit Dashboard | ✅ | `core/rls/rlsAuditDashboard.js` |
| queryScoper distributed integration | ✅ | `core/rls/queryScoper.js` (integration) |
| rlsContext traceId + signature | ✅ | `middleware/rlsContext.js` (integration) |
| Metrics route distributed aggregation | ✅ | `core/rls/rlsMetricsRoute.js` (integration) |
| Barrel export updates | ✅ | `core/rls/index.js` (integration) |

#### Security Design Principles

- **Non-Blocking:** All Redis/MongoDB writes are fire-and-forget. Failures degrade to local-only; never block the request pipeline.
- **Defense-in-Depth:** Circuit breaker provides graduated degradation (CLOSED → DEGRADED → OPEN).
- **Forensic-Grade:** Every violation is persisted to MongoDB with 365-day TTL, correlated by `rlsTraceId`.
- **Zero-Trust Queues:** BullMQ jobs must carry and validate RLS context per `RLS_QUEUE_MODE`.
- **Tamper-Proof:** HMAC-SHA256 signing prevents context modification during inter-service communication.

#### Deployment Requirements

| Step | Action | Status |
|------|--------|--------|
| 1 | Configure `RLS_SIGNING_SECRET` in all production environments | Pending |
| 2 | Set `RLS_QUEUE_MODE=WARN` initially, promote to `ENFORCE` | Pending |
| 3 | Set `RLS_HASH_STRICT=false` initially, promote to `true` after 48h canary | Pending |
| 4 | Validate circuit breaker thresholds under production load | Pending |
| 5 | Enable audit dashboard access for platform operators | Pending |

### Canonical Auth Pipeline (Post-Phase F.3+++)

```
orgProtect → organizationContext → subscriptionGuard → featureFlagMiddleware
    → branchContextMiddleware → unifiedCapabilityMiddleware → assertCapabilities
    → ssotEnforcer
    → rlsContext + rlsTraceId                                     ← Phase F
    → rlsSignatureMiddleware (optional)                           ← Phase F.3+++
    → rlsDistributedHashMiddleware (optional)                     ← Phase F.3+++
    → rlsCircuitBreakerMiddleware                                 ← Phase F.3+++
    → requireEntitlement → requireFeature
    → requireOrgPermission(P.XXX) → policyMiddleware(P.XXX)
    → fieldFilterMiddleware(resourceType) [READ]                  ← Phase E
    → fieldWriteGuardMiddleware(resourceType) [WRITE]             ← Phase E
    → handler
    → secureModel(Model).find(query, req)                         ← Phase F
    → queryScoper dual-writes (local + Redis)                     ← Phase F.3+++
    → Response + capabilities.visibleFields                   ← Phase E
```

---

### Phase F.5 — RLS Trust Hardening & Exemption Elimination (COMPLETE ✅)

**Completed:** 2026-03-24
**Prerequisite:** Phase F.3+++ (Distributed Hardening)
**Goal:** Build governance infrastructure for measurable, irreversible RLS compliance

#### Motivation

Phase F through F.3+++ established the runtime enforcement layer (secureModel, queryScoper, circuit breaker, HMAC signing). Phase F.5 addresses the **governance gap**: there was no systematic tracking of WHY certain files bypass secureModel, no CI enforcement to prevent regression, and no measurable migration path.

#### Deliverables

| Component | Status | File |
|-----------|--------|------|
| Centralized Exemption Registry | ✅ | `core/rls/rlsExemptionRegistry.js` (68 entries) |
| CI-Blocking Exemption Validator | ✅ | `scripts/validateRLSExemptions.js` |
| Phase F.5 Auditor Upgrade | ✅ | `scripts/auditRLS.js` (coverage metrics) |
| Barrel Export Integration | ✅ | `core/rls/index.js` |
| npm CI Scripts | ✅ | `package.json` (4 scripts) |
| Architecture Spec Update | ✅ | `specs/system-architecture.spec.md` (§6.7, Invariants 13-15) |

#### Exemption Registry Summary

| Category | Count | Permanent | Eliminable |
|----------|-------|-----------|------------|
| PLATFORM_SERVICE | 6 | 6 | 0 |
| PLATFORM_CRON | 3 | 3 | 0 |
| PLATFORM_AUTH | 5 | 5 | 0 |
| PUBLIC_ENDPOINT | 1 | 1 | 0 |
| SUPERVISOR_PLANE | 8 | 8 | 0 |
| PATIENT_PORTAL | 2 | 1 | 1 |
| SHARED_ACCESS | 40 | 0 | 40 |
| DOMAIN_EVENT | 3 | 0 | 3 |
| BACKGROUND_WORKER | 1 | 0 | 1 |
| **Total** | **68** | **24** | **44** |

#### CI Scripts

```bash
npm run audit:rls              # Advisory mode
npm run audit:rls:strict       # CI gate (exit 1 on violations)
npm run validate:rls-exemptions        # Advisory mode
npm run validate:rls-exemptions:strict # CI gate (exit 1 on violations)
```

---

### Phase F.5.1 — Unified RLS Validation Engine (COMPLETE ✅)

**Completed:** 2026-03-24
**Prerequisite:** Phase F.5 (Trust Hardening & Exemption Governance)
**Goal:** Eliminate boot-time / CI-time validation divergence via a single validation engine

#### Problem Statement

Phase F.5 introduced three independent RLS enforcement points: boot-time validator (`rlsValidator.js`), CI auditor (`auditRLS.js`), and compliance scanner (`checkRLSCompliance.js`). Each had its own copy of exemption patterns, safe markers, and raw query detection logic. The boot validator used a narrower set of exemption patterns and lacked registry awareness, causing **345 false-positive violations** and boot failures when `RLS_STRICT=true` was enabled.

#### Solution

Created `rlsValidationEngine.js` as the **Single Source of Truth** for all RLS validation logic. All three enforcement points now delegate scanning to this unified engine.

#### Architecture

```
rlsValidationEngine.js (SSOT)
    ├── EXEMPT_PATTERNS        — regex-based file exclusions
    ├── SAFE_MARKERS           — @rls-exempt, secureModel, etc.
    ├── LINE_PATTERNS          — raw query detection regexes
    ├── DEPRECATED_PATTERNS    — legacy pattern detection
    ├── isExempt(filePath)     → consults BOTH patterns AND rlsExemptionRegistry
    └── runValidation(options) → unified scan with module grouping + metrics
            ↑                         ↑                      ↑
        rlsValidator.js         auditRLS.js          checkRLSCompliance.js
        (boot-time)             (CI audit)           (CI compliance)
```

#### Deliverables

| Component | Status | File |
|-----------|--------|------|
| Unified Validation Engine | ✅ | `core/rls/rlsValidationEngine.js` |
| Boot Validator Refactored | ✅ | `core/rls/rlsValidator.js` (delegates to engine) |
| CI Auditor Refactored | ✅ | `scripts/auditRLS.js` (delegates to engine, -170 LOC) |
| Compliance Script Refactored | ✅ | `scripts/checkRLSCompliance.js` (delegates to engine) |
| Barrel Export Updated | ✅ | `core/rls/index.js` (exports `runRLSValidation`) |
| Architecture Spec Updated | ✅ | `specs/system-architecture.spec.md` §6.7, Invariant 16 |

#### Verification (All 3 Enforcement Points)

```
Boot-time:   0 violations, registry validated ✅
CI audit:    0 violations, registry validated ✅
Compliance:  0 violations, registry validated ✅
```

#### Architecture Impact

- **Deterministic compliance:** Boot-time and CI-time validation produce identical results — divergence is structurally impossible
- **Single maintenance point:** All exemption patterns, safe markers, and query detection regexes live in ONE file
- **345 false positives eliminated:** Boot validator now correctly respects the exemption registry
- **Phase F.6 unblocked:** Migration waves can proceed with confidence that removing exemptions will not trigger false failures

---

### Phase F.6 — Zero-Trust RLS Hardening (COMPLETE ✅)

**Completed:** 2026-03-24
**Prerequisite:** Phase F.5.1 (Unified Validation Engine)
**Goal:** Establish cryptographic Zero-Trust enforcement for ALL database access — authenticated, background, and public

#### Motivation

Phase F through F.5.1 built the governance and validation infrastructure. However, three critical gaps remained:
1. **Background operations** (cron, queues) lacked cryptographic verification — any object with `organizationId` was trusted
2. **NULL context** fell through silently — no fail-closed enforcement
3. **Public endpoints** (intake) operated without rate limiting or token-binding enforcement

Phase F.6 closes all three gaps with a three-layer enforcement model.

#### Three-Layer Zero-Trust Model

**Layer 1: HMAC-Signed System Contexts (`systemContext.js`)**
- `createSystemContext()` generates cryptographically signed contexts for background operations
- HMAC-SHA256 signing with `INTERNAL_SYSTEM_SECRET`
- TTL-based expiry (default 1h) prevents replay attacks
- Timing-safe signature comparison (`crypto.timingSafeEqual`) prevents timing attacks
- Contexts are frozen (immutable) after creation

**Layer 2: Unified Execution Guard (`secureModel.js`)**
- `ensureRLSContext()` validates ALL contexts before ANY database operation
- Express `req` objects → standard RLS path
- System contexts → HMAC verification required (INV-17)
- NULL/undefined context → hard 500 error (INV-19, fail-closed)
- Failed verification → `RLSViolation` audit trail + rejection

**Layer 3: Public Endpoint Hardening (`intakeRateLimit.js`)**
- Rate limiting on all public intake endpoints (INV-18)
- `intakeValidateLimiter`: 10 req/15min per IP+token (GET)
- `intakeSubmitLimiter`: 5 req/15min per IP+token (POST)
- Token-bound `organizationId` from server-side records — user-supplied org context FORBIDDEN

#### Deliverables

| Component | Status | File |
|-----------|--------|------|
| HMAC System Context Factory | ✅ | `core/rls/systemContext.js` (264 lines) |
| Unified Execution Guard | ✅ | `core/rls/secureModel.js` (updated) |
| CI/CD Raw Model Detector | ✅ | `scripts/checkRawModelUsage.js` |
| Public Intake Rate Limiter | ✅ | `middleware/intakeRateLimit.js` |
| Intake Route Hardening | ✅ | `patientDomain/patientDomain.routes.js` (rate limiters wired) |
| Security Test Suite | ✅ | `tests/security/rls.systemContext.test.js` |
| Barrel Export Updates | ✅ | `core/rls/index.js` (createSystemContext, verifySystemContext, isSystemContext) |
| npm CI Scripts | ✅ | `validate:raw-models`, `validate:raw-models:strict`, `test:system-context` |
| Architecture Spec | ✅ | `system-architecture.spec.md` §6.7, §8.1, INV-17/18/19 |

#### Security Invariants Established

| ID | Name | Enforcement |
|----|------|-------------|
| INV-17 | SYSTEM_CONTEXT_VERIFICATION | System contexts MUST be HMAC-signed and verified |
| INV-18 | PUBLIC_TOKEN_BINDING | Public endpoints MUST be rate-limited; organizationId from token records ONLY |
| INV-19 | NON_NULL_ORG_CONTEXT | NULL context → fail-closed (hard 500 error) |

#### Attack Vectors Mitigated

| Vector | Mitigation | Invariant |
|--------|-----------|-----------|
| Forged system context | HMAC-SHA256 verification | INV-17 |
| Tampered organizationId | Per-org HMAC integrity check | INV-17 |
| Context replay attack | TTL expiry + future timestamp rejection | INV-17 |
| Cross-tenant signature swap | organizationId bound into HMAC payload | INV-17 |
| Timing attack | `crypto.timingSafeEqual()` | INV-17 |
| Public endpoint org injection | Token-bound organizationId (server-side) | INV-18 |
| Token enumeration | Per-IP+token rate limiting | INV-18 |
| NULL context bypass | Fail-closed enforcement (hard error) | INV-19 |
| Raw model bypass (dev time) | CI/CD `checkRawModelUsage.js` gate | INV-17 |

#### Canonical Auth Pipeline (Post-Phase F.6)

```
Request
    → orgProtect (JWT verification + tokenVersion)              ← Phase A
    → organizationContext                                        ← Phase A
    → subscriptionGuard                                          ← Phase B
    → featureFlags                                               ← Phase B
    → branchContext                                              ← Phase A
    → unifiedCapability                                          ← Phase C
    → assertCapabilities                                         ← Phase C
    → ssotEnforcer                                               ← Phase D
    → rlsContext + rlsTraceId                                    ← Phase F
    → rlsSignatureMiddleware (optional)                          ← Phase F.3+++
    → rlsDistributedHashMiddleware (optional)                    ← Phase F.3+++
    → rlsCircuitBreakerMiddleware                                ← Phase F.3+++
    → requireOrgPermission (RBAC)                                ← Phase A
    → policyMiddleware (PBAC)                                    ← Phase D
    → fieldFilterMiddleware(resourceType) [READ]                 ← Phase E
    → fieldWriteGuardMiddleware(resourceType) [WRITE]            ← Phase E
    → Controller logic                                           ←
    → secureModel(Model).find(query, req)                        ← Phase F
      → ensureRLSContext() — HMAC or JWT verification            ← Phase F.6 ✅
    → queryScoper dual-writes (local + Redis)                    ← Phase F.3+++
    → Response + capabilities.visibleFields                      ← Phase E
```

#### CI/CD Gates

```bash
npm run validate:raw-models          # Advisory mode
npm run validate:raw-models:strict   # CI gate (exit 1 on violations)
npm run audit:rls                    # RLS compliance advisory
npm run audit:rls:strict             # RLS compliance CI gate
npm run validate:rls-exemptions      # Exemption budget advisory
npm run validate:rls-exemptions:strict # Exemption budget CI gate
npm run test:system-context          # System context security tests
```

---

### Phase F.7 — Zero-Trust Wave Migration (PLANNED)

**Target:** Eliminate all 44 eliminable exemptions → 100% secureModel coverage
**Strategy:** Repositories → Services → Controllers (bottom-up)
**Prerequisite:** Phase F.6 (Zero-Trust Hardening)
**Threshold Ratcheting:** `RLS_EXEMPTION_MAX` lowered after each wave

#### Migration Waves

| Wave | Target Domain | Files | Priority |
|------|--------------|-------|----------|
| **Wave 1** | Patient Domain Repositories | 4 files | P0 — Critical |
| **Wave 2** | Patient Domain Services | 6 files | P0 — Critical |
| **Wave 3** | Patient Domain Controllers | 5 files | P1 — High |
| **Wave 4** | Organization Controllers | 10 files | P1 — High |
| **Wave 5** | Orthodontic Domain | 5 files | P1 — High |
| **Wave 6** | Document Engine Domain | 4 files | P2 — Medium |
| **Wave 7** | Billing/Finance Domain | 3 files | P2 — Medium |
| **Wave 8** | Features Control | 4 files | P2 — Medium |
| **Wave 9** | Remaining Domains | 3 files | P3 — Low |

#### req.organizationId → req.rls.organizationId Migration

All ~40 files using `req.organizationId` in `src/modules/` must be migrated to use `req.rls.organizationId` — the verified, immutable JWT-derived tenant context.

#### Threshold Ratchet Schedule

| After Wave | Max Eliminable | RLS_EXEMPTION_MAX |
|------------|----------------|-------------------|
| Current | 44 | 55 |
| Wave 1-2 | 34 | 40 |
| Wave 3-4 | 19 | 25 |
| Wave 5-6 | 10 | 15 |
| Wave 7-9 | 0 | 5 |
| Graduate | 0 | 0 (freeze registry) |

#### Completion Criteria

- [ ] All eliminable exemptions = 0
- [ ] `req.organizationId` usage = 0 in `src/modules/`
- [ ] `npm run audit:rls:strict` passes with 100% coverage
- [ ] `npm run validate:rls-exemptions:strict` passes with 0 violations
- [ ] Registry frozen (only permanent entries remain)
- [ ] `buildScopedQuery` deprecated and removed

---

### Phase F.10 — Production Lock-In & Drift Enforcement (COMPLETE ✅)

**Status:** Deployed — Warn mode active
**Prerequisite:** Phase F.6 (Zero-Trust Hardening) + Phase E (FLS Engine)
**Invariant:** INV-29 — SECURE_FLOW_ENFORCEMENT
**Spec Reference:** spec.md §38.13, §38.14

#### Objective

Runtime drift detection across ALL org-plane routes. Validates that the complete security enforcement chain (Context → Execution → FLS → Taxonomy) was applied to every request before the response is sent.

#### Implementation Summary

| Component | File | Status |
|-----------|------|--------|
| secureModel marker | `core/rls/secureModel.js` | ✅ `markSecureModelUsed(ctx)` wired |
| FLS read marker | `rbac/fieldFilter.js` | ✅ `markFLSReadApplied(req)` wired |
| FLS write marker | `rbac/fieldWriteGuard.js` | ✅ `markFLSWriteApplied(req)` wired |
| Global middleware | `app.js` org chain | ✅ `secureFlowMiddleware()` mounted after `rlsContext` |
| Assertion engine | `core/rls/secureFlowAssertion.js` | ✅ 326 lines, marker + middleware + strict mode |
| Barrel export | `core/rls/index.js` | ✅ Spread-exported via `...require("./secureFlowAssertion")` |

#### Enforcement Escalation Path

```
Sprint N     → SECURE_FLOW_MODE=warn     (monitor violations)
Sprint N+2   → SECURE_FLOW_MODE=enforce  (alert on violations)
Sprint N+4   → enforceSecureFlowStrict() (block violating responses)
```

#### Success Criteria

- [x] `secureFlowMiddleware()` mounted in org-plane middleware chain
- [x] `markSecureModelUsed` wired into all secureModel context paths
- [x] `markFLSReadApplied` wired into fieldFilter middleware
- [x] `markFLSWriteApplied` wired into fieldWriteGuard middleware
- [x] INV-29 formally documented in spec.md
- [ ] 2+ sprints with zero `SECURE_FLOW_VIOLATION` logs → escalate to `enforce`
- [ ] All routes pass strict enforcement → enable `enforceSecureFlowStrict()`

---

### Phase H — Settings Hub Integration

**Status:** Phase 1 COMPLETE ✅ (Pre-Implementation Hardening)
**Prerequisite:** Phase F.6 (Zero-Trust Hardening) + Phase E (FLS Engine)
**Spec Reference:** spec.md §39
**Priority:** P2 — Medium

#### Objective

Expose platform-level billing and support services to organization users via a bridge pattern, delivering a Notion-like Settings Hub experience without breaking plane isolation or introducing cross-tenant risk.

#### Phase Breakdown

| Phase | Title | Status | Description |
|-------|-------|--------|-------------|
| H.1 | Pre-Implementation Hardening | ✅ DONE | Bridge contracts, org context guard, DTO transformers, RBAC/PBAC/FLS registration |
| H.2 | Bridge Services | ✅ DONE | `orgBillingBridge.service.js`, `orgSupportBridge.service.js`, `enforceDTO.js` |
| H.3 | API Routes | ✅ DONE | `/api/v1/org/settings/billing/*`, `/api/v1/org/settings/support/*` |
| H.4 | Frontend Assembly | ✅ DONE | SupportPage, BillingPage, StatusBadge, PriorityTag, TicketCard, ChatBubble |
| H.5 | Validation & Rollout | ✅ DONE | Manual code-level audit, contract verification, canary strategy |
| H.6 | Final Hardening | ✅ DONE | DTO version lock, rate limiting, ObjectId validation, audit logging, bridge freeze |

#### Phase H.1 — Pre-Implementation Hardening (COMPLETE ✅)

**Completed:** 2026-03-26

| Component | File | Status |
|-----------|------|--------|
| Billing bridge contract | `specs/contracts/bridges/orgBilling.contract.js` | ✅ |
| Support bridge contract | `specs/contracts/bridges/orgSupport.contract.js` | ✅ |
| Org context guard | `core/security/assertOrgContext.js` | ✅ |
| DTO transformers | `services/bridges/utils/transformers.js` | ✅ |
| RBAC: `support.write` | `rbac/orgPermissions.js` | ✅ |
| PBAC: `SUPPORT_WRITE` policy | `rbac/policyRegistry.js` | ✅ |
| FLS: `subscription` resource | `rbac/fieldAccessRegistry.js` | ✅ |
| FLS: `supportTicket` resource | `rbac/fieldAccessRegistry.js` | ✅ |
| Ticket compound index | `shared/models/Ticket.js` | ✅ |

#### Phase H.2 — Bridge Services (COMPLETE ✅)

**Completed:** 2026-03-26

| Service | File | Consumes | Status |
|---------|------|----------|--------|
| DTO Enforcement | `services/bridges/utils/enforceDTO.js` | — (pure validation) | ✅ |
| Billing Bridge | `services/bridges/orgBillingBridge.service.js` | OrgContract, PlatformInvoice, EntitlementResolver | ✅ |
| Support Bridge | `services/bridges/orgSupportBridge.service.js` | Ticket (via secureModel), assertOrgContext | ✅ |

**Implemented Rules:**
- Support bridge uses `secureModel(Ticket)` for org-scoped DB access
- Billing bridge accesses platform models directly (they ARE platform-plane)
- All responses pass through `enforceDTO()` + DTO transformers
- No raw Mongoose documents cross the boundary
- `extractOrgId(req)` + `assertOrgContext()` for identity verification

#### Phase H.3 — API Routes (COMPLETE ✅)

**Completed:** 2026-03-26

| Method | Path | Permission | Guard | Status |
|--------|------|-----------|-------|--------|
| GET | `/api/v1/org/settings/billing/subscription` | `billing.read` | `authorize()` | ✅ |
| GET | `/api/v1/org/settings/billing/invoices` | `billing.read` | `authorize()` | ✅ |
| GET | `/api/v1/org/settings/billing/usage` | `billing.read` | `authorize()` | ✅ |
| GET | `/api/v1/org/settings/support/tickets` | `support.read` | `authorize()` | ✅ |
| POST | `/api/v1/org/settings/support/tickets` | `support.write` | `authorize()` | ✅ |
| GET | `/api/v1/org/settings/support/tickets/:id` | `support.read` | `authorize()` | ✅ |
| POST | `/api/v1/org/settings/support/tickets/:id/comments` | `support.write` | `authorize()` | ✅ |

**Route Files:**
- `routes/org/settingsBilling.routes.js` — 3 billing endpoints
- `routes/org/settingsSupport.routes.js` — 4 support endpoints
- `routes/settingsRoutes.js` — mount point updated

#### Phase H.3.5 — Pre-Frontend Hardening (COMPLETE ✅)

**Completed:** 2026-03-26

| Component | File | Status |
|-----------|------|--------|
| API client | `services/settings.api.js` | ✅ |
| Query keys | `lib/query/queryKeys.js` (QK.settingsBilling + QK.settingsSupport) | ✅ |
| Billing hooks | `modules/org/settings/hooks/useSettingsBilling.js` | ✅ |
| Support hooks | `modules/org/settings/hooks/useSettingsSupport.js` | ✅ |
| DTO types | `types/settings.types.js` | ✅ |
| Frontend rules | `rules/frontend.rules.md` | ✅ |

**Skipped (already exist):**
- Permission hook → `useCapability` from `@/hooks/useCapability` (Phase 17)
- Error handler → `normalizeError` from `@/utils/errorHandler` (already comprehensive)

#### Phase H.4 — Frontend Assembly (COMPLETE ✅)

**Completed:** 2026-03-26

| Component | File | Type |
|-----------|------|------|
| StatusBadge | `modules/org/settings/components/StatusBadge.jsx` | Reusable |
| PriorityTag | `modules/org/settings/components/PriorityTag.jsx` | Reusable |
| TicketCard | `modules/org/settings/components/TicketCard.jsx` | Reusable |
| ChatBubble | `modules/org/settings/components/ChatBubble.jsx` | Reusable |
| SupportPage | `modules/org/settings/pages/SupportPage.jsx` | Page |
| BillingPage | `modules/org/settings/pages/BillingPage.jsx` | Page |

**Routes registered:**
- `/org/settings/billing` → `RequireOrgPermission(billing.read)` → `BillingPage`
- `/org/settings/support` → `RequireOrgPermission(support.read)` → `SupportPage`

**Settings page updated:**
- Added Billing & Support section with navigation cards
- Gated by `billing.read` and `support.read` permissions

#### Estimated Total Effort

| Phase | Effort |
|----------|--------|
| H.1 | 1 day (DONE) |
| H.2 | 1 day (DONE) |
| H.3 | 0.5 day (DONE) |
| H.3.5 | 0.5 day (DONE) |
| H.4 | 1 day (DONE) |
| H.5 | 0.5 day (DONE) |
| **Total** | **~5 days** |

#### Phase H.5 — Validation & Controlled Rollout (COMPLETE ✅)

**Completed:** 2026-03-26

**Validation Tasks Executed:**
1. ✅ CI Security Validation (manual code-level audit)
2. ✅ Runtime Security Verification (config documented)
3. ✅ Integration Test Matrix (9 critical paths verified)
4. ✅ Frontend ↔ Backend Contract Test (field-by-field alignment)
5. ✅ Canary Deployment Strategy (documented)
6. ✅ Observability Checklist (3 events logging confirmed)
7. ✅ Performance Check (all endpoints < 250ms target)
8. ✅ Production Configuration (SECURE_FLOW_MODE=strict)

**Audit Findings:**
- Zero raw model queries in Settings Hub
- Zero DTO leaks (15 forbidden keys checked recursively)
- Zero cross-plane imports
- Zero RLS violations
- All frontend fields have safe defaults (no null crash risk)
- `actorId` never appears in any DTO output

**Full Report:** See `phase_h5_validation_report.md` in artifacts

#### Phase H.6 — Final Hardening (COMPLETE ✅)

**Completed:** 2026-03-26

**Files Created:**
| File | Purpose |
|------|---------|
| `SETTINGS_DTO_VERSION.js` | Immutable contract version (v1.0.0) |
| `validateObjectId.js` | MongoDB ObjectId validation utility |
| `settingsRateLimit.js` | 3 rate limiters (create/comment/billing) |
| `validate-settings-hub.js` | CI validator (7 structural checks) |

**Hardening Applied:**
1. ✅ DTO Version Lock — All responses include `version: "v1.0.0"` envelope
2. ✅ Pagination Hard Cap — `Math.min(limit, 50)` defense-in-depth
3. ✅ ObjectId Validation — 400 on malformed ticket IDs
4. ✅ Rate Limiting — supportCreate (10/min), supportComment (15/min), billingRead (30/min)
5. ✅ Read Audit Logging — `ORG_BILLING_ACCESS` + `ORG_SUPPORT_VIEW` events
6. ✅ CI Output — `validate-settings-hub.js` writes to log file
7. ✅ Bridge Freeze — `@bridge-layer (LOCKED)` on all bridge files

**Bug Fixed:**
- `enforceDTO(mapSubscription, contract, planVersion)` — third arg silently dropped; wrapped in closure

---

## PHASE X — HOT PATH SIMPLIFICATION + FINAL HARDENING (COMPLETE ✅)

**Completed:** 2026-03-27
**Objective:** Reduce runtime complexity, eliminate circular dependencies, enforce single source of truth for permissions, and harden entitlement engine.

### Phase X.1 — Circular Dependency Resolution + Middleware Consolidation

| Action | Result |
|--------|--------|
| 18 top-level route `require()` → lazy `routeFactory` lambdas | ✅ Zero circular deps |
| `requireFeature` → `requireEntitlement` on all routes | ✅ Single entitlement guard |
| `branchScopeMiddleware` → `branchContext.middleware.js` | ✅ Single branch middleware |
| `req.user.permissionSet` → `req.authContext.permissionSet` | ✅ Single permission source |
| `CORE_MODULES` → lazy `getCoreModules()` with null guard | ✅ Fail-closed entitlement |
| `instanceof Set` guards on all `.has()` calls | ✅ No more undefined.has crashes |

### Phase X.2 — Pre-X2 Audit (PASS)

- 10/10 checks passed at code + runtime level
- 19/19 modules mounted, 28/28 Guardian checks, 0 RLS violations
- Zero `TypeError` crashes in runtime
- 4 non-blocking issues documented for Phase X.2

### Phase X.2 — Deep Simplification (PLANNED)

**Priority:** P1 — High
**Estimated Effort:** ~5 hours total

| Phase | Task | Time | Risk |
|-------|------|------|------|
| X.2a | Delete 10 dead middleware/backup files + fix 5 runtime bugs | ~1hr | Low |
| X.2b | Unify 5 rate limiter files into 1 factory (fix IPv6) | ~30min | Low |
| X.2c | Merge subscription guards, simplify global pipeline (7 → 3) | ~1hr | Medium |
| X.2d | RLS slimming (24 → 10 files, ~153KB removed) | ~2hrs | Medium |
| X.2e | Boot optimization (move 3 validators to CI-only) | ~30min | Low |

**Expected Outcomes:**
- Middleware files: 40 → 22
- RLS files: 24 → 10
- Global pipeline: 7 → 3
- Rate limiters: 5 → 1 (0 IPv6 errors)
- Removable LOC: ~5,000+

---

## SECTION 6 — ORG FINANCE + ACCOUNTING ARCHITECTURE REFACTOR (TDS v1.0)

**Priority:** P1 — High
**Spec Reference:** `specs/org-finance-accounting.spec.md` (v1.0)
**Core Goal:** 
Establish two clean bounded contexts to eliminate financial logic drift.
- **financeDomain** (Transactional/Write) → SSOT for Invoices, Payments, Refunds, Ledger.
- **accountingDomain** (Analytical/Read) → SSOT for Revenue summaries, P&L, Dashboards.

### 🧪 6.1 MIGRATION ROADMAP

#### PHASE 1 — CLEAN FINANCE DOMAIN
**Objective:** Consolidate all transactional logic into one authoritative domain.
- **MERGE:** `billingDomain` → `financeDomain` (Rename/Refactor to authoritative core).
- **DELETE:** legacy `financeDomain` (unstructured) and `financialDomain`.
- **RESULT:** Single transactional domain: `financeDomain`.

#### PHASE 2 — CREATE ACCOUNTING DOMAIN
**Objective:** Initialize the projection/analytical layer.
- **CREATE:** `modules/accountingDomain/`.
- **BUILD:** Projections (P&L, Revenue), Services (Revenue/Expense), and Initial Listeners.

#### PHASE 3 — EVENT BUS EXPANSION
**Objective:** Decouple domains via immutable event streams.
- **EMIT:** `invoice.created`, `payment.received`, `refund.processed`.
- **EMIT (External):** `inventory.purchase.created` (from inventory), `lab.case.completed` (from lab).
- **CONSUME:** `accountingDomain` as primary consumer.

#### PHASE 4 — MOVE ANALYTICS
**Objective:** Align reporting routes with the analytical domain.
- **MOVE:** `billingAnalytics.routes.js` → `accountingDomain/routes/reports.routes.js`.
- **REFACTOR:** Reporting endpoints to read from `accountingDomain` projections.

#### PHASE 5 — FRONTEND ALIGNMENT
**Objective:** UX parity with domain boundaries.
- **Finance Tab:** Invoices + Payments (transactional).
- **Reports Tab:** Accounting dashboards (analytical).

#### PHASE 6 — REMOVE LEGACY PERMISSIONS
**Objective:** Clean security registry.
- **DELETE:** `billing.read`, `finance.read`.
- **ENFORCE:** `invoices.*`, `payments.*`, `accounting.read`, `accounting.analytics`.

---

### 🚨 6.2 ENFORCEMENT RULES (MANDATORY)

| Rule | Definition |
|---|---|
| **NO CROSS-CALLS** | `accountingDomain` MUST NOT import `finance` services directly. Use events. |
| **READ-ONLY PROJECTIONS** | `accountingDomain` MUST NOT perform ledger writes. |
| **IMMUTABLE LEDGER** | `financeDomain` MUST maintain append-only journal entries. |
| **DOMAIN ISOLATION** | Shared mutable state between finance and accounting is strictly **FORBIDDEN**. |

---

### Estimated Effort
- Phase 1 (Clean/Merge): 2 days
- Phase 2 (Accounting Setup): 2 days
- Phase 3 (Event Bus): 1.5 days
- Phase 4 (Analytics Move): 1 day
- Phase 5 (Frontend UI): 1.5 days
- Phase 6 (Security Cleanup): 0.5 day
- **Total: ~8.5 days**

---

## SECTION 7 — CLINICAL & INFRASTRUCTURE HARDENING (PHASE 25) ✅ COMPLETE

**Priority:** P1 — High
**Date:** 2026-04-02
**Status:** ✅ DONE

### 7.1 Audit Chain Hardening (BullMQ)
**Objective:** Resolve hash-chain collisions in multi-instance environments.
- **Worker:** `auditWorker.js` — Enforces strict sequential processing (`concurrency: 1`).
- **Self-Healing:** Inline E11000 recovery + boot-time index repair.
- **Isolation:** Per-org database uniqueness (`{ previousHash: 1 }`).

### 7.2 Branch Chair Synchronization
**Objective:** Standardize treatment chair management across all branches.
- **API:** Dedicated `/branches/:id/chairs` endpoint.
- **Provisioning:** Self-healing auto-creation of default chairs for legacy branches.
- **UI:** Appointment drawer now fetches real-time chair data.

---

### Estimated Effort
- Audit Hardening: 1.5 days
- Branch Sync: 0.5 day
- **Total: 2 days**

