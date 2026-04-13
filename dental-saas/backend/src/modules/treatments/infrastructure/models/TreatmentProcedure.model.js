/**
 * TreatmentProcedure.model.js
 * Treatments Domain — Procedure Entity
 *
 * Represents a specific clinical procedure within a category.
 * Multi-tenant: per-org DB.
 * Immutable appointment snapshot: appointments copy name/duration/price/color
 * at booking time — DO NOT rely on procedureId alone in appointments.
 */

"use strict";

const mongoose = require("mongoose");

const treatmentProcedureSchema = new mongoose.Schema(
    {
        organizationId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Organization",
            required: true,
        },
        categoryId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "TreatmentCategory",
            required: true,
        },
        name: {
            type: String,
            required: true,
            trim: true,
        },
        // Short machine-readable code (e.g. "BOND-01", "WIRE-02")
        code: {
            type: String,
            required: true,
            trim: true,
            uppercase: true,
        },
        // Duration in minutes — required for appointment slot calculation
        duration: {
            type: Number,
            required: true,
            min: 5,
        },
        // Optional default price
        price: {
            type: Number,
            min: 0,
            default: null,
        },
        currency: {
            type: String,
            default: "EGP",
        },
        // UI color identifier (hex or named color for calendar/card display)
        color: {
            type: String,
            default: "#4f46e5",  // indigo-600 default
            trim: true,
        },
        description: {
            type: String,
            trim: true,
            default: "",
        },
        isActive: {
            type: Boolean,
            default: true,
        },
        // Ordering within category
        sortOrder: {
            type: Number,
            default: 0,
        },
        createdBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
        },
    },
    { timestamps: true }
);

// Unique code per org
treatmentProcedureSchema.index({ organizationId: 1, code: 1 }, { unique: true });
// Fetch by category (primary query pattern)
treatmentProcedureSchema.index({ organizationId: 1, categoryId: 1, isActive: 1 });
// Text search by name
treatmentProcedureSchema.index({ name: "text" });

const modelName = "TreatmentProcedure";

module.exports = {
    modelName,
    schema: treatmentProcedureSchema,
    default: mongoose.models[modelName] || mongoose.model(modelName, treatmentProcedureSchema),
};
