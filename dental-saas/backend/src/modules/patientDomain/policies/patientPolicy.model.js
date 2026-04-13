const mongoose = require("mongoose");

const patientPolicySchema = new mongoose.Schema(
    {
        // Per-org DB: kept for reference but NOT required.
        organizationId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Organization",
        },
        allowMedicalHistoryUpdate: { type: Boolean, default: true },
        allowFileUpload: { type: Boolean, default: true },
        allowInvoiceViewing: { type: Boolean, default: true },
        allowDoctorSelection: { type: Boolean, default: false },
        allowOnlinePayment: { type: Boolean, default: false },
        version: { type: Number, default: 0 }
    },
    { timestamps: true }
);

// Per-org DB: singleton per database (no organizationId needed in index)

const modelName = "PatientPolicy";

module.exports = {
    modelName,
    schema: patientPolicySchema,
    default: mongoose.models[modelName] || mongoose.model(modelName, patientPolicySchema),
};
