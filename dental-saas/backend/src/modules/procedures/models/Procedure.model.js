/**
 * Procedure.model.js
 * Phase 3 — Clinical Operations: Procedure Catalog
 *
 * Represents a clinic's catalog of dental procedures.
 * Tenant-isolated by organizationId.
 * Supports FDI tooth numbering and category-based grouping.
 */

"use strict";

const mongoose = require("mongoose");

const procedureSchema = new mongoose.Schema(
    {
        // Per-org DB: kept for reference but NOT required.
        organizationId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Organization",
        },
        code: {
            type: String,
            required: true,
            trim: true,
            uppercase: true
        },
        name: {
            type: String,
            required: true,
            trim: true
        },
        description: {
            type: String,
            trim: true,
            default: ""
        },
        defaultPrice: {
            type: Number,
            required: true,
            min: 0
        },
        // v8.2 Precision Extension (Minor Units)
        defaultPriceMinor: {
            type: Number,
            min: 0
        },
        currency: {
            type: String,
            required: true,
            default: "AED"
        },
        category: {
            type: String,
            required: true,
            trim: true,
            enum: [
                "diagnostic",
                "preventive",
                "restorative",
                "endodontic",
                "periodontic",
                "prosthodontic",
                "orthodontic",
                "oral_surgery",
                "implant",
                "cosmetic",
                "pediatric",
                "emergency",
                "other"
            ],
            default: "other"
        },
        requiresTooth: {
            type: Boolean,
            default: false
        },
        // FDI tooth numbering support — applicable range
        applicableTeeth: [{
            type: String,
            trim: true
        }],
        // Duration estimate in minutes
        estimatedDuration: {
            type: Number,
            min: 0,
            default: 30
        },
        isActive: {
            type: Boolean,
            default: true
        },
        version: {
            type: Number,
            default: 0
        }
    },
    { timestamps: true }
);

// Per-org DB: indexes optimized — no organizationId prefix needed.
procedureSchema.index({ code: 1 }, { unique: true });
procedureSchema.index({ category: 1 });
procedureSchema.index({ isActive: 1 });
procedureSchema.index({ name: "text" });

const modelName = "Procedure";

module.exports = {
    modelName,
    schema: procedureSchema,
    default: mongoose.models[modelName] || mongoose.model(modelName, procedureSchema),
};
