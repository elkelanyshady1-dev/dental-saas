/**
 * casePhase.repository.js
 * Domain: orthodontic-cases
 * Layer: Infrastructure > Repository
 *
 * All queries scoped by organizationId from req.context.
 * Model is per-org-DB-bound via getModel(req.dbConnection, CasePhaseDef).
 *
 * SECURITY: _getModel enforces dbIsolation guard — hard-fails if
 * req.dbConnection is missing, preventing writes to the platform DB.
 */

"use strict";

const getModel           = require("../../../../core/db/getModel");
const enforceDbIsolation = require("../../../../core/db/dbIsolation.guard");
const CasePhaseDef       = require("../../models/CasePhase.model");

function _getModel(req) {
    enforceDbIsolation(req);
    return getModel(req.dbConnection, CasePhaseDef);
}

/**
 * createMany — bulk-insert phase documents for a new case.
 * Used by phase.service.js when creating default phases.
 *
 * @param {Object} req
 * @param {Array} phaseDocs
 * @param {Object} [options]
 * @param {import('mongoose').ClientSession} [options.session] — MongoDB session for transactions
 */
async function createMany(req, phaseDocs, { session } = {}) {
    const CasePhase = _getModel(req);
    const docs = await CasePhase.insertMany(
        phaseDocs.map((p) => ({
            ...p,
            organizationId: req.context.organizationId,
        })),
        { session: session || undefined }
    );
    return docs.map((d) => d.toObject());
}

/**
 * findByCaseId — ordered phase list for a case.
 */
async function findByCaseId(req, caseId) {
    const CasePhase = _getModel(req);
    return CasePhase.find({
        caseId,
        organizationId: req.context.organizationId,
    })
    .sort({ order: 1 })
    .lean();
}

/**
 * findById — single phase, org-scoped.
 */
async function findById(req, phaseId) {
    const CasePhase = _getModel(req);
    return CasePhase.findOne({
        _id:            phaseId,
        organizationId: req.context.organizationId,
    }).lean();
}

/**
 * findActivePhase — the currently active phase for a case.
 */
async function findActivePhase(req, caseId) {
    const CasePhase = _getModel(req);
    return CasePhase.findOne({
        caseId,
        organizationId: req.context.organizationId,
        status: "active",
    }).lean();
}

/**
 * updateStatus — transition a phase status.
 * Sets startedAt when transitioning to "active".
 * Sets completedAt when transitioning to "completed".
 *
 * @param {Object} req
 * @param {string} phaseId
 * @param {string} status
 * @param {Object} [options]
 * @param {import('mongoose').ClientSession} [options.session] — MongoDB session for transactions
 */
async function updateStatus(req, phaseId, status, { session } = {}) {
    const CasePhase = _getModel(req);
    const now = new Date();
    const update = { $set: { status } };

    if (status === "active")    update.$set.startedAt   = now;
    if (status === "completed") update.$set.completedAt = now;

    return CasePhase.findOneAndUpdate(
        { _id: phaseId, organizationId: req.context.organizationId },
        update,
        { new: true, runValidators: true, session: session || undefined }
    ).lean();
}

module.exports = {
    createMany,
    findByCaseId,
    findById,
    findActivePhase,
    updateStatus,
};
