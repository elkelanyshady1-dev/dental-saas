/**
 * permissionValidator.js — Domain Naming Enforcement Runtime Guard
 *
 * PURPOSE:
 * Detects and logs misuse of billing.read permission in clinic finance routes.
 * This is a DEV/CI guard — catches permission naming collisions at runtime.
 *
 * Domain Glossary v1.0 — billing ≠ billingDomain ≠ accounting
 * See: docs/domain-glossary.md
 *
 * PLANE: Utility (no plane affiliation — pure governance)
 */

"use strict";

/**
 * FINANCE ROUTE PREFIXES (clinic analytics — accounting.read territory)
 * These routes belong to billingDomain/analytics — NOT to SaaS billing.
 */
const CLINIC_FINANCE_PATTERNS = [
    "/api/v1/org/finance",
    "/api/v1/finance",
    "/org/finance",
];

/**
 * SAAS BILLING ROUTES (billing.read territory)
 * These are the ONLY routes where billing.read is valid.
 */
const SAAS_BILLING_PATTERNS = [
    "/api/v1/org/settings/billing",
    "/settings/billing",
];

/**
 * validatePermissionForRoute()
 *
 * Call this in development/CI to detect permission naming violations.
 * Logs a CRITICAL error if billing.read is used in a clinic finance route.
 *
 * @param {string} permission  - The permission string being checked
 * @param {string} route       - The route being guarded
 * @param {string} [file]      - Optional: source file for better tracing
 */
function validatePermissionForRoute(permission, route, file = "") {
    // ─── Rule 1: billing.read MUST NOT appear in clinic finance routes ──────
    if (
        permission === "billing.read" &&
        CLINIC_FINANCE_PATTERNS.some(pattern => route.includes(pattern))
    ) {
        const msg = [
            "🚨 DOMAIN NAMING VIOLATION — permissionValidator.js",
            `   Permission: billing.read`,
            `   Route:      ${route}`,
            file ? `   File:       ${file}` : "",
            `   Problem:    billing.read is for SaaS subscription — NOT clinic finance analytics.`,
            `   Fix:        Replace billing.read → accounting.read`,
            `   Reference:  docs/domain-glossary.md`,
        ].filter(Boolean).join("\n");

        console.error(msg);

        if (process.env.NODE_ENV === "test" || process.env.PERMISSION_STRICT === "true") {
            throw new Error(`[permissionValidator] Domain Naming Violation: billing.read in clinic finance route: ${route}`);
        }

        return false;
    }

    // ─── Rule 2: accounting.read MUST NOT appear in SaaS billing routes ─────
    if (
        permission === "accounting.read" &&
        SAAS_BILLING_PATTERNS.some(pattern => route.includes(pattern))
    ) {
        const msg = [
            "🚨 DOMAIN NAMING VIOLATION — permissionValidator.js",
            `   Permission: accounting.read`,
            `   Route:      ${route}`,
            file ? `   File:       ${file}` : "",
            `   Problem:    accounting.read is for clinic analytics — NOT SaaS subscription routes.`,
            `   Fix:        Replace accounting.read → billing.read`,
            `   Reference:  docs/domain-glossary.md`,
        ].filter(Boolean).join("\n");

        console.error(msg);

        if (process.env.NODE_ENV === "test" || process.env.PERMISSION_STRICT === "true") {
            throw new Error(`[permissionValidator] Domain Naming Violation: accounting.read in SaaS billing route: ${route}`);
        }

        return false;
    }

    return true;
}

/**
 * assertFinancePermission()
 *
 * Express middleware factory. Use in clinic finance routes to assert
 * that billing.read is NEVER used as a guard.
 *
 * Usage (in route files):
 *   router.use(assertFinancePermission(__filename));
 *
 * @param {string} [file]  - __filename of the calling route file
 */
function assertFinancePermission(file = "") {
    return (req, res, next) => {
        const route = req.originalUrl || req.url || "";

        if (
            CLINIC_FINANCE_PATTERNS.some(pattern => route.includes(pattern)) &&
            req.resolvedPermission === "billing.read"
        ) {
            console.error(
                `🚨 [permissionValidator] billing.read detected in clinic finance route: ${route} (${file})`
            );
        }

        next();
    };
}

module.exports = {
    validatePermissionForRoute,
    assertFinancePermission,
    CLINIC_FINANCE_PATTERNS,
    SAAS_BILLING_PATTERNS,
};
