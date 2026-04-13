/**
 * auditInterceptor.js
 * ═══════════════════════════════════════════════════════════════
 * Organization Plane — Automatic Mutation Audit Logger
 *
 * Express middleware that automatically logs all mutation operations
 * (POST, PUT, PATCH, DELETE) to the cryptographic audit chain.
 *
 * ── WHY ─────────────────────────────────────────────────────────
 * Controllers should focus on business logic, not audit plumbing.
 * This middleware creates a fire-and-forget audit record AFTER the
 * response is sent, capturing:
 *   - Who (userId, role, name)
 *   - What (action, entity, entityId)
 *   - Where (organizationId, branchId, IP, user-agent)
 *   - When (timestamp from crypto chain)
 *   - How (changes payload, request body snapshot)
 *
 * ── USAGE ───────────────────────────────────────────────────────
 *
 * 1. Auto-mode (attach to router — logs all mutations):
 *    router.use(auditInterceptor.autoAudit("Patient"));
 *
 * 2. Manual-mode (call in controller for fine-grained control):
 *    await auditInterceptor.logAction(req, {
 *      action: "PATIENT_UPDATED",
 *      entity: "Patient",
 *      entityId: patient._id,
 *      changes: { name: { from: old.name, to: new.name } }
 *    });
 *
 * ── MEDICAL COMPLIANCE ──────────────────────────────────────────
 * All patient-facing mutations MUST produce audit records.
 * Records are immutable (AuditLog model has append-only guards).
 * SHA-256 hash chain prevents tampering.
 *
 * PLANE: Org only.
 *
 * @module middleware/auditInterceptor
 */

"use strict";

const auditService = require("../services/auditService");
const logger = require("../utils/logger");
const eventBus = require("../core/eventBus");
const { AUDIT_EVENT_CREATED } = require("../core/domainEvents");

// ─── Action Derivation ──────────────────────────────────────────────────────

const METHOD_ACTION_MAP = {
    POST: "CREATED",
    PUT: "UPDATED",
    PATCH: "UPDATED",
    DELETE: "DELETED",
};

/**
 * Derive a standardized action string from the HTTP method and entity.
 * @param {string} method — HTTP method
 * @param {string} entity — Entity name (e.g., "Patient", "Appointment")
 * @returns {string} — e.g., "PATIENT_CREATED"
 */
function deriveAction(method, entity) {
    const verb = METHOD_ACTION_MAP[method] || "ACCESSED";
    return `${entity.toUpperCase()}_${verb}`;
}

/**
 * Extract a candidate entityId from the request URL.
 * Looks for the last segment that is a valid MongoDB ObjectId.
 * @param {string} originalUrl
 * @returns {string|null}
 */
function extractEntityId(originalUrl) {
    const segments = originalUrl.split("/").reverse();
    for (const seg of segments) {
        if (/^[0-9a-fA-F]{24}$/.test(seg)) {
            return seg;
        }
    }
    return null;
}

/**
 * Sanitize the request body for audit storage.
 * Removes sensitive fields and limits size.
 * @param {Object} body
 * @returns {Object}
 */
function sanitizeBody(body) {
    if (!body || typeof body !== "object") return {};

    const sanitized = { ...body };

    // Never store passwords, tokens, or secrets
    const SENSITIVE_FIELDS = [
        "password", "newPassword", "currentPassword", "confirmPassword",
        "token", "refreshToken", "accessToken", "secret",
        "creditCard", "cardNumber", "cvv", "ssn",
    ];

    for (const field of SENSITIVE_FIELDS) {
        if (sanitized[field]) {
            sanitized[field] = "[REDACTED]";
        }
    }

    // Limit body snapshot size (prevent huge file uploads from filling audit)
    const str = JSON.stringify(sanitized);
    if (str.length > 2048) {
        return { _truncated: true, _size: str.length, _keys: Object.keys(sanitized) };
    }

    return sanitized;
}

// ─── Manual Audit Logger ────────────────────────────────────────────────────

/**
 * logAction — Manual audit record creation for fine-grained control.
 *
 * Use this in controllers where you need to specify exact changes,
 * custom action names, or entity-specific metadata.
 *
 * @param {import("express").Request} req — Express request (must have req.user)
 * @param {Object} opts
 * @param {string} opts.action — Action name (e.g., "PATIENT_UPDATED")
 * @param {string} opts.entity — Entity type (e.g., "Patient")
 * @param {string} opts.entityId — Entity ID
 * @param {Object} [opts.changes] — Change diff { field: { from, to } }
 * @param {string} [opts.description] — Human-readable description
 * @param {import("mongoose").ClientSession} [opts.session] — MongoDB session for txn
 * @returns {Promise<Object>} Audit record
 */
async function logAction(req, opts = {}) {
    const { action, entity, entityId, changes, description, session } = opts;

    if (!action || !entity) {
        logger.warn({ event: "AUDIT_LOG_SKIPPED", opts }, "[Audit] Missing action or entity");
        return null;
    }

    try {
        const user = req.user;
        const record = await auditService.createAuditRecord({
            actorId: user?._id || user?.id,
            actorType: "tenant_user",
            action,
            entity,
            entityType: entity,
            entityId: entityId || null,
            organizationId: req.organizationId || user?.organizationId,
            branchId: req.activeBranchId || "000000000000000000000000",
            regionCode: req.regionCode,
            ipAddress: req.ip,
            userAgent: req.headers?.["user-agent"],
            correlationId: req.requestId || req.correlationId,
            success: true,
            description: description || `${action} on ${entity}${entityId ? ` (${entityId})` : ""}`,
            details: {
                changes: changes || null,
                method: req.method,
                path: req.originalUrl,
                actorSnapshot: {
                    name: user?.name || `${user?.firstName || ""} ${user?.lastName || ""}`.trim(),
                    role: user?.roleId?.name || user?.role,
                    email: user?.email,
                },
            },
            actor: user
        }, session);

        return record;
    } catch (err) {
        // Fire-and-forget — audit failure must NEVER block business operations
        logger.error({
            event: "AUDIT_LOG_FAILED",
            action,
            entity,
            entityId,
            err: err.message,
        }, "[Audit] Failed to create audit record");
        return null;
    }
}

// ─── Auto Audit Middleware ──────────────────────────────────────────────────

/**
 * autoAudit — Express middleware that auto-logs mutations.
 *
 * Attach to a router to automatically create audit records for
 * POST/PUT/PATCH/DELETE requests.
 *
 * @param {string} entity — Entity type for this router (e.g., "Patient")
 * @returns {import("express").RequestHandler}
 *
 * @example
 *   // In patient routes:
 *   router.use(autoAudit("Patient"));
 *   router.post("/", controller.create);     // → PATIENT_CREATED
 *   router.patch("/:id", controller.update); // → PATIENT_UPDATED
 *   router.delete("/:id", controller.delete); // → PATIENT_DELETED
 */
function autoAudit(entity) {
    return function auditMiddleware(req, res, next) {
        // Only audit mutations
        if (!["POST", "PUT", "PATCH", "DELETE"].includes(req.method)) {
            return next();
        }

        // Hook into response finish to log AFTER the response
        const originalEnd = res.end;
        const startTime = Date.now();

        res.end = function (...args) {
            // Restore original end
            res.end = originalEnd;
            res.end.apply(this, args);

            // Only audit successful mutations (2xx + 3xx)
            if (res.statusCode >= 400) return;

            const action = deriveAction(req.method, entity);
            const entityId = req.params?.id || extractEntityId(req.originalUrl);

            // Fire-and-forget — do not await
            // Phase 14: Use setImmediate for zero-latency impact
            setImmediate(() => {
                logAction(req, {
                    action,
                    entity,
                    entityId,
                    changes: sanitizeBody(req.body),
                    description: `${action}${entityId ? ` — ${entityId}` : ""} (${Date.now() - startTime}ms)`,
                }).then(() => {
                    // Emit domain event for real-time Socket.IO streaming
                    try {
                        eventBus.emit(AUDIT_EVENT_CREATED, {
                            organizationId: req.organizationId || req.user?.organizationId,
                            action,
                            entity,
                            entityId,
                            actorId: req.user?._id || req.user?.id,
                            timestamp: new Date(),
                        }, "auditInterceptor");
                    } catch (_) {
                        // EventBus emission must never block
                    }
                }).catch(() => {}); // Silently swallow — already logged inside logAction
            });
        };

        next();
    };
}

// ─── Exports ────────────────────────────────────────────────────────────────

module.exports = {
    logAction,
    autoAudit,
    deriveAction,
    sanitizeBody,
};
