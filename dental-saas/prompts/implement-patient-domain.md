# Implement Patient Domain Prompt
## DentalSaaS v3.2 — AI-Assisted Implementation Prompt
**Domain:** Patient Domain — Sovereign Aggregate Extensions
**Classification:** Domain Core — Mutation Authority

---

## CONTEXT

You are extending the **Patient Domain** of DentalSaaS, a multi-tenant dental clinic SaaS platform. The Patient Domain is built around the **Sovereign Aggregate Pattern**: a single service (`PatientAggregateService`) is the only authorized path for mutating Patient state.

The existing implementation is production-grade with:
- Atomic MongoDB transactions (snapshot isolation + majority write concern)
- OAV (Optimistic Aggregate Versioning) on every mutation
- Post-commit event emission via EventBus
- Within-transaction AuditLog recording
- Multi-branch governance enforcement

You must **not break** any of these patterns. All new mutations must follow the same archetype.

You are in **ENTERPRISE DETERMINISTIC GOVERNANCE MODE**. Output Sentinel Pre-Check before writing code.

---

## ARCHITECTURE CONSTRAINTS (MANDATORY)

1. **PatientAggregateService is the ONLY mutation authority.** Controllers are HTTP adapters only — never call `Patient.save()` or `Patient.updateOne()` directly from controllers.
2. **Every mutation must be atomic.** Use `session.withTransaction()` with `readConcern: snapshot, writeConcern: majority`.
3. **OAV is mandatory for all external mutations.** `expectedVersion` must be required for non-internal calls. Throw `VersionConflictError` if missing.
4. **Audit log within transaction.** If audit fails, the transaction rolls back.
5. **Event post-commit only.** Events are emitted after `session.endSession()`, never inside the transaction.
6. **Tenant scoping is absolute.** Every query must include `{ organizationId }`.
7. **Aggregate projection only.** Controllers return `this.getPatientAggregate(...)` — never raw Mongoose documents.
8. **Primary branch safety.** When changing `allowedBranchIds`, primary must always remain in the list.

---

## IMPLEMENTATION TARGETS

### Target 1: Add Audit to `setPortalEnabled`

The `setPortalEnabled` method updates `portalEnabled` on Patient but does NOT create an AuditLog record. Add it:

```javascript
// In setPortalEnabled, after successful OAV update:
await this._recordAudit({
  organizationId,
  actorId,                    // needs to be added to function signature
  action: "PATIENT_PORTAL_ENABLED",  // or "PATIENT_PORTAL_DISABLED" based on `enabled`
  entityId: patientId,
  metadata: { portalEnabled: enabled },
  ipAddress,                  // needs to be added to function signature  
  session: null               // setPortalEnabled doesn't use a full session
});
```

Also emit an event:
```javascript
eventBus.emit(enabled ? "PATIENT_PORTAL_ENABLED" : "PATIENT_PORTAL_DISABLED", {
  organizationId,
  patientId,
  actorId
});
```

Update the function signature to accept `{ organizationId, patientId, enabled, actorId, ipAddress, expectedVersion, isInternalEvent }`.

### Target 2: Add Negative Stock Guard Pattern (as reference for financial balance)

The aggregate projection has a financial slot that is currently a placeholder:
```javascript
financial: {
  balance: 0,        // placeholder
  currency: "USD",
  lastInvoice: null
}
```

Add a read-only query to populate this from `BillingInvoice` (org clinical invoicing) within `getPatientAggregate`:

```javascript
// In getPatientAggregate — add after clinical query:
const financialSummary = await this._getFinancialSummary({ organizationId, patientId });

// New helper method:
async _getFinancialSummary({ organizationId, patientId }) {
  // Import BillingInvoice from org/billing domain (READ ONLY — no mutation)
  const BillingInvoice = require("../../organization/billing/models/billingInvoice.model");
  
  const invoices = await BillingInvoice.find({
    organizationId,
    patientId,
    status: { $ne: "void" }
  }).sort({ createdAt: -1 }).limit(10).lean();
  
  const totalCharged = invoices.reduce((sum, inv) => sum + (inv.total || 0), 0);
  const totalPaid = invoices
    .filter(inv => inv.status === "paid")
    .reduce((sum, inv) => sum + (inv.total || 0), 0);
  
  return {
    balance: totalCharged - totalPaid,
    currency: invoices[0]?.currency || "USD",
    lastInvoice: invoices[0] ? {
      id: invoices[0]._id,
      total: invoices[0].total,
      status: invoices[0].status,
      createdAt: invoices[0].createdAt
    } : null
  };
}
```

### Target 3: Enforce Clinical Notes Immutability

Clinical notes in `ClinicalRecord.notes` are currently mutable (standard Mongoose array). Add a guard to prevent editing existing notes — only append is allowed:

```javascript
// In clinical.model.js — add a pre-hook that detects modification of existing notes:
clinicalRecordSchema.pre("save", function() {
  if (this.isModified("notes")) {
    const original = this._original?.notes || [];
    // Notes that exist in original must not be modified
    for (const origNote of original) {
      const current = this.notes.id(origNote._id);
      if (current && (current.content !== origNote.content || 
                      current.authorId.toString() !== origNote.authorId.toString())) {
        throw new Error("[ClinicalRecord] Notes are append-only. Existing notes cannot be modified.");
      }
    }
  }
});
```

Also add to `updateMedicalHistory` — use `$push` instead of array reassignment to ensure notes are append-only at the service layer.

### Target 4: Wire Prescription to Aggregate Projection

The `prescription.model.js` exists but is not returned in the aggregate. Add it:

```javascript
// In getPatientAggregate — add prescription query:
const prescriptions = await Prescription.find({ 
  organizationId, 
  patientId 
}).sort({ createdAt: -1 }).lean();

// Add to aggregate response:
clinical: {
  medicalHistory: ...,
  notes: ...,
  prescriptions: prescriptions || [],   // <-- add this
  alerts,
  riskFlags
}
```

---

## ARCHETYPE TEMPLATE (Copy this for any new mutation)

```javascript
async newMutation({ organizationId, actorId, patientId, data, ipAddress, expectedVersion, isInternalEvent = false }) {
  let eventPayload;
  const session = await mongoose.startSession();
  try {
    await session.withTransaction(async () => {
      const patient = await Patient.findOne({ _id: patientId, organizationId, isActive: true }).session(session);
      if (!patient) throw new Error("Patient not found.");

      const VersionConflictError = require("../../../errors/VersionConflictError");
      if (!isInternalEvent && expectedVersion === undefined) {
        throw new VersionConflictError("expectedVersion required");
      }
      const targetVersion = isInternalEvent ? patient.version : expectedVersion;

      const result = await Patient.updateOne(
        { _id: patient._id, organizationId, version: targetVersion },
        { $set: { /* changes */ }, $inc: { version: 1 } },
        { session }
      );

      if (result.modifiedCount === 0) {
        throw new VersionConflictError("Aggregate version mismatch");
      }

      await this._recordAudit({
        organizationId, actorId,
        action: "PATIENT_NEW_ACTION",
        entityId: patient._id,
        metadata: { /* relevant data */ },
        ipAddress, session
      });

      eventPayload = { organizationId, patientId, actorId };
    }, { readConcern: { level: "snapshot" }, writeConcern: { w: "majority" } });
  } finally {
    await session.endSession();
  }

  if (eventPayload) {
    eventBus.emit("PATIENT_NEW_EVENT", eventPayload);
  }

  return this.getPatientAggregate({ organizationId, patientId });
}
```

---

## FILE LOCATIONS

| File | Purpose |
|------|---------|
| `backend/src/modules/patientDomain/core/patient.aggregate.service.js` | Mutation authority |
| `backend/src/modules/patientDomain/clinical/clinical.model.js` | Clinical record model |
| `backend/src/modules/patientDomain/clinical/prescription.model.js` | Prescription model |
| `backend/src/modules/patientDomain/core/patient.controller.js` | HTTP adapter |
| `backend/src/modules/patientDomain/patientDomain.routes.js` | Route definitions |
| `backend/src/core/domainEvents.js` | Event name constants |
| `backend/src/core/eventBus.js` | EventBus singleton |
| `backend/src/errors/VersionConflictError.js` | OAV error class |

---

## OUTPUT FORMAT

For each implementation target:
1. Sentinel Pre-Check
2. Exact diff of changes (no full rewrites)
3. Confirm transaction boundary preserved
4. Confirm audit record within transaction
5. Confirm event emitted post-commit
6. Confirm no cross-domain direct writes

---

## TESTING

After implementing each target, provide:
1. Unit test for the new behavior
2. Test for OAV conflict scenario
3. Test that audit is created within same transaction
4. Test that event is NOT emitted if transaction fails
