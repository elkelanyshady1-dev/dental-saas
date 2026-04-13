const mongoose = require("mongoose");

const branchSchema = new mongoose.Schema(
    {
        name: {
            type: String,
            required: true,
        },

        // Per-org DB mode: kept for reference/audit but NOT required.
        // Database isolation (dental_org_<orgId>) is the tenant boundary.
        organizationId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Organization",
        },
        email: String, // Added email field

        type: {
            type: String,
            enum: ["internal", "external"],
            default: "internal",
        },

        // ─── Academic vs Private Branch Model (v32.0) ────────────────────────────
        // clinicType controls billing eligibility and patient care classification.
        // PRIVATE → standard billing-enabled clinic
        // ACADEMIC → university/postgrad training — NO billing allowed
        // NOTE: Named "clinicType" (not "type") to avoid collision with the
        //       existing internal/external "type" field above.
        clinicType: {
            type: String,
            enum: ["PRIVATE", "ACADEMIC"],
            default: "PRIVATE",
            required: true,
        },

        address: {
            type: String,
            default: "",
        },

        phone: {
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

        // ─── Operatory Capacity (v32.4) ───────────────────────────────────────
        numberOfOperatories: {
            type: Number,
            default: 1,
            min: 1,
            max: 100,
        },

        chairs: [
            {
                // _id is auto-generated as ObjectId by Mongoose.
                // Stored as a proper ObjectId so chairId in Appointment passes validator.
                name:     { type: String, required: true },
                isActive: { type: Boolean, default: true },
            }
        ],

        // ─── Online Booking Configuration (v1.4.0) ───────────────
        timezone: {
            type: String,
            default: "UTC",
        },

        onlineBooking: {
            enabled:              { type: Boolean, default: false },
            requireApproval:      { type: Boolean, default: true },
            bookingWindowDays:    { type: Number,  default: 30 },
            slotDurationMinutes:  { type: Number,  default: 30 },
            dailyStartTime:       { type: String,  default: "09:00" },
            dailyEndTime:         { type: String,  default: "17:00" },
            allowedWeekDays:      { type: [Number], default: [1, 2, 3, 4, 5] },
            allowDoctorSelection: { type: Boolean, default: false },
            allowedDoctorIds:     [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
            maxBookingsPerSlot:   { type: Number,  default: 1 },
        },

        // ─── Branch-level working hours (strict sub-schema) ───────────────────
        // IMPORTANT: typed as a strict sub-document (NOT `type: Object`) so Mongoose
        // tracks deep mutations automatically — no markModified() calls needed.
        workingHours: {
            sunday:    { enabled: { type: Boolean, default: true  }, start: { type: String, default: "09:00" }, end: { type: String, default: "17:00" } },
            monday:    { enabled: { type: Boolean, default: true  }, start: { type: String, default: "09:00" }, end: { type: String, default: "17:00" } },
            tuesday:   { enabled: { type: Boolean, default: true  }, start: { type: String, default: "09:00" }, end: { type: String, default: "17:00" } },
            wednesday: { enabled: { type: Boolean, default: true  }, start: { type: String, default: "09:00" }, end: { type: String, default: "17:00" } },
            thursday:  { enabled: { type: Boolean, default: true  }, start: { type: String, default: "09:00" }, end: { type: String, default: "17:00" } },
            friday:    { enabled: { type: Boolean, default: false }, start: { type: String, default: "09:00" }, end: { type: String, default: "17:00" } },
            saturday:  { enabled: { type: Boolean, default: false }, start: { type: String, default: "09:00" }, end: { type: String, default: "17:00" } },
        },

        // ── Google Maps Geolocation (v32.3) ──────────────────────────────────
        location: {
            formattedAddress: { type: String, default: "" },
            address:          { type: String, default: "" },
            lat:              { type: Number, default: null },
            lng:              { type: Number, default: null },
        },
    },
    { timestamps: true }
);

// Per-org DB: indexes optimized for per-database queries.
branchSchema.index({ "location.lat": 1, "location.lng": 1 });
branchSchema.index({ name: 1 });
branchSchema.index({ isActive: 1 });
branchSchema.index({ clinicType: 1 }); // Academic vs Private filter

const modelName = "Branch";

module.exports = {
    modelName,
    schema: branchSchema,
    default: mongoose.models[modelName] || mongoose.model(modelName, branchSchema),
};