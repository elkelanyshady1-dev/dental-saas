/**
 * patient.read.service.js
 * 
 * Read-Only Facade for Patient Domain.
 * Strictly prohibits mutations.
 *
 * @per-org-compliant — All read operations use getModel + guards.
 * organizationId auto-injected via per-org DB connection.
 *
 * Phase F.3 — Runtime assertions as defense-in-depth.
 */

const PatientDef = require("../../../organization/patient/models/patient.model");
const getModel = require("../../../core/db/getModel");
const { assertPatientRLS } = require("../../../core/guards/tenantAssertions");

// Per-request model resolution
function _getPatient(req) {
    return getModel(req.dbConnection, PatientDef);
}

class PatientReadService {
    /**
     * getPatientById(req, patientId, session)
     * Returns a plain JS object representing the patient.
     * @per-org-compliant — per-org DB connection provides tenant isolation
     */
    async getPatientById(req, patientId, session = null) {
        assertPatientRLS(req, "PatientReadService.getPatientById");
        return await _getPatient(req).findOne({ _id: patientId })
            .session(session)
            .lean();
    }

    /**
     * existsPatient(req, patientId, session)
     * Lightweight check for patient existence within an organization.
     * @per-org-compliant — per-org DB connection provides tenant isolation
     */
    async existsPatient(req, patientId, session = null) {
        assertPatientRLS(req, "PatientReadService.existsPatient");
        const count = await _getPatient(req).countDocuments({ _id: patientId })
            .session(session);
        return count > 0;
    }

    /**
     * getPatientsByIds(req, patientIds, selectFields, session)
     * Batched read for performance-safe cross-domain display data.
     * @per-org-compliant — per-org DB connection provides tenant isolation
     */
    async getPatientsByIds(req, patientIds, selectFields = "nameArabic nameEnglish", session = null) {
        assertPatientRLS(req, "PatientReadService.getPatientsByIds");
        return await _getPatient(req).find({ _id: { $in: patientIds } })
            .select(selectFields)
            .session(session)
            .lean();
    }
}

module.exports = new PatientReadService();
