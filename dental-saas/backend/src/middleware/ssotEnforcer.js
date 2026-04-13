/**
 * ssotEnforcer.js — SSOT Violation Detector
 * Phase 1 — Authorization Stabilization
 *
 * ── PURPOSE ──────────────────────────────────────────────────────────────────
 * Detects and warns about any code path that would read the legacy
 * `req.organization.modules` field instead of `req.capabilities.modules`.
 *
 * In development / staging, logs a warning whenever the deprecated field
 * is present on the request. This helps identify remaining code paths
 * that haven't been migrated to the SSOT pipeline.
 *
 * ── MOUNT ORDER ──────────────────────────────────────────────────────────────
 * Must be mounted AFTER:
 *   unifiedCapabilityMiddleware → assertCapabilities → ssotEnforcer
 *
 * ── BEHAVIOR ─────────────────────────────────────────────────────────────────
 * - Production:  No-op (zero overhead)
 * - Development: Logs SSOT_VIOLATION warning if org.modules is accessed
 *
 * PLANE: Org only.
 */

"use strict";

const logger = require("@utils/logger");

/**
 * Middleware that detects legacy org.modules usage.
 * In non-production environments, wraps req.organization with a Proxy
 * to intercept property access on the `modules` field.
 *
 * @param {import("express").Request} req
 * @param {import("express").Response} res
 * @param {import("express").NextFunction} next
 */
function ssotEnforcer(req, res, next) {
    // Zero overhead in production
    if (process.env.NODE_ENV === "production") {
        return next();
    }

    // Phase 8: req.organization is deprecated and trapped.
    // This enforcer was designed for the era when organizationContext
    // middleware populated req.organization. Since that middleware is
    // removed from the /org chain, this is a no-op guard.
    // Kept for routes that still intentionally use organizationContext
    // (portals, entitlements) — they override the trap.
    try {
        if (req.organization && typeof req.organization === "object") {
            if (req.organization.modules && typeof req.organization.modules === "object") {
                const orgId = req.organization._id?.toString();
                const endpoint = `${req.method} ${req.originalUrl}`;

                logger.warn({
                    event: "SSOT_ENFORCER_WARNING",
                    organizationId: orgId,
                    endpoint,
                    hasCapabilities: !!req.capabilities?.modules,
                }, `[SSOT] org.modules still accessible — downstream code must use req.capabilities.modules exclusively. Endpoint: ${endpoint}`);
            }
        }
    } catch {
        // Phase 8 trap fires — expected. req.organization is deprecated.
    }

    next();
}

module.exports = ssotEnforcer;
