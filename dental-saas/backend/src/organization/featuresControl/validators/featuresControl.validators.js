/**
 * featuresControl.validators.js — Request Validation Middleware
 *
 * Input validation for all Features Control Center endpoints.
 * Uses manual validation (no external libs) for consistency with
 * the existing codebase patterns.
 *
 * PLANE: Org only.
 */

"use strict";

// ─── Toggle Module Validator ────────────────────────────────────────────────

/**
 * Validates PATCH /modules/:key body
 * Required: { enabled: boolean }
 * Params:   :key (alphanumeric string)
 */
function validateToggleModule(req, res, next) {
    const { key } = req.params;
    const { enabled } = req.body;

    if (!key || typeof key !== "string" || !/^[a-zA-Z0-9_]+$/.test(key)) {
        return res.status(400).json({
            success: false,
            error: { code: "INVALID_MODULE_KEY", message: "Module key must be an alphanumeric string." },
        });
    }

    if (typeof enabled !== "boolean") {
        return res.status(400).json({
            success: false,
            error: { code: "INVALID_ENABLED", message: "enabled must be a boolean value." },
        });
    }

    next();
}

// ─── Simulate Decision Validator ────────────────────────────────────────────

/**
 * Validates POST /inspect body
 * Required: { permission: string }
 * Optional: { resourceId: string }
 */
function validateInspect(req, res, next) {
    const { permission, resourceId } = req.body;

    if (!permission || typeof permission !== "string") {
        return res.status(400).json({
            success: false,
            error: { code: "INVALID_PERMISSION", message: "permission must be a non-empty string." },
        });
    }

    // Permission format: "module.action"
    if (!/^[a-zA-Z0-9_]+\.[a-zA-Z0-9_]+$/.test(permission)) {
        return res.status(400).json({
            success: false,
            error: { code: "INVALID_PERMISSION_FORMAT", message: "permission must follow 'module.action' format." },
        });
    }

    if (resourceId !== undefined && typeof resourceId !== "string") {
        return res.status(400).json({
            success: false,
            error: { code: "INVALID_RESOURCE_ID", message: "resourceId must be a string if provided." },
        });
    }

    next();
}

// ─── Batch Inspect Validator ────────────────────────────────────────────────

/**
 * Validates POST /inspect/batch body
 * Required: { permissions: string[] }
 */
function validateInspectBatch(req, res, next) {
    const { permissions } = req.body;

    if (!Array.isArray(permissions)) {
        return res.status(400).json({
            success: false,
            error: { code: "INVALID_PERMISSIONS", message: "permissions must be an array of strings." },
        });
    }

    if (permissions.length === 0) {
        return res.status(400).json({
            success: false,
            error: { code: "EMPTY_PERMISSIONS", message: "permissions array must not be empty." },
        });
    }

    if (permissions.length > 25) {
        return res.status(400).json({
            success: false,
            error: { code: "BATCH_TOO_LARGE", message: "Maximum 25 permissions per batch." },
        });
    }

    for (const p of permissions) {
        if (typeof p !== "string" || !/^[a-zA-Z0-9_]+\.[a-zA-Z0-9_]+$/.test(p)) {
            return res.status(400).json({
                success: false,
                error: { code: "INVALID_PERMISSION_FORMAT", message: `Invalid permission format: "${p}". Must follow 'module.action' format.` },
            });
        }
    }

    next();
}

// ─── Usage Query Validator ──────────────────────────────────────────────────

/**
 * Validates GET /modules/usage query
 * Optional: ?days=7 (1–30)
 */
function validateUsageQuery(req, res, next) {
    if (req.query.days !== undefined) {
        const days = parseInt(req.query.days, 10);
        if (isNaN(days) || days < 1 || days > 30) {
            return res.status(400).json({
                success: false,
                error: { code: "INVALID_DAYS", message: "days must be an integer between 1 and 30." },
            });
        }
    }
    next();
}

// ─── Exports ────────────────────────────────────────────────────────────────

module.exports = {
    validateToggleModule,
    validateInspect,
    validateInspectBatch,
    validateUsageQuery,
};
