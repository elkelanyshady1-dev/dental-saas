/**
 * activityFormatter.js
 * Platform Activity Feed — Event Enrichment Utilities
 *
 * Converts raw AuditLog documents into human-readable activity entries.
 * Used by: platformAnalyticsController.getLatestEvents
 *
 * PLANE: Platform
 * SECURITY: Must never expose tokens, passwords, or secret keys.
 */

"use strict";

// ─── Action → Human label ─────────────────────────────────────────────────────
const ACTION_LABELS = {
    // Auth
    LOGIN_SUCCESS: "logged in",
    LOGIN_FAILED: "failed to log in",
    LOGOUT: "logged out",
    TOKEN_REFRESH: "refreshed session token",
    TOKEN_REVOKED: "revoked session token",
    PASSWORD_CHANGED: "changed password",
    PASSWORD_RESET: "reset password",

    // CRUD
    CREATE: "created",
    UPDATE: "updated",
    DELETE: "deleted",
    RESTORE: "restored",
    ARCHIVE: "archived",

    // Platform admin
    CAPABILITY_DENIED: "attempted unauthorized action",
    PERMISSION_DENIED: "was denied access",
    ACCESS_DENIED: "was denied access",
    PLAN_CHANGED: "changed subscription plan",
    ORG_SUSPENDED: "suspended organization",
    ORG_REACTIVATED: "reactivated organization",

    // Billing
    PAYMENT_SUCCESS: "payment succeeded",
    PAYMENT_FAILED: "payment failed",
    INVOICE_CREATED: "created invoice",
    SUBSCRIPTION_CREATED: "created subscription",
    SUBSCRIPTION_CANCELED: "cancelled subscription",

    // Data
    IMPORT: "imported data",
    EXPORT: "exported data",
};

/**
 * Converts a raw action string to a readable verb phrase.
 * "LOGIN_SUCCESS" → "logged in"
 * "CREATE_PATIENT" → "created patient"
 */
function formatAction(action) {
    if (!action) return "performed action";
    const upper = action.toUpperCase();

    // Exact match
    if (ACTION_LABELS[upper]) return ACTION_LABELS[upper];

    // Prefix match (e.g. "CREATE_APPOINTMENT" → "created")
    for (const [key, label] of Object.entries(ACTION_LABELS)) {
        if (upper.startsWith(key + "_") || upper.startsWith(key + ".")) {
            return label;
        }
    }

    // Fallback: lowercase with underscores replaced
    return action.toLowerCase().replace(/_/g, " ");
}

// ─── Event category (for badge colour) ───────────────────────────────────────
const AUTH_ACTIONS = new Set(["LOGIN_SUCCESS", "LOGIN_FAILED", "LOGOUT", "TOKEN_REFRESH", "TOKEN_REVOKED", "PASSWORD_CHANGED", "PASSWORD_RESET"]);
const BILLING_ACTIONS = new Set(["PAYMENT_SUCCESS", "PAYMENT_FAILED", "INVOICE_CREATED", "SUBSCRIPTION_CREATED", "SUBSCRIPTION_CANCELED", "PLAN_CHANGED"]);
const SECURITY_ACTIONS = new Set(["CAPABILITY_DENIED", "PERMISSION_DENIED", "ACCESS_DENIED", "LOGIN_FAILED"]);

function categorizeAction(action) {
    if (!action) return "data";
    const upper = action.toUpperCase();
    if (SECURITY_ACTIONS.has(upper)) return "security";
    if (AUTH_ACTIONS.has(upper)) return "auth";
    if (BILLING_ACTIONS.has(upper)) return "billing";
    if (upper.startsWith("DELETE")) return "danger";
    return "data";
}

// ─── Entity name extraction ───────────────────────────────────────────────────
/**
 * Best-effort name from the mixed `details` object.
 * Checks common field names used across entities.
 */
function extractEntityName(details) {
    if (!details || typeof details !== "object") return null;
    return (
        details.name ||
        details.patientName ||
        details.title ||
        details.subject ||
        details.email ||
        details.code ||
        null
    );
}

// ─── Redaction ────────────────────────────────────────────────────────────────
const REDACTED_KEYS = new Set([
    "password", "passwordHash", "token", "accessToken", "refreshToken",
    "secret", "apiKey", "privateKey", "hash", "currentHash", "previousHash",
]);

/**
 * Returns a sanitized details object safe for API exposure.
 * Only the extracted displayable name is passed — raw details are never sent.
 */
function sanitizeDetails(details) {
    if (!details || typeof details !== "object") return null;
    const safe = {};
    for (const [k, v] of Object.entries(details)) {
        if (REDACTED_KEYS.has(k)) continue;
        if (typeof v === "string" && v.length > 200) continue; // skip large blobs
        safe[k] = v;
    }
    return safe;
}

/**
 * enrichEvent — transforms a raw AuditLog lean document into a dashboard-ready object.
 *
 * @param {object} log      — AuditLog lean document (with populated org/branch)
 * @param {object} actorMap — map of actorId.toString() → { name, email, role }
 * @returns {object}
 */
function enrichEvent(log, actorMap = {}) {
    const actor = actorMap[log.actorId?.toString()] || null;

    const actorName = actor?.name || actor?.email || log.actorType || "System";
    const entityName = extractEntityName(log.details);
    const actionLabel = formatAction(log.action);
    const category = categorizeAction(log.action);

    // Build human readable message: "John Smith created patient Ahmed Ali"
    const entityPart = log.entity ? ` ${log.entity.toLowerCase()}` : "";
    const namePart = entityName ? ` ${entityName}` : "";
    const message = `${actorName} ${actionLabel}${entityPart}${namePart}`.trim();

    return {
        _id: log._id,
        message,
        actorName,
        actorRole: actor?.role || log.actorType || null,
        action: log.action,
        actionLabel,
        category,
        entity: log.entity || null,
        entityName: entityName || null,
        organizationName: log.organizationId?.name || null,
        organizationSlug: log.organizationId?.slug || null,
        branchName: log.branchId?.name || null,
        ipAddress: log.ipAddress || null,
        timestamp: log.createdAt,
        // Security-safe: never send hash, token, or raw details blob
        // entityName already extracted above — raw details excluded
    };
}

module.exports = { enrichEvent, formatAction, categorizeAction, extractEntityName };
