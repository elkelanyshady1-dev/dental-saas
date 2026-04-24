/**
 * PermissionChangeLog.js — Immutable Audit Trail for RBAC Permission Changes
 *
 * Records every permission mutation including:
 *   - Manual role edits by org admins
 *   - Auto-heal operations by autoFixPermissions.js
 *   - SSOT version migrations
 *
 * This creates a forensic-grade trail that answers:
 *   "Who changed what permission, when, and why?"
 *
 * ┌─────────────────────────────────┐
 * │  autoFixPermissions.js          │ → AUTO_HEAL / SSOT_MIGRATION
 * │  roleController.js              │ → MANUAL_EDIT
 * └────────────┬────────────────────┘
 *              │
 *              ▼
 *   ┌──────────────────────────────┐
 *   │   PermissionChangeLog (DB)   │  ← THIS FILE
 *   └──────────────────────────────┘
 *
 * PLANE: Org only.
 * COLLECTION: permissionchangelogs
 * IMMUTABILITY: Append-only — update/delete blocked by Mongoose guards.
 */

"use strict";

const mongoose = require("mongoose");
const permissionChangeLogSchema = new mongoose.Schema({
  // ─── Identity Context ────────────────────────────────────────────────
  // Per-org DB mode: kept for reference/audit but NOT required.
  // Database isolation (dental_org_<orgId>) is the tenant boundary.
  // immutable: true — forensic audit chain integrity.
  organizationId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Organization",
    immutable: true
  },
  roleId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Role",
    required: true,
    immutable: true
  },
  roleName: {
    type: String,
    required: true,
    immutable: true
  },
  // ─── Actor Context ───────────────────────────────────────────────────
  // actorType: "system" for auto-heal, "user" for manual edits
  actorType: {
    type: String,
    enum: ["system", "user"],
    required: true,
    immutable: true
  },
  actorId: {
    type: mongoose.Schema.Types.ObjectId,
    default: null,
    immutable: true
  },
  actorName: {
    type: String,
    default: "system",
    immutable: true
  },
  // ─── Change Type ─────────────────────────────────────────────────────
  changeType: {
    type: String,
    enum: ["AUTO_HEAL",
    // autoFixPermissions added missing fields
    "SSOT_MIGRATION",
    // SSOT version bumped, role updated
    "MANUAL_EDIT",
    // Admin manually changed permissions
    "ROLE_CREATE",
    // New role created
    "ROLE_DELETE" // Role deleted
    ],
    required: true,
    immutable: true
  },
  // ─── Permission Diff ─────────────────────────────────────────────────
  // Records what actually changed — both added and removed permissions.
  permissionsAdded: {
    type: [String],
    default: [],
    immutable: true
  },
  permissionsRemoved: {
    type: [String],
    default: [],
    immutable: true
  },
  // ─── Version Context ─────────────────────────────────────────────────
  previousPermissionVersion: {
    type: Number,
    default: null,
    immutable: true
  },
  newPermissionVersion: {
    type: Number,
    required: true,
    immutable: true
  },
  // ─── Metadata ────────────────────────────────────────────────────────
  summary: {
    type: String,
    default: null,
    immutable: true
  },
  correlationId: {
    type: String,
    default: null,
    immutable: true
  },
  // ─── Timestamp — immutable once set ──────────────────────────────────
  createdAt: {
    type: Date,
    default: Date.now,
    immutable: true
  }
});

// ─── Append-Only Immutability Guards ─────────────────────────────────────────
// Same pattern as AuditLog and BillingLedger — cannot be bypassed via Mongoose.
permissionChangeLogSchema.pre(["updateOne", "findOneAndUpdate", "replaceOne", "updateMany"], function () {
  throw new Error("[PermissionChangeLog] Immutability violation: Permission change logs are append-only and cannot be updated.");
});
permissionChangeLogSchema.pre(["deleteOne", "findOneAndDelete", "deleteMany"], function () {
  throw new Error("[PermissionChangeLog] Immutability violation: Permission change logs are append-only and cannot be deleted.");
});

// Per-org DB: indexes optimized for per-database queries.
permissionChangeLogSchema.index({
  createdAt: -1
});
permissionChangeLogSchema.index({
  roleId: 1,
  createdAt: -1
});
permissionChangeLogSchema.index({
  changeType: 1,
  createdAt: -1
});
permissionChangeLogSchema.index({
  actorType: 1,
  createdAt: -1
});
permissionChangeLogSchema.index({
  correlationId: 1
}, {
  sparse: true
});
const modelName = "PermissionChangeLog";
module.exports = {
  modelName,
  schema: permissionChangeLogSchema
};