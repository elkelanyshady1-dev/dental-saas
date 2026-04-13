/**
 * orthoTodo.repository.js
 * Domain: ortho-todos
 * Layer: Infrastructure > Repository
 *
 * All queries scoped by organizationId from req.context (NEVER from client).
 * Soft-delete enforced on all reads (isDeleted: { $ne: true }).
 */

"use strict";

const getModel    = require("../../../core/db/getModel");
const OrthoTodoDef = require("../models/orthoTodo.model");

function _getModel(req) {
    return getModel(req.dbConnection, OrthoTodoDef);
}

/**
 * create — insert a single todo.
 */
async function create(req, data) {
    const OrthoTodo = _getModel(req);
    const doc = await OrthoTodo.create({
        ...data,
        organizationId: req.context.organizationId,
    });
    return doc.toObject();
}

/**
 * findByCase — all non-deleted todos for a case, newest first.
 * Optional status filter.
 */
async function findByCase(req, caseId, { status = null, limit = 100, skip = 0 } = {}) {
    const OrthoTodo = _getModel(req);
    const query = {
        organizationId: req.context.organizationId,
        caseId,
        isDeleted: { $ne: true },
    };
    if (status) query.status = status;
    return OrthoTodo.find(query)
        .sort({ priority: -1, createdAt: -1 }) // high priority first, newest first
        .skip(skip)
        .limit(limit)
        .lean();
}

/**
 * findByVisit — todos created during a specific visit.
 */
async function findByVisit(req, visitId) {
    const OrthoTodo = _getModel(req);
    return OrthoTodo.find({
        organizationId: req.context.organizationId,
        visitId,
        isDeleted: { $ne: true },
    }).sort({ createdAt: -1 }).lean();
}

/**
 * findById — single todo, org-scoped.
 */
async function findById(req, id) {
    const OrthoTodo = _getModel(req);
    return OrthoTodo.findOne({
        _id:            id,
        organizationId: req.context.organizationId,
        isDeleted:      { $ne: true },
    }).lean();
}

/**
 * countPendingByCase — count of pending todos for a case.
 * Used for summary badges on overview page.
 */
async function countPendingByCase(req, caseId) {
    const OrthoTodo = _getModel(req);
    return OrthoTodo.countDocuments({
        organizationId: req.context.organizationId,
        caseId,
        status:    "pending",
        isDeleted: { $ne: true },
    });
}

/**
 * countHighPriorityByCase — count of high-priority pending todos.
 */
async function countHighPriorityByCase(req, caseId) {
    const OrthoTodo = _getModel(req);
    return OrthoTodo.countDocuments({
        organizationId: req.context.organizationId,
        caseId,
        status:    "pending",
        priority:  "high",
        isDeleted: { $ne: true },
    });
}

/**
 * updateStatus — transition todo status + track completion.
 */
async function updateStatus(req, id, status) {
    const OrthoTodo = _getModel(req);
    const update = { $set: { status } };
    if (status === "done") {
        update.$set.completedAt = new Date();
        update.$set.completedBy = req.context.userId ?? null;
    }
    if (status === "pending") {
        update.$set.completedAt = null;
        update.$set.completedBy = null;
    }
    return OrthoTodo.findOneAndUpdate(
        { _id: id, organizationId: req.context.organizationId, isDeleted: { $ne: true } },
        update,
        { new: true }
    ).lean();
}

/**
 * patch — update allowed metadata fields.
 */
async function patch(req, id, fields) {
    const OrthoTodo = _getModel(req);
    const allowed = {};
    if (fields.description !== undefined) allowed.description  = fields.description;
    if (fields.priority    !== undefined) allowed.priority     = fields.priority;
    if (fields.tooth       !== undefined) allowed.tooth        = fields.tooth;
    if (fields.surface     !== undefined) allowed.surface      = fields.surface;
    if (fields.clinicalPhase !== undefined) allowed.clinicalPhase = fields.clinicalPhase;
    if (fields.visitId     !== undefined) allowed.visitId      = fields.visitId || null;
    if (fields.status      !== undefined) {
        allowed.status = fields.status;
        if (fields.status === "done") {
            allowed.completedAt = new Date();
            allowed.completedBy = req.context.userId ?? null;
        } else {
            allowed.completedAt = null;
            allowed.completedBy = null;
        }
    }
    if (Object.keys(allowed).length === 0) return null;
    return OrthoTodo.findOneAndUpdate(
        { _id: id, organizationId: req.context.organizationId, isDeleted: { $ne: true } },
        { $set: allowed },
        { new: true }
    ).lean();
}

/**
 * softDelete — marks a todo as deleted.
 */
async function softDelete(req, id) {
    const OrthoTodo = _getModel(req);
    return OrthoTodo.findOneAndUpdate(
        { _id: id, organizationId: req.context.organizationId, isDeleted: { $ne: true } },
        { $set: { isDeleted: true } },
        { new: true }
    ).lean();
}

module.exports = {
    create,
    findByCase,
    findByVisit,
    findById,
    countPendingByCase,
    countHighPriorityByCase,
    updateStatus,
    patch,
    softDelete,
};
