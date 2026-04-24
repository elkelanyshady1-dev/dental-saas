/**
 * OrganizationEntitlement.model.js
 * Sprint 2 — Tenant Entitlement Engine
 *
 * PURPOSE:
 * Persistent, per-organization snapshot of entitlements.
 * Bridges plan-level definitions (PlanVersion.modules / limits) with
 * any platform-admin overrides or add-ons granted to a specific tenant.
 *
 * Architecture position:
 *   PlanVersion → OrgContract → OrganizationEntitlement → entitlementResolver
 *
 * One active record per org at any time (enforced by partial unique index).
 * Historical records are kept with effectiveUntil set when superseded.
 *
 * Consumers:
 *   - entitlementResolver.service.js (primary reader)
 *   - orgSubscriptionGuard.js (attaches to req.planCapabilities)
 *   - orgEntitlement.controller.js (platform admin overrides)
 *   - GET /api/org/entitlements (org-plane self-serve)
 *
 * Immutable billing systems NOT modified:
 *   OrgContract, PlanVersion, pricingEngine, invoiceEngine, BillingLedger
 *
 * PLANE: Platform (created by platform billing layer)
 * COLLECTION: organizationentitlements
 */

"use strict";

const mongoose = require("mongoose");

// ─── Module Overrides Sub-schema ──────────────────────────────────────────────
// Mirrors PlanVersion.modules shape.  All fields optional — only overridden
// fields need to be present.  Missing fields inherit from PlanVersion.
const moduleOverridesSchema = new mongoose.Schema({
  patients: Boolean,
  appointments: Boolean,
  finance: Boolean,
  inventory: Boolean,
  lab: Boolean,
  orthodonticsAdv: Boolean,
  analytics: Boolean,
  booking: Boolean,
  communication: {
    enabled: Boolean,
    smsQuota: Number,
    whatsappQuota: Number,
    emailQuota: Number
  }
}, {
  _id: false
});

// ─── Limit Overrides Sub-schema ───────────────────────────────────────────────
const limitOverridesSchema = new mongoose.Schema({
  maxUsers: Number,
  maxBranches: Number,
  // Phase 4.0b: Explicit patient limit override
  maxPatients: Number,
  // Storage quota override (MB). When set, supersedes PlanVersion.limits.maxStorageMB.
  maxStorageMB: Number
}, {
  _id: false
});

// ─── Quota Overrides Sub-schema (Phase 4.0b) ─────────────────────────────────
// Mirrors PlanVersion.quotas shape. Only overridden fields need to be present.
const quotaOverridesSchema = new mongoose.Schema({
  storageMB: Number,
  imagesMB: Number
}, {
  _id: false
});

// ─── Main Schema ──────────────────────────────────────────────────────────────
const organizationEntitlementSchema = new mongoose.Schema({
  // ── References ────────────────────────────────────────────────────────
  organizationId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Organization",
    required: true,
    index: true
  },
  contractId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "OrgContract",
    required: true
  },
  planVersionId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "PlanVersion",
    required: true,
    index: true
  },
  // ── Entitlement Data ──────────────────────────────────────────────────
  // Merged result: plan defaults + any overrides applied by this record.
  // On source="plan", these mirror PlanVersion.modules / limits verbatim.
  // On source="override"|"addon", only the changed fields are present.
  modules: {
    type: moduleOverridesSchema,
    default: () => ({})
  },
  limits: {
    type: limitOverridesSchema,
    default: () => ({})
  },
  // Phase 4.0b: Quota overrides (storageMB, imagesMB)
  quotas: {
    type: quotaOverridesSchema,
    default: () => ({})
  },
  // Add-ons granted to this org independent of plan (e.g. "extra_sms_5000")
  addons: {
    type: [String],
    default: []
  },
  // ── Source Classification ─────────────────────────────────────────────
  // "plan"      → created automatically on contract activation
  // "override"  → platform admin applied manual override
  // "addon"     → a billable add-on was purchased / granted
  // "migration" → created by the migration script for existing orgs
  source: {
    type: String,
    enum: ["plan", "override", "addon", "migration"],
    required: true,
    default: "plan"
  },
  // ── Audit ─────────────────────────────────────────────────────────────
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "PlatformUser",
    default: null
  },
  // ── Effective Window ──────────────────────────────────────────────────
  // effectiveUntil = null → this is the CURRENT entitlement for the org.
  // effectiveUntil set   → historical record, superseded by a newer one.
  effectiveFrom: {
    type: Date,
    default: Date.now
  },
  effectiveUntil: {
    type: Date,
    default: null
  }
}, {
  timestamps: true,
  collection: "organizationentitlements"
});

// ─── Indexes ──────────────────────────────────────────────────────────────────

// Partial unique index: only one CURRENT entitlement per org at a time.
// effectiveUntil: null means "current".
// This prevents race-condition double-creates at the DB level.
organizationEntitlementSchema.index({
  organizationId: 1
}, {
  unique: true,
  partialFilterExpression: {
    effectiveUntil: null
  },
  name: "unique_current_entitlement_per_org"
});

// Per-org history (newest first) — for audit trail queries
organizationEntitlementSchema.index({
  organizationId: 1,
  createdAt: -1
});

// Per-contract lookup — allows cleaning up stale entitlements when a contract
// is superseded or terminated
organizationEntitlementSchema.index({
  contractId: 1
});

// Per-planVersion count — useful for impact analysis before deprecating a version
organizationEntitlementSchema.index({
  planVersionId: 1,
  effectiveUntil: 1
});
const modelName = "OrganizationEntitlement";
module.exports = {
  modelName,
  schema: organizationEntitlementSchema
};