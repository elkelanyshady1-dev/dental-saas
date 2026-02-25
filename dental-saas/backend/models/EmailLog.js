const mongoose = require("mongoose");

const emailLogSchema = new mongoose.Schema(
    {
        organizationId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Organization",
            required: true,
        },
        invoiceId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Invoice",
        },
        type: {
            type: String,
            enum: [
                "INVOICE_CREATED",
                "INVOICE_PAID",
                "RETRY_FAILED",
                "RETRY_EXHAUSTED",
                "GRACE_STARTED",
                "SUBSCRIPTION_SUSPENDED",
                "TEMP_PASSWORD",
                "PASSWORD_RESET",
            ],
            required: true,
        },
        // cycleId used for idempotency to prevent sending the same email multiple times per billing cycle
        cycleId: {
            type: String,
        },
        recipient: {
            type: String,
            required: true,
        },
        status: {
            type: String,
            enum: ["pending", "sent", "failed"],
            default: "pending",
        },
        errorMessage: {
            type: String,
        },
    },
    { timestamps: true }
);

// Index to quickly look up emails and prevent duplicate spam per cycle
emailLogSchema.index({ organizationId: 1, type: 1, cycleId: 1 });
emailLogSchema.index({ organizationId: 1, createdAt: -1 });

module.exports = mongoose.model("EmailLog", emailLogSchema);
