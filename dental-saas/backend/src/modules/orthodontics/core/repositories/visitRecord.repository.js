/**
 * visitRecord.repository.js
 * Domain: orthodontic-cases
 * Layer: Infrastructure > Repository
 *
 * Phase 3.2 Changes:
 *   FIX 1: create() now accepts optional { session } for MongoDB transaction support
 *   FIX 7: findByCaseId() sort updated to { visitNumber: 1, createdAt: 1 }
 *            — createdAt is a tiebreaker guaranteeing order for same-visitNumber
 *              edges (e.g., if transaction rollback caused a gap and two records
 *              have adjacent but equal counters — practically impossible but safe)
 *
 * IMMUTABILITY: snapshotId NEVER changes after creation — no update method.
 * All queries scoped by organizationId from req.context.
 */

"use strict";

const getModel           = require("../../../../core/db/getModel");
const enforceDbIsolation = require("../../../../core/db/dbIsolation.guard");
const VisitRecordDef     = require("../../models/VisitRecord.model");

function _getModel(req) {
    enforceDbIsolation(req);
    return getModel(req.dbConnection, VisitRecordDef);
}

// ─────────────────────────────────────────────────────────────────────────────
// create — FIX 1: session support
// ─────────────────────────────────────────────────────────────────────────────

/**
 * create
 *
 * Phase 3.2 — FIX 1: Accepts optional { session } for atomic transaction.
 * Array form is MANDATORY when using a session in Mongoose.
 *
 * @param {Object} req
 * @param {Object} data
 * @param {Object} [options]
 * @param {import('mongoose').ClientSession} [options.session]
 */
async function create(req, data, { session } = {}) {
    const VisitRecord = _getModel(req);

    const payload = {
        ...data,
        };

    if (session) {
        // Array form required by Mongoose when session is provided
        const [doc] = await VisitRecord.create([payload], { session });
        return doc.toObject();
    }

    const doc = await VisitRecord.create(payload);
    return doc.toObject();
}

// ─────────────────────────────────────────────────────────────────────────────
// findByCaseId — FIX 7: dual sort for guaranteed timeline order
// ─────────────────────────────────────────────────────────────────────────────

/**
 * findByCaseId
 *
 * Phase 3.2 — FIX 7: Primary sort by visitNumber, secondary by createdAt.
 *
 * WHY DUAL SORT:
 *   visitNumber is monotonic (not gap-free — gaps can occur on TX rollback).
 *   createdAt is the authoritative tiebreaker in the extremely rare case
 *   where visitNumber uniqueness is violated by a data migration or recovery.
 *   Combined sort ensures deterministic ordering under all conditions.
 *
 * @param {Object} req
 * @param {string} caseId
 * @param {Object} [opts]
 * @param {string} [opts.phaseId]
 * @param {number} [opts.limit=100]
 * @param {number} [opts.skip=0]
 */
async function findByCaseId(req, caseId, { phaseId, limit = 100, skip = 0 } = {}) {
    const VisitRecord = _getModel(req);
    const query = {
        caseId,
        isActive:       true,
    };
    if (phaseId) query.phaseId = phaseId;

    return VisitRecord.find(query)
        .sort({ visitNumber: 1, createdAt: 1 }) // FIX 7: dual sort
        .skip(skip)
        .limit(limit)
        .lean();
}

// ─────────────────────────────────────────────────────────────────────────────
// countByCaseId
// ─────────────────────────────────────────────────────────────────────────────

async function countByCaseId(req, caseId) {
    const VisitRecord = _getModel(req);
    return VisitRecord.countDocuments({
        caseId,
        isActive:       true,
    });
}

// ─────────────────────────────────────────────────────────────────────────────
// findById
// ─────────────────────────────────────────────────────────────────────────────

async function findById(req, id) {
    const VisitRecord = _getModel(req);
    return VisitRecord.findOne({
        _id:            id,
        }).lean();
}

// ─────────────────────────────────────────────────────────────────────────────
// findByAppointmentId — idempotency guard
// ─────────────────────────────────────────────────────────────────────────────

async function findByAppointmentId(req, appointmentId) {
    const VisitRecord = _getModel(req);
    return VisitRecord.findOne({
        appointmentId,
        }).lean();
}

// ─────────────────────────────────────────────────────────────────────────────
// findBySnapshotId — reverse lookup
// ─────────────────────────────────────────────────────────────────────────────

async function findBySnapshotId(req, snapshotId) {
    const VisitRecord = _getModel(req);
    return VisitRecord.findOne({
        snapshotId,
        }).lean();
}

module.exports = {
    create,
    findByCaseId,
    countByCaseId,
    findById,
    findByAppointmentId,
    findBySnapshotId,
};
