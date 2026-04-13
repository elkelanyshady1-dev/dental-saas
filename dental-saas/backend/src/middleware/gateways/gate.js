/**
 * gate.js — Unified Org Route Security Factory (Phase 2)
 *
 * ── WHAT THIS IS ─────────────────────────────────────────────────────────────
 * The single entry point for the Phase 2 gateway layer.
 * Replaces the verbose per-route middleware stacks with a clean, declarative API.
 *
 * ── TARGET ARCHITECTURE ──────────────────────────────────────────────────────
 *
 *   Request
 *     ↓
 *   orgGateway     → auth + org document + DB connection
 *     ↓
 *   branchGateway  → branch resolution (optional — see gate.noRls)
 *     ↓
 *   accessGateway  → entitlement (plan) + RBAC (role)
 *     ↓
 *   rlsGateway     → frozen HMAC-signed tenant context
 *     ↓
 *   Controller
 *
 * ── CORRECT USAGE ────────────────────────────────────────────────────────────
 *
 *   ⚠️  IMPORTANT: gate() is for ROUTE-LEVEL use ONLY.
 *
 *   CONTEXT A — Routes mounted UNDER orgV1Routes.js (the vast majority):
 *     orgV1Routes already applies orgProtect + organizationContext + dbContext globally.
 *     gate() would re-apply orgGateway which calls those again.
 *     With the req._authDone idempotency guard (BUG-9 fix), the second auth
 *     pass is O(1) — but dbContext re-registration is still wasteful.
 *
 *     For orgV1-mounted routes, use gate.access() for access control only:
 *       router.get("/patients", ...gate.access("patients.read", "patients"), controller.list)
 *
 *   CONTEXT B — Routes mounted OUTSIDE orgV1Routes.js (e.g. /api/v1/patient/domain):
 *     These must apply the full chain. Use gate() directly:
 *       router.get("/", ...gate("patients.read", "patients"), controller.list)
 *
 *   CONTEXT C — AUTH_ONLY routes (no RBAC, no entitlement — rare):
 *     Use gate.auth() which returns just [orgGateway, branchGateway, rlsGateway]:
 *       router.get("/profile", ...gate.auth(), controller.getProfile)
 *
 * ── WHAT IS NOT REPLACED BY GATE ─────────────────────────────────────────────
 *   - policyMiddleware (PBAC) — resource-level, passed as additional middleware
 *   - fieldFilterMiddleware    — field-level visibility filtering
 *   - fieldWriteGuardMiddleware — write access per field
 *   - limitGuard               — plan-based record limits
 *   - autoAudit                — always passes through, appended separately
 *   - intakeValidateLimiter / rate limiters — route-specific
 *
 * ── PLANE ─────────────────────────────────────────────────────────────────────
 *   Organization only. Do NOT use on /api/platform routes.
 *
 * ── PHASE ─────────────────────────────────────────────────────────────────────
 *   Phase 2 — Safe consolidation. Additive only. No existing code changed.
 *
 * ── ROLLBACK ──────────────────────────────────────────────────────────────────
 *   Each gateway delegates to its original middleware. To roll back any route:
 *     router.get("/patients", orgProtect, organizationContext, dbContext,
 *       requireEntitlement("patients"), branchContext, rlsContext,
 *       requireOrgPermission(P.PATIENTS_READ), controller.list)
 */

"use strict";

const orgGateway = require("./orgGateway");
const branchGateway = require("./branchGateway");
const accessGateway = require("./accessGateway");
const rlsGateway = require("./rlsGateway");

// ─── Factory: Full chain (for routes OUTSIDE orgV1Routes context) ─────────────

/**
 * gate(permission, featureKey)
 *
 * Returns full middleware array:
 *   [orgGateway, branchGateway, ...accessGateway(permission, featureKey), rlsGateway]
 *
 * Use for routes mounted OUTSIDE orgV1Routes.js that need the full auth stack.
 *
 * @param {string|null} permission   RBAC permission, e.g. "patients.read"
 * @param {string|null} [featureKey] Entitlement module key, e.g. "patients"
 * @returns {import("express").RequestHandler[]}
 */
function gate(permission, featureKey) {
    return [
        orgGateway,
        branchGateway,
        ...accessGateway(permission, featureKey),
        rlsGateway,
    ];
}

// ─── Variant: Access-only (for routes INSIDE orgV1Routes.js) ──────────────────

/**
 * gate.access(permission, featureKey)
 *
 * Returns ONLY the access control middleware:
 *   [...accessGateway(permission, featureKey), rlsGateway]
 *
 * Use for routes mounted UNDER orgV1Routes.js where auth + org + DB context
 * is already applied globally. Avoids redundant orgGateway + branchGateway.
 *
 * @param {string|null} permission
 * @param {string|null} [featureKey]
 * @returns {import("express").RequestHandler[]}
 */
gate.access = function (permission, featureKey) {
    return [
        ...accessGateway(permission, featureKey),
        rlsGateway,
    ];
};

// ─── Variant: Auth-only (no RBAC, no entitlement) ────────────────────────────

/**
 * gate.auth()
 *
 * Returns the authentication + context chain only:
 *   [orgGateway, branchGateway, rlsGateway]
 *
 * Use for AUTH_ONLY routes (e.g. /profile, /context/branches).
 *
 * @returns {import("express").RequestHandler[]}
 */
gate.auth = function () {
    return [orgGateway, branchGateway, rlsGateway];
};

// ─── Variant: Auth + RLS without branch (for multi-branch admin routes) ───────

/**
 * gate.noRls(permission, featureKey)
 *
 * Full chain without rlsGateway. For routes that apply their own RLS
 * context or need custom scoping before rlsContext runs.
 *
 * @param {string|null} permission
 * @param {string|null} [featureKey]
 * @returns {import("express").RequestHandler[]}
 */
gate.noRls = function (permission, featureKey) {
    return [
        orgGateway,
        branchGateway,
        ...accessGateway(permission, featureKey),
        // NOTE: rlsGateway intentionally omitted
    ];
};

module.exports = gate;
