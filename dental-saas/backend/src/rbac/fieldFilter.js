/**
 * fieldFilter.js — Field-Level Response Filtering
 *
 * Strips sensitive fields from API responses based on the user's role.
 * Applied in controllers AFTER data fetching, BEFORE response.
 *
 * Features:
 *   - Whitelist-based (only allowed fields pass through)
 *   - Handles plain objects and Mongoose documents
 *   - Supports arrays of resources (batch filtering)
 *   - Deep-safe: doesn't crash on null/undefined
 *   - Audit-friendly: returns filter metadata
 *
 * Usage:
 *   const { filterFields } = require("@rbac/fieldFilter");
 *
 *   const safeData = filterFields("patient", req.user, patient.toObject());
 *   res.json({ success: true, data: safeData });
 *
 * PLANE: Org only.
 */

"use strict";

const { fieldAccess, hasFullAccess } = require("./fieldAccessRegistry");
const { markFLSReadApplied } = require("../core/guards/flowMarkers");

// ─── Auth Helper (JWT SSOT) ──────────────────────────────────────────────────
// Phase Auth-SSOT: Role MUST come from the JWT (req.context.roleName),
// never from req.user.roleId (unpopulated since Phase 6) or req.user.role.
const { getRole } = require("@utils/auth/getRole");

// ─── Core Filter ────────────────────────────────────────────────────────────

/**
 * Filter a single resource object by role-allowed fields.
 *
 * @param {string} resourceType — e.g., "patient", "invoice"
 * @param {Object} user — the authenticated user (req.user)
 * @param {Object} data — the resource data (plain object)
 * @returns {{ data: Object, filtered: boolean, fieldsRemoved: number }}
 */
function filterFields(resourceType, user, data) {
    // Null safety
    if (!data) return { data: null, filtered: false, fieldsRemoved: 0, allowedFields: null };

    // filterFields is called outside middleware context — use req.__flsRole if set,
    // otherwise attempt legacy extraction (for direct controller calls).
    const role = (user?.__flsRoleOverride) || user?.roleId?.name || user?.role || null;
    if (!role) return { data: {}, filtered: true, fieldsRemoved: Object.keys(data).length, allowedFields: [] };

    // Get field rules for this resource + role
    const resourceRules = fieldAccess[resourceType];
    if (!resourceRules) {
        // No field rules defined — pass through (resource not registered)
        return { data, filtered: false, fieldsRemoved: 0, allowedFields: null };
    }

    const allowedFields = resourceRules[role];

    // No access definition for this role → return empty (deny)
    if (!allowedFields) {
        return { data: {}, filtered: true, fieldsRemoved: Object.keys(data).length, allowedFields: [] };
    }

    // Full access → pass through
    if (allowedFields.length === 1 && allowedFields[0] === "*") {
        return { data, filtered: false, fieldsRemoved: 0, allowedFields: null };
    }

    // Whitelist filter
    const allowSet = new Set(allowedFields);
    const result = {};
    let removed = 0;

    for (const [key, value] of Object.entries(data)) {
        if (allowSet.has(key)) {
            result[key] = value;
        } else {
            removed++;
        }
    }

    return { data: result, filtered: true, fieldsRemoved: removed, allowedFields: [...allowedFields] };
}

// ─── Array Filter ───────────────────────────────────────────────────────────

/**
 * Filter an array of resources by role-allowed fields.
 *
 * @param {string} resourceType
 * @param {Object} user
 * @param {Object[]} items — array of resource objects
 * @returns {{ data: Object[], filtered: boolean, totalFieldsRemoved: number, allowedFields: string[]|null }}
 */
function filterFieldsArray(resourceType, user, items) {
    if (!Array.isArray(items)) return { data: [], filtered: false, totalFieldsRemoved: 0, allowedFields: null };

    let totalRemoved = 0;
    let anyFiltered = false;
    let allowedFields = null;

    const filtered = items.map((item, index) => {
        const result = filterFields(resourceType, user, item);
        if (result.filtered) anyFiltered = true;
        totalRemoved += result.fieldsRemoved;
        // Capture allowedFields from first item (consistent across array)
        if (index === 0) allowedFields = result.allowedFields;
        return result.data;
    });

    return { data: filtered, filtered: anyFiltered, totalFieldsRemoved: totalRemoved, allowedFields };
}

// ─── Mongoose Document Helper ───────────────────────────────────────────────

/**
 * Convert a Mongoose document (or array) to a filtered plain object.
 * Convenience wrapper that handles .toObject() conversion.
 *
 * @param {string} resourceType
 * @param {Object} user
 * @param {Object|Object[]} docOrDocs — Mongoose document(s)
 * @returns {Object|Object[]} — filtered plain object(s)
 */
function filterDocument(resourceType, user, docOrDocs) {
    if (Array.isArray(docOrDocs)) {
        const plain = docOrDocs.map(d => (d?.toObject ? d.toObject() : d));
        return filterFieldsArray(resourceType, user, plain).data;
    }

    const plain = docOrDocs?.toObject ? docOrDocs.toObject() : docOrDocs;
    return filterFields(resourceType, user, plain).data;
}

// ─── Middleware Factory ─────────────────────────────────────────────────────

/**
 * Express middleware that auto-filters res.json() on specific resource types.
 * Wraps the original res.json to apply field filtering transparently.
 *
 * @param {string} resourceType
 * @param {string} [dataKey="data"] — key in response body containing the resource
 * @returns {import("express").RequestHandler}
 *
 * @example
 *   router.get("/:id",
 *     orgProtect,
 *     requireOrgPermission(P.PATIENTS_READ),
 *     fieldFilterMiddleware("patient"),
 *     controller.getPatient
 *   );
 */
function fieldFilterMiddleware(resourceType, dataKey = "data") {
    return function fieldFilterGuard(req, res, next) {
        // Skip if user has full access (optimization)
        const role = getRole(req);
        if (role && hasFullAccess(resourceType, role)) {
            // ── Auth Trace: FIELD_READ SKIP (full access) ──
            if (typeof req.addAuthTrace === "function") {
                req.addAuthTrace({
                    layer: "FIELD_READ",
                    resource: resourceType,
                    result: "ALLOW",
                    reason: "Full read access (wildcard)",
                    details: { role },
                });
            }
            // ── Drift Detection: mark FLS read applied (full access path) ──
            markFLSReadApplied(req);
            return next();
        }

        // ── Drift Detection: mark FLS read applied (whitelist path) ──
        markFLSReadApplied(req);

        // Wrap res.json to intercept and filter
        const originalJson = res.json.bind(res);
        res.json = function (body) {
            if (body && body[dataKey]) {
                let filterResult;
                let allowedFieldsForResponse = null;

                if (Array.isArray(body[dataKey])) {
                    filterResult = filterFieldsArray(resourceType, req.user, body[dataKey]);
                    body[dataKey] = filterResult.data;
                    // Use first item's allowed fields (consistent across array)
                    allowedFieldsForResponse = filterResult.allowedFields || null;
                } else {
                    filterResult = filterFields(resourceType, req.user, body[dataKey]);
                    body[dataKey] = filterResult.data;
                    allowedFieldsForResponse = filterResult.allowedFields || null;
                }

                // ── Inject capabilities.visibleFields into response ──
                if (allowedFieldsForResponse !== null) {
                    body.capabilities = {
                        ...(body.capabilities || {}),
                        visibleFields: allowedFieldsForResponse,
                        resource: resourceType,
                    };
                }

                // ── Auth Trace: FIELD_READ FILTER_APPLIED ──
                if (typeof req.addAuthTrace === "function") {
                    req.addAuthTrace({
                        layer: "FIELD_READ",
                        resource: resourceType,
                        result: filterResult.filtered ? "FILTER_APPLIED" : "ALLOW",
                        reason: filterResult.filtered
                            ? `${filterResult.fieldsRemoved || filterResult.totalFieldsRemoved || 0} field(s) stripped`
                            : "No filtering needed",
                        details: { role },
                    });
                }
            }
            return originalJson(body);
        };

        next();
    };
}

// ─── Aggregate Result Filter (Phase F.10) ───────────────────────────────────

/**
 * Filter aggregate pipeline results through FLS.
 * Each row in the aggregate output is filtered by the user's role.
 *
 * @param {string} resourceType — e.g., "patient", "analytics"
 * @param {Object} user — the authenticated user (req.user)
 * @param {Object[]} results — aggregate pipeline output
 * @returns {{ data: Object[], filtered: boolean, totalFieldsRemoved: number, capabilities: Object|null }}
 *
 * @example
 *   const raw = await SecureModel.aggregate(pipeline);
 *   const { data, capabilities } = filterAggregateResults("treatment", req.user, raw);
 *   res.json({ success: true, data, ...(capabilities ? { capabilities } : {}) });
 */
function filterAggregateResults(resourceType, user, results) {
    if (!Array.isArray(results) || results.length === 0) {
        return { data: results || [], filtered: false, totalFieldsRemoved: 0, capabilities: null };
    }

    // filterFieldsBatch: called without req — derive role from user properties
    const role = user?.roleId?.name || user?.role || null;
    if (!role) {
        return { data: [], filtered: true, totalFieldsRemoved: results.length, capabilities: { visibleFields: [], resource: resourceType } };
    }

    // Check for full access (optimization)
    if (hasFullAccess(resourceType, role)) {
        return { data: results, filtered: false, totalFieldsRemoved: 0, capabilities: null };
    }

    const arrayResult = filterFieldsArray(resourceType, user, results);

    return {
        data: arrayResult.data,
        filtered: arrayResult.filtered,
        totalFieldsRemoved: arrayResult.totalFieldsRemoved,
        capabilities: arrayResult.allowedFields
            ? { visibleFields: arrayResult.allowedFields, resource: resourceType }
            : null,
    };
}

// ─── Exports ────────────────────────────────────────────────────────────────

/**
 * extractRole — backwards-compat helper for fieldWriteGuard.js.
 * Reads role from a user object (req.user), NOT from req.context.
 * New code should use getRole(req) from @utils/auth/getRole instead.
 *
 * @param {Object} user — req.user
 * @returns {string|null}
 */
function extractRole(user) {
    return user?.__flsRoleOverride || user?.roleId?.name || user?.role || null;
}

module.exports = {
    filterFields,
    filterFieldsArray,
    filterDocument,
    filterAggregateResults,
    fieldFilterMiddleware,
    extractRole,
};
