const mongoose = require("mongoose");

const appointmentSchema = new mongoose.Schema(
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

        dentistId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            required: true,
        },

        chairId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Chair",
            required: true,
        },

        startTime: {
            type: Date,
            required: true,
        },

        endTime: {
            type: Date,
            required: true,
        },

        duration: {
            type: Number, // minutes
            required: true,
        },

        status: {
            type: String,
            enum: [
                "open",
                "confirmed",
                "checked-in",
                "in-progress",
                "completed",
                "delayed",
                "cancelled",
                "no-show",
                "waiting-list",
            ],
            default: "open",
        },

        // ─── Audit trail ─────────────────────────────────
        statusHistory: [
            {
                status: String,
                changedBy: {
                    type: mongoose.Schema.Types.ObjectId,
                    ref: "User",
                },
                changedAt: {
                    type: Date,
                    default: Date.now,
                },
            },
        ],

        // ─── Timestamps per status ───────────────────────
        checkedInAt: Date,
        startedAt: Date,
        completedAt: Date,
        cancelledAt: Date,

        // ─── Waiting time (computed) ─────────────────────
        waitingDuration: {
            type: Number, // minutes
            default: null,
        },

        notes: {
            type: String,
            default: "",
        },
        isActive: {
            type: Boolean,
            default: true,
        },
        deletedAt: {
            type: Date,
            default: null,
        },
    },
    { timestamps: true }
);

// ─── Indexes ──────────────────────────────────────────────

// Calendar queries: list by branch + time range
appointmentSchema.index({ organizationId: 1, branchId: 1, startTime: 1 });

// Dentist overlap: across ALL branches
appointmentSchema.index({ organizationId: 1, dentistId: 1, startTime: 1, endTime: 1 });

// Chair overlap: within branch
appointmentSchema.index({ organizationId: 1, branchId: 1, chairId: 1, startTime: 1, endTime: 1 });

// Dashboard filtering by status
appointmentSchema.index({ organizationId: 1, status: 1, startTime: 1 });
appointmentSchema.index({ organizationId: 1, branchId: 1, startTime: 1 }); // Enhanced index

module.exports = mongoose.model("Appointment", appointmentSchema);
