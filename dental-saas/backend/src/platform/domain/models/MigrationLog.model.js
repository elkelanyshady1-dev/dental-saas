/**
 * MigrationLog.model.js
 * Platform Plane — Org Cluster-Migration Audit Trail
 *
 * Append-only log of every org cluster migration. Each state transition of
 * the Phase 8 migration FSM writes one entry. `migrationId` correlates every
 * entry from PREPARING through COMPLETE/FAILED, so a single migration run
 * can be reconstructed end-to-end.
 *
 * NEVER moves — stays platform-side next to billing audits. Writes here are
 * part of the migration service's own logic, not on the request path.
 *
 * PLANE: Platform
 * BINDING: resolved via getPlatformModel(def) — not globally registered.
 */

"use strict";

const mongoose = require("mongoose");

const migrationLogSchema = new mongoose.Schema(
    {
        // UUID generated when migrationState becomes PREPARING. Primary
        // correlation key across all entries for one migration.
        migrationId: {
            type: String,
            required: true,
            index: true,
        },

        organizationId: {
            type: mongoose.Schema.Types.ObjectId,
            required: true,
            index: true,
        },

        // Before → After state names (from the migrationState enum). A
        // transition into PREPARING has from=null.
        from: {
            type: String,
            default: null,
        },
        to: {
            type: String,
            required: true,
        },

        sourceCluster: { type: String, required: true },
        targetCluster: { type: String, required: true },

        // Principal that triggered the transition (platform user id, service
        // actor key, or "system" for scheduler-triggered steps).
        actor: {
            type: String,
            default: "system",
        },

        // Free-form, short. Used for human context — "ops: rebalance capacity",
        // "auto: cluster DOWN", "cutover window 2026-04-30T02:00Z".
        reason: {
            type: String,
            default: null,
        },

        // Captured at the moment of transition. Useful for reproducing state.
        routingVersion: { type: Number },
        routingEpoch: { type: Number },

        // Free-form details (lag measurements, token positions, doc counts…).
        details: {
            type: mongoose.Schema.Types.Mixed,
            default: {},
        },
    },
    { timestamps: true }
);

// Compound index for timeline views per migration.
migrationLogSchema.index({ migrationId: 1, createdAt: 1 });
// Compound index for timeline views per org.
migrationLogSchema.index({ organizationId: 1, createdAt: -1 });

module.exports = {
    modelName: "MigrationLog",
    schema: migrationLogSchema,
};
