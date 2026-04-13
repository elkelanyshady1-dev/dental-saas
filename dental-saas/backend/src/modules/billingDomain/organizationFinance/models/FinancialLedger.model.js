const mongoose = require("mongoose");

const financialLedgerSchema = new mongoose.Schema(
    {
        // Per-org DB: kept for reference but NOT required.
        organizationId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Organization",
        },
        patientId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Patient",
            required: true
        },
        type: {
            type: String,
            required: true
        },
        amount: {
            type: Number,
            required: true
        },
        // v8.2 Precision Extension (Minor Units)
        amountMinor: { type: Number },
        currency: { type: String, required: true, default: "AED" },
        referenceId: {
            type: mongoose.Schema.Types.ObjectId,
            required: true
        },
        branchId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Branch",
            required: true
        },
        performedByUserId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            required: true
        },
        timestamp: {
            type: Date,
            default: Date.now
        }
    }
);

// Force immutability by preventing updates/deletes? 
// In Mongoose we can use middleware or just not expose methods.
// The index helps with audit trails.
// Per-org DB: indexes optimized — no organizationId prefix needed.
financialLedgerSchema.index({ patientId: 1, timestamp: -1 });
financialLedgerSchema.index({ branchId: 1 });

const modelName = "FinancialLedger";

module.exports = {
    modelName,
    schema: financialLedgerSchema,
    default: mongoose.models[modelName] || mongoose.model(modelName, financialLedgerSchema),
};
