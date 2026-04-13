const mongoose = require("mongoose");

const printSettingSchema = new mongoose.Schema(
    {
        // Per-org DB: kept for reference but NOT required.
        organizationId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Organization",
        },
        branchId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Branch",
            required: true
        },
        clinicNameArabic: { type: String },
        clinicNameEnglish: { type: String },
        addressArabic: { type: String },
        addressEnglish: { type: String },
        phone: { type: String },
        taxId: { type: String },
        licenseNumber: { type: String },
        logoUrl: { type: String },
        doctorSignatureUrl: { type: String },
        defaultInvoiceTemplateId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "DocumentTemplate"
        },
        defaultPrescriptionTemplateId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "DocumentTemplate"
        },
        defaultReceiptTemplateId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "DocumentTemplate"
        },
        enableOverlay: { type: Boolean, default: false },
        showWatermarkOnVoid: { type: Boolean, default: true },
        thermalPrinterWidthMM: { type: Number, default: 80 }
    },
    { timestamps: true }
);

// Per-org DB: unique per branch per database
printSettingSchema.index({ branchId: 1 }, { unique: true });

const modelName = "PrintSetting";

module.exports = {
    modelName,
    schema: printSettingSchema,
    default: mongoose.models[modelName] || mongoose.model(modelName, printSettingSchema),
};
