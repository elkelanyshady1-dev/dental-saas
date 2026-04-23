/**
 * settingsHub.service.js — Settings Domain Aggregator
 *
 * Phase H.2 — Settings Hub Backend Alignment
 *
 * PURPOSE:
 * Single entry point for settings domain orchestration.
 * All cross-cutting settings operations (snapshot, diff, bulk reads)
 * are coordinated here instead of scattered across controllers.
 *
 * DOMAIN: Settings
 * PLANE: Organization (per-org, db-per-tenant)
 *
 * CONSUMERS:
 *   - Future settings dashboard API (GET /api/v1/org/settings/summary)
 *   - AI audit pipeline (settings state snapshot for compliance)
 *   - Admin portal overview
 *
 * ARCHITECTURE RULES (ENFORCED):
 *   - MUST receive dbConnection from controller (zero fallback to global Mongoose)
 *   - MUST NOT import from Platform plane models directly
 *   - MUST go through org-scoped services only
 *   - All mutations MUST be audit-logged
 *
 * PLANE ISOLATION:
 *   ❌ NO cross-plane imports
 *   ✅ Delegates to domain-specific services (security, features, billing)
 */

"use strict";

const logger = require("@utils/logger");

// ─── Domain Service Imports ──────────────────────────────────────────────────
// Each domain owns its data — the hub only orchestrates, never duplicates logic.

// Lazy-require pattern to avoid circular dependency issues at boot time.
// The hub is instantiated at request time, not at module load time.

// ─── Settings Snapshot ───────────────────────────────────────────────────────

/**
 * getSettingsSummary
 *
 * Returns a high-level settings snapshot for the org.
 * Used by dashboard widgets and AI audit pipelines.
 *
 * @param {Object} ctx
 * @param {Object} ctx.dbConnection - Per-org Mongoose connection (REQUIRED)
 * @param {string} ctx.organizationId - Org ID from verified JWT
 * @param {Object} ctx.capabilities - Resolved capability map from req.capabilities
 * @returns {Promise<Object>} Settings summary
 */
async function getSettingsSummary({
  dbConnection,
  organizationId,
  capabilities
}) {
  if (!dbConnection) {
    throw new Error("[SettingsHub] dbConnection is REQUIRED — cannot use global Mongoose");
  }
  logger.info({
    service: "settingsHub",
    orgId: organizationId
  }, "[SettingsHub] Fetching settings summary");

  // ── Entitlement snapshot from capabilities (already resolved by middleware) ──
  const planModules = capabilities?.modules || {};
  const planLimits = capabilities?.limits || {};

  // ── Module state summary (no DB read — derived from capabilities) ───────────
  const modulesSummary = {
    patients: Boolean(planModules.patients),
    appointments: Boolean(planModules.appointments),
    finance: Boolean(planModules.finance),
    orthodontics: Boolean(planModules.orthodontics),
    analytics: Boolean(planModules.analytics),
    inventory: Boolean(planModules.inventory),
    booking: Boolean(planModules.booking)
  };

  // ── Limits snapshot ─────────────────────────────────────────────────────────
  const limitsSummary = {
    maxUsers: planLimits.maxUsers ?? null,
    maxBranches: planLimits.maxBranches ?? null,
    maxPatients: planLimits.maxPatients ?? null,
    storageMB: capabilities?.quotas?.storageMB ?? planLimits.maxStorageMB ?? null
  };
  return {
    modules: modulesSummary,
    limits: limitsSummary
    // Extend with domain-specific snapshots as needed:
    // security: await securityService.getSnapshot({ dbConnection })
    // features: await featuresService.getSnapshot({ dbConnection })
  };
}

// ─── Settings Domain Audit ───────────────────────────────────────────────────

/**
 * logSettingsChange
 *
 * Centralized audit entry point for ALL settings mutations.
 * Enforces SHA-256 hash-chained immutable audit records.
 *
 * RULE: ALL settings mutations MUST call this function.
 *
 * @param {Object} ctx
 * @param {Object} ctx.dbConnection - Per-org Mongoose connection
 * @param {string} ctx.userId - Authenticated user ID
 * @param {string} ctx.orgId - Organization ID
 * @param {string} ctx.module - Settings module (e.g. "security", "features", "billing")
 * @param {string} ctx.action - Action taken (e.g. "SETTINGS_UPDATED", "MODULE_TOGGLED")
 * @param {Object} ctx.previousState - State before mutation
 * @param {Object} ctx.newState - State after mutation
 * @param {string} [ctx.reason] - Optional human-readable reason
 */
async function logSettingsChange({
  dbConnection,
  userId,
  orgId,
  module,
  action,
  previousState,
  newState,
  reason
}) {
  if (!dbConnection) {
    throw new Error("[SettingsHub] dbConnection is REQUIRED for audit logging");
  }

  // Delegate to the org's audit logger (hash-chained, immutable)
  // Import lazily to avoid boot-time circular deps
  const {
    auditLogger
  } = require("../../core/audit/auditLogger");
  await auditLogger.log({
    dbConnection,
    action,
    module: `settings.${module}`,
    userId,
    orgId,
    changes: {
      previousState,
      newState
    },
    reason: reason || null
    // Hash chaining is enforced inside auditLogger — not duplicated here
  });
  logger.info({
    service: "settingsHub",
    module,
    action,
    userId,
    orgId
  }, `[SettingsHub] Settings change logged: ${module}.${action}`);
}

// ─── Exports ────────────────────────────────────────────────────────────────

module.exports = {
  getSettingsSummary,
  logSettingsChange
};