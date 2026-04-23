"use strict";

/**
 * CastAnalysis.model.js
 * Domain: clinical-snapshots
 * Layer: Infrastructure › Model
 *
 * Stores cast (study model) analysis inputs and computed results.
 * Optionally linked to a ClinicalSnapshot via snapshotId.
 * Immutable after creation — no update route exposed.
 */

const mongoose = require("mongoose");

const castAnalysisSchema = new mongoose.Schema(
    {
        // ── Multi-Tenancy ──────────────────────────────────────────

        // ── Patient + Case ─────────────────────────────────────────
        patientId: {
            type:     mongoose.Schema.Types.ObjectId,
            ref:      "Patient",
            required: true,
        },
        caseId: {
            type:    mongoose.Schema.Types.ObjectId,
            ref:     "OrthodonticCase",
            default: null,
        },

        // ── Optional link to ClinicalSnapshot ─────────────────────
        snapshotId: {
            type:    mongoose.Schema.Types.ObjectId,
            ref:     "ClinicalSnapshot",
            default: null,
        },

        // ── Raw Inputs ─────────────────────────────────────────────
        input: {
            upper: {
                required: {
                    right: { type: [Number], default: [] }, // teeth 1–6 right
                    left:  { type: [Number], default: [] }, // teeth 1–6 left
                },
                available: {
                    right: { type: mongoose.Schema.Types.Mixed, default: {} },
                    left:  { type: mongoose.Schema.Types.Mixed, default: {} },
                },
            },
            lower: {
                required: {
                    right: { type: [Number], default: [] },
                    left:  { type: [Number], default: [] },
                },
                available: {
                    right: { type: mongoose.Schema.Types.Mixed, default: {} },
                    left:  { type: mongoose.Schema.Types.Mixed, default: {} },
                },
            },
            toothSize: {
                upperAnterior: { type: Number, default: null },
                lowerAnterior: { type: Number, default: null },
                upperTotal:    { type: Number, default: null },
                lowerTotal:    { type: Number, default: null },
            },
            ashley: {
                upperPM:    { type: Number, default: null },
                upperBasal: { type: Number, default: null },
                lowerPM:    { type: Number, default: null },
                lowerBasal: { type: Number, default: null },
            },
        },

        // ── Computed Results (written by service engine) ───────────
        result: {
            upper: {
                right: { net: Number },
                left:  { net: Number },
                total: Number,
            },
            lower: {
                right: { net: Number },
                left:  { net: Number },
                total: Number,
            },
            bolton: {
                anterior: mongoose.Schema.Types.Mixed,
                total:    mongoose.Schema.Types.Mixed,
            },
            ashley: {
                upper: mongoose.Schema.Types.Mixed,
                lower: mongoose.Schema.Types.Mixed,
            },
        },

        // ── Audit ──────────────────────────────────────────────────
        createdBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref:  "User",
        },
    },
    {
        timestamps: true,
        strict:     true,
    }
);

// Indexes
castAnalysisSchema.index({ patientId: 1, createdAt: -1 });
castAnalysisSchema.index({ createdAt: -1 });
castAnalysisSchema.index({ caseId: 1, createdAt: -1 });

const modelName = "CastAnalysis";

module.exports = {
    modelName,
    schema: castAnalysisSchema,
};
