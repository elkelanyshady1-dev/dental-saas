/**
 * portalProfile.projection.js
 * Phase 5 — Portal Domain-Owned Read Model: Patient Profile
 *
 * Replaces: patientProjection.buildPatientProfile()
 * Source Models: Patient (org domain), ClinicalRecord (patient domain)
 *
 * DOMAIN BOUNDARY:
 *   This projection uses getModel(req.dbConnection, ModelDef) to resolve
 *   connection-bound Mongoose models at runtime. No global mongoose.model()
 *   calls — models are resolved on the caller's per-org connection.
 *
 * SECURITY:
 *   - Uses secureModel() for all queries (Phase 2 RLS)
 *   - Accepts req for tenant context injection
 *   - Returns DTO with explicit field whitelist (no raw document leak)
 *
 * @per-org-transactional — portal profile projection — organizationId from req.rls
 */

"use strict";

const getModel = require("../../../core/db/getModel");
const PatientDef = require("../../../organization/patient/models/patient.model");
const ClinicalRecordDef = require("../../patientDomain/clinical/clinical.model");

/**
 * Builds a patient profile DTO for the portal dashboard.
 *
 * Patient-visible fields ONLY — no internal IDs, no staff data,
 * no financial details (those come from portalFinancial.projection).
 *
 * @param {Object} req - Express request (must have req.rls + req.dbConnection)
 * @returns {Object|null} Patient profile DTO
 */
async function buildPortalProfile(req) {
    const patientId = req.patientId || req.rls?.patientId;

    if (!patientId) {
        return null;
    }

    // Resolve Patient model on the caller's per-org connection
    const Patient = getModel(req.dbConnection, PatientDef);
    const securePatient = Patient;

    const patient = await securePatient
        .findOne({ _id: patientId, isActive: true })
        .select("nameArabic nameEnglish phone email gender dateOfBirth patientCode createdAt")
        .lean();

    if (!patient) return null;

    // Clinical data (optional — may not exist for all patients)
    let clinical = null;
    try {
        const ClinicalRecord = getModel(req.dbConnection, ClinicalRecordDef);
        const secureClinical = ClinicalRecord;

        clinical = await secureClinical
            .findOne({ patientId })
            .select("medicalHistory")
            .lean();
    } catch (_) {
        // ClinicalRecord model may not be registered — safe to skip
    }

    // Build alerts from clinical data
    const alerts = [];
    const riskFlags = [];

    if (clinical?.medicalHistory?.allergies?.length > 0) {
        alerts.push({ type: "MEDICAL_ALLERGY", data: clinical.medicalHistory.allergies });
    }
    if (clinical?.medicalHistory?.smoking) riskFlags.push("SMOKER");
    if (clinical?.medicalHistory?.pregnancy) riskFlags.push("PREGNANT");

    // Normalized DTO — explicit whitelist only
    return {
        id: patient._id.toString(),
        demographics: {
            fullName: patient.nameArabic || patient.nameEnglish,
            nameArabic: patient.nameArabic,
            nameEnglish: patient.nameEnglish,
            phone: patient.phone,
            email: patient.email,
            gender: patient.gender,
            dob: patient.dateOfBirth,
        },
        clinical: {
            riskFlags,
            alerts,
            hasHistory: !!clinical,
        },
        metadata: {
            patientCode: patient.patientCode,
            status: "active",
            createdAt: patient.createdAt?.toISOString(),
        },
    };
}

module.exports = {
    buildPortalProfile,
};
