/**
 * clinicalAction.dto.js
 * Domain: orthodontic-clinical-action
 * Layer: Application > DTO
 *
 * Backend is the SINGLE SOURCE OF TRUTH for all API responses.
 * Raw Mongoose documents are NEVER returned directly.
 *
 * Builds a frontend-safe representation of ClinicalAction records.
 * Supports 7 domains: archwire, elastic, powerchain, accessory, ligature, ipr, space.
 */

"use strict";

/**
 * buildClinicalActionDTO
 * Full clinical action detail — includes domain-specific payload and audit info.
 * Used for GET by ID and detailed clinical views.
 *
 * @param {Object} doc - Lean ClinicalAction document
 * @returns {Object|null}  ClinicalActionDTO
 */
function buildClinicalActionDTO(doc) {
    if (!doc) return null;
    return {
        id:               doc._id?.toString() ?? null,
        organizationId:   doc.organizationId?.toString() ?? null,
        caseId:           doc.caseId?.toString() ?? null,
        patientId:        doc.patientId?.toString() ?? null,
        snapshotId:       doc.snapshotId?.toString() ?? null,

        // ── Domain Classification ───────────────────────────────────
        domain:           doc.domain ?? null,
        actionType:       doc.actionType ?? null,

        // ── Status Lifecycle ────────────────────────────────────────
        status:           doc.status ?? "ACTIVE",

        // ── Domain-Specific Payload (flexible structure) ─────────────
        // Frontend interprets based on domain:
        // archwire:   { arch, material, size, brand }
        // elastic:    { fromTooth, toTooth, type, size }
        // powerchain: { arch, segments }
        // accessory:  { type, toothId, notes }
        // ligature:   { type, toothId, notes }
        // ipr:        { betweenTeeth, amount, notes }
        // space:      { toothId, type, notes }
        payload:         doc.payload ?? null,

        // ── Audit Trail ─────────────────────────────────────────────
        createdBy:        doc.createdBy?.toString() ?? null,
        removedBy:        doc.removedBy?.toString() ?? null,
        removedAt:        doc.removedAt instanceof Date ? doc.removedAt.getTime() : null,
        removalReason:    doc.removalReason ?? null,

        // ── Timestamps ──────────────────────────────────────────────
        createdAt:        doc.createdAt instanceof Date ? doc.createdAt.getTime() : null,
        updatedAt:        doc.updatedAt instanceof Date ? doc.updatedAt.getTime() : null,
    };
}

/**
 * buildClinicalActionListItemDTO
 * Lightweight list item — minimal payload for list performance.
 * Used for case clinical action list, domain-specific lists.
 *
 * @param {Object} doc - Lean ClinicalAction document
 * @returns {Object|null}  ClinicalActionListItemDTO
 */
function buildClinicalActionListItemDTO(doc) {
    if (!doc) return null;
    return {
        id:               doc._id?.toString() ?? null,
        organizationId:   doc.organizationId?.toString() ?? null,
        caseId:           doc.caseId?.toString() ?? null,
        patientId:        doc.patientId?.toString() ?? null,

        // ── Domain Classification ───────────────────────────────────
        domain:           doc.domain ?? null,
        actionType:       doc.actionType ?? null,

        // ── Status Lifecycle ────────────────────────────────────────
        status:           doc.status ?? "ACTIVE",

        // ── Minimal Payload Info (no full payload) ──────────────────
        // Extract key display info from payload based on domain
        payloadSummary:   _extractPayloadSummary(doc.domain, doc.payload),

        // ── Audit Trail (minimal) ───────────────────────────────────
        createdBy:        doc.createdBy?.toString() ?? null,
        removedAt:        doc.removedAt instanceof Date ? doc.removedAt.getTime() : null,

        // ── Timestamps ──────────────────────────────────────────────
        createdAt:        doc.createdAt instanceof Date ? doc.createdAt.getTime() : null,
        updatedAt:        doc.updatedAt instanceof Date ? doc.updatedAt.getTime() : null,
    };
}

/**
 * _extractPayloadSummary
 * Extract key display fields from payload based on domain.
 * Prevents exposing full payload in list items.
 *
 * @param {string} domain - Domain type
 * @param {Object} payload - Payload object
 * @returns {Object}  Domain-specific summary
 * @private
 */
function _extractPayloadSummary(domain, payload) {
    if (!payload) return null;

    switch (domain) {
        case "archwire":
            return {
                arch:     payload.arch ?? null,
                material: payload.material ?? null,
                size:     payload.size ?? null,
                brand:    payload.brand ?? null,
            };
        case "elastic":
            return {
                fromTooth: payload.fromTooth ?? null,
                toTooth:   payload.toTooth ?? null,
                type:      payload.type ?? null,
                size:      payload.size ?? null,
            };
        case "powerchain":
            return {
                arch:     payload.arch ?? null,
                segments: payload.segments ?? null,
            };
        case "accessory":
        case "ligature":
        case "space":
            return {
                toothId: payload.toothId ?? null,
                type:    payload.type ?? null,
                notes:   payload.notes ? payload.notes.substring(0, 50) : null,
            };
        case "ipr":
            return {
                betweenTeeth: payload.betweenTeeth ?? null,
                amount:       payload.amount ?? null,
                notes:        payload.notes ? payload.notes.substring(0, 50) : null,
            };
        default:
            return payload;
    }
}

module.exports = { buildClinicalActionDTO, buildClinicalActionListItemDTO };
