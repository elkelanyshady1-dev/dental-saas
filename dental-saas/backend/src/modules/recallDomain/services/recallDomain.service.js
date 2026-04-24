/**
 * recallDomain.service.js — Full Recall Domain Service
 * Domain: recalls
 * Layer: Service
 *
 * Provides FULL CRUD + status transitions + statistics:
 *   - listRecalls(req, filters) → paginated recall list
 *   - getRecallStats(req)       → dashboard stat counters
 *   - updateRecallStatus(req, recallId, status)
 *   - deleteRecall(req, recallId) → soft cancel
 *
 * HARD RULES:
 *   ✅ organizationId from req.context (JWT SSOT)
 *   ✅ enforceDbIsolation() in every model access
 *   ✅ No organizationId filters inside org DB (handled by connection)
 *   ✅ All responses shaped via buildRecallDTO (dto/recall.dto.js)
 */

"use strict";

const mongoose           = require("mongoose");
const RecallDef          = require("../../../organization/models/Recall");
const getModel           = require("@core/db/getModel");
const enforceDbIsolation = require("@core/db/dbIsolation.guard");
const { buildRecallDTO } = require("../dto/recall.dto");
const logger             = require("@utils/logger");

// ── Internal helpers ──────────────────────────────────────────────────────────

function _getRecallModel(req) {
    enforceDbIsolation(req);
    return getModel(req.dbConnection, RecallDef);
}

// ── listRecalls ───────────────────────────────────────────────────────────────
/**
 * Returns paginated, filtered recall list.
 *
 * @param {Object} req
 * @param {Object} filters
 * @param {string} [filters.status]    - filter by status
 * @param {string} [filters.search]    - search by patient name
 * @param {string} [filters.branchId]  - filter by branch
 * @param {string} [filters.dateFrom]  - due date range start
 * @param {string} [filters.dateTo]    - due date range end
 * @param {string} [filters.type]      - recall type filter
 * @param {number} [filters.page=1]
 * @param {number} [filters.limit=20]
 * @returns {Promise<{ recalls: Object[], meta: Object }>}
 */
async function listRecalls(req, filters = {}) {
    const Recall = _getRecallModel(req);
    const { status, search, branchId, patientId, dateFrom, dateTo, type, page = 1, limit = 20 } = filters;

    const query = {};

    // Status filter
    if (status && status !== "all") {
        if (status === "overdue") {
            query.status = { $in: ["pending", "sent"] };
            query.dueDate = { $lt: new Date() };
        } else {
            query.status = status;
        }
    }

    // Search by patient name (case-insensitive prefix)
    if (search && search.trim()) {
        query.patientName = { $regex: search.trim(), $options: "i" };
    }

    // Branch filter
    if (branchId && mongoose.isValidObjectId(branchId)) {
        query.branchId = new mongoose.Types.ObjectId(branchId);
    }

    // Patient filter (for patient-profile scoped lists)
    if (patientId && mongoose.isValidObjectId(patientId)) {
        query.patientId = new mongoose.Types.ObjectId(patientId);
    }

    // Date range filter
    if (dateFrom || dateTo) {
        query.dueDate = query.dueDate || {};
        if (dateFrom) query.dueDate.$gte = new Date(dateFrom);
        if (dateTo) query.dueDate.$lte = new Date(dateTo);
    }

    // Type filter
    if (type) {
        query.type = type;
    }

    const skip = (page - 1) * limit;

    const [recalls, total] = await Promise.all([
        Recall.find(query)
            .sort({ dueDate: 1 })
            .skip(skip)
            .limit(limit)
            .lean(),
        Recall.countDocuments(query),
    ]);

    return {
        recalls: recalls.map(buildRecallDTO),
        meta: {
            total,
            page,
            limit,
            pages: Math.ceil(total / limit),
        },
    };
}

// ── getRecallStats ────────────────────────────────────────────────────────────
/**
 * Returns dashboard stat counters.
 *
 * @param {Object} req
 * @returns {Promise<Object>} { dueToday, overdue, thisWeek, completed }
 */
async function getRecallStats(req) {
    const Recall = _getRecallModel(req);

    const now = new Date();
    const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const endOfDay = new Date(startOfDay);
    endOfDay.setDate(endOfDay.getDate() + 1);

    const startOfWeek = new Date(startOfDay);
    startOfWeek.setDate(startOfWeek.getDate() - startOfWeek.getDay());
    const endOfWeek = new Date(startOfWeek);
    endOfWeek.setDate(endOfWeek.getDate() + 7);

    const [dueToday, overdue, thisWeek, completed] = await Promise.all([
        Recall.countDocuments({
            status: { $in: ["pending", "sent"] },
            dueDate: { $gte: startOfDay, $lt: endOfDay },
        }),
        Recall.countDocuments({
            status: { $in: ["pending", "sent"] },
            dueDate: { $lt: startOfDay },
        }),
        Recall.countDocuments({
            status: { $in: ["pending", "sent"] },
            dueDate: { $gte: startOfWeek, $lt: endOfWeek },
        }),
        Recall.countDocuments({
            status: "completed",
        }),
    ]);

    return { dueToday, overdue, thisWeek, completed };
}

// ── updateRecallStatus ────────────────────────────────────────────────────────
/**
 * Transitions a recall to a new status.
 *
 * @param {Object} req
 * @param {string} recallId
 * @param {string} newStatus
 * @param {Object} [opts]
 * @param {string} [opts.bookedAppointmentId]
 * @param {string} [opts.notes]
 * @returns {Promise<Object>} Updated recall DTO
 */
async function updateRecallStatus(req, recallId, newStatus, opts = {}) {
    const Recall = _getRecallModel(req);

    const VALID_TRANSITIONS = {
        pending:   ["sent", "booked", "completed", "cancelled"],
        sent:      ["booked", "completed", "cancelled"],
        booked:    ["completed", "cancelled"],
        overdue:   ["sent", "booked", "completed", "cancelled"],
        completed: [],
        cancelled: ["pending"],
    };

    const recall = await Recall.findById(recallId);

    if (!recall) {
        const err = new Error(`Recall ${recallId} not found.`);
        err.statusCode = 404;
        err.code       = "RECALL_NOT_FOUND";
        throw err;
    }

    const previousStatus = recall.status;
    const allowed = VALID_TRANSITIONS[previousStatus] || [];
    if (!allowed.includes(newStatus)) {
        const err = new Error(`Cannot transition recall from '${previousStatus}' to '${newStatus}'.`);
        err.statusCode = 400;
        err.code       = "INVALID_STATUS_TRANSITION";
        throw err;
    }

    recall.status = newStatus;

    if (newStatus === "sent") {
        recall.sentAt = new Date();
    }
    if (newStatus === "completed") {
        recall.completedAt = new Date();
    }
    if (newStatus === "booked" && opts.bookedAppointmentId) {
        recall.bookedAppointmentId = new mongoose.Types.ObjectId(opts.bookedAppointmentId);
    }
    if (opts.notes !== undefined) {
        recall.notes = opts.notes;
    }

    await recall.save();

    logger.info({
        event:    "RECALL_STATUS_UPDATED",
        recallId: recall._id,
        from:     previousStatus,
        to:       newStatus,
        orgId:    req.context.organizationId,
        userId:   req.context.userId,
    });

    return buildRecallDTO(recall.toObject());
}

// ── deleteRecall ──────────────────────────────────────────────────────────────
/**
 * Cancels a recall (soft delete — status -> cancelled).
 *
 * @param {Object} req
 * @param {string} recallId
 * @returns {Promise<Object>} Cancelled recall DTO
 */
async function deleteRecall(req, recallId) {
    return updateRecallStatus(req, recallId, "cancelled");
}

// ── getRecallById ─────────────────────────────────────────────────────────────

async function getRecallById(req, recallId) {
    const Recall = _getRecallModel(req);

    const recall = await Recall.findById(recallId).lean();

    if (!recall) {
        const err = new Error(`Recall ${recallId} not found.`);
        err.statusCode = 404;
        err.code       = "RECALL_NOT_FOUND";
        throw err;
    }

    return buildRecallDTO(recall);
}

module.exports = {
    listRecalls,
    getRecallStats,
    updateRecallStatus,
    deleteRecall,
    getRecallById,
};
