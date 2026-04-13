/**
 * fieldWriteGuard.js — Write-Side Field Protection Middleware (v3.0 DUAL MODE)
 *
 * Complements fieldFilter.js (read-side) by guarding requests that contain
 * fields the user's role is not permitted to write.
 *
 * v3.0 DUAL MODE CHANGES (Phase 20 — TASK-AUTH-INT-004):
 *   - Enforcement mode control: STRICT (reject) vs WARN (strip + continue)
 *   - Mode configured via FIELD_WRITE_GUARD_MODE env var
 *   - Default: "strict" (production-safe)
 *   - WARN mode: strips forbidden fields, logs warning, continues request
 *
 * v2.0 STRICT CHANGES (Phase 19):
 *   - FIX-1: STRICT MODE — Rejects with 403 instead of silent stripping
 *   - FIX-2: Deep field validation — flattens nested objects for path-based checking
 *   - FIX-3: Role coverage enforcement — throws if role has no field access defined
 *   - FIX-4: Auth trace integration — emits FIELD_WRITE step to req.authTrace
 *
 * Enforcement Modes:
 *   strict — 403 reject on forbidden fields (production default)
 *   warn   — strip forbidden fields, log WARN, emit auth trace WARN, continue
 *
 * Environment Variables:
 *   FIELD_WRITE_GUARD_MODE — "strict" | "warn" (default: "strict")
 *
 * Flow:
 *   req.body → fieldWriteGuardMiddleware → 403 (strict) / strip (warn) / next()
 *
 * Features:
 *   - Whitelist-based: only allowed fields survive
 *   - Role-aware: uses same role extraction as fieldFilter
 *   - Dual mode: strict (reject) or warn (strip + log)
 *   - Deep: flattens nested objects so "address.city" is checked individually
 *   - Audit-friendly: logs violations with FIELD_ACCESS_VIOLATION event
 *   - Auth trace: emits FIELD_WRITE step for observability
 *   - Configurable: per-resource, per-role definitions
 *
 * PLANE: Org only.
 */

"use strict";

const { extractRole } = require("./fieldFilter");
const logger = require("@utils/logger");
const { markFLSWriteApplied } = require("../core/guards/flowMarkers");

// ─── JWT-Aware Role Extractor ────────────────────────────────────────────────
// Architecture Rule: role MUST come from req.context.roleName (JWT SSOT).
// req.user.roleId is NEVER populated (banned since Phase 6).
// extractRole(req.user) is kept only as a last-resort fallback for test contexts.
function jwtAwareExtractRole(req) {
    return (
        req?.context?.roleName ||          // ✅ JWT SSOT (primary)
        extractRole(req?.user) ||          // 🚧 legacy fallback for test stubs
        null
    );
}

// ─── Deep Field Flattener (FIX-2) ──────────────────────────────────────────
//
// Recursively flattens nested objects into dot-notation paths.
// This prevents attackers from bypassing field checks by nesting
// forbidden fields inside objects.
//
// Example:
//   { name: "test", address: { city: "Cairo", zip: "12345" } }
//   → ["name", "address.city", "address.zip"]

/**
 * Flatten a nested object into an array of dot-notation paths.
 *
 * @param {Object} obj — the object to flatten
 * @param {string} [prefix=""] — current path prefix
 * @returns {string[]} — array of dot-notation field paths
 */
function flattenFieldPaths(obj, prefix = "") {
    if (!obj || typeof obj !== "object") return [];

    return Object.keys(obj).reduce((acc, key) => {
        const path = prefix ? `${prefix}.${key}` : key;
        const value = obj[key];

        // Recurse into plain objects (not arrays, dates, ObjectIds, etc.)
        if (
            value !== null &&
            typeof value === "object" &&
            !Array.isArray(value) &&
            !(value instanceof Date) &&
            !value._bsontype // Skip MongoDB ObjectId
        ) {
            return [...acc, ...flattenFieldPaths(value, path)];
        }

        return [...acc, path];
    }, []);
}

// ─── Write Access Definitions (Phase X.3 — Modular) ─────────────────────────
// All per-resource, per-role write rules are now split into src/rbac/writeGuards/.
const writeAccess = require("./writeGuards");

// ─── Core Write Guard (v2.0 STRICT) ────────────────────────────────────────

/**
 * Validate write fields against the whitelist (STRICT MODE).
 * Returns invalid fields instead of stripping them.
 *
 * @param {string} resourceType — e.g., "patient", "invoice"
 * @param {Object} user — the authenticated user (req.user)
 * @param {Object} body — the request body to validate
 * @param {string} [preResolvedRole] — optional pre-resolved role (JWT SSOT path)
 * @returns {{ valid: boolean, invalidFields: string[], role: string|null }}
 */
function guardWriteFields(resourceType, user, body, preResolvedRole) {
    if (!body || typeof body !== "object") {
        return { valid: true, invalidFields: [], role: preResolvedRole || extractRole(user) };
    }

    // Use pre-resolved role (from JWT SSOT) if available, fallback to legacy extraction
    const role = preResolvedRole || extractRole(user);
    if (!role) {
        return { valid: false, invalidFields: Object.keys(body), role: null };
    }

    // Get write rules for this resource + role
    const resourceRules = writeAccess[resourceType];
    if (!resourceRules) {
        // No write rules defined — pass through (resource not registered)
        return { valid: true, invalidFields: [], role };
    }

    const allowedFields = resourceRules[role];

    // FIX-3: Role coverage enforcement — no definition = denied
    if (!allowedFields) {
        const bodyKeys = flattenFieldPaths(body);
        return { valid: bodyKeys.length === 0, invalidFields: bodyKeys, role };
    }

    // Full write access → pass through
    if (allowedFields.length === 1 && allowedFields[0] === "*") {
        return { valid: true, invalidFields: [], role };
    }

    // FIX-2: Deep field validation — flatten nested objects
    const bodyPaths = flattenFieldPaths(body);
    const allowSet = new Set(allowedFields);

    // Check each field path: allow if the field itself or its top-level parent is allowed
    const invalidFields = bodyPaths.filter(path => {
        // Direct match
        if (allowSet.has(path)) return false;

        // Top-level parent match (e.g., "insurance.provider" is allowed if "insurance" is allowed)
        const topLevel = path.split(".")[0];
        if (allowSet.has(topLevel)) return false;

        return true; // Not allowed
    });

    return { valid: invalidFields.length === 0, invalidFields, role };
}

// ─── Enforcement Mode (v3.0 Phase 20) ───────────────────────────────────────

/**
 * Get the current enforcement mode.
 * @returns {"strict" | "warn"}
 */
function getEnforcementMode() {
    const mode = (process.env.FIELD_WRITE_GUARD_MODE || "strict").toLowerCase();
    if (mode === "warn") return "warn";
    return "strict"; // Default: production-safe
}

/**
 * Strip forbidden fields from a body object.
 * Uses dot-notation paths to remove nested keys.
 *
 * @param {Object} body — req.body to mutate
 * @param {string[]} invalidFields — dot-notation paths to remove
 */
function _stripFields(body, invalidFields) {
    for (const path of invalidFields) {
        const parts = path.split(".");
        let current = body;
        for (let i = 0; i < parts.length - 1; i++) {
            if (current == null || typeof current !== "object") break;
            current = current[parts[i]];
        }
        if (current != null && typeof current === "object") {
            delete current[parts[parts.length - 1]];
        }
    }
}

// ─── Middleware Factory (v3.0 DUAL MODE) ────────────────────────────────────

/**
 * Express middleware that guards forbidden field writes.
 *
 * Enforcement modes:
 *   strict — 403 reject (default, production-safe)
 *   warn   — strip forbidden fields, log WARN, continue to next()
 *
 * @param {string} resourceType — e.g., "patient", "invoice"
 * @returns {import("express").RequestHandler}
 *
 * @example
 *   const { fieldWriteGuardMiddleware } = require("@rbac/fieldWriteGuard");
 *
 *   router.put("/:id",
 *     orgProtect,
 *     requireOrgPermission(P.PATIENTS_UPDATE),
 *     policyMiddleware(P.PATIENTS_UPDATE, getResource),
 *     fieldWriteGuardMiddleware("patient"),
 *     controller.updatePatient
 *   );
 */
function fieldWriteGuardMiddleware(resourceType) {
    return function writeGuard(req, res, next) {
        // ── Drift Detection: mark FLS write applied ──
        markFLSWriteApplied(req);

        // Only guard write methods
        if (!["POST", "PUT", "PATCH"].includes(req.method)) {
            // Emit auth trace for non-write methods (skip)
            if (typeof req.addAuthTrace === "function") {
                req.addAuthTrace({
                    layer: "FIELD_WRITE",
                    resource: resourceType,
                    result: "SKIP",
                    reason: `Method ${req.method} is not a write operation`,
                });
            }
            return next();
        }

        // Skip if no body
        if (!req.body || Object.keys(req.body).length === 0) {
            if (typeof req.addAuthTrace === "function") {
                req.addAuthTrace({
                    layer: "FIELD_WRITE",
                    resource: resourceType,
                    result: "SKIP",
                    reason: "Empty request body",
                });
            }
            return next();
        }

        // Skip for full-access roles (optimization)
        // ✅ JWT SSOT: role from req.context.roleName, not req.user.roleId
        const role = jwtAwareExtractRole(req);
        if (role) {
            const rules = writeAccess[resourceType];
            if (rules && rules[role] && rules[role].length === 1 && rules[role][0] === "*") {
                if (typeof req.addAuthTrace === "function") {
                    req.addAuthTrace({
                        layer: "FIELD_WRITE",
                        resource: resourceType,
                        result: "ALLOW",
                        reason: "Full write access (wildcard)",
                        details: { role },
                    });
                }
                return next();
            }
        }

        // Validate fields — pass role directly to bypass req.user.roleId lookup
        const result = guardWriteFields(resourceType, req.user, req.body, role);

        // Determine enforcement mode
        const mode = getEnforcementMode();

        // Handle forbidden fields
        if (!result.valid && result.invalidFields.length > 0) {
            // Log the violation (always, regardless of mode)
            logger.warn({
                type: "FIELD_ACCESS_VIOLATION",
                event: mode === "strict" ? "FIELD_WRITE_GUARD_DENIED" : "FIELD_WRITE_GUARD_WARNED",
                enforcementMode: mode,
                resourceType,
                role: result.role,
                userId: req.user?._id,
                invalidFields: result.invalidFields,
                invalidCount: result.invalidFields.length,
                endpoint: `${req.method} ${req.route?.path || req.originalUrl}`,
                requestId: req.requestId,
            }, `[FieldWriteGuard] ${mode.toUpperCase()} — ${result.invalidFields.length} forbidden field(s) in ${resourceType} write: ${result.invalidFields.join(", ")}`);

            // ── WARN MODE — Strip forbidden fields and continue ──────────
            if (mode === "warn") {
                // Emit auth trace WARN (not DENY — request continues)
                if (typeof req.addAuthTrace === "function") {
                    req.addAuthTrace({
                        layer: "FIELD_WRITE",
                        resource: resourceType,
                        result: "WARN",
                        reason: `WARN mode: stripped forbidden fields: ${result.invalidFields.join(", ")}`,
                        details: {
                            enforcementMode: "warn",
                            role: result.role,
                            strippedFields: result.invalidFields,
                        },
                    });
                }

                // Strip the forbidden fields from body
                _stripFields(req.body, result.invalidFields);

                // Attach metadata (with strippedFields for downstream auditing)
                req._writeGuard = {
                    resourceType,
                    role: result.role,
                    invalidFields: result.invalidFields,
                    strippedFields: result.invalidFields,
                    allowed: true, // allowed = true because request continues
                    enforcementMode: "warn",
                };

                return next();
            }

            // ── STRICT MODE (default) — Reject with 403 ─────────────────
            // Emit auth trace DENY
            if (typeof req.addAuthTrace === "function") {
                req.addAuthTrace({
                    layer: "FIELD_WRITE",
                    resource: resourceType,
                    result: "DENY",
                    reason: `Forbidden fields: ${result.invalidFields.join(", ")}`,
                    details: {
                        enforcementMode: "strict",
                        role: result.role,
                        invalidFields: result.invalidFields,
                    },
                });
            }

            // Attach write guard metadata
            req._writeGuard = {
                resourceType,
                role: result.role,
                invalidFields: result.invalidFields,
                allowed: false,
                enforcementMode: "strict",
            };

            // 403 REJECT — no silent stripping in strict mode
            return res.status(403).json({
                success: false,
                error: {
                    code: "FIELD_ACCESS_DENIED",
                    message: "You are not authorized to modify the following fields.",
                    invalidFields: result.invalidFields,
                },
            });
        }

        // ALLOW — all fields valid
        if (typeof req.addAuthTrace === "function") {
            req.addAuthTrace({
                layer: "FIELD_WRITE",
                resource: resourceType,
                result: "ALLOW",
                reason: "All fields permitted",
                details: { role: result.role, enforcementMode: mode },
            });
        }

        // Attach metadata for downstream introspection
        req._writeGuard = {
            resourceType,
            role: result.role,
            invalidFields: [],
            allowed: true,
            enforcementMode: mode,
        };

        next();
    };
}

// ─── Registry Introspection ─────────────────────────────────────────────────

/**
 * Get all resource types that have write access definitions.
 */
function getWriteResourceTypes() {
    return Object.keys(writeAccess);
}

/**
 * Get write-allowed fields for a specific resource + role.
 */
function getWriteFields(resourceType, role) {
    return writeAccess[resourceType]?.[role] || undefined;
}

// ─── Exports ────────────────────────────────────────────────────────────────

module.exports = {
    guardWriteFields,
    fieldWriteGuardMiddleware,
    getWriteResourceTypes,
    getWriteFields,
    getEnforcementMode,
    writeAccess,
    flattenFieldPaths,
};
