/**
 * permissionRules.js — Pattern-Based Permission Inference Rules
 *
 * Instead of maintaining a hardcoded route→permission mapping for 111+ routes,
 * this system auto-infers the correct permission from:
 *   1. The module domain (patients, invoices, orthodontics, etc.)
 *   2. The HTTP method (GET→READ, POST→CREATE, PUT/PATCH→UPDATE, DELETE→DELETE)
 *   3. Explicit overrides for edge cases
 *
 * GUARANTEE: Adding a new CRUD route in any known domain automatically gets
 *            the correct permission — zero matrix maintenance.
 *
 * The canonical matrix (permissionMatrix.js) is still used for CI validation.
 * This module provides the INFERENCE ENGINE that can generate/validate the matrix.
 *
 * PLANE: Org only.
 */

"use strict";

const { P } = require("./orgPermissions");

// ─── Method → CRUD Suffix ──────────────────────────────────────────────────

const METHOD_CRUD = {
    GET:    "READ",
    POST:   "CREATE",
    PUT:    "UPDATE",
    PATCH:  "UPDATE",
    DELETE: "DELETE",
};

// ─── Domain Rules ──────────────────────────────────────────────────────────
//
// Each rule maps a module domain to its CRUD permission set.
// The `prefix` is used for P enum lookup: P[`${prefix}_${CRUD}`]
//
// Order matters — first match wins for path-based rules.
//

const domainRules = [
    // ── Standard CRUD Domains ─────────────────────────────────────────
    {
        domain: "patients",
        prefix: "PATIENTS",
        crud: {
            READ:   P.PATIENTS_READ,
            CREATE: P.PATIENTS_CREATE,
            UPDATE: P.PATIENTS_UPDATE,
            DELETE: P.PATIENTS_DELETE,
        },
    },
    {
        domain: "appointments",
        prefix: "APPOINTMENTS",
        crud: {
            READ:   P.APPOINTMENTS_READ,
            CREATE: P.APPOINTMENTS_CREATE,
            UPDATE: P.APPOINTMENTS_UPDATE,
            DELETE: P.APPOINTMENTS_DELETE,
        },
    },
    {
        domain: "recalls",
        prefix: "RECALLS",
        crud: {
            READ:   P.RECALLS_READ,
            CREATE: P.RECALLS_CREATE,
            UPDATE: P.RECALLS_UPDATE,
            DELETE: P.RECALLS_DELETE,
        },
    },
    {
        domain: "families",
        prefix: "FAMILIES",
        crud: {
            READ:   P.FAMILIES_READ,
            CREATE: P.FAMILIES_CREATE,
            UPDATE: P.FAMILIES_UPDATE,
            DELETE: P.FAMILIES_DELETE,
        },
    },
    {
        domain: "treatments",
        prefix: "TREATMENTS",
        crud: {
            READ:   P.TREATMENTS_READ,
            CREATE: P.TREATMENTS_CREATE,
            UPDATE: P.TREATMENTS_UPDATE,
            DELETE: P.TREATMENTS_DELETE,
        },
    },
    {
        domain: "procedures",
        prefix: "PROCEDURES",
        crud: {
            READ:   P.PROCEDURES_READ,
            CREATE: P.PROCEDURES_CREATE,
            UPDATE: P.PROCEDURES_UPDATE,
            DELETE: P.PROCEDURES_DELETE,
        },
    },
    {
        domain: "invoices",
        prefix: "INVOICES",
        crud: {
            READ:   P.INVOICES_READ,
            CREATE: P.INVOICES_CREATE,
            UPDATE: P.INVOICES_UPDATE,
            DELETE: P.INVOICES_DELETE,
        },
    },
    {
        domain: "payments",
        prefix: "PAYMENTS",
        crud: {
            READ:   P.PAYMENTS_READ,
            CREATE: P.PAYMENTS_CREATE,
            UPDATE: P.PAYMENTS_UPDATE,
            DELETE: P.PAYMENTS_DELETE,
        },
    },
    {
        domain: "branches",
        prefix: "BRANCHES",
        crud: {
            READ:   P.BRANCHES_READ,
            CREATE: P.BRANCHES_CREATE,
            UPDATE: P.BRANCHES_UPDATE,
            DELETE: P.BRANCHES_DELETE,
        },
    },
    {
        domain: "users",
        prefix: "USERS",
        crud: {
            READ:   P.USERS_READ,
            CREATE: P.USERS_CREATE,
            UPDATE: P.USERS_UPDATE,
            DELETE: P.USERS_DELETE,
        },
    },
    {
        domain: "orthodontics",
        prefix: "ORTHODONTICS",
        crud: {
            READ:   P.ORTHO_READ,
            CREATE: P.ORTHO_FULL,
            UPDATE: P.ORTHO_FULL,
            DELETE: P.ORTHO_FULL,
        },
    },

    // ── Non-CRUD Domains (flat permission sets) ───────────────────────
    {
        domain: "finance",
        prefix: "ACCOUNTING",
        crud: {
            READ:   P.ACCOUNTING_READ,
            CREATE: P.ACCOUNTING_CREATE,
            UPDATE: P.ACCOUNTING_UPDATE,
            DELETE: P.ACCOUNTING_DELETE,
        },
    },
    {
        domain: "analytics",
        prefix: "ACCOUNTING",
        crud: {
            READ:   P.ACCOUNTING_READ,
            CREATE: P.ACCOUNTING_CREATE,
            UPDATE: P.ACCOUNTING_UPDATE,
            DELETE: P.ACCOUNTING_DELETE,
        },
    },
    {
        domain: "organization",
        prefix: "STAFF",
        // Organization routes are always STAFF_MANAGE (admin only)
        crud: {
            READ:   P.STAFF_MANAGE,
            CREATE: P.STAFF_MANAGE,
            UPDATE: P.STAFF_MANAGE,
            DELETE: P.STAFF_MANAGE,
        },
    },
    {
        domain: "authorization",
        prefix: "STAFF",
        crud: {
            READ:   P.STAFF_MANAGE,
            CREATE: P.STAFF_MANAGE,
            UPDATE: P.STAFF_MANAGE,
            DELETE: P.STAFF_MANAGE,
        },
    },
    {
        domain: "bookingApproval",
        prefix: "APPOINTMENTS",
        crud: {
            READ:   P.APPOINTMENTS_READ,
            CREATE: P.APPOINTMENTS_UPDATE,  // approve/reject are mutations
            UPDATE: P.APPOINTMENTS_UPDATE,
            DELETE: P.APPOINTMENTS_DELETE,
        },
    },
    {
        domain: "addOn",
        prefix: "ACCOUNTING",
        crud: {
            READ:   P.ACCOUNTING_READ,
            CREATE: P.ACCOUNTING_UPDATE,
            UPDATE: P.ACCOUNTING_UPDATE,
            DELETE: P.ACCOUNTING_DELETE,
        },
    },
];

// ─── Explicit Overrides ─────────────────────────────────────────────────────
//
// For routes where the pattern-based inference is WRONG.
// These are edge cases that cannot be inferred from domain + method alone.
//
// Key format: "domain:METHOD:path"
//

const overrides = new Map([
    // Calendar routes live in appointments domain but use CALENDAR_READ
    ["appointments:GET:/calendar",          P.CALENDAR_READ],
    ["appointments:GET:/availability",      P.APPOINTMENTS_READ],

    // Portal monitoring uses its own permission domain
    ["portalMonitoring:GET:/photos",               P.PORTAL_READ],
    ["portalMonitoring:GET:/monitoring",            P.PORTAL_READ],
    ["portalMonitoring:GET:/monitoring/:id",        P.PORTAL_READ],
    ["portalMonitoring:PATCH:/monitoring/:id/review", P.MONITORING_REVIEW],
    ["portalMonitoring:POST:/messages/staff",       P.PORTAL_MANAGE],
    ["portalMonitoring:GET:/messages",              P.PORTAL_READ],

    // Organization billing routes use ACCOUNTING, not STAFF
    ["organization:POST:/billing/portal",   P.ACCOUNTING_UPDATE],

    // Invoice void is semantically a DELETE permission
    ["invoices:POST:/:id/void",             P.INVOICES_DELETE],

    // ── Semantic overrides: HTTP method ≠ business permission ──────────
    // These routes mutate a sub-resource (family, tags, etc.) but the
    // permission is scoped to the PARENT entity (patients.update).
    // POST /:id/family → linking a family member is a patient UPDATE
    ["patients:POST:/:id/family",           P.PATIENTS_UPDATE],
    // DELETE /:id/family/:memberId → unlinking is a patient UPDATE
    ["patients:DELETE:/:id/family/:memberId", P.PATIENTS_UPDATE],
    // POST/DELETE tags → metadata mutation, not entity creation/deletion
    ["patients:POST:/:id/tags",             P.PATIENTS_UPDATE],
    ["patients:DELETE:/:id/tags/:tag",       P.PATIENTS_UPDATE],
    // POST /intelligence/run → runs analysis on patients, mutation scope
    ["patients:POST:/intelligence/run",     P.PATIENTS_UPDATE],
    // POST /bulk → bulk operations are patient updates
    ["patients:POST:/bulk",                 P.PATIENTS_UPDATE],
    // POST /:id/intake-link → generates portal magic link (portal permission)
    ["patients:POST:/:id/intake-link",      P.PORTAL_MANAGE],

    // DELETE /members/:memberId → unlinking is families.update (not delete)
    ["families:DELETE:/members/:memberId",  P.FAMILIES_UPDATE],
]);

// ─── AUTH_ONLY Routes (no permission guard needed) ──────────────────────────
//
// These routes are accessible to ALL authenticated org users.
// They are intentionally excluded from permission inference.
//

const authOnlyRoutes = new Set([
    "authorization:GET:/permissions",       // Self-introspection
]);

// ─── Build Domain Index ─────────────────────────────────────────────────────

const domainIndex = new Map();
for (const rule of domainRules) {
    domainIndex.set(rule.domain, rule);
}

// ─── Exports ────────────────────────────────────────────────────────────────

module.exports = {
    domainRules,
    domainIndex,
    overrides,
    authOnlyRoutes,
    METHOD_CRUD,
};
