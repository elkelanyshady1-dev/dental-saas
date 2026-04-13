/**
 * CasePhase.model.js
 * Domain: orthodontic-cases
 * Layer: Infrastructure > Model
 *
 * A CasePhase represents a discrete clinical phase within an OrthodonticCase.
 * Phases are created automatically when a case is created (via phase.service.js).
 * They progress linearly: pre-treatment → treatment → post-treatment
 *
 * IMMUTABILITY RULE:
 *   Phase `name` and `order` are NEVER changed after creation.
 *   Only `status`, `startedAt`, `completedAt` are mutable.
 *   The caseId link is permanent.
 *
 * MULTI-TENANCY:
 *   organizationId is required and indexed. All queries MUST scope by it.
 */

"use strict";

const mongoose = require("mongoose");

const PHASE_NAMES = ["pre-treatment", "treatment", "post-treatment"];
const PHASE_STATUSES = ["pending", "active", "completed"];

const casePhaseSchema = new mongoose.Schema(
    {
        // ── Multi-Tenancy ─────────────────────────────────────────────────
        organizationId: {
            type:     mongoose.Schema.Types.ObjectId,
            ref:      "Organization",
            required: true,
        },

        // ── Case Link ─────────────────────────────────────────────────────
        caseId: {
            type:     mongoose.Schema.Types.ObjectId,
            ref:      "OrthodonticCase",
            required: true,
        },

        // ── Phase Identity (immutable after create) ───────────────────────
        name: {
            type:     String,
            enum:     PHASE_NAMES,
            required: true,
        },
        order: {
            type:     Number,
            required: true,
            min:      1,
            max:      3,
        },

        // ── Phase Lifecycle (mutable) ─────────────────────────────────────
        status: {
            type:    String,
            enum:    PHASE_STATUSES,
            default: "pending",
        },
        startedAt:   { type: Date, default: null },
        completedAt: { type: Date, default: null },
    },
    { timestamps: true }
);

// ── Indexes ───────────────────────────────────────────────────────────────────

// Primary: "all phases for a case, in order"
casePhaseSchema.index({ caseId: 1, order: 1 });

// Tenant-scoped list
casePhaseSchema.index({ organizationId: 1, caseId: 1 });

// Active phase lookup
casePhaseSchema.index(
    { caseId: 1, status: 1 },
    { partialFilterExpression: { status: "active" } }
);

const modelName = "CasePhase";

module.exports = {
    modelName,
    schema: casePhaseSchema,
    PHASE_NAMES,
    PHASE_STATUSES,
};
