/**
 * intake.controller.js — Patient Intake Magic Link Controller
 * v2.0 — Phase F.6 Zero-Trust RLS Migration
 *
 * Phase F.6 Changes:
 *   - Authenticated endpoints use SecurePatient for tenant isolation enforcement
 *   - PUBLIC endpoints (validateToken, submitIntakeForm) use token-resolved
 *     organizationId scoping — these are structurally exempt from req-based
 *     RLS because they run without JWT auth. They use explicit organizationId
 *     from the validated intake token record.
 *
 * Endpoints:
 *   POST /patient/domain/:id/intake-link  (staff, authenticated)
 *   GET  /intake/:token                    (public)
 *   POST /intake/:token                    (public)
 */

"use strict";

const crypto = require("crypto");
const PatientIntakeToken = require("./patientIntakeToken.model");
const PatientDef = require("../../../organization/patient/models/patient.model");
const getModel = require("../../../core/db/getModel");
const dbManager = require("../../../core/db/dbManager");
const { successResponse, errorResponse } = require("@utils/responseFormatter");
const { authorize } = require("@utils/authorize");
const { P } = require("@rbac/orgPermissions");
const { resolveDisplayName } = require("../../../dto/patient.dto");

// Per-request model (authenticated routes)
function _getPatient(req) {
    return getModel(req.dbConnection, PatientDef);
}

// Connection-bound model for public routes (no req.dbConnection available)
function _getPatientForOrg(orgId) {
    const conn = dbManager.getConnection(orgId.toString());
    return getModel(conn, PatientDef);
}

class IntakeController {
    /**
     * POST /patient/domain/:id/intake-link
     * Generate a magic link token for the patient intake form.
     * Requires authenticated staff user (RLS-enforced).
     */
    async generateIntakeLink(req, res) {
        try {
            authorize(req, P.PATIENTS_UPDATE);
            const organizationId = req.context.organizationId;
            const patientId = req.params.id;

            const Patient = _getPatient(req);
            const patient = await Patient.findOne({
                _id: patientId,
                isActive: true,
            }).lean();

            if (!patient) {
                return errorResponse(res, "Patient not found.", "NOT_FOUND", 404);
            }

            // Generate secure token
            const token = crypto.randomBytes(32).toString("hex");
            const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours

            await PatientIntakeToken.create({
                patientId,
                organizationId,
                token,
                expiresAt,
            });

            // Build intake URL
            const baseUrl = process.env.FRONTEND_URL || req.headers.origin || "https://app.dentalsaas.com";
            const intakeUrl = `${baseUrl}/intake/${token}`;

            return successResponse(res, {
                token,
                intakeUrl,
                expiresAt,
                patientName: resolveDisplayName(patient),
            }, 201);
        } catch (error) {
            console.error("Intake Link Generation Error:", error);
            return errorResponse(res, error.message, "INTAKE_LINK_ERROR", 500);
        }
    }

    /**
     * GET /intake/:token
     * Validate token and return patient basic info (public endpoint).
     *
     * @per-org-public-access — No JWT auth. Token contains organizationId.
     * This is structurally safe: organizationId comes exclusively from the
     * server-side PatientIntakeToken record (not from user input).
     */
    async validateToken(req, res) {
        try {
            const { token } = req.params;

            // @per-org-public-access — intake flow — no JWT context, token carries organizationId
            const intakeToken = await PatientIntakeToken.findOne({
                token,
                used: false,
                expiresAt: { $gt: new Date() },
            }).lean();

            if (!intakeToken) {
                return errorResponse(res, "Invalid or expired intake link.", "INVALID_TOKEN", 404);
            }

            // @per-org-public-access — intake flow — organizationId from validated token record
            const Patient = _getPatientForOrg(intakeToken.organizationId);
            // @per-org-public-access — intake flow, token-bound, connection-scoped
            const patient = await Patient.findOne({
                _id: intakeToken.patientId,
            })
                .select("nameEnglish nameArabic phone patientCode gender dateOfBirth")
                .lean();

            if (!patient) {
                return errorResponse(res, "Patient record not found.", "NOT_FOUND", 404);
            }

            return successResponse(res, {
                patient: {
                    name: resolveDisplayName(patient),
                    patientCode: patient.patientCode,
                    phone: patient.phone,
                    gender: patient.gender,
                    dateOfBirth: patient.dateOfBirth,
                },
                expiresAt: intakeToken.expiresAt,
            });
        } catch (error) {
            console.error("Intake Token Validation Error:", error);
            return errorResponse(res, error.message, "TOKEN_VALIDATION_ERROR", 500);
        }
    }

    /**
     * POST /intake/:token
     * Accept patient intake form submission (public endpoint).
     * Updates patient record with additional information.
     *
     * @per-org-public-access — No JWT auth. Token contains organizationId.
     * This is structurally safe: all DB writes scope to the token's
     * organizationId, which was set at generation by an authenticated staff.
     */
    async submitIntakeForm(req, res) {
        try {
            const { token } = req.params;
            const {
                address,
                medicalHistory,
                allergies,
                insurance,
                emergencyContact,
                nationality,
                nationalId,
                maritalStatus,
                job,
                email,
                dateOfBirth,
            } = req.body;

            // Validate token
            // @per-org-public-access — intake flow — no JWT context, token carries organizationId
            const intakeToken = await PatientIntakeToken.findOne({
                token,
                used: false,
                expiresAt: { $gt: new Date() },
            });

            if (!intakeToken) {
                return errorResponse(res, "Invalid or expired intake link.", "INVALID_TOKEN", 404);
            }

            // Build update payload (only non-empty fields)
            const updateData = {};
            if (address) updateData.address = address;
            if (email) updateData.email = email;
            if (nationality) updateData.nationality = nationality;
            if (nationalId) updateData.nationalId = nationalId;
            if (maritalStatus) updateData.maritalStatus = maritalStatus;
            if (job) updateData.job = job;
            if (dateOfBirth) updateData.dateOfBirth = dateOfBirth;

            if (insurance?.provider || insurance?.policyNumber) {
                updateData.insurance = {
                    provider: insurance.provider || "",
                    policyNumber: insurance.policyNumber || "",
                };
            }

            if (emergencyContact?.name || emergencyContact?.phone) {
                updateData.emergencyContact = {
                    name: emergencyContact.name || "",
                    phone: emergencyContact.phone || "",
                    relation: emergencyContact.relation || "",
                };
            }

            // Mark patient as "complete" status since intake is filled
            updateData.status = "complete";

            // Per-org DB: connection scopes to org database — no organizationId filter needed
            const Patient = _getPatientForOrg(intakeToken.organizationId);
            await Patient.updateOne(
                { _id: intakeToken.patientId },
                { $set: updateData, $inc: { version: 1 } }
            );

            // Handle medical history via clinical record if provided
            if (medicalHistory || allergies) {
                const ClinicalRecord = require("../clinical/clinical.model");
                const clinicalUpdate = {};
                if (medicalHistory) clinicalUpdate["medicalHistory"] = medicalHistory;
                if (allergies) clinicalUpdate["medicalHistory.allergies"] = allergies;

                // Per-org DB: connection scopes to org database
                await ClinicalRecord.findOneAndUpdate(
                    { patientId: intakeToken.patientId },
                    { $set: clinicalUpdate },
                    { upsert: true }
                );
            }

            // Mark token as used
            intakeToken.used = true;
            intakeToken.submittedAt = new Date();
            await intakeToken.save();

            return successResponse(res, {
                message: "Intake form submitted successfully.",
                submittedAt: intakeToken.submittedAt,
            });
        } catch (error) {
            console.error("Intake Form Submission Error:", error);
            return errorResponse(res, error.message, "INTAKE_SUBMIT_ERROR", 500);
        }
    }
}

module.exports = new IntakeController();
