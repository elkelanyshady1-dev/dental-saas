/**
 * AuditLog.js
 * Shared Immutable Audit Log Model (v21.0)
 *
 * v21.0 — Hardened for enterprise Platform Audit Trail Explorer:
 *   - actorFirstName / actorLastName (split from name for display)
 *   - actorRole (snapshot at write time — never rely on live DB)
 *   - browser / os / device (UA-parsed, from requestMetadata.js)
 *   - geoLocation (geoip-lite optional — falls back to "Unknown")
 *   - requestId (X-Request-ID from AsyncLocalStorage)
 *   - description (human-readable action summary)
 *   - Append-only Mongoose guards (same pattern as BillingLedger)
 *
 * PLANE: Shared — written from both platform and org paths.
 * COLLECTION: auditlogs
 */

const mongoose = require("mongoose");
const auditLogSchema = new mongoose.Schema({
  // Per-org DB mode: kept for reference/audit but NOT required.
  // Database isolation (dental_org_<orgId>) is the tenant boundary.
  organizationId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Organization"
  },
  regionCode: {
    type: String,
    required: true,
    uppercase: true
  },
  branchId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Branch",
    required: true,
    immutable: true
  },
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User"
  },
  // The specific user who performed the action (can be platform admin or tenant user)
  actorId: {
    type: mongoose.Schema.Types.ObjectId
  },
  actorType: {
    type: String,
    enum: ["platform_user", "tenant_user", "system"],
    default: "tenant_user",
    required: true
  },
  action: {
    type: String,
    required: true
  },
  entity: {
    type: String
  },
  entityType: {
    // v1.7.0 requirement
    type: String
  },
  entityId: {
    type: mongoose.Schema.Types.ObjectId
  },
  ipAddress: {
    type: String
  },
  userAgent: {
    type: String
  },
  statusCode: {
    type: Number
  },
  success: {
    type: Boolean
  },
  details: {
    type: mongoose.Schema.Types.Mixed
  },
  metadata: {
    // v1.7.0 requirement
    type: mongoose.Schema.Types.Mixed
  },
  correlationId: {
    type: String
  },
  // v20.2 — Session-level traceability for multi-event correlation
  sessionId: {
    type: String,
    default: null
  },
  previousHash: {
    type: String,
    default: "0"
  },
  currentHash: {
    type: String,
    required: true
  },
  signatureVersion: {
    type: Number,
    required: true,
    default: 1
  },
  // ── Actor identity snapshot (write-time — never rely on live DB) ──────────
  // Split name fields allow the UI to display "Shady Elkelany" without
  // parsing the `name` field, and allow sorting/filtering by first or last name.
  actorFirstName: {
    type: String,
    default: null
  },
  actorLastName: {
    type: String,
    default: null
  },
  actorRole: {
    type: String,
    default: null
    // Snapshot of the actor's role at the time of the action.
    // NEVER load from live DB — roles can change after the event.
  },
  // ── Human-readable description ─────────────────────────────────────────────
  description: {
    type: String,
    default: null
  },
  // ── X-Request-ID correlation ──────────────────────────────────────────────
  requestId: {
    type: String,
    default: null
  },
  // ── Device / browser metadata (from requestMetadata.js) ───────────────────
  geoLocation: {
    type: String,
    default: null
  },
  // "Cairo, Egypt" — display only
  browser: {
    type: String,
    default: null
  },
  // "Edge"
  os: {
    type: String,
    default: null
  },
  // "Windows"
  device: {
    type: String,
    default: null
  },
  // "Desktop" | "Mobile" | "Tablet"

  // ── Timestamp — immutable once set ────────────────────────────────────────
  createdAt: {
    type: Date,
    default: Date.now,
    immutable: true // v21.0 — timestamp must never be changed
  }
});

// ─── Append-Only Immutability Guards (v21.0) ──────────────────────────────────
// Prevents any update or delete operation on audit records.
// Same pattern as BillingLedger — cannot be bypassed via Mongoose.
// Only a direct MongoDB driver call could circumvent these guards.
auditLogSchema.pre(["updateOne", "findOneAndUpdate", "replaceOne", "updateMany"], function () {
  throw new Error("[AuditLog] Immutability violation: AuditLog entries are append-only and cannot be updated. " + "Create a correcting entry instead.");
});
auditLogSchema.pre(["deleteOne", "findOneAndDelete", "deleteMany"], function () {
  throw new Error("[AuditLog] Immutability violation: AuditLog entries are append-only and cannot be deleted. " + "The audit log is a permanent compliance record.");
});

// 🛡️ v11.0 Hardening — Chain Split Protection
// Only one audit record can follow a specific previous hash for a given organization.
// Per-org DB: indexes optimized for per-database queries.
// organizationId compound indexes REMOVED — DB isolation handles tenant scoping.

// Chain split protection — unique per-DB (was per-org+hash, now per-DB+hash)
auditLogSchema.index({
  previousHash: 1
}, {
  unique: true
});
auditLogSchema.index({
  currentHash: 1
});
auditLogSchema.index({
  userId: 1
});
auditLogSchema.index({
  actorId: 1,
  actorType: 1
});
auditLogSchema.index({
  createdAt: -1
});
auditLogSchema.index({
  action: 1,
  createdAt: -1
});
auditLogSchema.index({
  entityType: 1,
  entityId: 1
});
auditLogSchema.index({
  requestId: 1
}, {
  sparse: true
});
auditLogSchema.index({
  actorRole: 1,
  createdAt: -1
});
auditLogSchema.index({
  geoLocation: 1
});
auditLogSchema.index({
  branchId: 1
});
auditLogSchema.index({
  correlationId: 1
});
auditLogSchema.index({
  sessionId: 1
}, {
  sparse: true
});
auditLogSchema.index({
  regionCode: 1,
  createdAt: -1
});
auditLogSchema.index({
  entityId: 1,
  entity: 1
});
const modelName = "AuditLog";
module.exports = {
  modelName,
  schema: auditLogSchema
};
module.exports.auditLogSchema = auditLogSchema;