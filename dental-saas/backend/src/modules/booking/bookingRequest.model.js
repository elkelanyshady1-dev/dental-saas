const mongoose = require("mongoose");

const bookingRequestSchema = new mongoose.Schema(
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
        requestedDate: {
            type: Date,
            required: true,
        },
        requestedTime: {
            type: String, // "HH:mm" format
            required: true,
        },
        status: {
            type: String,
            enum: ["pending", "approved", "rejected"],
            default: "pending",
        },
        approvedBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
        },
        approvedAt: Date,
        rejectionReason: String,
        notes: String,
    },
    { timestamps: true }
);

// Performance index for staff-side dashboard and tenant isolation
bookingRequestSchema.index({ organizationId: 1, branchId: 1, status: 1 });
bookingRequestSchema.index({ organizationId: 1, branchId: 1, requestedDate: 1 });
bookingRequestSchema.index({ organizationId: 1, patientId: 1 });

const modelName = "BookingRequest";

module.exports = {
    modelName,
    schema: bookingRequestSchema,
    default: mongoose.models[modelName] || mongoose.model(modelName, bookingRequestSchema),
};
