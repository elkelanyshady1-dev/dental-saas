/**
 * clinical.controller.js — Clinical Record Controller
 * v2.0 — Phase F.6 Zero-Trust RLS Migration
 *
 * Phase F.6 Changes:
 *   - Replaced buildScopedQuery + raw Patient.countDocuments with Patient
 *   - req passed to getPatientAggregate for tenant context
 *   - Legacy RLS exemptions removed — fully migrated to secureModel
 */
const patientAggregateService = require("../core/patient.aggregate.service");
const PatientDef = require("../../../organization/patient/models/patient.model");
const getModel = require("../../../core/db/getModel");
const {
  successResponse,
  errorResponse
} = require("@utils/responseFormatter");
const {
  authorize
} = require("@utils/authorize");
const {
  P
} = require("@rbac/orgPermissions");
function _getPatient(req) {
  return getModel(req.dbConnection, PatientDef);
}
class ClinicalController {
  async getRecord(req, res) {
    try {
      if (req.context?.type === "org" || req.user?.type !== "patient") {
        authorize(req, P.PATIENTS_READ);
      }
      const organizationId = req.context?.organizationId || req.organizationId;
      const patientId = req.context?.patientId || (req.user?.type === "patient" ? req.user.patientId : req.params.id);
      const Patient = _getPatient(req);
      const accessCheck = await Patient.countDocuments({
        _id: patientId
      });
      if (accessCheck === 0) {
        return errorResponse(res, "Patient not found or access denied", "NOT_FOUND", 404);
      }
      const profile = await patientAggregateService.getPatientAggregate({
        patientId,
        req
      });
      return successResponse(res, profile.clinical);
    } catch (error) {
      return errorResponse(res, error.message, "FETCH_FAILED", 400);
    }
  }
  async update(req, res) {
    try {
      if (req.context?.type === "org" || req.user?.type !== "patient") {
        authorize(req, P.PATIENTS_UPDATE);
      }
      const organizationId = req.context?.organizationId || req.organizationId;
      const patientId = req.context?.patientId || (req.user?.type === "patient" ? req.user.patientId : req.params.id);
      const actorId = req.context?.userId || req.user?._id;
      const Patient = _getPatient(req);
      const accessCheck = await Patient.countDocuments({
        _id: patientId
      });
      if (accessCheck === 0) {
        return errorResponse(res, "Patient not found or access denied", "NOT_FOUND", 404);
      }
      const record = await patientAggregateService.updateMedicalHistory({
        actorId,
        patientId,
        medicalHistory: req.body,
        notes: req.body.notes,
        ipAddress: req.ip
      });
      return successResponse(res, record.clinical);
    } catch (error) {
      return errorResponse(res, error.message, "UPDATE_FAILED", 400);
    }
  }
}
module.exports = new ClinicalController();