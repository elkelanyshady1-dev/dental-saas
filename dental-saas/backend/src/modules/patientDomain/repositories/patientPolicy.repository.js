/**
 * patientPolicy.repository.js — DDD Repository Layer
 * v4.0 — Guards V2 Migration (Direct Model Access)
 *
 * Isolates PatientPolicy DB queries.
 * Uses getModel(req.dbConnection, Def) for per-org model resolution.
 */

"use strict";

const PatientPolicyDef = require("../policies/patientPolicy.model");
const getModel = require("../../../core/db/getModel");

// ── Connection-Bound Helper ─────────────────────────────────────────────────
function _getPatientPolicy(req) {
    return getModel(req.dbConnection, PatientPolicyDef);
}

class PatientPolicyRepository {
    /**
     * Find policy for organization (inside optional session).
     * @param {object} req   Express request (must have req.dbConnection)
     * @param {import("mongoose").ClientSession} [session]
     * @returns {Promise<object|null>}
     */
    async findByOrg(req, session = null) {
        const PatientPolicy = _getPatientPolicy(req);
        const q = PatientPolicy.findOne({});
        if (session) q.session(session);
        return q;
    }

    /**
     * Find policy for organization — lean (read-only).
     * @param {object} req   Express request (must have req.dbConnection)
     * @returns {Promise<object|null>}
     */
    async findByOrgLean(req) {
        const PatientPolicy = _getPatientPolicy(req);
        return PatientPolicy.findOne({}).lean();
    }

    /**
     * Create new policy.
     * @param {object} data   Policy data
     * @param {object} req    Express request (must have req.dbConnection)
     * @param {import("mongoose").ClientSession} session
     * @returns {Promise<object>}
     */
    async create(data, req, session) {
        const PatientPolicy = _getPatientPolicy(req);
        const instance = new PatientPolicy(data);
        if (session) {
            await instance.save({ session });
        } else {
            await instance.save();
        }
        return instance;
    }

    /**
     * Versioned update with OAV check.
     * @param {string} policyId
     * @param {object} req   Express request (must have req.dbConnection)
     * @param {number} targetVersion
     * @param {object} updateSet
     * @param {import("mongoose").ClientSession} session
     */
    async versionedUpdate(policyId, req, targetVersion, updateSet, session) {
        const VersionConflictError = require("../../../errors/VersionConflictError");
        const PatientPolicy = _getPatientPolicy(req);
        const result = await PatientPolicy.updateOne(
            { _id: policyId, version: targetVersion },
            { $set: updateSet, $inc: { version: 1 } },
            session ? { session } : undefined
        );

        if (result.modifiedCount === 0) {
            throw new VersionConflictError("Aggregate version mismatch");
        }

        return result;
    }
}

module.exports = new PatientPolicyRepository();
