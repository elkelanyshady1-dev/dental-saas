const mongoose = require("mongoose");

const financialEventLedgerSchema = new mongoose.Schema(
    {
        eventId: {
            type: String,
            required: true
        },
        // Per-org DB: kept for reference but NOT required.
        organizationId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Organization",
        },
        processedAt: {
            type: Date,
            default: Date.now
        }
    }
);

financialEventLedgerSchema.index({ eventId: 1 }, { unique: true });

const modelName = "FinancialEventLedger";

module.exports = {
    modelName,
    schema: financialEventLedgerSchema,
    default: mongoose.models[modelName] || mongoose.model(modelName, financialEventLedgerSchema),
};
