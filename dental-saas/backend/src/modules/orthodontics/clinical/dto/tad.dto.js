/**
 * tad.dto.js
 * Domain: orthodontic-tad
 * Layer: Application > DTO
 *
 * Backend is the SINGLE SOURCE OF TRUTH for all API responses.
 * Raw Mongoose documents are NEVER returned directly.
 *
 * Builds a frontend-safe representation of TAD (Temporary Anchorage Device) records.
 * Status derives from event log; frontend receives computed state.
 */

"use strict";

/**
 * buildTadEventDTO
 * Serialize a single TAD lifecycle event.
 *
 * @param {Object} event - TAD event from events[]
 * @returns {Object|null}
 */
function buildTadEventDTO(event) {
    if (!event) return null;
    return {
        id:                   event._id?.toString() ?? null,
        type:                 event.type ?? null,
        reason:               event.reason ?? null,
        notes:                event.notes ?? null,
        scheduledReinsertAt:  event.scheduledReinsertAt instanceof Date
                                  ? event.scheduledReinsertAt.getTime()
                                  : null,
        performedBy:          event.performedBy?.toString() ?? null,
        createdAt:            event.createdAt instanceof Date ? event.createdAt.getTime() : null,
    };
}

/**
 * buildTadDTO
 * Full TAD detail — includes hardware specs, all lifecycle events, and failure count.
 * Used for GET by ID and detailed views.
 *
 * @param {Object} doc - Lean TAD document
 * @returns {Object|null}  TadDTO
 */
function buildTadDTO(doc) {
    if (!doc) return null;
    return {
        id:                 doc._id?.toString() ?? null,
        organizationId:     doc.organizationId?.toString() ?? null,
        caseId:             doc.caseId?.toString() ?? null,
        patientId:          doc.patientId?.toString() ?? null,
        snapshotId:         doc.snapshotId?.toString() ?? null,

        // ── Clinical Placement ──────────────────────────────────────
        toothNumber:        doc.toothNumber ?? null,
        position:           doc.position ?? null,
        positionLabel:      doc.positionLabel ?? null,

        // ── Hardware Specs ─────────────────────────────────────────
        brand:              doc.brand ?? null,
        diameter:           doc.diameter ?? null,
        length:             doc.length ?? null,

        // ── Lifecycle Status ────────────────────────────────────────
        status:             doc.status ?? "ACTIVE",

        // ── Event Log (full history) ────────────────────────────────
        events:             Array.isArray(doc.events)
                                ? doc.events.map(buildTadEventDTO)
                                : [],

        // ── Failure Tracking ────────────────────────────────────────
        failureCount:       doc.failureCount ?? 0,

        // ── Alert State ─────────────────────────────────────────────
        hasActiveAlert:     doc.hasActiveAlert ?? false,

        // ── Timestamps ──────────────────────────────────────────────
        createdAt:          doc.createdAt instanceof Date ? doc.createdAt.getTime() : null,
        updatedAt:          doc.updatedAt instanceof Date ? doc.updatedAt.getTime() : null,
    };
}

/**
 * buildTadListItemDTO
 * Lightweight list item — includes latest event info only (no full events array).
 * Used for TAD list views, dashboards, case overview.
 *
 * @param {Object} doc - Lean TAD document
 * @returns {Object|null}  TadListItemDTO
 */
function buildTadListItemDTO(doc) {
    if (!doc) return null;

    // Extract latest event info
    const latestEvent = Array.isArray(doc.events) && doc.events.length > 0
        ? doc.events[doc.events.length - 1]
        : null;

    return {
        id:                 doc._id?.toString() ?? null,
        organizationId:     doc.organizationId?.toString() ?? null,
        caseId:             doc.caseId?.toString() ?? null,
        patientId:          doc.patientId?.toString() ?? null,

        // ── Clinical Placement (minimal) ────────────────────────────
        toothNumber:        doc.toothNumber ?? null,
        position:           doc.position ?? null,
        positionLabel:      doc.positionLabel ?? null,

        // ── Hardware Specs ─────────────────────────────────────────
        brand:              doc.brand ?? null,

        // ── Lifecycle Status ────────────────────────────────────────
        status:             doc.status ?? "ACTIVE",

        // ── Latest Event Info (no full array) ─────────────────────
        latestEventType:    latestEvent?.type ?? null,
        latestEventAt:      latestEvent?.createdAt instanceof Date
                                ? latestEvent.createdAt.getTime()
                                : null,

        // ── Failure Tracking ────────────────────────────────────────
        failureCount:       doc.failureCount ?? 0,

        // ── Alert State ─────────────────────────────────────────────
        hasActiveAlert:     doc.hasActiveAlert ?? false,

        // ── Timestamps ──────────────────────────────────────────────
        createdAt:          doc.createdAt instanceof Date ? doc.createdAt.getTime() : null,
        updatedAt:          doc.updatedAt instanceof Date ? doc.updatedAt.getTime() : null,
    };
}

module.exports = { buildTadDTO, buildTadListItemDTO, buildTadEventDTO };
