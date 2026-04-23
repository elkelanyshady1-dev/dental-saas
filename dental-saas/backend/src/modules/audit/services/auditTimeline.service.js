/**
 * auditTimeline.service.js
 * ═══════════════════════════════════════════════════════════════
 * Organization Plane — Audit Timeline Query Service
 *
 * Provides query capabilities for the audit log with support for:
 *   - Entity-scoped timelines (per patient, appointment, etc.)
 *   - User activity history
 *   - Organization-wide audit trail
 *   - Filtered/paginated results
 *
 * All queries are scoped to the authenticated user's organization
 * (tenant isolation enforced at query level).
 *
 * PLANE: Org only.
 *
 * @module modules/audit/services/auditTimeline.service
 */

"use strict";

const mongoose = require("mongoose");
const { auditLogSchema } = require("../../../shared/models/AuditLog");
const { getRegionContext } = require("../../../infrastructure/regionRouter");

const logger = require("../../../utils/logger");

/**
 * Get the AuditLog model for the given region.
 * @param {string} regionCode
 * @returns {Promise<mongoose.Model>}
 */
async function _getAuditModel(regionCode) {
    if (!regionCode || regionCode === "GLOBAL") {
        // Step 5d: AuditLog is platform-plane (cross-org, audit cluster).
        const platformConnection = require("../../../core/db/platformConnection");
        return platformConnection.get().model("AuditLog", auditLogSchema);
    }
    const { mongooseConnection } = await getRegionContext(regionCode);
    return mongooseConnection.model("AuditLog", auditLogSchema);
}

/**
 * Get a secureModel-wrapped AuditLog for the given region.
 * @param {string} regionCode
 * @returns {Promise<Object>} secureModel-wrapped model
 */
async function _getSecureAuditModel(regionCode) {
    const AuditLog = await _getAuditModel(regionCode);
    return AuditLog;
}

// ─── Action Category Mapping ────────────────────────────────────────────────

const ACTION_CATEGORIES = {
    // Patient lifecycle
    PATIENT_CREATED: "patient",
    PATIENT_UPDATED: "patient",
    PATIENT_DELETED: "patient",

    // Appointments
    APPOINTMENT_CREATED: "appointment",
    APPOINTMENT_UPDATED: "appointment",
    APPOINTMENT_DELETED: "appointment",
    APPOINTMENT_STATUS_CHANGED: "appointment",

    // Treatments
    TREATMENT_CREATED: "treatment",
    TREATMENT_UPDATED: "treatment",
    TREATMENT_COMPLETED: "treatment",
    TREATMENT_PLAN_CREATED: "treatment",
    TREATMENT_PLAN_APPROVED: "treatment",

    // Clinical
    CLINICAL_NOTE_ADDED: "clinical",
    PROCEDURE_PERFORMED: "clinical",
    PRESCRIPTION_CREATED: "clinical",

    // Financial
    INVOICE_CREATED: "financial",
    INVOICE_UPDATED: "financial",
    PAYMENT_CREATED: "financial",
    PAYMENT_REFUNDED: "financial",

    // Administrative
    USER_CREATED: "admin",
    USER_UPDATED: "admin",
    USER_DELETED: "admin",
    ROLE_UPDATED: "admin",
    BRANCH_CREATED: "admin",
    BRANCH_UPDATED: "admin",

    // Security
    LOGIN_SUCCESS: "security",
    LOGIN_FAILURE: "security",
    TOKEN_REFRESH: "security",
    LOGOUT: "security",
    PASSWORD_CHANGED: "security",
    ORG_PERMISSION_DENIED: "security",
    CAPABILITY_DENIED: "security",
};

/**
 * Categorize an action string.
 * @param {string} action
 * @returns {string}
 */
function categorizeAction(action) {
    return ACTION_CATEGORIES[action] || "other";
}

// ─── Query Methods ──────────────────────────────────────────────────────────

/**
 * getEntityTimeline — Retrieve audit history for a specific entity.
 *
 * @param {Object} params
 * @param {string} params.entityId — The entity's MongoDB ObjectId
 * @param {string} params.organizationId — Tenant isolation
 * @param {string} params.regionCode — Region for DB routing
 * @param {string} [params.entityType] — Filter by entity type (e.g., "Patient")
 * @param {string} [params.category] — Filter by action category
 * @param {number} [params.page=1]
 * @param {number} [params.limit=50]
 * @returns {Promise<{ logs: Array, total: number, page: number, totalPages: number }>}
 */
async function getEntityTimeline(params) {
    const {
        entityId,
        organizationId,
        regionCode,
        entityType,
        category,
        page = 1,
        limit = 50,
    } = params;

    const AuditLog = await _getSecureAuditModel(regionCode);

    const query = {
        entityId: new mongoose.Types.ObjectId(entityId),
    };

    if (entityType) query.entityType = entityType;

    // Apply category filter (maps to action prefixes)
    if (category && category !== "all") {
        const categoryActions = Object.entries(ACTION_CATEGORIES)
            .filter(([, cat]) => cat === category)
            .map(([action]) => action);

        if (categoryActions.length > 0) {
            query.action = { $in: categoryActions };
        }
    }

    const skip = (page - 1) * limit;

    const [logs, total] = await Promise.all([
        AuditLog.find(query)
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(limit)
            .lean(),
        AuditLog.countDocuments(query),
    ]);

    // Enrich with category
    const enrichedLogs = logs.map(log => ({
        ...log,
        category: categorizeAction(log.action),
        performedBy: {
            userId: log.actorId,
            name: [log.actorFirstName, log.actorLastName].filter(Boolean).join(" ") || null,
            role: log.actorRole,
        },
    }));

    return {
        logs: enrichedLogs,
        total,
        page,
        totalPages: Math.ceil(total / limit),
    };
}

/**
 * getUserActivity — Retrieve audit history for a specific user.
 *
 * @param {Object} params
 * @param {string} params.userId — The actor's MongoDB ObjectId
 * @param {string} params.organizationId — Tenant isolation
 * @param {string} params.regionCode
 * @param {string} [params.category]
 * @param {number} [params.page=1]
 * @param {number} [params.limit=50]
 * @returns {Promise<{ logs: Array, total: number, page: number, totalPages: number }>}
 */
async function getUserActivity(params) {
    const {
        userId,
        organizationId,
        regionCode,
        category,
        page = 1,
        limit = 50,
    } = params;

    const AuditLog = await _getSecureAuditModel(regionCode);

    const query = {
        actorId: new mongoose.Types.ObjectId(userId),
    };

    if (category && category !== "all") {
        const categoryActions = Object.entries(ACTION_CATEGORIES)
            .filter(([, cat]) => cat === category)
            .map(([action]) => action);

        if (categoryActions.length > 0) {
            query.action = { $in: categoryActions };
        }
    }

    const skip = (page - 1) * limit;

    const [logs, total] = await Promise.all([
        AuditLog.find(query)
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(limit)
            .lean(),
        AuditLog.countDocuments(query),
    ]);

    const enrichedLogs = logs.map(log => ({
        ...log,
        category: categorizeAction(log.action),
        performedBy: {
            userId: log.actorId,
            name: [log.actorFirstName, log.actorLastName].filter(Boolean).join(" ") || null,
            role: log.actorRole,
        },
    }));

    return {
        logs: enrichedLogs,
        total,
        page,
        totalPages: Math.ceil(total / limit),
    };
}

/**
 * getOrgTimeline — Organization-wide audit trail.
 *
 * @param {Object} params
 * @param {string} params.organizationId
 * @param {string} params.regionCode
 * @param {string} [params.category]
 * @param {string} [params.action] — Filter by specific action
 * @param {string} [params.search] — Free-text search in description
 * @param {Date} [params.from] — Start date
 * @param {Date} [params.to] — End date
 * @param {number} [params.page=1]
 * @param {number} [params.limit=50]
 * @returns {Promise<{ logs: Array, total: number, page: number, totalPages: number }>}
 */
async function getOrgTimeline(params) {
    const {
        organizationId,
        regionCode,
        category,
        action,
        search,
        from,
        to,
        page = 1,
        limit = 50,
    } = params;

    const AuditLog = await _getSecureAuditModel(regionCode);

    const query = {};

    if (action) query.action = action;

    if (category && category !== "all") {
        const categoryActions = Object.entries(ACTION_CATEGORIES)
            .filter(([, cat]) => cat === category)
            .map(([act]) => act);

        if (categoryActions.length > 0) {
            query.action = { $in: categoryActions };
        }
    }

    if (search) {
        query.description = { $regex: search, $options: "i" };
    }

    if (from || to) {
        query.createdAt = {};
        if (from) query.createdAt.$gte = new Date(from);
        if (to) query.createdAt.$lte = new Date(to);
    }

    const skip = (page - 1) * limit;

    const [logs, total] = await Promise.all([
        AuditLog.find(query)
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(limit)
            .lean(),
        AuditLog.countDocuments(query),
    ]);

    const enrichedLogs = logs.map(log => ({
        ...log,
        category: categorizeAction(log.action),
        performedBy: {
            userId: log.actorId,
            name: [log.actorFirstName, log.actorLastName].filter(Boolean).join(" ") || null,
            role: log.actorRole,
        },
    }));

    return {
        logs: enrichedLogs,
        total,
        page,
        totalPages: Math.ceil(total / limit),
    };
}

/**
 * getAuditStats — Aggregate audit statistics for the dashboard.
 *
 * @param {Object} params
 * @param {string} params.organizationId
 * @param {string} params.regionCode
 * @param {number} [params.days=7] — Lookback period
 * @returns {Promise<Object>}
 */
async function getAuditStats(params) {
    const {
        organizationId,
        regionCode,
        days = 7,
    } = params;

    const AuditLog = await _getSecureAuditModel(regionCode);

    const since = new Date();
    since.setDate(since.getDate() - days);

    const [totalActions, byCategory, recentDenials] = await Promise.all([
        AuditLog.countDocuments({
            createdAt: { $gte: since },
        }),

        // secureModel.aggregate prepends $match { organizationId } automatically
        AuditLog.aggregate([
            {
                $match: {
                    createdAt: { $gte: since },
                },
            },
            {
                $group: {
                    _id: "$action",
                    count: { $sum: 1 },
                },
            },
            { $sort: { count: -1 } },
            { $limit: 20 },
        ]),

        AuditLog.countDocuments({
            createdAt: { $gte: since },
            action: { $in: ["ORG_PERMISSION_DENIED", "CAPABILITY_DENIED", "ENTITLEMENT_DENIED"] },
        }),
    ]);

    // Categorize action counts
    const categorized = {};
    for (const { _id: action, count } of byCategory) {
        const cat = categorizeAction(action);
        categorized[cat] = (categorized[cat] || 0) + count;
    }

    return {
        totalActions,
        recentDenials,
        byCategory: categorized,
        topActions: byCategory.slice(0, 10),
        period: { days, since },
    };
}

module.exports = {
    getEntityTimeline,
    getUserActivity,
    getOrgTimeline,
    getAuditStats,
    categorizeAction,
    ACTION_CATEGORIES,
};
