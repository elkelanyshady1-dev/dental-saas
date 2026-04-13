/**
 * CaseAccess.js — Cross-Organization Case Access Bridge
 *
 * THE SECURITY CORE OF THE SUPERVISOR PLANE.
 *
 * Every supervisor route that touches case data MUST validate
 * a CaseAccess record before granting access.
 *
 * Maps: SupervisorUser ↔ OrthodonticCase (many-to-many, cross-org)
 *
 * SENTINEL: This is the ONLY bridge between supervisor plane and org plane data.
 *           No shortcut queries against OrthodonticCase without CaseAccess validation.
 */

"use strict";

const mongoose = require("mongoose");

const caseAccessSchema = new mongoose.Schema(
    {
        supervisorId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "SupervisorUser",
            required: true,
        },
        caseId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "OrthodonticCase",
            required: true,
        },
        organizationId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Organization",
            required: true,
        },

        // Org-plane user who granted access (via invitation)
        grantedBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            required: true,
        },

        role: {
            type: String,
            enum: ["SUPERVISOR", "OBSERVER"],
            default: "SUPERVISOR",
        },

        permissions: {
            canComment: { type: Boolean, default: true },
            canApprove: { type: Boolean, default: true },
            canViewAnalysis: { type: Boolean, default: true },
            canDownload: { type: Boolean, default: false },
        },

        status: {
            type: String,
            enum: ["ACTIVE", "REVOKED", "EXPIRED"],
            default: "ACTIVE",
        },

        // Optional expiration (null = permanent until revoked)
        expiresAt: {
            type: Date,
            default: null,
        },

        revokedAt: {
            type: Date,
            default: null,
        },
        revokedBy: {
            type: mongoose.Schema.Types.ObjectId,
            default: null,
        },
    },
    {
        timestamps: true,
        collection: "caseAccess",
    }
);

// ─── Indexes ────────────────────────────────────────────────────────────────

// Primary lookup: supervisor dashboard — "all active cases for this supervisor"
caseAccessSchema.index({ supervisorId: 1, status: 1 });

// Access check: "does this supervisor have access to this case?"
caseAccessSchema.index({ caseId: 1, supervisorId: 1 }, { unique: true });

// Org-scoped query: "all supervisors with access to cases in this org"
caseAccessSchema.index({ organizationId: 1, supervisorId: 1 });

// Case-scoped query: "all supervisors who can see this case"
caseAccessSchema.index({ caseId: 1, status: 1 });

const modelName = "CaseAccess";

module.exports = {
    modelName,
    schema: caseAccessSchema,
    default: mongoose.models[modelName] || mongoose.model(modelName, caseAccessSchema),
};
