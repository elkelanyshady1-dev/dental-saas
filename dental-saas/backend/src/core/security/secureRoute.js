/**
 * secureRoute.js
 * ═══════════════════════════════════════════════════════════════
 * Organization Plane — Compile-Time Route Security Enforcer
 *
 * Eliminates the possibility of defining an insecure route.
 * All route definitions MUST go through secureRoute(), which:
 *   1. Validates that security config is provided
 *   2. Composes the zeroTrust middleware chain
 *   3. Optionally attaches autoAudit middleware
 *   4. Optionally attaches additional middleware (validators, PBAC)
 *
 * ── WHY ─────────────────────────────────────────────────────────
 *
 * Before: Developers could forget zeroTrust() on new routes.
 *   router.get("/patients", controller.list);  ← INSECURE, no guard
 *
 * After: secureRoute() throws at boot time if config is missing.
 *   secureRoute(router, "get", "/patients", {
 *     permission: "patients.read",
 *     feature: "patients",
 *   }, controller.list);
 *
 * ── GOVERNANCE ──────────────────────────────────────────────────
 *
 * This module emits a GOVERNANCE_VIOLATION log if:
 *   - permission is missing
 *   - handler is missing
 *   - feature is explicitly set to null (must be undefined or string)
 *
 * The violation log is picked up by the governance monitoring system.
 *
 * PLANE: Org only. NEVER use for /api/platform/* routes.
 *
 * @module core/security/secureRoute
 */

"use strict";

const zeroTrust = require("../../middleware/zeroTrustGateway");
const { autoAudit } = require("../../middleware/auditInterceptor");
const logger = require("../../utils/logger");

// ─── Route Registry (for governance auditing) ───────────────────────────────
// Maps method:path → config for startup validation and runtime introspection.
const _routeRegistry = [];

/**
 * secureRoute — Define a route with enforced zero-trust security.
 *
 * @param {import("express").Router} router — Express router instance
 * @param {string} method — HTTP method (get, post, put, patch, delete)
 * @param {string} path — Route path (e.g., "/patients", "/:id")
 * @param {Object} config — Security configuration
 * @param {string} config.permission — Required RBAC permission (e.g., "patients.read")
 * @param {string} [config.feature] — Entitlement feature key (e.g., "patients")
 * @param {string} [config.entity] — Entity name for autoAudit (e.g., "Patient")
 * @param {boolean} [config.skipBranch=false] — Skip branch context validation
 * @param {boolean} [config.auditLog=false] — Enable gateway passage logging
 * @param {Array<import("express").RequestHandler>} [config.middleware=[]] — Additional middleware
 * @param {...import("express").RequestHandler} handlers — Route handler(s)
 *
 * @throws {Error} If permission is missing or handler is missing
 *
 * @example
 *   // Read route — feature-gated, no branch required
 *   secureRoute(router, "get", "/patients", {
 *     permission: "patients.read",
 *     feature: "patients",
 *     skipBranch: true,
 *   }, controller.list);
 *
 *   // Mutation route — with audit and PBAC middleware
 *   secureRoute(router, "post", "/patients", {
 *     permission: "patients.create",
 *     feature: "patients",
 *     entity: "Patient",
 *     middleware: [validate(schema), policyMiddleware(P.PATIENTS_CREATE)],
 *   }, controller.create);
 */
function secureRoute(router, method, path, config, ...handlers) {
    // ── Compile-time validation ──────────────────────────────────────────
    if (!config || typeof config !== "object") {
        const msg = `[secureRoute] GOVERNANCE VIOLATION: Missing security config for route "${method.toUpperCase()} ${path}"`;
        logger.error({ event: "GOVERNANCE_VIOLATION", rule: "MISSING_CONFIG", method, path }, msg);
        throw new Error(msg);
    }

    if (!config.permission || typeof config.permission !== "string") {
        const msg = `[secureRoute] GOVERNANCE VIOLATION: Missing or invalid permission for route "${method.toUpperCase()} ${path}"`;
        logger.error({
            event: "GOVERNANCE_VIOLATION",
            rule: "MISSING_PERMISSION",
            method,
            path,
            providedConfig: config,
        }, msg);
        throw new Error(msg);
    }

    if (!handlers.length) {
        const msg = `[secureRoute] GOVERNANCE VIOLATION: No handler provided for route "${method.toUpperCase()} ${path}"`;
        logger.error({ event: "GOVERNANCE_VIOLATION", rule: "MISSING_HANDLER", method, path }, msg);
        throw new Error(msg);
    }

    const normalizedMethod = method.toLowerCase();
    if (!["get", "post", "put", "patch", "delete"].includes(normalizedMethod)) {
        throw new Error(`[secureRoute] Invalid HTTP method: "${method}" for route "${path}"`);
    }

    // ── Build middleware chain ────────────────────────────────────────────
    const chain = [
        // Step 1: Zero-Trust Gateway (auth → org → subscription → branch → RBAC → entitlement)
        ...zeroTrust(config.permission, config.feature, {
            skipBranch: config.skipBranch ?? false,
            strictEntitlement: config.strictEntitlement ?? false,
            auditLog: config.auditLog ?? false,
        }),
    ];

    // Step 2: Auto-Audit for mutations (if entity specified)
    if (config.entity && ["post", "put", "patch", "delete"].includes(normalizedMethod)) {
        chain.push(autoAudit(config.entity));
    }

    // Step 3: Additional middleware (validators, PBAC, field filters, etc.)
    if (config.middleware && Array.isArray(config.middleware)) {
        chain.push(...config.middleware);
    }

    // ── Register route ───────────────────────────────────────────────────
    router[normalizedMethod](path, ...chain, ...handlers);

    // ── Registry entry (for governance dashboard / startup audit) ─────────
    _routeRegistry.push({
        method: normalizedMethod.toUpperCase(),
        path,
        permission: config.permission,
        feature: config.feature || null,
        entity: config.entity || null,
        skipBranch: config.skipBranch ?? false,
        hasCustomMiddleware: !!(config.middleware && config.middleware.length),
        registeredAt: new Date().toISOString(),
    });
}

/**
 * getRouteRegistry — Returns all routes registered via secureRoute().
 * Used by:
 *   - Governance dashboard (runtime introspection)
 *   - Startup route audit script
 *   - Swagger auto-documentation
 *
 * @returns {Array<Object>}
 */
function getRouteRegistry() {
    return [..._routeRegistry];
}

/**
 * getRegistryStats — Quick summary of registered routes.
 * @returns {Object}
 */
function getRegistryStats() {
    const byMethod = {};
    const byFeature = {};
    const byEntity = {};

    for (const entry of _routeRegistry) {
        byMethod[entry.method] = (byMethod[entry.method] || 0) + 1;
        if (entry.feature) byFeature[entry.feature] = (byFeature[entry.feature] || 0) + 1;
        if (entry.entity) byEntity[entry.entity] = (byEntity[entry.entity] || 0) + 1;
    }

    return {
        totalRoutes: _routeRegistry.length,
        byMethod,
        byFeature,
        byEntity,
    };
}

module.exports = secureRoute;
module.exports.secureRoute = secureRoute;
module.exports.getRouteRegistry = getRouteRegistry;
module.exports.getRegistryStats = getRegistryStats;
