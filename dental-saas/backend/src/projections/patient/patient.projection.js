/**
 * patient.projection.js — CQRS-lite Read Model
 */
"use strict";

const getModel = require("@core/db/getModel");
const PatientDef = require("../../organization/patient/models/patient.model");
const ClinicalRecord = require("../../modules/patientDomain/clinical/clinical.model");
const { buildPatientFinancialSummary } = require("../financial/financial.projection");

/** @private Resolve Patient model — connection-bound when available */
function _getPatient(dbConnection) {
    return dbConnection
        ? getModel(dbConnection, PatientDef)
        : PatientDef.default;
}

/**
 * Builds a clean, decoupled patient profile DTO.
 * @param {Object} params
 * @param {string} params.organizationId
 * @param {string} params.patientId
 * @param {import('mongoose').Connection} [params.dbConnection] — per-org DB connection
 */
async function buildPatientProfile({ organizationId, patientId, dbConnection }) {
    const Patient = _getPatient(dbConnection);
    const patient = await Patient.findOne({ _id: patientId, organizationId }).lean();
    if (!patient) return null;

    const clinical = await ClinicalRecord.findOne({ organizationId, patientId }).lean();

    // Derived logic centralized in projection layer
    const alerts = [];
    const riskFlags = [];

    if (clinical?.medicalHistory?.allergies?.length > 0) {
        alerts.push({ type: "MEDICAL_ALLERGY", data: clinical.medicalHistory.allergies });
    }

    if (clinical?.medicalHistory?.smoking) riskFlags.push("SMOKER");
    if (clinical?.medicalHistory?.pregnancy) riskFlags.push("PREGNANT");

    // 2. Fetch Financial Summary (Composition)
    const financial = await buildPatientFinancialSummary({ organizationId, patientId });

    // 3. Normalized DTO (Explicit Whitelist Only)
    return {
        id: patient._id.toString(),
        demographics: {
            fullName: patient.nameArabic || patient.nameEnglish,
            nameArabic: patient.nameArabic,
            nameEnglish: patient.nameEnglish,
            phone: patient.phone,
            email: patient.email,
            gender: patient.gender,
            dob: patient.dateOfBirth
        },
        clinical: {
            riskFlags,
            alerts,
            activeTreatments: 0, // Future: StageExecution hook
            hasHistory: !!clinical
        },
        financial: {
            outstandingBalance: financial.outstandingBalance,
            totalInvoiced: financial.totalInvoiced,
            totalPaid: financial.totalPaid,
            currency: financial.currency
        },
        metadata: {
            patientCode: patient.patientCode,
            status: patient.isActive ? "active" : "inactive",
            createdAt: patient.createdAt?.toISOString()
        }
    };
}

module.exports = {
    buildPatientProfile
};

