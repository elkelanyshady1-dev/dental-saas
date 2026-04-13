/**
 * authorize.js — Centralized Authorization Wrapper
 * Phase 1 — Authorization Stabilization & Guard Normalization
 *
 * ── PURPOSE ──────────────────────────────────────────────────────────────────
 * Provides a single, deterministic authorization chain builder.
 * All org-plane routes SHOULD use this wrapper to ensure consistent
 * middleware ordering.
 *
 * ── PIPELINE ORDER (MANDATORY) ───────────────────────────────────────────────
 *   1. requireEntitlement(module)     — Plan-level module gate
 *   2. requireFeature(feature)        — Sub-feature gate (optional)
 *   3. requireOrgPermission(perm)     — RBAC permission check
 *   4. policyMiddleware(resource)     — PBAC context check (optional, last)
 *
 * ── UPSTREAM PREREQUISITES ───────────────────────────────────────────────────
 * The following middleware must have already executed (mounted on the parent
 * router for /api/v1/org):
 *   subscriptionGuard → authMiddleware → featureFlagMiddleware
 *   → branchContextMiddleware → unifiedCapabilityMiddleware → assertCapabilities
 *
 * ── USAGE ────────────────────────────────────────────────────────────────────
 *   const authorize = require("../middleware/authorize");
 *
 *   router.get("/patients",
 *       ...authorize({ module: "patients", permission: "patients.read" }),
 *       controller.list
 *   );
 *
 *   router.post("/:caseId/analysis",
 *       ...authorize({
 *           module: "orthodontics",
 *           feature: "orthodontics.aiAnalysis",
 *           permission: "orthodontics.full",  // Phase 30: orthodontics.create removed
 *       }),
 *       controller.triggerAnalysis
 *   );
 *
 * PLANE: Org only. Do NOT use on /api/platform/* routes.
 */

"use strict";

const requireEntitlement = require("./requireEntitlement");
const requireOrgPermission = require("./requireOrgPermission");

/**
 * Build a deterministic authorization middleware chain.
 *
 * @param {Object} options
 * @param {string} [options.module]     — Module entitlement key (e.g., "patients", "orthodontics")
 * @param {string} [options.feature]    — Sub-feature key (e.g., "orthodontics.aiAnalysis")
 * @param {string} [options.permission] — RBAC permission string (e.g., "patients.read")
 * @returns {import("express").RequestHandler[]} — Ordered middleware array (spread into route)
 *
 * @throws {Error} if no authorization parameters are provided
 */
function authorize({ module, feature, permission } = {}) {
    if (!module && !feature && !permission) {
        throw new Error(
            "[authorize] At least one of { module, feature, permission } must be provided."
        );
    }

    /** @type {import("express").RequestHandler[]} */
    const chain = [];

    // 1. Module entitlement gate (plan-level)
    if (module) {
        chain.push(requireEntitlement(module));
    }

    // 2. Sub-feature gate (uses entitlement — requireFeature removed in Phase X)
    if (feature) {
        chain.push(requireEntitlement(feature));
    }

    // 3. RBAC permission check
    if (permission) {
        chain.push(requireOrgPermission(permission));
    }

    return chain;
}

module.exports = authorize;
