/**
 * orgPermissions.js
 * Organization RBAC — Canonical Permission Definitions
 *
 * This is the SINGLE source of truth for org-plane RBAC permission strings.
 * All backend middleware, frontend hooks, and UI guards must reference
 * these constants — never raw string literals.
 *
 * Permission string format: "<module>.<action>"
 * Must stay in sync with Role.js schema fields.
 *
 * PLANE: Org only. Do NOT import in platform-plane contexts.
 *
 * PERMISSION_VERSION: 5 (Phase 30 FINAL — §45)
 *
 * ORTHODONTICS RBAC — FINAL STATE:
 *   EXPOSED TO ROLES (2 permissions only):
 *     orthodontics.full  → all clinical mutations (doctor, org_admin)
 *     orthodontics.read  → read-only view (assistant, lab_technician)
 *
 *   ALL engine-level granular permissions have been REMOVED.
 *   Controllers use orthodontics.full / orthodontics.read directly.
 *   No hierarchy resolution required at runtime for the ortho domain.
 */

"use strict";

// ─── Permission Strings ───────────────────────────────────────────────────────

const P = {
    // Patient module
    PATIENTS_READ: "patients.read",
    PATIENTS_CREATE: "patients.create",
    PATIENTS_UPDATE: "patients.update",
    PATIENTS_DELETE: "patients.delete",

    // Appointments module
    APPOINTMENTS_READ: "appointments.read",
    APPOINTMENTS_CREATE: "appointments.create",
    APPOINTMENTS_UPDATE: "appointments.update",
    APPOINTMENTS_DELETE: "appointments.delete",

    // Recalls module
    RECALLS_READ: "recalls.read",
    RECALLS_CREATE: "recalls.create",
    RECALLS_UPDATE: "recalls.update",
    RECALLS_DELETE: "recalls.delete",

    // Families module
    FAMILIES_READ: "families.read",
    FAMILIES_CREATE: "families.create",
    FAMILIES_UPDATE: "families.update",
    FAMILIES_DELETE: "families.delete",

    // Accounting module
    ACCOUNTING_READ:    "accounting.read",
    ACCOUNTING_CREATE:  "accounting.create",
    ACCOUNTING_UPDATE:  "accounting.update",
    ACCOUNTING_DELETE:  "accounting.delete",
    ACCOUNTING_MANAGE:  "accounting.manage",   // Admin: replay projections, bulk ops
    ACCOUNTING_REPORTS: "accounting.reports",  // Premium: export P&L, generate reports

    // ─── Orthodontics Domain (Phase 30 FINAL — Two-permission model) ───────────
    //
    // These are the ONLY two orthodontics permissions in the system.
    // All controllers use these directly — no engine-level granular permissions exist.
    //
    //   ORTHO_FULL  → orthodontics.full — all clinical mutations
    //   ORTHO_READ  → orthodontics.read — read-only clinical view
    //
    // Roles:  doctor, org_admin → ORTHO_FULL
    //         assistant, lab_technician → ORTHO_READ

    ORTHO_FULL: "orthodontics.full",   // all write operations across the ortho domain
    ORTHO_READ: "orthodontics.read",   // read-only view across the ortho domain

    // Calendar module
    CALENDAR_READ: "calendar.read",
    CALENDAR_MULTI_BRANCH: "calendar.multiBranchView",
    CALENDAR_SELF_FILTER: "calendar.selfFilterOnly",

    // Staff management (org_admin only)
    STAFF_MANAGE: "staff.manage",

    // Users module (Phase 1 — User Management)
    USERS_READ: "users.read",
    USERS_CREATE: "users.create",
    USERS_UPDATE: "users.update",
    USERS_DELETE: "users.delete",

    // Branches module (Phase 1 — Branch Management)
    BRANCHES_READ: "branches.read",
    BRANCHES_CREATE: "branches.create",
    BRANCHES_UPDATE: "branches.update",
    BRANCHES_DELETE: "branches.delete",

    // Procedures module (Phase 3 — Clinical Operations)
    PROCEDURES_READ: "procedures.read",
    PROCEDURES_CREATE: "procedures.create",
    PROCEDURES_UPDATE: "procedures.update",
    PROCEDURES_DELETE: "procedures.delete",

    // Treatments module (Phase 3 — Clinical Operations)
    TREATMENTS_READ: "treatments.read",
    TREATMENTS_CREATE: "treatments.create",
    TREATMENTS_UPDATE: "treatments.update",
    TREATMENTS_DELETE: "treatments.delete",

    // Invoices module (Phase 3 — Patient Billing)
    INVOICES_READ: "invoices.read",
    INVOICES_CREATE: "invoices.create",
    INVOICES_UPDATE: "invoices.update",
    INVOICES_DELETE: "invoices.delete",

    // Payments module (Phase 3 — Patient Billing)
    PAYMENTS_READ: "payments.read",
    PAYMENTS_CREATE: "payments.create",
    PAYMENTS_UPDATE: "payments.update",
    PAYMENTS_DELETE: "payments.delete",

    // Patient Portal module (Phase 5 — Patient Portal & Remote Monitoring)
    PORTAL_READ: "portal.read",
    PORTAL_MANAGE: "portal.manage",
    MONITORING_REVIEW: "monitoring.review",

    // ⚠️  SaaS SUBSCRIPTION READ — NOT clinic finance analytics.
    // VALID for: settingsBilling.routes.js (/settings/billing/* endpoints)
    // FORBIDDEN for: any /org/finance/* route (use ACCOUNTING_READ instead)
    // Reference: docs/domain-glossary.md — billing ≠ billingDomain ≠ accounting
    BILLING_READ: "billing.read",

    // Double-entry ledger (Phase C — Ledger System)
    // Read-only — ledger writes happen exclusively via system services
    LEDGER_READ: "ledger.read",

    // Refund engine (Phase D — Refund Lifecycle)
    REFUNDS_CREATE: "refunds.create",
    REFUNDS_READ: "refunds.read",

    // Security Control Center (Phase 7 — RBAC Governance)
    SECURITY_READ:   "security.read",
    SECURITY_MANAGE: "security.manage",

    // ─── Phase 22 — New Modules ──────────────────────────────────────────────

    // Inventory module (Phase 22 — Supply Chain)
    INVENTORY_READ:   "inventory.read",
    INVENTORY_CREATE: "inventory.create",
    INVENTORY_UPDATE: "inventory.update",
    INVENTORY_DELETE: "inventory.delete",

    // Lab module (Phase 22 — Lab Management)
    LAB_READ:   "lab.read",
    LAB_CREATE: "lab.create",
    LAB_UPDATE: "lab.update",
    LAB_DELETE: "lab.delete",

    // Communication module (Phase 22 — Messaging & Notifications)
    COMMUNICATION_READ:   "communication.read",
    COMMUNICATION_SEND:   "communication.send",
    COMMUNICATION_MANAGE: "communication.manage",

    // Analytics module (Phase 22 — Reporting & Insights)
    ANALYTICS_READ:   "analytics.read",
    ANALYTICS_EXPORT: "analytics.export",

    // Dashboard module (Phase 22 — Dashboard Actions)
    DASHBOARD_READ:   "dashboard.read",
    DASHBOARD_MANAGE: "dashboard.manage",

    // ─── Phase A — RBAC Gap Closure ──────────────────────────────────────────

    // Support module (Phase A — Support Tickets)
    SUPPORT_READ:   "support.read",
    SUPPORT_CREATE: "support.create",
    SUPPORT_WRITE:  "support.write",   // Settings Hub — reply to own tickets

    // Storage module (Phase A — Storage Usage Self-Serve)
    STORAGE_READ:   "storage.read",

    // Document Engine (AUDIT-003 — documentEngineDomain HTTP exposure)
    DOCUMENTS_READ:   "documents.read",
    DOCUMENTS_CREATE: "documents.create",
    DOCUMENTS_MANAGE: "documents.manage",   // Admin: create/update templates
};

// ─── Permission Groups (Meta-Layer) ──────────────────────────────────────────
// Groups aggregate related permissions for use in role seeds and governance.
// They prevent permission explosion as the module count grows (17 → 40+).
// Groups are composable: role definitions can mix groups + individual permissions.
//
// RULE: Every value in a group MUST be a P constant.
// Groups are validated at require() time — broken references throw immediately.

const PERMISSION_GROUPS = {
    // Full CRUD per domain module
    PATIENT_FULL_ACCESS: [
        P.PATIENTS_READ, P.PATIENTS_CREATE, P.PATIENTS_UPDATE, P.PATIENTS_DELETE,
    ],
    APPOINTMENT_FULL_ACCESS: [
        P.APPOINTMENTS_READ, P.APPOINTMENTS_CREATE, P.APPOINTMENTS_UPDATE, P.APPOINTMENTS_DELETE,
    ],
    RECALL_FULL_ACCESS: [
        P.RECALLS_READ, P.RECALLS_CREATE, P.RECALLS_UPDATE, P.RECALLS_DELETE,
    ],
    FAMILY_FULL_ACCESS: [
        P.FAMILIES_READ, P.FAMILIES_CREATE, P.FAMILIES_UPDATE, P.FAMILIES_DELETE,
    ],
    ACCOUNTING_FULL_ACCESS: [
        P.ACCOUNTING_READ, P.ACCOUNTING_CREATE, P.ACCOUNTING_UPDATE, P.ACCOUNTING_DELETE,
        P.ACCOUNTING_MANAGE, P.ACCOUNTING_REPORTS,
    ],
    // Phase 30 FINAL: orthodontics.full is the single permission for the entire domain
    ORTHODONTICS_FULL_ACCESS: [
        P.ORTHO_FULL,
    ],
    // Read-only access group for assistants / lab technicians
    ORTHODONTICS_READ_ACCESS: [
        P.ORTHO_READ,
    ],

    USER_FULL_ACCESS: [
        P.USERS_READ, P.USERS_CREATE, P.USERS_UPDATE, P.USERS_DELETE,
    ],
    BRANCH_FULL_ACCESS: [
        P.BRANCHES_READ, P.BRANCHES_CREATE, P.BRANCHES_UPDATE, P.BRANCHES_DELETE,
    ],
    PROCEDURE_FULL_ACCESS: [
        P.PROCEDURES_READ, P.PROCEDURES_CREATE, P.PROCEDURES_UPDATE, P.PROCEDURES_DELETE,
    ],
    TREATMENT_FULL_ACCESS: [
        P.TREATMENTS_READ, P.TREATMENTS_CREATE, P.TREATMENTS_UPDATE, P.TREATMENTS_DELETE,
    ],
    INVOICE_FULL_ACCESS: [
        P.INVOICES_READ, P.INVOICES_CREATE, P.INVOICES_UPDATE, P.INVOICES_DELETE,
    ],
    PAYMENT_FULL_ACCESS: [
        P.PAYMENTS_READ, P.PAYMENTS_CREATE, P.PAYMENTS_UPDATE, P.PAYMENTS_DELETE,
    ],

    // Phase 22 new module groups
    INVENTORY_FULL_ACCESS: [
        P.INVENTORY_READ, P.INVENTORY_CREATE, P.INVENTORY_UPDATE, P.INVENTORY_DELETE,
    ],
    LAB_FULL_ACCESS: [
        P.LAB_READ, P.LAB_CREATE, P.LAB_UPDATE, P.LAB_DELETE,
    ],
    COMMUNICATION_FULL_ACCESS: [
        P.COMMUNICATION_READ, P.COMMUNICATION_SEND, P.COMMUNICATION_MANAGE,
    ],
    ANALYTICS_FULL_ACCESS: [
        P.ANALYTICS_READ, P.ANALYTICS_EXPORT,
    ],
    DASHBOARD_FULL_ACCESS: [
        P.DASHBOARD_READ, P.DASHBOARD_MANAGE,
    ],

    // Phase A — new module groups
    SUPPORT_FULL_ACCESS: [
        P.SUPPORT_READ, P.SUPPORT_CREATE, P.SUPPORT_WRITE,
    ],
    STORAGE_FULL_ACCESS: [
        P.STORAGE_READ,
    ],

    // Composite groups (cross-module)
    CLINICAL_FULL_ACCESS: [
        P.PROCEDURES_READ, P.PROCEDURES_CREATE, P.PROCEDURES_UPDATE, P.PROCEDURES_DELETE,
        P.TREATMENTS_READ, P.TREATMENTS_CREATE, P.TREATMENTS_UPDATE, P.TREATMENTS_DELETE,
    ],
    BILLING_FULL_ACCESS: [
        P.INVOICES_READ, P.INVOICES_CREATE, P.INVOICES_UPDATE, P.INVOICES_DELETE,
        P.PAYMENTS_READ, P.PAYMENTS_CREATE, P.PAYMENTS_UPDATE, P.PAYMENTS_DELETE,
    ],
    PORTAL_FULL_ACCESS: [
        P.PORTAL_READ, P.PORTAL_MANAGE, P.MONITORING_REVIEW,
    ],
    SECURITY_FULL_ACCESS: [
        P.SECURITY_READ, P.SECURITY_MANAGE,
    ],

    // Role-level macros (composited from module groups)
    ORG_ADMIN_ALL: [
        // Every permission in the system — org_admin gets all
        ...Object.values(P),
    ],
};

// ─── Group Utilities ────────────────────────────────────────────────────────

/**
 * Expand a single permission group name into its constituent permission strings.
 * @param {string} groupName - Name of the group (e.g. "PATIENT_FULL_ACCESS")
 * @returns {string[]} Array of permission strings
 * @throws {Error} If group does not exist
 */
function expandGroup(groupName) {
    if (!PERMISSION_GROUPS[groupName]) {
        throw new Error(`[orgPermissions] Unknown permission group: "${groupName}". Valid groups: ${Object.keys(PERMISSION_GROUPS).join(", ")}`);
    }
    return [...PERMISSION_GROUPS[groupName]];
}

/**
 * Expand multiple groups and/or individual permissions into a flat deduplicated array.
 * @param {...(string|string[])} args - Group names (from PERMISSION_GROUPS) or individual P values
 * @returns {string[]} Deduplicated flat array of permission strings
 */
function expandGroups(...args) {
    const result = new Set();
    for (const arg of args.flat()) {
        if (PERMISSION_GROUPS[arg]) {
            PERMISSION_GROUPS[arg].forEach(p => result.add(p));
        } else {
            result.add(arg);
        }
    }
    return [...result];
}

// ─── Boot-Time Group Validation ─────────────────────────────────────────────
// Ensure every group entry is a valid P value. Catches typos at import time.
const allPValues = new Set(Object.values(P));
for (const [groupName, perms] of Object.entries(PERMISSION_GROUPS)) {
    for (const perm of perms) {
        if (!allPValues.has(perm)) {
            throw new Error(
                `[orgPermissions] PERMISSION_GROUPS.${groupName} contains invalid value: "${perm}". ` +
                `All group entries must be values from the P enum.`
            );
        }
    }
}

// ─── Role Permission Map ──────────────────────────────────────────────────────
// Authoritative map of which permissions each system role receives.
// Used for documentation, tests, and the frontend role-change UI.
// The live permission source remains the Role documents seeded by roleInitializer.js.

const ORG_ROLE_PERMISSIONS = {
    org_admin: [
        P.PATIENTS_READ, P.PATIENTS_CREATE, P.PATIENTS_UPDATE, P.PATIENTS_DELETE,
        P.APPOINTMENTS_READ, P.APPOINTMENTS_CREATE, P.APPOINTMENTS_UPDATE, P.APPOINTMENTS_DELETE,
        P.RECALLS_READ, P.RECALLS_CREATE, P.RECALLS_UPDATE, P.RECALLS_DELETE,
        P.FAMILIES_READ, P.FAMILIES_CREATE, P.FAMILIES_UPDATE, P.FAMILIES_DELETE,
        P.ACCOUNTING_READ, P.ACCOUNTING_CREATE, P.ACCOUNTING_UPDATE, P.ACCOUNTING_DELETE,
        P.ACCOUNTING_MANAGE, P.ACCOUNTING_REPORTS,
        // Phase 30: Single domain permission — hierarchy resolves all engine perms
        P.ORTHO_FULL,
        P.CALENDAR_READ, P.CALENDAR_MULTI_BRANCH,
        P.STAFF_MANAGE,
        P.USERS_READ, P.USERS_CREATE, P.USERS_UPDATE, P.USERS_DELETE,
        P.BRANCHES_READ, P.BRANCHES_CREATE, P.BRANCHES_UPDATE, P.BRANCHES_DELETE,
        P.PROCEDURES_READ, P.PROCEDURES_CREATE, P.PROCEDURES_UPDATE, P.PROCEDURES_DELETE,
        P.TREATMENTS_READ, P.TREATMENTS_CREATE, P.TREATMENTS_UPDATE, P.TREATMENTS_DELETE,
        P.INVOICES_READ, P.INVOICES_CREATE, P.INVOICES_UPDATE, P.INVOICES_DELETE,
        P.PAYMENTS_READ, P.PAYMENTS_CREATE, P.PAYMENTS_UPDATE, P.PAYMENTS_DELETE,
        P.PORTAL_READ, P.PORTAL_MANAGE, P.MONITORING_REVIEW,
        P.SECURITY_READ, P.SECURITY_MANAGE,
        // Phase 22 — new modules (org_admin gets full access)
        P.INVENTORY_READ, P.INVENTORY_CREATE, P.INVENTORY_UPDATE, P.INVENTORY_DELETE,
        P.LAB_READ, P.LAB_CREATE, P.LAB_UPDATE, P.LAB_DELETE,
        P.COMMUNICATION_READ, P.COMMUNICATION_SEND, P.COMMUNICATION_MANAGE,
        P.ANALYTICS_READ, P.ANALYTICS_EXPORT,
        P.DASHBOARD_READ, P.DASHBOARD_MANAGE,
        // Phase A — RBAC gap closure
        P.SUPPORT_READ, P.SUPPORT_CREATE, P.SUPPORT_WRITE,
        P.STORAGE_READ,
        // Phase G/C — Billing Domain
        P.BILLING_READ,
        P.LEDGER_READ,
        // Phase D — Refunds
        P.REFUNDS_CREATE,
        P.REFUNDS_READ,
        // AUDIT-003 — Document Engine
        P.DOCUMENTS_READ, P.DOCUMENTS_CREATE, P.DOCUMENTS_MANAGE,
    ],


    doctor: [
        P.PATIENTS_READ, P.PATIENTS_CREATE, P.PATIENTS_UPDATE,
        P.APPOINTMENTS_READ, P.APPOINTMENTS_CREATE, P.APPOINTMENTS_UPDATE,
        P.RECALLS_READ, P.RECALLS_CREATE,
        P.FAMILIES_READ, P.FAMILIES_CREATE,
        // Phase 30: Single domain permission — hierarchy resolves all engine perms
        P.ORTHO_FULL,
        P.CALENDAR_READ, P.CALENDAR_SELF_FILTER,
        P.BRANCHES_READ,
        P.PROCEDURES_READ, P.PROCEDURES_CREATE, P.PROCEDURES_UPDATE,
        P.TREATMENTS_READ, P.TREATMENTS_CREATE, P.TREATMENTS_UPDATE,
        P.INVOICES_READ, P.INVOICES_CREATE,
        P.PAYMENTS_READ,
        P.PORTAL_READ, P.MONITORING_REVIEW,
        // Phase 22 — selective access
        P.INVENTORY_READ,                          // ✅ TASK-FE-RBAC-001 — inventory visible to doctors
        P.LAB_READ, P.LAB_CREATE,
        P.ACCOUNTING_READ,                         // ✅ finance analytics (branch-scoped by PBAC)
        P.ANALYTICS_READ,
        P.DASHBOARD_READ,
        P.COMMUNICATION_READ, P.COMMUNICATION_SEND,
        // Phase A
        P.SUPPORT_READ, P.SUPPORT_CREATE, P.SUPPORT_WRITE,
        P.STORAGE_READ,
        // AUDIT-003 — Document Engine
        P.DOCUMENTS_READ, P.DOCUMENTS_CREATE,
    ],


    assistant: [
        P.PATIENTS_READ,
        P.APPOINTMENTS_READ, P.APPOINTMENTS_CREATE, P.APPOINTMENTS_UPDATE,
        P.RECALLS_READ,
        P.FAMILIES_READ,
        P.CALENDAR_READ,
        P.BRANCHES_READ,
        P.PROCEDURES_READ,
        P.TREATMENTS_READ,
        P.INVOICES_READ, P.INVOICES_CREATE, P.INVOICES_UPDATE,
        P.PAYMENTS_READ,
        P.PORTAL_READ,
        // Phase 22 — limited access
        P.INVENTORY_READ,
        P.LAB_READ,
        P.DASHBOARD_READ,
        P.COMMUNICATION_READ,
        // Phase A
        P.SUPPORT_READ, P.SUPPORT_CREATE,
        P.STORAGE_READ,
        // AUDIT-003 — Document Engine
        P.DOCUMENTS_READ,
        // Phase 30: Read-only orthodontics. Cannot start/end visits or mutate clinical data.
        P.ORTHO_READ,
    ],


    receptionist: [
        P.PATIENTS_READ, P.PATIENTS_CREATE,
        P.APPOINTMENTS_READ, P.APPOINTMENTS_CREATE, P.APPOINTMENTS_UPDATE,
        P.RECALLS_READ, P.RECALLS_CREATE, P.RECALLS_UPDATE,
        P.FAMILIES_READ, P.FAMILIES_CREATE, P.FAMILIES_UPDATE,
        P.ACCOUNTING_READ,
        P.CALENDAR_READ,
        P.BRANCHES_READ,
        P.PROCEDURES_READ,
        P.TREATMENTS_READ,
        P.INVOICES_READ, P.INVOICES_CREATE,
        P.PAYMENTS_READ, P.PAYMENTS_CREATE,
        P.PORTAL_READ,
        // Phase 22 — limited access
        P.INVENTORY_READ,
        P.DASHBOARD_READ,
        P.COMMUNICATION_READ, P.COMMUNICATION_SEND,
        // Phase A
        P.SUPPORT_READ, P.SUPPORT_CREATE,
        P.STORAGE_READ,
    ],

    lab_technician: [
        P.PATIENTS_READ,
        // Phase 30: Read-only orthodontics (hierarchy grants bonding.read, tads.read, sequence.read)
        P.ORTHO_READ,
        P.CALENDAR_READ,
        P.BRANCHES_READ,
        // Phase 22 — lab technician gets full lab access
        P.LAB_READ, P.LAB_CREATE, P.LAB_UPDATE, P.LAB_DELETE,
        P.DASHBOARD_READ,
        // Phase A
        P.STORAGE_READ,
    ],

};

// ─── Allowed Role Names (for governance UI dropdowns and validation) ──────────

const ORG_ROLES = Object.freeze([
    "org_admin",
    "doctor",
    "assistant",
    "receptionist",
    "lab_technician",
]);

module.exports = { P, PERMISSION_GROUPS, expandGroup, expandGroups, ORG_ROLE_PERMISSIONS, ORG_ROLES };
