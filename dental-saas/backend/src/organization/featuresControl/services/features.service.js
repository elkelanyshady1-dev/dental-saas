/**
 * features.service.js — Feature Decision Chain Resolution
 *
 * Resolves the full authorization decision chain for every feature:
 *   1. Entitlement (plan → module enabled?)
 *   2. Feature Flag (platform flag override?)
 *   3. RBAC (user role has permission?)
 *   4. Policy/PBAC (resource-level condition rules?)
 *
 * Returns a per-feature decision chain that the UI uses to render
 * the FeaturesTable and FeatureInspectorDrawer.
 *
 * PLANE: Org only.
 */

"use strict";

const { P } = require("../../../rbac/orgPermissions");
const { policies } = require("../../../rbac/policyRegistry");
const { parseOrgFeatures } = require("./modules.service");
const logger = require("@utils/logger");

// ─── Feature Definitions (SSOT) ─────────────────────────────────────────────

const FEATURE_DEFS = Object.freeze([
    // Patients
    { key: "patients.read",        name: "View Patients",        moduleKey: "patients",      module: "Patients",             risk: "low",      source: "admin" },
    { key: "patients.create",      name: "Create Patients",      moduleKey: "patients",      module: "Patients",             risk: "medium",   source: "admin" },
    { key: "patients.update",      name: "Edit Patients",        moduleKey: "patients",      module: "Patients",             risk: "medium",   source: "admin" },
    { key: "patients.delete",      name: "Delete Patients",      moduleKey: "patients",      module: "Patients",             risk: "critical", source: "admin" },
    // Appointments
    { key: "appointments.read",    name: "View Appointments",    moduleKey: "appointments",  module: "Appointments",         risk: "low",      source: "admin" },
    { key: "appointments.create",  name: "Book Appointments",    moduleKey: "appointments",  module: "Appointments",         risk: "low",      source: "admin" },
    { key: "appointments.update",  name: "Modify Appointments",  moduleKey: "appointments",  module: "Appointments",         risk: "medium",   source: "admin" },
    { key: "appointments.delete",  name: "Cancel Appointments",  moduleKey: "appointments",  module: "Appointments",         risk: "medium",   source: "admin" },
    // Treatments
    { key: "treatments.read",      name: "View Treatments",      moduleKey: "treatments",    module: "Clinical Treatments",  risk: "low",      source: "admin" },
    { key: "treatments.create",    name: "Create Treatments",    moduleKey: "treatments",    module: "Clinical Treatments",  risk: "medium",   source: "admin" },
    { key: "treatments.update",    name: "Modify Treatments",    moduleKey: "treatments",    module: "Clinical Treatments",  risk: "medium",   source: "admin" },
    // Orthodontics — Phase 30 FINAL: two-permission model
    { key: "orthodontics.read",  name: "View Cases",                       moduleKey: "orthodontics",  module: "Orthodontics",  risk: "low",    source: "plan" },
    { key: "orthodontics.full",  name: "Manage Cases (All Clinical Ops)",  moduleKey: "orthodontics",  module: "Orthodontics",  risk: "medium", source: "plan" },
    // Finance
    { key: "accounting.read",      name: "View Finances",       moduleKey: "finance",       module: "Finance & Billing",    risk: "medium",   source: "admin" },
    { key: "accounting.create",    name: "Create Invoices",     moduleKey: "finance",       module: "Finance & Billing",    risk: "medium",   source: "admin" },
    { key: "accounting.update",    name: "Process Payments",    moduleKey: "finance",       module: "Finance & Billing",    risk: "critical", source: "admin" },
    // Inventory
    { key: "inventory.read",       name: "View Inventory",      moduleKey: "inventory",     module: "Inventory",            risk: "low",      source: "admin" },
    { key: "inventory.create",     name: "Add Stock",           moduleKey: "inventory",     module: "Inventory",            risk: "low",      source: "admin" },
    // Analytics
    { key: "analytics.read",       name: "View Analytics",      moduleKey: "analytics",     module: "Analytics & Reports",  risk: "low",      source: "plan" },
    { key: "analytics.export",     name: "Export Reports",      moduleKey: "analytics",     module: "Analytics & Reports",  risk: "medium",   source: "plan" },
    // Security
    { key: "security.read",        name: "View Audit Logs",     moduleKey: "security",      module: "Security Center",      risk: "critical", source: "admin" },
    { key: "security.manage",      name: "Manage Security",     moduleKey: "security",      module: "Security Center",      risk: "critical", source: "admin" },
    // Users
    { key: "users.read",           name: "View Staff",          moduleKey: "users",         module: "Staff Management",     risk: "low",      source: "admin" },
    { key: "users.create",         name: "Add Staff",           moduleKey: "users",         module: "Staff Management",     risk: "medium",   source: "admin" },
    { key: "users.update",         name: "Edit Staff",          moduleKey: "users",         module: "Staff Management",     risk: "medium",   source: "admin" },
    { key: "users.delete",         name: "Remove Staff",        moduleKey: "users",         module: "Staff Management",     risk: "critical", source: "admin" },
    // Branches
    { key: "branches.read",        name: "View Branches",       moduleKey: "branches",      module: "Branches",             risk: "low",      source: "admin" },
    { key: "branches.create",      name: "Add Branches",        moduleKey: "branches",      module: "Branches",             risk: "medium",   source: "plan" },
    // Lab
    { key: "lab.read",             name: "View Lab",            moduleKey: "lab",           module: "Lab Management",       risk: "low",      source: "admin" },
    { key: "lab.create",           name: "Create Lab Orders",   moduleKey: "lab",           module: "Lab Management",       risk: "medium",   source: "admin" },
    // Communication
    { key: "communication.read",   name: "View Messages",       moduleKey: "communication", module: "Communication",        risk: "low",      source: "admin" },
    { key: "communication.send",   name: "Send Messages",       moduleKey: "communication", module: "Communication",        risk: "low",      source: "admin" },
    // Dashboard
    { key: "dashboard.read",       name: "View Dashboard",      moduleKey: "dashboard",     module: "Dashboard",            risk: "low",      source: "admin" },
    { key: "dashboard.manage",     name: "Manage Dashboard",    moduleKey: "dashboard",     module: "Dashboard",            risk: "medium",   source: "admin" },
]);

// ─── Feature Resolution ─────────────────────────────────────────────────────

/**
 * Resolve feature decision chains for all features in the system.
 *
 * @param {Object} params
 * @param {Object} params.org — Organization Mongoose document
 * @param {Object} params.user — req.user (for RBAC check)
 * @param {Object} [params.capabilities] — req.capabilities
 * @returns {Array} — resolved features with decision chains
 */
function resolveFeatures({ org, user, capabilities }) {
    const orgModules = org.modules || {};
    const orgFeatures = parseOrgFeatures(org.features);

    const userPermissions = user?.permissions || [];
    const userCapabilities = capabilities || {};

    return FEATURE_DEFS.map(feat => {
        const moduleEnabled = orgModules[feat.moduleKey] !== false;
        const flagEnabled = orgFeatures[`${feat.key}.disabled`] !== true;
        const rbacGranted = Array.isArray(userPermissions)
            ? userPermissions.includes(feat.key)
            : !!userCapabilities[feat.key];

        const hasPolicyRules = !!(policies[feat.key] && policies[feat.key].length > 0);

        // Decision chain — 4-layer trace
        const decisionChain = [
            {
                label: "Plan (Entitlement)",
                passed: moduleEnabled,
                detail: moduleEnabled ? "allowed" : "module locked",
            },
            {
                label: "Feature Flag",
                passed: flagEnabled,
                detail: flagEnabled ? "enabled" : "disabled by platform",
            },
            {
                label: "RBAC (Role)",
                passed: rbacGranted,
                detail: rbacGranted ? "granted" : "not in role",
            },
            {
                label: "Policy (Resource)",
                passed: true, // PBAC evaluations are resource-specific → always "pending" at list level
                detail: hasPolicyRules ? `${policies[feat.key].length} rules active` : "no restrictions",
            },
        ];

        let status;
        if (!moduleEnabled) status = "locked";
        else if (!flagEnabled) status = "flag";
        else if (rbacGranted) status = "on";
        else status = "off";

        return {
            ...feat,
            status,
            decisionChain,
        };
    });
}

// ─── Exports ────────────────────────────────────────────────────────────────

module.exports = {
    FEATURE_DEFS,
    resolveFeatures,
};
