# Audit System

## Purpose
Provide forensic-grade audit logging for all security-relevant and data mutation events.

## Architecture
```
Business Service → emitViaOutbox(EVENT, { _audit: {...} })
  ↓ (post-commit)
Audit Listener → createAuditRecord(auditPayload)
  ↓
AuditLog collection (per-org DB)
```

## Audit Record Schema
```javascript
{
  organizationId: ObjectId,
  branchId: ObjectId,
  actorId: ObjectId,
  actorType: "tenant_user" | "platform_user" | "system",
  action: String,         // e.g. "PATIENT_CREATED"
  entity: String,         // e.g. "PATIENT"
  entityType: String,
  entityId: ObjectId,
  details: Object,        // Action-specific metadata
  ipAddress: String,
  success: Boolean,
  createdAt: Date,
}
```

## Action Categories
| Category | Examples |
|----------|---------|
| Auth | `LOGIN_SUCCESS`, `LOGIN_FAILURE`, `PASSWORD_CHANGED` |
| Patient | `PATIENT_CREATED`, `PATIENT_DELETED`, `PATIENT_STATUS_CHANGED` |
| Clinical | `TREATMENT_PLANNED`, `PROCEDURE_COMPLETED` |
| Financial | `INVOICE_CREATED`, `PAYMENT_RECEIVED`, `REFUND_ISSUED` |
| Admin | `USER_CREATED`, `ROLE_UPDATED`, `BRANCH_CREATED` |

## Key Files
| File | Purpose |
|------|---------|
| `backend/src/services/auditService.js` | Audit record creation |
| `backend/src/shared/models/AuditLog.js` | Schema definition |
| `backend/src/listeners/` | Event-to-audit mapping |

## Querying
- Platform admins: `GET /platform/organizations/:id/audit-logs`
- Always scoped by organizationId
- Supports filtering by action, success, pagination

## Dependencies
- [[EventDrivenArchitecture]] — Events carry `_audit` payloads
- [[DatabaseIsolation]] — Audit logs stored in per-org DB
- [[SecurityArchitecture]] — Audit is the accountability layer

## Status
**ACTIVE**

---
#audit #security #logging #forensic
