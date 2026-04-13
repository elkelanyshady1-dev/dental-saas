/**
 * portalFieldFilter.js
 * Phase 3 — Portal Field-Level Security Middleware (HARDENED)
 *
 * PROBLEM:
 *   The core fieldFilterMiddleware reads role via extractRole(req.user),
 *   which expects req.user.roleId.name or req.user.role (org-plane convention).
 *   Portal patients have req.user.type = "patient" but NO req.user.role field.
 *   Result: extractRole returns null → empty data → broken responses.
 *
 * SOLUTION:
 *   This middleware bridges the portal tenant context (req.rls.role) into the
 *   core FLS engine WITHOUT mutating req.user. It uses req.__portalRole
 *   as a side-channel and patches extractRole resolution via req.user.role
 *   only within the middleware scope, restoring it immediately after.
 *
 * HARDENING (Phase 3.1):
 *   - Uses req.__portalRole for role resolution (no req.user mutation leak)
 *   - Sets + restores req.user.role within middleware scope ONLY
 *   - Fail-closed on missing role
 *
 * PLANE: Portal (patient-facing)
 * @per-org-transactional — portal FLS middleware — bridges portal RLS to field access
 */

"use strict";

const { fieldFilterMiddleware } = require("../../../rbac/fieldFilter");
const { fieldWriteGuardMiddleware } = require("../../../rbac/fieldWriteGuard");
const { markFLSReadApplied, markFLSWriteApplied } = require("../../../core/guards/flowMarkers");
const logger = require("../../../utils/logger");
const { getRole } = require("../../../utils/auth/getRole");

/**
 * Resolves the FLS role from the portal context.
 *
 * Priority:
 *   1. req.__portalRole (set by middleware — SAFE, not on req.user)
 *   2. req.rls.role (from portalRLSContext)
 *   3. req.user.type === "patient" → "patient"
 *   4. req.user.roleId.name (org staff fallback)
 *   5. null (fail-closed)
 *
 * @param {Object} req - Express request
 * @returns {string|null} Role name for FLS lookup
 */
function resolvePortalRole(req) {
    // Primary: middleware-scoped portal role (no req.user mutation)
    if (req.__portalRole) return req.__portalRole;

    // tenant context (set by portalRLSContext middleware)
    if (req.rls?.role) return req.rls.role;

    // Fallback: user type from patientProtect
    if (req.user?.type === "patient") return "patient";

    // Org staff fallback: use JWT role (org_admin, doctor, etc.)
    const orgRole = getRole(req);
    if (orgRole) return orgRole;

    return null;
}

/**
 * Portal Field Filter Middleware (Read)
 *
 * Wraps the core fieldFilterMiddleware by:
 *   1. Resolving role from portal context
 *   2. Setting req.__portalRole (no req.user mutation leak)
 *   3. Temporarily setting req.user.role for core middleware compatibility
 *   4. Restoring req.user.role immediately after core middleware runs
 *
 * @param {string} resourceType - Portal resource type (e.g., "portalProgress")
 * @param {string} [dataKey="data"] - Key in response body containing data
 * @returns {import("express").RequestHandler}
 */
function portalFieldFilter(resourceType, dataKey = "data") {
    const coreMiddleware = fieldFilterMiddleware(resourceType, dataKey);

    return function portalFieldFilterGuard(req, res, next) {
        const role = resolvePortalRole(req);

        // Set side-channel marker (never mutates req.user permanently)
        req.__portalRole = role;

        if (!role) {
            // Fail-closed: no role = no data
            logger.warn({
                event: "PORTAL_FLS_NO_ROLE",
                resource: resourceType,
                path: req.originalUrl,
            }, "[PortalFLS] No role resolved — blocking response");

            markFLSReadApplied(req);

            const originalJson = res.json.bind(res);
            res.json = function (body) {
                if (body && body[dataKey]) {
                    body[dataKey] = Array.isArray(body[dataKey]) ? [] : {};
                    body.capabilities = { visibleFields: [], resource: resourceType };
                }
                return originalJson(body);
            };
            return next();
        }

        if (!req.user) {
            // Public route (no req.user) — skip FLS entirely
            // Public auth routes don't return resource data that needs filtering
            markFLSReadApplied(req);
            return next();
        }

        // ── Scoped role injection (core middleware compatibility) ─────────
        // Save, inject, delegate, restore — req.user.role is NEVER leaked
        const originalRole = req.user.role;
        const hadRole = "role" in req.user;

        req.user.role = role;

        coreMiddleware(req, res, () => {
            // Restore immediately — no downstream leak
            if (hadRole) {
                req.user.role = originalRole;
            } else {
                delete req.user.role;
            }
            next();
        });
    };
}

/**
 * Portal Write Guard Middleware
 *
 * Wraps the core fieldWriteGuardMiddleware by injecting portal role.
 * Same scoped injection pattern — req.user is restored after guard runs.
 *
 * @param {string} resourceType - Portal resource type (e.g., "portalMonitoringSession")
 * @returns {import("express").RequestHandler}
 */
function portalWriteGuard(resourceType) {
    const coreMiddleware = fieldWriteGuardMiddleware(resourceType);

    return function portalWriteGuardHandler(req, res, next) {
        const role = resolvePortalRole(req);

        req.__portalRole = role;

        if (!role) {
            logger.warn({
                event: "PORTAL_FLS_WRITE_NO_ROLE",
                resource: resourceType,
                path: req.originalUrl,
            }, "[PortalFLS] No role resolved — blocking write");

            markFLSWriteApplied(req);
            return res.status(403).json({
                success: false,
                error: {
                    code: "FIELD_WRITE_DENIED",
                    message: "Write access denied — no role context.",
                },
            });
        }

        if (!req.user) {
            markFLSWriteApplied(req);
            return next();
        }

        // ── Scoped role injection ────────────────────────────────────────
        const originalRole = req.user.role;
        const hadRole = "role" in req.user;

        req.user.role = role;

        coreMiddleware(req, res, () => {
            if (hadRole) {
                req.user.role = originalRole;
            } else {
                delete req.user.role;
            }
            next();
        });
    };
}

module.exports = {
    portalFieldFilter,
    portalWriteGuard,
    resolvePortalRole,
};
