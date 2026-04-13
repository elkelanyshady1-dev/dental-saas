const mongoose = require("mongoose");

const paymentAllocationSchema = new mongoose.Schema(
    {
        // Per-org DB: kept for reference but NOT required.
        organizationId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Organization",
        },
        paymentId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "PatientPayment",
            required: true
        },
        invoiceId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "PatientInvoice",
            required: true
        },
        allocatedAmount: {
            type: Number,
            required: true
        },
        // v8.2 Precision Extension (Minor Units)
        allocatedAmountMinor: { type: Number },
        currency: { type: String, required: true, default: "AED" },
    },
    { timestamps: true }
);

// Per-org DB: indexes optimized — no organizationId prefix needed.
paymentAllocationSchema.index({ invoiceId: 1 });
paymentAllocationSchema.index({ paymentId: 1 });

const modelName = "PaymentAllocation";

module.exports = {
    modelName,
    schema: paymentAllocationSchema,
    default: mongoose.models[modelName] || mongoose.model(modelName, paymentAllocationSchema),
};
