/**
 * clinicalRecord.repository.js — DDD Repository Layer
 * v4.0 — Guards V2 Migration (Direct Model Access)
 *
 * Isolates ClinicalRecord DB queries.
 * Uses getModel(req.dbConnection, Def) for per-org model resolution.
 */

"use strict";

const ClinicalRecordDef = require("../clinical/clinical.model");
const getModel = require("../../../core/db/getModel");

// ── Connection-Bound Helper ─────────────────────────────────────────────────
function _getClinicalRecord(req) {
    return getModel(req.dbConnection, ClinicalRecordDef);
}

class ClinicalRecordRepository {
    /**
     * Find or create clinical record for a patient.
     * @param {object} req   Express request (must have req.dbConnection)
     * @param {string} patientId
     * @param {import("mongoose").ClientSession} [session]
     * @returns {Promise<object>}
     */
    async findOrCreate(req, patientId, session = null) {
        const ClinicalRecord = _getClinicalRecord(req);

        const q = ClinicalRecord.findOne({ patientId });
        if (session) q.session(session);
        let record = await q;

        if (!record) {
            record = new ClinicalRecord({ patientId });
            if (session) {
                await record.save({ session });
            } else {
                await record.save();
            }
        }
        return record;
    }

    /**
     * Find clinical record (read-only).
     * @param {object} req   Express request (must have req.dbConnection)
     * @param {string} patientId
     * @returns {Promise<object|null>}
     */
    async findByPatientLean(req, patientId) {
        const ClinicalRecord = _getClinicalRecord(req);
        return ClinicalRecord.findOne({ patientId }).lean();
    }

    /**
     * Save clinical record inside transaction.
     */
    async save(record, session) {
        return record.save({ session });
    }
}

module.exports = new ClinicalRecordRepository();
