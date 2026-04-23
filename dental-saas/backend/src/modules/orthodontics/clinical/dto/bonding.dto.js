/**
 * bonding.dto.js
 * Domain: orthodontic-bonding
 * Layer: Application > DTO
 *
 * Backend is the SINGLE SOURCE OF TRUTH for all API responses.
 * Raw Mongoose documents are NEVER returned directly.
 *
 * Builds a frontend-safe representation of Bonding records.
 * Whitelist pattern ensures no internal fields are exposed.
 */

"use strict";

/**
 * buildBondingHistoryDTO
 * Serialize a single bonding history event.
 *
 * @param {Object} event - Bonding history event
 * @returns {Object|null}
 */
function buildBondingHistoryDTO(event) {
    if (!event) return null;
    return {
        id:          event._id?.toString() ?? null,
        action:      event.action,
        value:       event.value ?? null,
        performedBy: event.performedBy?.toString() ?? null,
        notes:       event.notes ?? null,
        createdAt:   event.createdAt instanceof Date ? event.createdAt.getTime() : null,
    };
}

/**
 * buildBondingDTO
 * Full bonding detail — includes clinical specs and complete history.
 * Used for GET by ID and after create operations.
 *
 * @param {Object} doc - Lean Bonding document
 * @returns {Object|null}  BondingDTO
 */
function buildBondingDTO(doc) {
    if (!doc) return null;
    return {
        id:                 doc._id?.toString() ?? null,
        caseId:             doc.caseId?.toString() ?? null,
        patientId:          doc.patientId?.toString() ?? null,
        snapshotId:         doc.snapshotId?.toString() ?? null,

        // ── Clinical Placement ──────────────────────────────────────
        tooth:              doc.tooth ?? null,
        type:               doc.type ?? null,

        // ── Bracket Specification ─────────────────────────────────
        prescription:       doc.prescription ?? null,
        slot:               doc.slot ?? null,
        bondingHeight:      doc.bondingHeight ?? null,
        bondingPosition:    doc.bondingPosition ?? null,
        brand:              doc.brand ?? null,

        // ── Source Tracking ────────────────────────────────────────
        source:             doc.source ? {
            type:           doc.source.type ?? null,
            referenceGroup: doc.source.referenceGroup ?? null,
        } : null,

        // ── TAD Linking ────────────────────────────────────────────
        linkedTadIds:       Array.isArray(doc.linkedTadIds)
                                ? doc.linkedTadIds.map(id => id?.toString?.() ?? id)
                                : [],

        // ── History (event-sourced) ────────────────────────────────
        history:            Array.isArray(doc.history)
                                ? doc.history.map(buildBondingHistoryDTO)
                                : [],

        // ── Timestamps ─────────────────────────────────────────────
        createdAt:          doc.createdAt instanceof Date ? doc.createdAt.getTime() : null,
        updatedAt:          doc.updatedAt instanceof Date ? doc.updatedAt.getTime() : null,
    };
}

/**
 * buildBondingListItemDTO
 * Lightweight list item — excludes full history for list performance.
 * Used for patient bonding list, case overview, etc.
 *
 * @param {Object} doc - Lean Bonding document
 * @returns {Object|null}  BondingListItemDTO
 */
function buildBondingListItemDTO(doc) {
    if (!doc) return null;
    return {
        id:                 doc._id?.toString() ?? null,
        caseId:             doc.caseId?.toString() ?? null,
        patientId:          doc.patientId?.toString() ?? null,

        // ── Clinical Placement (minimal) ────────────────────────────
        tooth:              doc.tooth ?? null,
        type:               doc.type ?? null,
        brand:              doc.brand ?? null,

        // ── Latest History Info (no full array) ─────────────────────
        latestHistoryAction: Array.isArray(doc.history) && doc.history.length > 0
                                ? doc.history[doc.history.length - 1].action ?? null
                                : null,

        // ── Timestamps ─────────────────────────────────────────────
        createdAt:          doc.createdAt instanceof Date ? doc.createdAt.getTime() : null,
        updatedAt:          doc.updatedAt instanceof Date ? doc.updatedAt.getTime() : null,
    };
}

module.exports = { buildBondingDTO, buildBondingListItemDTO, buildBondingHistoryDTO };
