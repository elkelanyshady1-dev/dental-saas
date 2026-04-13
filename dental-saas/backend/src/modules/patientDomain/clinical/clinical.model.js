const mongoose = require("mongoose");

const clinicalRecordSchema = new mongoose.Schema(
    {
        organizationId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Organization",
            required: true,
        },
        patientId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Patient",
            required: true,
        },
        medicalHistory: {
            chronicConditions: [String],
            allergies: [String],
            medications: [String],
            smoking: Boolean,
            pregnancy: Boolean,
        },
        notes: [{
            authorId: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
            content: String,
            createdAt: { type: Date, default: Date.now }
        }],
    },
    { timestamps: true }
);

clinicalRecordSchema.index({ organizationId: 1, patientId: 1 });

const modelName = "ClinicalRecord";

module.exports = {
    modelName,
    schema: clinicalRecordSchema,
    default: mongoose.models[modelName] || mongoose.model(modelName, clinicalRecordSchema),
};
