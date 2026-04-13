/**
 * sequence.dto.js
 * Domain: orthodontic-sequence
 * Layer: Application > DTO
 *
 * Backend is the SINGLE SOURCE OF TRUTH for all API responses.
 * Raw Mongoose documents are NEVER returned directly.
 *
 * Builds a frontend-safe representation of SequencePlan records.
 * Steps are ordered and validated at backend; frontend renders as-is.
 */

"use strict";

/**
 * buildSequenceActionDTO
 * Serialize a single sequence action (V2 hooks — data only).
 *
 * @param {Object} action - Action object from step.actions[]
 * @returns {Object|null}
 */
function buildSequenceActionDTO(action) {
    if (!action) return null;
    return {
        type:    action.type ?? null,
        payload: action.payload ?? null,
    };
}

/**
 * buildSequenceStepDTO
 * Serialize a single sequence step with its actions.
 *
 * @param {Object} step - Step object from steps[]
 * @returns {Object|null}
 */
function buildSequenceStepDTO(step) {
    if (!step) return null;
    return {
        order:       step.order ?? 0,
        title:       step.title ?? null,
        description: step.description ?? null,
        actions:     Array.isArray(step.actions)
                         ? step.actions.map(buildSequenceActionDTO)
                         : [],
    };
}

/**
 * buildSequenceDTO
 * Full sequence plan detail — includes all steps with their actions.
 * Used for GET by ID and sequence planning interface.
 *
 * @param {Object} doc - Lean SequencePlan document
 * @returns {Object|null}  SequenceDTO
 */
function buildSequenceDTO(doc) {
    if (!doc) return null;
    return {
        id:              doc._id?.toString() ?? null,
        organizationId:  doc.organizationId?.toString() ?? null,
        caseId:          doc.caseId?.toString() ?? null,

        // ── Metadata ─────────────────────────────────────────────────
        name:            doc.name ?? "Treatment Sequence",
        createdBy:       doc.createdBy?.toString() ?? null,

        // ── Treatment Steps (ordered) ────────────────────────────────
        steps:           Array.isArray(doc.steps)
                             ? doc.steps.map(buildSequenceStepDTO)
                             : [],

        // ── Timestamps ───────────────────────────────────────────────
        createdAt:       doc.createdAt instanceof Date ? doc.createdAt.getTime() : null,
        updatedAt:       doc.updatedAt instanceof Date ? doc.updatedAt.getTime() : null,
    };
}

/**
 * buildSequenceListItemDTO
 * Lightweight list item — includes step count only, not full steps array.
 * Used for case list views where only metadata is needed.
 *
 * @param {Object} doc - Lean SequencePlan document
 * @returns {Object|null}  SequenceListItemDTO
 */
function buildSequenceListItemDTO(doc) {
    if (!doc) return null;
    return {
        id:              doc._id?.toString() ?? null,
        organizationId:  doc.organizationId?.toString() ?? null,
        caseId:          doc.caseId?.toString() ?? null,

        // ── Metadata ─────────────────────────────────────────────────
        name:            doc.name ?? "Treatment Sequence",
        createdBy:       doc.createdBy?.toString() ?? null,

        // ── Step Count (metadata only — no full steps array) ────────
        stepCount:       Array.isArray(doc.steps) ? doc.steps.length : 0,

        // ── Timestamps ───────────────────────────────────────────────
        createdAt:       doc.createdAt instanceof Date ? doc.createdAt.getTime() : null,
        updatedAt:       doc.updatedAt instanceof Date ? doc.updatedAt.getTime() : null,
    };
}

module.exports = { buildSequenceDTO, buildSequenceListItemDTO, buildSequenceStepDTO, buildSequenceActionDTO };
