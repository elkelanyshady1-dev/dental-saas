/**
 * OrgUsage.model.js
 * ═══════════════════════════════════════════════════════════════
 * Phase 4.0e — Tracks real-time resource usage per organization.
 *
 * Counters for users, branches, patients — updated atomically
 * via $inc on every create/delete operation.
 *
 * storageUsedMB is a denormalized snapshot from
 * OrganizationStorageUsage for quick limit checks
 * without cross-collection queries.
 *
 * Pattern: Single-document-per-org (like CommunicationUsage,
 * OrganizationStorageUsage). Upsert on first write.
 *
 * PLANE: Platform (needs to be accessible for cross-org admin views)
 * COLLECTION: orgusages
 * ═══════════════════════════════════════════════════════════════
 */

"use strict";

const mongoose = require("mongoose");

const orgUsageSchema = new mongoose.Schema(
    {
        organizationId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Organization",
            required: true,
            unique: true,
            index: true,
        },

        // ── Seat counters ────────────────────────────────────────────────────
        usersCount: {
            type: Number,
            default: 0,
            min: 0,
        },

        branchesCount: {
            type: Number,
            default: 0,
            min: 0,
        },

        patientsCount: {
            type: Number,
            default: 0,
            min: 0,
        },

        // ── Storage snapshot ─────────────────────────────────────────────────
        // Denormalized from OrganizationStorageUsage for fast reads.
        // Updated alongside storageUsage.increment/decrement calls.
        storageUsedMB: {
            type: Number,
            default: 0,
            min: 0,
        },
    },
    {
        timestamps: true,
        collection: "orgusages",
    }
);

// ─── Virtuals ────────────────────────────────────────────────────────────────
orgUsageSchema.virtual("storageUsedGB").get(function () {
    return Math.round((this.storageUsedMB / 1024) * 100) / 100;
});

const modelName = "OrgUsage";

module.exports = {
    modelName,
    schema: orgUsageSchema,
    default: mongoose.models[modelName] || mongoose.model(modelName, orgUsageSchema),
};
