/**
 * ortho.models.js
 * 
 * Specialty Extension for Orthodontics
 */
const mongoose = require("mongoose");

// We don't redefine ClinicalCase, we define extension structures 
// that sit inside ClinicalCase.extensionData or link via patientId/caseId

const cephStudySchema = new mongoose.Schema({
    organizationId: { type: mongoose.Schema.Types.ObjectId, ref: "Organization" },
    patientId: { type: mongoose.Schema.Types.ObjectId, ref: "Patient", required: true },
    caseId: { type: mongoose.Schema.Types.ObjectId, ref: "ClinicalCase", required: true },
    mediaId: { type: mongoose.Schema.Types.ObjectId, ref: "ClinicalMediaAsset", required: true },
    landmarks: [{
        name: { type: String }, // e.g., "Sella", "Nasion"
        x: { type: Number },
        y: { type: Number }
    }],
    measurements: {
        sna: Number,
        snb: Number,
        anb: Number,
        // ... more measurements
    },
    createdAt: { type: Date, default: Date.now }
});

const cephStudyModelName = "CephStudy";

module.exports = {
    cephStudyModelName,
    cephStudySchema,
    CephStudy: mongoose.models[cephStudyModelName] || mongoose.model(cephStudyModelName, cephStudySchema),
};
