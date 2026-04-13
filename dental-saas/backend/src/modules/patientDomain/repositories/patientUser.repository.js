/**
 * patientUser.repository.js — DDD Repository Layer
 * v5.0 — Guards V2 Migration (Direct Model Access)
 *
 * Isolates PatientUser (portal access) DB queries.
 * Per-org mode: req.dbConnection is ALWAYS required.
 */

"use strict";

const PatientUserDef = require("../access/patientUser.model");
const getModel = require("../../../core/db/getModel");

// ── Strict Per-Org Helper ───────────────────────────────────────────────────
function _getPatientUser(reqOrConnection) {
    const connection = reqOrConnection?.dbConnection || reqOrConnection;
    if (!connection) {
        throw new Error("[PatientUserRepository] connection is REQUIRED — per-org mode does not allow fallback");
    }
    return getModel(connection, PatientUserDef);
}

class PatientUserRepository {
    /**
     * Invalidate patient portal access (kill-switch).
     * Increments tokenVersion to invalidate all active JWTs.
     *
     * @param {string} patientId
     * @param {string} organizationId
     * @param {import("mongoose").ClientSession} session
     * @param {object} req   Express request (must have req.dbConnection)
     */
    async invalidateAccess(patientId, organizationId, session, req) {
        const PatientUser = _getPatientUser(req);
        return PatientUser.updateOne(
            { patientId },
            { $inc: { tokenVersion: 1 }, $set: { isActive: false } },
            session ? { session } : undefined
        );
    }

    /**
     * Background/transaction context — requires explicit connection.
     * @param {string} patientId
     * @param {string} organizationId
     * @param {import("mongoose").ClientSession} session
     * @param {import("mongoose").Connection} connection — from connectionResolver
     */
    async invalidateAccessWithConnection(patientId, organizationId, session, connection) {
        const PatientUser = _getPatientUser(connection);
        return PatientUser.updateOne(
            { patientId, organizationId },
            { $inc: { tokenVersion: 1 }, $set: { isActive: false } },
            { session }
        );
    }
}

module.exports = new PatientUserRepository();
