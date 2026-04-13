/**
 * permissionMatrix.js — Canonical Route → Permission Matrix
 *
 * This is the SINGLE source of truth for which permission protects each route.
 * Used by:
 *   1. CI validation (scripts/checkPermissionMatrix.js) — AST verifies actual code
 *   2. Runtime enforcement (middleware/enforcePermissionMatrix.js) — optional double-check
 *   3. Swagger documentation generation
 *   4. Frontend capability guards
 *
 * Format:
 *   matrix[MODULE][METHOD:PATH] = P.PERMISSION
 *
 * ⚠️  If a route is added to the codebase but NOT to this matrix, CI will fail.
 * ⚠️  If a route's actual permission differs from this matrix, CI will fail.
 *
 * PLANE: Org only. Do NOT add platform routes here.
 */

"use strict";

const { P } = require("./orgPermissions");

// ─── Permission Matrix ──────────────────────────────────────────────────────

const matrix = {

    // ── Patient Domain ──────────────────────────────────────────────

    patients: {
        // Staff-side internal (mounted under /patient/domain/internal)
        "GET:/internal/patients/next-code":   P.PATIENTS_READ,
        "POST:/internal/patients":            P.PATIENTS_CREATE,
        "GET:/internal/patients":             P.PATIENTS_READ,

        // Legacy + sovereign patient management (mounted under /patient/domain)
        "GET:/":                              P.PATIENTS_READ,
        "POST:/":                             P.PATIENTS_CREATE,
        "GET:/search":                        P.PATIENTS_READ,
        "POST:/quick":                        P.PATIENTS_CREATE,
        "POST:/:id/family":                   P.PATIENTS_UPDATE,
        "GET:/:id/family":                    P.PATIENTS_READ,
        "DELETE:/:id/family/:memberId":       P.PATIENTS_UPDATE,
        "POST:/:id/tags":                     P.PATIENTS_UPDATE,
        "DELETE:/:id/tags/:tag":              P.PATIENTS_UPDATE,
        "POST:/intelligence/run":             P.PATIENTS_UPDATE,
        "POST:/bulk":                         P.PATIENTS_UPDATE,
        "POST:/:id/intake-link":              P.PORTAL_MANAGE,
        "GET:/:id":                           P.PATIENTS_READ,
        "PUT:/:id":                           P.PATIENTS_UPDATE,
        "PATCH:/:id":                         P.PATIENTS_UPDATE,
        "DELETE:/:id":                        P.PATIENTS_DELETE,
        "GET:/:id/clinical":                  P.PATIENTS_READ,
        "PUT:/:id/clinical":                  P.PATIENTS_UPDATE,
        "PUT:/policies":                      P.PATIENTS_UPDATE,
    },

    // ── Appointments ────────────────────────────────────────────────

    appointments: {
        "GET:/availability":                  P.APPOINTMENTS_READ,
        "GET:/":                              P.APPOINTMENTS_READ,
        "GET:/calendar":                      P.CALENDAR_READ,
        "PATCH:/:id/status":                  P.APPOINTMENTS_UPDATE,
        "GET:/:id":                           P.APPOINTMENTS_READ,
        "POST:/":                             P.APPOINTMENTS_CREATE,
        "PUT:/:id":                           P.APPOINTMENTS_UPDATE,
        "DELETE:/:id":                        P.APPOINTMENTS_DELETE,
    },

    // ── Recalls ─────────────────────────────────────────────────────

    recalls: {
        "GET:/":                              P.RECALLS_READ,
        "GET:/:id":                           P.RECALLS_READ,
        "POST:/":                             P.RECALLS_CREATE,
        "PATCH:/:id/status":                  P.RECALLS_UPDATE,
    },

    // ── Families ────────────────────────────────────────────────────

    families: {
        "GET:/:id/members":                   P.FAMILIES_READ,
        "DELETE:/members/:memberId":          P.FAMILIES_UPDATE,
    },

    // ── Treatments ──────────────────────────────────────────────────

    treatments: {
        "GET:/":                              P.TREATMENTS_READ,
        "GET:/:id":                           P.TREATMENTS_READ,
        "POST:/":                             P.TREATMENTS_CREATE,
        "PATCH:/:id/status":                  P.TREATMENTS_UPDATE,
        "GET:/plans":                         P.TREATMENTS_READ,
        "GET:/plans/:id":                     P.TREATMENTS_READ,
        "POST:/plans":                        P.TREATMENTS_CREATE,
    },

    // ── Procedures ──────────────────────────────────────────────────

    procedures: {
        "GET:/":                              P.PROCEDURES_READ,
        "GET:/:id":                           P.PROCEDURES_READ,
        "POST:/":                             P.PROCEDURES_CREATE,
        "PUT:/:id":                           P.PROCEDURES_UPDATE,
        "DELETE:/:id":                        P.PROCEDURES_DELETE,
    },

    // ── Invoices ────────────────────────────────────────────────────

    invoices: {
        "GET:/":                              P.INVOICES_READ,
        "GET:/:id":                           P.INVOICES_READ,
        "POST:/":                             P.INVOICES_CREATE,
        "POST:/:id/void":                     P.INVOICES_DELETE,
    },

    // ── Payments ────────────────────────────────────────────────────

    payments: {
        "GET:/":                              P.PAYMENTS_READ,
        "GET:/:id":                           P.PAYMENTS_READ,
        "POST:/":                             P.PAYMENTS_CREATE,
    },

    // ── Branches ────────────────────────────────────────────────────

    branches: {
        "POST:/":                             P.BRANCHES_CREATE,
        "GET:/":                              P.BRANCHES_READ,
        "GET:/:id":                           P.BRANCHES_READ,
        "PATCH:/:id":                         P.BRANCHES_UPDATE,
        "DELETE:/:id":                        P.BRANCHES_DELETE,
    },

    // ── Users ───────────────────────────────────────────────────────

    users: {
        "POST:/":                             P.USERS_CREATE,
        "GET:/":                              P.USERS_READ,
        "GET:/practitioners":                 P.USERS_READ,
        "GET:/check-username":               P.USERS_CREATE,
        "GET:/:id":                           P.USERS_READ,
        "PATCH:/:id":                         P.USERS_UPDATE,
        "DELETE:/:id":                        P.USERS_DELETE,
    },

    // ── Orthodontics ────────────────────────────────────────────────

    orthodontics: {
        "GET:/":                              P.ORTHO_READ,
        "GET:/:id":                           P.ORTHO_READ,
        "POST:/":                             P.ORTHO_FULL,
        "PATCH:/:id/status":                  P.ORTHO_FULL,
        "GET:/:caseId/scans":                 P.ORTHO_READ,
        "POST:/:caseId/scans":                P.ORTHO_FULL,
        "POST:/:caseId/analysis/segmentation":  P.ORTHO_FULL,
        "GET:/:caseId/analysis/segmentation":   P.ORTHO_READ,
        "POST:/:caseId/analysis/cephalometric": P.ORTHO_FULL,
        "GET:/:caseId/analysis/cephalometric":  P.ORTHO_READ,
        "GET:/:caseId/aligner-plans":         P.ORTHO_READ,
        "POST:/:caseId/aligner-plans":        P.ORTHO_FULL,
        "GET:/aligner-plans/:id":             P.ORTHO_READ,
        "GET:/:caseId/workflow":              P.ORTHO_READ,
        "PUT:/:caseId/workflow":              P.ORTHO_FULL,
        "GET:/:caseId/snapshots":             P.ORTHO_READ,
        "GET:/:caseId/snapshots/:snapshotId": P.ORTHO_READ,
        "POST:/uploads/photo":                P.ORTHO_FULL,
        "POST:/uploads/stl":                  P.ORTHO_FULL,
        "POST:/uploads/audio":                P.ORTHO_FULL,
        "POST:/:caseId/share":                P.ORTHO_FULL,
        "GET:/:caseId/export":                P.ORTHO_READ,
    },

    // ── Finance / Accounting ────────────────────────────────────────

    finance: {
        "GET:/summary/daily":                 P.ACCOUNTING_READ,
        "GET:/summary/monthly":               P.ACCOUNTING_READ,
        "GET:/outstanding":                   P.ACCOUNTING_READ,
    },

    // ── Analytics ───────────────────────────────────────────────────

    analytics: {
        "GET:/":                              P.ACCOUNTING_READ,
    },

    // ── Patient Portal (staff-side) ─────────────────────────────────

    portalMonitoring: {
        "GET:/photos":                        P.PORTAL_READ,
        "GET:/monitoring":                    P.PORTAL_READ,
        "GET:/monitoring/:id":                P.PORTAL_READ,
        "PATCH:/monitoring/:id/review":       P.MONITORING_REVIEW,
        "POST:/messages/staff":               P.PORTAL_MANAGE,
        "GET:/messages":                      P.PORTAL_READ,
    },

    // ── Booking Approval ────────────────────────────────────────────

    bookingApproval: {
        "GET:/":                              P.APPOINTMENTS_READ,
        "POST:/:id/approve":                  P.APPOINTMENTS_UPDATE,
        "POST:/:id/reject":                   P.APPOINTMENTS_UPDATE,
    },

    // ── Authorization ───────────────────────────────────────────────

    authorization: {
        // GET /permissions is AUTH_ONLY — self-introspection, no permission guard needed
        // "GET:/permissions":                — intentionally excluded
        "GET:/visibility-debug":              P.STAFF_MANAGE,
        "GET:/users/:userId/visibility":      P.STAFF_MANAGE,
        "PUT:/users/:userId/visibility":      P.STAFF_MANAGE,
        "DELETE:/users/:userId/visibility":    P.STAFF_MANAGE,
    },

    // ── Organization (Legacy Routes — being migrated) ───────────────

    organization: {
        "POST:/":                             P.STAFF_MANAGE,
        "PUT:/appointment-settings":          P.STAFF_MANAGE,
        "GET:/settings":                      P.STAFF_MANAGE,
        "PUT:/settings":                      P.STAFF_MANAGE,
        "POST:/billing/portal":               P.ACCOUNTING_UPDATE,
    },

    // ── Add-On (Legacy Routes — being migrated) ─────────────────────

    addOn: {
        "POST:/purchase":                     P.ACCOUNTING_UPDATE,
        "DELETE:/:id":                        P.ACCOUNTING_DELETE,
    },

    // ── Security Control Center ─────────────────────────────────────

    security: {
        "GET:/overview":                      P.SECURITY_MANAGE,
        "GET:/permissions":                   P.SECURITY_MANAGE,
        "GET:/matrix":                        P.SECURITY_MANAGE,
        "GET:/policies":                      P.SECURITY_MANAGE,
        "GET:/fields":                        P.SECURITY_MANAGE,
        "GET:/coverage":                      P.SECURITY_MANAGE,
        "GET:/logs":                          P.SECURITY_MANAGE,
        "POST:/simulate":                     P.SECURITY_MANAGE,
    },
};

// ─── Flattened Index (for runtime lookups) ──────────────────────────────────

/**
 * Flatten the matrix into a Map for O(1) lookups.
 * Key format: "METHOD:normalized_path"
 * Value: permission string (e.g., "patients.read")
 */
function buildFlatIndex(matrixObj) {
    const index = new Map();
    for (const [module, routes] of Object.entries(matrixObj)) {
        for (const [key, perm] of Object.entries(routes)) {
            // key is "METHOD:/path"
            index.set(`${module}::${key}`, perm);
        }
    }
    return index;
}

const flatIndex = buildFlatIndex(matrix);

// ─── Route Matching ─────────────────────────────────────────────────────────

/**
 * Normalize a request path into a template path for matrix lookup.
 * E.g., "/patients/abc123" → "/:id"
 *       "/patients/abc123/clinical" → "/:id/clinical"
 *       "/uploads/stl" → "/uploads/stl"
 *
 * @param {string} actualPath — the actual request path
 * @param {string[]} templatePaths — known template paths for this module
 * @returns {string|null} — matching template path or null
 */
function matchTemplatePath(actualPath, templatePaths) {
    for (const template of templatePaths) {
        const templateParts = template.split("/");
        const actualParts = actualPath.split("/");

        if (templateParts.length !== actualParts.length) continue;

        let match = true;
        for (let i = 0; i < templateParts.length; i++) {
            if (templateParts[i].startsWith(":")) continue;
            if (templateParts[i] !== actualParts[i]) {
                match = false;
                break;
            }
        }

        if (match) return template;
    }

    return null;
}

/**
 * Look up the expected permission for a given module, method, and path.
 *
 * @param {string} moduleName — e.g., "patients"
 * @param {string} method — e.g., "GET"
 * @param {string} path — e.g., "/abc123" or "/:id"
 * @returns {string|null} — expected permission string or null if not in matrix
 */
function getExpectedPermission(moduleName, method, path) {
    const moduleMatrix = matrix[moduleName];
    if (!moduleMatrix) return null;

    // Direct lookup first (template path)
    const directKey = `${method.toUpperCase()}:${path}`;
    if (moduleMatrix[directKey]) return moduleMatrix[directKey];

    // Template matching (actual path → template path)
    const templatePaths = Object.keys(moduleMatrix)
        .filter(k => k.startsWith(`${method.toUpperCase()}:`))
        .map(k => k.split(":").slice(1).join(":"));

    const matched = matchTemplatePath(path, templatePaths);
    if (matched) {
        return moduleMatrix[`${method.toUpperCase()}:${matched}`];
    }

    return null;
}

// ─── Statistics ─────────────────────────────────────────────────────────────

function getMatrixStats() {
    let totalRoutes = 0;
    const moduleStats = {};

    for (const [module, routes] of Object.entries(matrix)) {
        const count = Object.keys(routes).length;
        totalRoutes += count;
        moduleStats[module] = count;
    }

    const uniquePermissions = new Set(flatIndex.values()).size;

    return { totalRoutes, moduleStats, uniquePermissions, moduleCount: Object.keys(matrix).length };
}

// ─── Exports ────────────────────────────────────────────────────────────────

module.exports = {
    matrix,
    flatIndex,
    getExpectedPermission,
    matchTemplatePath,
    getMatrixStats,
};
