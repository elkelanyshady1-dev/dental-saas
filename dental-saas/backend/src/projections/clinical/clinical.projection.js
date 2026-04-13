"use strict";

const dbManager = require("@core/db/dbManager");
const getModel = require("@core/db/getModel");
const PrescriptionDef = require("../../modules/patientDomain/clinical/prescription.model");
const PatientDef = require("../../organization/patient/models/patient.model");
const UserDef = require("../../shared/models/User");

/**
 * buildPrescriptionView(prescriptionId, organizationId, dbConnection)
 * Returns a medical-grade DTO for prescription printing.
 */
async function buildPrescriptionView({ prescriptionId, organizationId, dbConnection }) {
    // Resolve connection: prefer passed dbConnection, fallback to orgId lookup
    const conn = dbConnection || dbManager.getConnection(String(organizationId));
    const Prescription = getModel(conn, PrescriptionDef);
    // Patient and User are populated via Mongoose refs — they need to be registered
    // on the same connection for .populate() to work
    getModel(conn, PatientDef);
    getModel(conn, UserDef);

    const prescription = await Prescription.findOne({ _id: prescriptionId, organizationId })
        .populate("patientId", "nameArabic nameEnglish dateOfBirth gender patientCode")
        .populate("doctorId", "name licenseNumber signatureUrl")
        .lean();

    if (!prescription) throw new Error("Prescription not found or unauthorized.");

    const patient = prescription.patientId;
    const doctor = prescription.doctorId;

    // Calculate age
    let age = "-";
    if (patient.dateOfBirth) {
        const today = new Date();
        const birthDate = new Date(patient.dateOfBirth);
        age = today.getFullYear() - birthDate.getFullYear();
        const m = today.getMonth() - birthDate.getMonth();
        if (m < 0 || (m === 0 && today.getDate() < birthDate.getDate())) {
            age--;
        }
    }

    return {
        prescriptionId: prescription._id,
        prescriptionNumber: prescription.prescriptionNumber,
        date: prescription.createdAt.toLocaleDateString("en-GB"),
        patientName: patient.nameArabic || patient.nameEnglish,
        patientAge: age,
        patientGender: patient.gender || "-",
        patientCode: patient.patientCode,
        diagnosis: prescription.diagnosis,
        medications: prescription.medications.map(m => ({
            drugName: m.drugName,
            dosage: m.dosage,
            frequency: m.frequency,
            duration: m.duration,
            instructions: m.instructions || "-"
        })),
        doctorName: doctor?.name || "-",
        doctorLicenseNumber: doctor?.licenseNumber || "-",
        doctorSignature: doctor?.signatureUrl || null,
        notes: prescription.notes || ""
    };
}

module.exports = {
    buildPrescriptionView
};
