/**
 * orthoTodo.dto.js
 * Domain: ortho-todos
 * Layer: Application > DTO
 *
 * Backend is SINGLE SOURCE OF TRUTH for all API responses.
 * Raw Mongoose docs are NEVER returned directly.
 */

"use strict";

/**
 * buildTodoDTO — full todo detail.
 * @param {Object} doc - Lean OrthoTodo document
 * @returns {Object} TodoDTO
 */
function buildTodoDTO(doc) {
    if (!doc) return null;
    return {
        id:            doc._id.toString(),
        patientId:     doc.patientId?.toString()     ?? null,
        caseId:        doc.caseId?.toString()         ?? null,
        visitId:       doc.visitId?.toString()        ?? null,
        type:          doc.type,
        tooth:         doc.tooth                      ?? null,
        surface:       doc.surface                    ?? null,
        description:   doc.description,
        clinicalPhase: doc.clinicalPhase              ?? null,
        status:        doc.status,
        priority:      doc.priority,
        completedAt:   doc.completedAt instanceof Date ? doc.completedAt.getTime() : null,
        completedBy:   doc.completedBy?.toString()    ?? null,
        createdAt:     doc.createdAt instanceof Date  ? doc.createdAt.getTime()  : null,
        updatedAt:     doc.updatedAt instanceof Date  ? doc.updatedAt.getTime()  : null,
    };
}

/**
 * buildTodoSummaryDTO — lightweight counts for overview badge.
 */
function buildTodoSummaryDTO({ pending, highPriority }) {
    return { pending, highPriority };
}

module.exports = { buildTodoDTO, buildTodoSummaryDTO };
