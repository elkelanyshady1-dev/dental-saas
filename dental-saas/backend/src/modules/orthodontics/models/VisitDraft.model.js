/**
 * VisitDraft.model.js — Phase 6: Auto-Save Draft Layer
 *
 * ARCHITECTURE:
 *   Draft ≠ Snapshot. Drafts are purely for crash recovery.
 *   They are temporary, overwritten on every auto-save tick.
 *   Snapshots = immutable clinical record. Drafts = disposable session cache.
 *
 * LIFECYCLE:
 *   startVisit   → draft may be created by first auto-save tick
 *   endVisit     → draft is DELETED (session complete, snapshot is SSOT)
 *   cancelVisit  → draft is DELETED (session abandoned)
 *   page refresh → draft queried; if present, restore-or-discard modal shown
 *
 * TENANCY: organizationId required. Scoped to org DB via getModel().
 * ONE draft per visit (unique index on visitId).
 */

"use strict";

const mongoose = require("mongoose");

const visitDraftSchema = new mongoose.Schema(
    {
        // ── Multi-Tenancy ──────────────────────────────────────────────────
        organizationId: {
            type:     mongoose.Schema.Types.ObjectId,
            required: true,
            index:    true,
        },

        // ── Session Reference ─────────────────────────────────────────────
        visitId: {
            type:     mongoose.Schema.Types.ObjectId,
            required: true,
            unique:   true,   // ONE draft per visit — upsert on save
            index:    true,
        },

        // ── Recovery Payload ──────────────────────────────────────────────
        // chartState: full reducer state snapshot (upper/lower teeth, archwires, etc.)
        // notes: free-text visit notes (mirrors SnapshotEditor local state)
        chartState: {
            type:    Object,
            default: {},
        },
        notes: {
            type:    String,
            default: "",
        },

        // ── Staleness guard ───────────────────────────────────────────────
        // updatedAt is set on every save tick. Used to detect stale drafts
        // (e.g., browser crashed 2 days ago — don't prompt recovery).
        savedAt: {
            type:    Date,
            default: () => new Date(),
        },
    },
    {
        timestamps: true,
        // Auto-expire drafts after 7 days as a safety net (TTL index)
        // This prevents orphaned drafts from accumulating if visits are
        // never formally ended (e.g., test environments).
    }
);

// Compound index for common query: findOne({ visitId, organizationId })
visitDraftSchema.index({ visitId: 1, organizationId: 1 }, { unique: true });

// TTL index — drafts evicted 7 days after last save (orphan cleanup)
visitDraftSchema.index({ savedAt: 1 }, { expireAfterSeconds: 7 * 24 * 60 * 60 });

module.exports = {
    name:   "VisitDraft",
    schema: visitDraftSchema,
};
