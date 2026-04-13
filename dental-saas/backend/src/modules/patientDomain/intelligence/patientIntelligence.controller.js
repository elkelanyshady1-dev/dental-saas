/**
 * patientIntelligence.controller.js — Patient Intelligence API
 * v2.0 — Phase F.6 Zero-Trust RLS Migration
 *
 * Phase F.6 Changes:
 *   - All raw Patient model queries replaced with Patient
 *   - organizationId removed from queries — per-org DB connection isolates it
 *   - Legacy RLS exemptions removed — fully migrated to secureModel
 *   - req passed to all secureModel calls for tenant context
 *
 * Endpoints:
 *   POST   /:id/tags         → addTag
 *   DELETE /:id/tags/:tag    → removeTag
 *   POST   /intelligence/run → runAnalysis (org-scoped)
 *   POST   /bulk             → bulkAction
 */
"use strict";

const { runPatientIntelligence, addTag, removeTag } = require("./patientIntelligence.job");
const PatientDef = require("../../../organization/patient/models/patient.model");
const getModel = require("../../../core/db/getModel");
const { successResponse, errorResponse } = require("@utils/responseFormatter");
const { authorize } = require("@utils/authorize");
const { P } = require("@rbac/orgPermissions");

function _getPatient(req) {
    return getModel(req.dbConnection, PatientDef);
}

class PatientIntelligenceController {

    /**
     * POST /:id/tags
     * Body: { tag: string }
     */
    async addTag(req, res) {
        try {
            authorize(req, P.PATIENTS_UPDATE);
            const organizationId = req.context.organizationId;
            const { id } = req.params;
            const { tag } = req.body;
            if (!tag) return errorResponse(res, "tag is required", "VALIDATION_ERROR", 400);

            await addTag(id, organizationId, tag);
            const Patient = _getPatient(req);
            const patient = await Patient.findOne({ _id: id }).select("_id tags").lean();
            return successResponse(res, { patientId: id, tags: patient?.tags ?? [] });
        } catch (err) {
            return errorResponse(res, err.message, "TAG_ERROR", 400);
        }
    }

    /**
     * DELETE /:id/tags/:tag
     */
    async removeTag(req, res) {
        try {
            authorize(req, P.PATIENTS_UPDATE);
            const organizationId = req.context.organizationId;
            const { id, tag } = req.params;

            await removeTag(id, organizationId, tag);
            const Patient = _getPatient(req);
            const patient = await Patient.findOne({ _id: id }).select("_id tags").lean();
            return successResponse(res, { patientId: id, tags: patient?.tags ?? [] });
        } catch (err) {
            return errorResponse(res, err.message, "TAG_ERROR", 400);
        }
    }

    /**
     * POST /intelligence/run
     * Triggers analysis for current organization.
     * Accepts optional balanceByPatientId map in body for financial integration.
     */
    async runAnalysis(req, res) {
        try {
            authorize(req, P.ANALYTICS_READ);
            const organizationId = req.context.organizationId;

            const { balanceByPatientId = {} } = req.body;
            const result = await runPatientIntelligence(organizationId.toString(), { balanceByPatientId });
            return successResponse(res, result);
        } catch (err) {
            return errorResponse(res, err.message, "INTELLIGENCE_ERROR", 500);
        }
    }

    /**
     * POST /bulk
     * Body: { patientIds: string[], action: "tag"|"export"|"whatsapp"|"assign_doctor", payload: any }
     */
    async bulkAction(req, res) {
        try {
            authorize(req, P.PATIENTS_UPDATE);
            const organizationId = req.context.organizationId;
            const { patientIds, action, payload } = req.body;

            if (!Array.isArray(patientIds) || patientIds.length === 0) {
                return errorResponse(res, "patientIds array required", "VALIDATION_ERROR", 400);
            }
            if (patientIds.length > 200) {
                return errorResponse(res, "Maximum 200 patients per bulk action", "VALIDATION_ERROR", 400);
            }

            let result = {};

            switch (action) {
                case "tag": {
                    const tag = payload?.tag;
                    if (!tag) return errorResponse(res, "payload.tag required", "VALIDATION_ERROR", 400);
                    const normalized = tag.trim().toLowerCase();
                    const Patient = _getPatient(req);
                    await Patient.updateMany(
                        { _id: { $in: patientIds } },
                        { $addToSet: { tags: normalized } }
                    );
                    result = { action: "tag", tag: normalized, affected: patientIds.length };
                    break;
                }

                case "remove_tag": {
                    const tag = payload?.tag;
                    if (!tag) return errorResponse(res, "payload.tag required", "VALIDATION_ERROR", 400);
                    const normalized = tag.trim().toLowerCase();
                    const Patient = _getPatient(req);
                    await Patient.updateMany(
                        { _id: { $in: patientIds } },
                        { $pull: { tags: normalized } }
                    );
                    result = { action: "remove_tag", tag: normalized, affected: patientIds.length };
                    break;
                }

                case "assign_doctor": {
                    const doctorId = payload?.doctorId;
                    if (!doctorId) return errorResponse(res, "payload.doctorId required", "VALIDATION_ERROR", 400);
                    const Patient = _getPatient(req);
                    await Patient.updateMany(
                        { _id: { $in: patientIds } },
                        { $set: { assignedDoctorId: doctorId } }
                    );
                    result = { action: "assign_doctor", doctorId, affected: patientIds.length };
                    break;
                }

                case "export": {
                    // Return patient identifiers for CSV export (handled by frontend)
                    const Patient = _getPatient(req);
                    const patients = await Patient.find({ _id: { $in: patientIds } })
                        .select("_id nameEnglish nameArabic phone patientCode email")
                        .lean();
                    result = { action: "export", patients };
                    break;
                }

                default:
                    return errorResponse(res, `Unknown action: ${action}`, "VALIDATION_ERROR", 400);
            }

            return successResponse(res, result);
        } catch (err) {
            return errorResponse(res, err.message, "BULK_ACTION_ERROR", 500);
        }
    }
}

module.exports = new PatientIntelligenceController();
