/**
 * branchCounter.repository.js — DDD Repository Layer
 * v4.0 — Guards V2 Migration (Direct Model Access)
 *
 * Isolates BranchCounter DB queries.
 * Uses getModel(req.dbConnection, Def) for per-org model resolution.
 */

"use strict";

const BranchCounterDef = require("../core/branchCounter.model");
const BranchDef = require("../../../shared/models/Branch");
const getModel = require("../../../core/db/getModel");

// ── Connection-Bound Helpers ────────────────────────────────────────────────
function _getModels(req) {
    return {
        BranchCounter: getModel(req.dbConnection, BranchCounterDef),
        Branch: getModel(req.dbConnection, BranchDef),
    };
}

class BranchCounterRepository {
    /**
     * Atomic increment and return next sequence number for a branch.
     * @param {string} branchId
     * @param {object} req   Express request (must have req.dbConnection)
     * @param {import("mongoose").ClientSession} session
     * @returns {Promise<{ branchInitial: string, patientCode: string }>}
     */
    async getNextPatientCode(branchId, req, session) {
        const { BranchCounter, Branch } = _getModels(req);

        const branch = await Branch.findById(branchId).select("name").lean();
        const branchInitial = (branch?.name?.[0] || "X").toUpperCase();

        const counter = await BranchCounter.findOneAndUpdate(
            { branchId },
            { $inc: { sequence: 1 } },
            { upsert: true, returnDocument: "after", session }
        );

        return {
            branchInitial,
            patientCode: `${branchInitial}${counter.sequence}`
        };
    }

    /**
     * Peek at the next code without incrementing.
     * @param {string} branchId
     * @param {object} req   Express request (must have req.dbConnection)
     * @returns {Promise<{ branchInitial: string, nextSequence: number, nextCode: string }>}
     */
    async peekNextCode(branchId, req) {
        const { BranchCounter, Branch } = _getModels(req);

        const branch = await Branch.findById(branchId).select("name").lean();
        const branchInitial = (branch?.name?.[0] || "X").toUpperCase();

        const counter = await BranchCounter.findOne({ branchId }).lean();
        const nextSequence = (counter?.sequence || 0) + 1;

        return { branchInitial, nextSequence, nextCode: `${branchInitial}${nextSequence}` };
    }
}

module.exports = new BranchCounterRepository();
