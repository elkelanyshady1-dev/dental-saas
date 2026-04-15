/**
 * orgRuntimeController.js
 * v1.0 — Context-Aware GlobalActionBar backend
 *
 * Provides org-scoped runtime metadata endpoints:
 *
 *   GET /api/v1/org/context/actions?context=<contextKey>
 *     — Returns a per-route allowlist used by OrgGlobalActionBar frontend hook.
 *     — Result is RBAC-filtered against the requesting user's permissions.
 *     — Does NOT trust the context key as authorization — it only shapes the response.
 *
 *   GET /api/v1/org/context/modules
 *     — Returns enabled module flags for the authenticated org (self-read only).
 *     — Useful for frontend module availability checks.
 *
 * ── Security notes ──────────────────────────────────────────────────────────
 *   organizationId is read from req.context.organizationId (set by authMiddleware from JWT).
 *   Phase 8: req.organization is deprecated — all org access uses req.context.
 *   No client-supplied orgId is ever trusted.
 *   "context" query param is a UI hint only — it never authorizes access.
 */

"use strict";

const { MODULE_REGISTRY, listModuleKeys } = require("../platform/featureRegistry");

// ─── Action definitions per route context ─────────────────────────────────────
// This mirrors the frontend actionRegistry.js but evaluated server-side.
// Each entry has a perm field matching RBAC permission keys.
//
// "perm" format: "module.action" — matches the permissionSet built in authMiddleware.
const CONTEXT_ACTION_DEFINITIONS = Object.freeze({

    dashboard: [
        { key: "send_sms", perm: "patients.read" },
        { key: "add_task", perm: "calendar.read" },
        { key: "add_appointment", perm: "appointments.create" },
        { key: "add_patient", perm: "patients.create" },
    ],

    patients: [
        { key: "import_csv", perm: "patients.create" },
        { key: "send_sms", perm: "patients.read" },
        { key: "add_patient", perm: "patients.create" },
    ],

    patient_profile: [
        { key: "add_prescription", perm: "clinical.update" },
        { key: "add_treatment", perm: "clinical.create" },
        { key: "new_invoice", perm: "accounting.create" },
        { key: "add_appointment", perm: "appointments.create" },
    ],

    appointments: [
        { key: "send_sms", perm: "patients.read" },
        { key: "add_appointment", perm: "appointments.create" },
    ],

    finance: [
        { key: "add_expense", perm: "accounting.create" },
        { key: "add_income", perm: "accounting.create" },
    ],

    calendar: [
        { key: "add_appointment", perm: "appointments.create" },
    ],

    analytics: [
        { key: "export_report", perm: "analytics.read" },
    ],

    inventory: [
        { key: "add_stock", perm: "inventory.create" },
        { key: "import_csv", perm: "inventory.create" },
    ],

    settings: [
        { key: "save_settings", perm: "settings.update" },
    ],

    default: [
        { key: "send_sms", perm: "patients.read" },
        { key: "add_appointment", perm: "appointments.create" },
        { key: "add_patient", perm: "patients.create" },
    ],
});

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Checks if the requesting user has a given permission.
 *
 * Uses req.context.permissions (a Set) built by authMiddleware.
 * Platform users (superadmin / platform_admin) bypass all RBAC.
 *
 * @param {import('express').Request} req
 * @param {string} perm — "module.action"
 * @returns {boolean}
 */
function userHasPermission(req, perm) {
    // Platform-level bypass (cross-plane escalation for platform admins
    // assisting orgs — intentional and documented).
    if (
        req.user.platformRole === "superadmin" ||
        req.user.platformRole === "platform_admin"
    ) {
        return true;
    }

    // RBAC SSOT: capability is determined solely by the permission Set built
    // from the JWT. org_admin naturally passes because ORG_ROLE_PERMISSIONS
    // grants it every permission — no inline role-name shortcut needed.
    return req.context?.permissions?.has(perm) ?? false;
}

// ─── Controllers ─────────────────────────────────────────────────────────────

/**
 * GET /api/v1/org/context/actions?context=<contextKey>
 *
 * Returns an array of { key, allowed } for each action in the context.
 * Frontend OrgGlobalActionBar merges this with its local actionRegistry.
 */
async function getContextActions(req, res) {
    try {
        const orgId = req.context?.organizationId || req.organizationId;
        const contextKey = req.query.context;

        // Validate context key — only known keys are accepted
        const definitions = CONTEXT_ACTION_DEFINITIONS[contextKey]
            ?? CONTEXT_ACTION_DEFINITIONS.default;

        // Build the RBAC-filtered allowlist
        const actions = definitions.map(({ key, perm }) => ({
            key,
            allowed: userHasPermission(req, perm),
        }));

        res.json({
            success: true,
            data: {
                context: contextKey ?? "default",
                organizationId: orgId,
                actions,
            },
        });
    } catch (err) {
        console.error("[orgRuntimeController:getContextActions]", err);
        res.status(500).json({
            success: false,
            error: { code: "INTERNAL_ERROR", message: err.message },
        });
    }
}

/**
 * GET /api/v1/org/context/modules
 *
 * Returns the enabled/disabled status of all registered modules for this org.
 * Includes plan-eligibility derived from FeatureDefinition.
 * Org users can read (not write) their module status.
 */
async function getEnabledModules(req, res) {
    try {
        const orgId = req.context?.organizationId || req.organizationId;

        // ── SSOT: Read module state from req.capabilities.modules (set by unifiedCapabilityMiddleware)
        // Phase B: org.modules is soft-deprecated; req.capabilities.modules is the single source of truth.
        const capModules = req.capabilities?.modules || {};

        const modules = {};
        for (const [registryKey, moduleDef] of Object.entries(MODULE_REGISTRY)) {
            // Plan info not available without org document — default to "unknown"
            const plan = req.plan?.key || "unknown";
            const planEligible = moduleDef.isCore || moduleDef.allowedPlans.includes(plan);

            modules[registryKey] = {
                key: moduleDef.key,
                enabled: moduleDef.isCore ? true : !!capModules[moduleDef.key],
                planEligible,
                plan,
                description: moduleDef.description,
            };
        }

        res.json({
            success: true,
            data: {
                organizationId: orgId,
                plan: req.plan?.key || "unknown",
                modules,
            },
        });
    } catch (err) {
        console.error("[orgRuntimeController:getEnabledModules]", err);
        res.status(500).json({
            success: false,
            error: { code: "INTERNAL_ERROR", message: err.message },
        });
    }
}

module.exports = {
    getContextActions,
    getEnabledModules,
};
