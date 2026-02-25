const mongoose = require("mongoose");

const recallSchema = new mongoose.Schema(
    {
        organizationId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Organization",
            required: true,
        },

        branchId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Branch",
            required: true,
        },

        patientId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Patient",
            required: true,
        },

        dueDate: {
            type: Date,
            required: true,
        },

        reason: {
            type: String,
            default: "",
        },

        status: {
            type: String,
            enum: ["pending", "sent", "booked", "cancelled"],
            default: "pending",
        },
    },
    { timestamps: true }
);

// Due recall queries by branch + date
recallSchema.index({ organizationId: 1, branchId: 1, dueDate: 1 });

// Automation: find all pending due recalls across org
recallSchema.index({ organizationId: 1, status: 1, dueDate: 1 });

module.exports = mongoose.model("Recall", recallSchema);
