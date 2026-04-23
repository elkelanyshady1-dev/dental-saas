/**
 * clinicalEvent.dto.js
 * Domain: orthodontic-clinical-event
 * Layer: Application > DTO
 *
 * Backend is the SINGLE SOURCE OF TRUTH for all API responses.
 * Raw Mongoose documents are NEVER returned directly.
 *
 * Builds a frontend-safe representation of ClinicalEvent records.
 * Events are immutable audit trail entries (append-only log).
 */

"use strict";

/**
 * buildClinicalEventDTO
 * Full clinical event detail — includes complete payload for event review.
 * Used for event detail view, event replay, audit drilling.
 *
 * @param {Object} doc - Lean ClinicalEvent document
 * @returns {Object|null}  ClinicalEventDTO
 */
function buildClinicalEventDTO(doc) {
    if (!doc) return null;
    return {
        id:               doc._id?.toString() ?? null,
        caseId:           doc.caseId?.toString() ?? null,
        visitId:          doc.visitId?.toString() ?? null,
        doctorId:         doc.doctorId?.toString() ?? null,

        // ── Event Classification ────────────────────────────────────
        type:             doc.type ?? null,
        severity:         doc.severity ?? "info",
        sequence:         doc.sequence ?? null,

        // ── Event Payload (full, for review) ────────────────────────
        eventId:          doc.eventId ?? null,
        version:          doc.version ?? null,
        payload:          doc.payload ?? null,

        // ── Timestamps ──────────────────────────────────────────────
        createdAt:        doc.createdAt instanceof Date ? doc.createdAt.getTime() : null,
    };
}

/**
 * buildClinicalEventListItemDTO
 * Lightweight list item — excludes full payload for list performance.
 * Used for event logs, timeline views, audit trail listings.
 *
 * @param {Object} doc - Lean ClinicalEvent document
 * @returns {Object|null}  ClinicalEventListItemDTO
 */
function buildClinicalEventListItemDTO(doc) {
    if (!doc) return null;
    return {
        id:               doc._id?.toString() ?? null,
        caseId:           doc.caseId?.toString() ?? null,
        visitId:          doc.visitId?.toString() ?? null,
        doctorId:         doc.doctorId?.toString() ?? null,

        // ── Event Classification ────────────────────────────────────
        type:             doc.type ?? null,
        severity:         doc.severity ?? "info",
        sequence:         doc.sequence ?? null,

        // ── Metadata Only (no full payload) ──────────────────────────
        eventId:          doc.eventId ?? null,
        version:          doc.version ?? null,

        // ── Timestamps ──────────────────────────────────────────────
        createdAt:        doc.createdAt instanceof Date ? doc.createdAt.getTime() : null,
    };
}

module.exports = { buildClinicalEventDTO, buildClinicalEventListItemDTO };
