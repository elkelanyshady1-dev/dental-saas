/**
 * zeroTrustGateway.js
 * ═══════════════════════════════════════════════════════════════
 * Organization Plane — Zero-Trust API Gateway (Composable)
 *
 * NO request is trusted by default. Every org-plane request MUST pass
 * through the full validation chain:
 *
 *   Request → Auth → Org Type Check → Org Hydration →
 *   Subscription → Branch → RBAC → Entitlement → Controller
 *
 * This module does NOT create new middleware — it COMPOSES the existing,
 * battle-tested middleware into a deterministic chain with a single
 * factory function.
 *
 * ── WHY THIS EXISTS ─────────────────────────────────────────────────
 *
 * Before this, middleware ordering was manually specified per route:
 *   router.get("/patients", ...orgProtect, organizationContext,
 *     subscriptionGuard, requireOrgPermission("patients.read"),
 *     requireEntitlement("patients"), controller.list);
 *
 * This led to:
 *   1. Inconsistent ordering across 60+ route files
 *   2. Missing guards on newly added routes
 *   3. Subscription check after RBAC (should be before)
 *
 * Now:
 *   router.get("/patients",
 *     ...zeroTrust("patients.read", "patients"),
 *     controller.list
 *   );
 *
 * ── CHAIN ORDER (DETERMINISTIC) ─────────────────────────────────────
 *
 *   1. authMiddleware        — JWT verification via jwtManager.verifyByType()
 *   2. orgTypeGuard          — Reject non-org tokens (built into orgProtect)
 *   3. organizationContext   — Hydrate req.organization from DB
 *   4. subscriptionGuard     — Check plan status, resolve plan capabilities
 *   5. branchContext         — Validate X-Branch-Id ownership
 *   6. requireOrgPermission  — RBAC check via permissionSet
 *   7. requireEntitlement    — Plan-level module/feature gating
 *   8. auditGateway          — Log the request passage (optional)
 *
 * ── SAFETY INVARIANTS ───────────────────────────────────────────────
 *
 *   ❌ No route without gateway
 *   ❌ No direct controller access
 *   ❌ No manual permission checks in controllers
 *   ❌ No role string comparisons
 *   ✅ Every org request validated end-to-end
 *
 * PLANE: Org only. NEVER use on /api/platform/* or /api/public/* routes.
 *
 * @module middleware/zeroTrustGateway
 */

"use strict";

const authMiddleware = require("./authMiddleware");
const organizationContext = require("./organizationMiddleware");
// Phase X.2.2: subscriptionGuard removed (requireEntitlement is SSOT)
const branchContextMiddleware = require("./branchContext.middleware");
const requireOrgPermission = require("./requireOrgPermission");
const requireEntitlement = require("./requireEntitlement");
const logger = require("../utils/logger");

// ─── Org Type Guard (inline — same logic as orgProtect[1]) ──────────────────
// We don't reuse orgProtect because it includes authMiddleware.
// Since we already have authMiddleware as step 1, repeating it would
// cause a double DB hydration (expensive + confusing for logging).
const orgTypeGuard = (req, res, next) => {
    if (!req.user || req.user.type !== "org") {
        return res.status(403).json({
            success: false,
            error: { code: "FORBIDDEN", message: "Organization token required" }
        });
    }
    req.organizationId = req.user.organizationId;
    next();
};

/**
 * zeroTrust — Zero-Trust Gateway Factory
 *
 * Returns a middleware array that enforces the full validation chain.
 *
 * @param {string} permission — Required capability string (e.g., "patients.read").
 *   Uses the same format as orgPermissions.js constants.
 *
 * @param {string} [featureKey] — Module/feature entitlement key (e.g., "orthodontics").
 *   If omitted, entitlement check is skipped (for core modules that are always on).
 *
 * @param {Object} [options] — Additional options
 * @param {boolean} [options.skipBranch=false] — Skip branch context validation
 *   (for routes that don't need branch scope, e.g., GET /roles)
 * @param {boolean} [options.strictEntitlement=false] — Bypass audit mode for entitlement
 * @param {boolean} [options.auditLog=false] — Log gateway passage (for debug/monitoring)
 *
 * @returns {Array<import("express").RequestHandler>} Middleware chain
 *
 * @example
 *   // Full chain with permission + entitlement
 *   router.get("/patients", ...zeroTrust("patients.read", "patients"), controller.list);
 *
 *   // Permission only (core module — always entitled)
 *   router.post("/patients", ...zeroTrust("patients.create"), controller.create);
 *
 *   // Skip branch context (org-wide read)
 *   router.get("/roles", ...zeroTrust("users.read", "users", { skipBranch: true }), controller.list);
 */
function zeroTrust(permission, featureKey, options = {}) {
    const {
        skipBranch = false,
        strictEntitlement = false,
        auditLog = false,
    } = options;

    if (!permission || typeof permission !== "string") {
        throw new Error(
            `[zeroTrust] permission is required and must be a string. Got: "${permission}"`
        );
    }

    const chain = [
        // ── Step 1: Authentication ──────────────────────────────────────
        // Verifies JWT via jwtManager.verifyByType(), hydrates user from DB,
        // builds permissionSet, checks tokenVersion.
        authMiddleware,

        // ── Step 2: Org Type Enforcement ────────────────────────────────
        // Only organization tokens pass. Platform/patient tokens → 403.
        orgTypeGuard,

        // ── Step 3: Organization Hydration ──────────────────────────────
        // Loads org document, checks isActive + subscription status,
        // resolves region context failsafe.
        organizationContext,

        // Phase X.2.2: subscriptionGuard REMOVED from chain.
        // requireEntitlement (moduleLoader) is now the single entitlement gate.
    ];

    // ── Step 5: Branch Context (optional) ───────────────────────────
    // Validates X-Branch-Id header, checks user's branch access array,
    // verifies branch belongs to the same organization (cross-tenant guard).
    if (!skipBranch) {
        chain.push(branchContextMiddleware);
    }

    // ── Step 6: RBAC — Capability Check ─────────────────────────────
    // O(1) lookup against req.authContext.permissionSet (Set<string>).
    // Logs denied access + creates audit record on failure.
    chain.push(requireOrgPermission(permission));

    // ── Step 7: Entitlement — Plan Feature Gate ─────────────────────
    // Checks if the org's subscription includes this module/feature.
    // Core modules pass through. Feature modules are plan-gated.
    if (featureKey) {
        chain.push(requireEntitlement(featureKey, { strict: strictEntitlement }));
    }

    // ── Step 8: Gateway Audit (optional debug logging) ──────────────
    if (auditLog) {
        chain.push((req, _res, next) => {
            logger.debug({
                event: "ZERO_TRUST_PASS",
                userId: req.user?._id,
                permission,
                featureKey: featureKey || "none",
                orgId: req.organizationId,
                branchId: req.activeBranchId || "none",
                path: req.originalUrl,
                method: req.method,
            }, `[ZeroTrust] Request authorized: ${permission}`);
            next();
        });
    }

    return chain;
}

// ─── Convenience Aliases ────────────────────────────────────────────────────

/**
 * zeroTrustRead — shortcut for read-only routes (skips branch for GET)
 */
function zeroTrustRead(permission, featureKey) {
    return zeroTrust(permission, featureKey, { skipBranch: true });
}

/**
 * zeroTrustMutate — shortcut for mutation routes (branch required, audit on)
 */
function zeroTrustMutate(permission, featureKey) {
    return zeroTrust(permission, featureKey, { skipBranch: false, auditLog: true });
}

module.exports = zeroTrust;
module.exports.zeroTrust = zeroTrust;
module.exports.zeroTrustRead = zeroTrustRead;
module.exports.zeroTrustMutate = zeroTrustMutate;
