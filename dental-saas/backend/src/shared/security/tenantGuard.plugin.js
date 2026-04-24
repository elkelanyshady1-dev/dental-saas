/**
 * tenantGuard.plugin.js — Mongoose Plugin for Platform-DB Tenant Isolation
 * Phase 5 — Runtime Enforcement Layer (Tenant Isolation Hardening)
 *
 * PURPOSE:
 * A Mongoose pre-hook plugin that enforces organizationId is present in all
 * query operations on platform-DB models that store multi-tenant data.
 *
 * This is the LAST LINE OF DEFENSE — if tenantModelWrapper (explicit scoping)
 * is bypassed and code queries a platform model directly without an
 * organizationId filter, this plugin catches it and throws.
 *
 * SCOPE:
 *   - ONLY apply to platform-DB models that contain organizationId field
 *   - NEVER apply to per-org DB models (database IS the isolation)
 *   - NEVER apply to platform-only models without organizationId (e.g., PlanTemplate)
 *
 * BYPASS:
 *   Platform-admin and background jobs that legitimately query across tenants
 *   can opt out by setting `{ tenantGuardBypass: true }` in query options.
 *   Bypasses are logged for audit.
 *
 * SUPPORTED HOOKS:
 *   find, findOne, findOneAndUpdate, findOneAndDelete, countDocuments,
 *   updateOne, updateMany, deleteOne, deleteMany
 *
 * @module shared/security/tenantGuard.plugin
 */

"use strict";

const logger = require("@utils/logger");

const GUARDED_HOOKS = [
    "find",
    "findOne",
    "findOneAndUpdate",
    "findOneAndDelete",
    "countDocuments",
    "updateOne",
    "updateMany",
    "deleteOne",
    "deleteMany",
];

/**
 * Mongoose plugin that enforces organizationId presence in query filters.
 *
 * @param {import("mongoose").Schema} schema
 * @param {Object} options
 * @param {string} options.modelName - Name of the model (for error messages)
 * @param {boolean} [options.strict=true] - If true, throws on missing orgId.
 *   If false, logs a warning only (use during migration period).
 *
 * @example
 * // In a platform-DB model schema definition:
 * const tenantGuard = require("@shared/security/tenantGuard.plugin");
 * schema.plugin(tenantGuard, { modelName: "OrgContract" });
 */
function tenantGuardPlugin(schema, options = {}) {
    const modelName = options.modelName || "UnknownModel";
    const strict = options.strict !== false;

    for (const hook of GUARDED_HOOKS) {
        schema.pre(hook, function tenantGuardHook() {
            // Check for explicit bypass (platform-admin / background jobs)
            const queryOptions = this.getOptions?.() || {};
            if (queryOptions.tenantGuardBypass === true) {
                logger.debug({
                    event: "TENANT_GUARD_BYPASS",
                    model: modelName,
                    operation: hook,
                }, `[tenantGuard] Bypass for ${modelName}.${hook}`);
                return;
            }

            // Inspect the query filter for organizationId
            const filter = this.getFilter?.() || {};
            const hasOrgId = filter.organizationId !== undefined;

            if (!hasOrgId) {
                const message =
                    `[tenantGuard] ${modelName}.${hook}() called WITHOUT organizationId filter. ` +
                    "Platform-DB models MUST be scoped to a tenant. " +
                    "Use scopeToTenant() wrapper or add organizationId to the query. " +
                    "For platform-admin cross-tenant queries, set { tenantGuardBypass: true } in options.";

                if (strict) {
                    const err = new Error(message);
                    err.code = "TENANT_GUARD_VIOLATION";
                    err.status = 500;
                    throw err;
                }

                logger.warn({
                    event: "TENANT_GUARD_WARNING",
                    model: modelName,
                    operation: hook,
                    filter: Object.keys(filter),
                }, message);
            }
        });
    }

    // Guard save/create: ensure organizationId is set on document
    schema.pre("save", function tenantGuardSaveHook() {
        if (!this.organizationId) {
            const message =
                `[tenantGuard] ${modelName}.save() called WITHOUT organizationId on document. ` +
                "Platform-DB documents MUST have organizationId set before saving.";

            if (strict) {
                const err = new Error(message);
                err.code = "TENANT_GUARD_VIOLATION";
                err.status = 500;
                throw err;
            }

            logger.warn({
                event: "TENANT_GUARD_SAVE_WARNING",
                model: modelName,
            }, message);
        }
    });
}

module.exports = tenantGuardPlugin;
