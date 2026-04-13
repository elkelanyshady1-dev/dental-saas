/**
 * permissionResolver.js — Pattern-Based Permission Inference Engine
 *
 * Resolves the expected permission for any route using:
 *   1. Override lookup (exact match for edge cases)
 *   2. Domain rule + HTTP method → CRUD mapping (auto-inference)
 *   3. AUTH_ONLY exclusion (self-introspection routes)
 *
 * This replaces manual route→permission mapping with automatic inference.
 * Adding a new CRUD route requires ZERO changes to this module.
 *
 * PLANE: Org only.
 */

"use strict";

const {
    domainIndex,
    overrides,
    authOnlyRoutes,
    METHOD_CRUD,
} = require("./permissionRules");

// ─── Resolution Result Types ────────────────────────────────────────────────

/**
 * @typedef {Object} ResolutionResult
 * @property {"resolved"|"auth_only"|"unknown_domain"|"unknown_method"} status
 * @property {string|null} permission — resolved permission string or null
 * @property {"override"|"rule"|"auth_only"|null} source — how it was resolved
 */

// ─── Core Resolver ──────────────────────────────────────────────────────────

/**
 * Resolve the expected permission for a route.
 *
 * @param {string} domain — module domain (e.g., "patients", "invoices")
 * @param {string} method — HTTP method (e.g., "GET", "POST")
 * @param {string} routePath — route path template (e.g., "/:id", "/search")
 * @returns {ResolutionResult}
 */
function resolvePermission(domain, method, routePath) {
    const normalizedMethod = method.toUpperCase();

    // 1. Check AUTH_ONLY exclusion
    const authKey = `${domain}:${normalizedMethod}:${routePath}`;
    if (authOnlyRoutes.has(authKey)) {
        return {
            status: "auth_only",
            permission: null,
            source: "auth_only",
        };
    }

    // 2. Check explicit override (highest priority)
    const overrideKey = `${domain}:${normalizedMethod}:${routePath}`;
    if (overrides.has(overrideKey)) {
        return {
            status: "resolved",
            permission: overrides.get(overrideKey),
            source: "override",
        };
    }

    // 3. Domain rule + method → CRUD
    const rule = domainIndex.get(domain);
    if (!rule) {
        return {
            status: "unknown_domain",
            permission: null,
            source: null,
        };
    }

    const crud = METHOD_CRUD[normalizedMethod];
    if (!crud) {
        return {
            status: "unknown_method",
            permission: null,
            source: null,
        };
    }

    const perm = rule.crud[crud];
    if (!perm) {
        return {
            status: "unknown_method",
            permission: null,
            source: null,
        };
    }

    return {
        status: "resolved",
        permission: perm,
        source: "rule",
    };
}

// ─── Batch Resolver ─────────────────────────────────────────────────────────

/**
 * Resolve permissions for multiple routes at once.
 *
 * @param {Array<{domain: string, method: string, path: string}>} routes
 * @returns {Array<ResolutionResult & {domain: string, method: string, path: string}>}
 */
function resolveAll(routes) {
    return routes.map(route => ({
        ...route,
        ...resolvePermission(route.domain, route.method, route.path),
    }));
}

// ─── Validation of Rules Against P Enum ─────────────────────────────────────

/**
 * Verify all permissions in rules and overrides are valid P enum values.
 * Call this in CI to catch invalid permission references.
 *
 * @returns {{ valid: boolean, invalid: string[] }}
 */
function validateRulesIntegrity() {
    const { P } = require("./orgPermissions");
    const validPermissions = new Set(Object.values(P));
    const invalid = [];

    // Check domain rules
    const { domainRules } = require("./permissionRules");
    for (const rule of domainRules) {
        for (const [crud, perm] of Object.entries(rule.crud)) {
            if (!validPermissions.has(perm)) {
                invalid.push(`domainRules[${rule.domain}].crud.${crud} = "${perm}"`);
            }
        }
    }

    // Check overrides
    for (const [key, perm] of overrides.entries()) {
        if (!validPermissions.has(perm)) {
            invalid.push(`overrides["${key}"] = "${perm}"`);
        }
    }

    return {
        valid: invalid.length === 0,
        invalid,
    };
}

// ─── Exports ────────────────────────────────────────────────────────────────

module.exports = {
    resolvePermission,
    resolveAll,
    validateRulesIntegrity,
};
