/**
 * orthodonticCase.dto.js
 * Domain: orthodontic-cases
 * Layer: Application > DTO
 *
 * Backend is the SINGLE SOURCE OF TRUTH for all API responses.
 * Raw Mongoose documents are NEVER returned directly.
 *
 * Builds a frontend-safe representation of OrthodonticCase.
 * Deliberately does NOT expose workflowData (that's the orthodontics module concern).
 * This DTO surfaces what the scheduling system needs: id, status, patientId, caseType.
 */

"use strict";

/**
 * buildPhaseDTO
 * Serialise a single CasePhase lean doc.
 *
 * @param {Object} phase - Lean CasePhase document
 * @returns {Object}
 */
function buildPhaseDTO(phase) {
    if (!phase) return null;
    return {
        id:          phase._id.toString(),
        name:        phase.name,
        order:       phase.order,
        status:      phase.status,
        startedAt:   phase.startedAt instanceof Date ? phase.startedAt.getTime() : null,
        completedAt: phase.completedAt instanceof Date ? phase.completedAt.getTime() : null,
    };
}

/**
 * buildCaseDTO
 * Full case detail — used for GET by ID and after create.
 *
 * @param {Object} doc    - Lean OrthodonticCase document
 * @param {Object} [ctx]  - Extra enrichment context
 * @param {Array}  [ctx.phases=[]]                   - CasePhase lean docs
 * @param {Object} [ctx.activePhase=null]             - Active CasePhase lean doc
 * @param {boolean} [ctx.hasDiagnosticSnapshot=false]
 * @param {boolean} [ctx.hasPretreatmentSnapshot=false]
 * @returns {Object}  CaseDTO
 */
function buildCaseDTO(doc, {
    phases               = [],
    activePhase          = null,
    hasDiagnosticSnapshot   = false,
    hasPretreatmentSnapshot = false,
} = {}) {
    if (!doc) return null;
    return {
        id:                     doc._id.toString(),
        organizationId:         doc.organizationId?.toString() ?? null,
        patientId:              doc.patientId?.toString() ?? null,
        caseType:               doc.caseType ?? "comprehensive",
        status:                 doc.status ?? "draft",
        malocclusionClass:      doc.malocclusionClass ?? null,
        estimatedDurationMonths: doc.estimatedDurationMonths ?? null,
        startedAt:              doc.createdAt instanceof Date
                                    ? doc.createdAt.getTime()
                                    : null,
        completedAt:            doc.completedAt instanceof Date
                                    ? doc.completedAt.getTime()
                                    : null,
        createdAt:              doc.createdAt instanceof Date
                                    ? doc.createdAt.getTime()
                                    : null,
        updatedAt:              doc.updatedAt instanceof Date
                                    ? doc.updatedAt.getTime()
                                    : null,
        // ── Phase enrichment ─────────────────────────────────────────────
        phases:                 phases.map(buildPhaseDTO),
        activePhase:            activePhase ? buildPhaseDTO(activePhase) : null,
        hasDiagnosticSnapshot,
        hasPretreatmentSnapshot,
    };
}

/**
 * buildCaseListItemDTO
 * Lightweight list item — for patient case list / scheduling sidebar.
 * Does NOT include workflowData, problemList, recordSets, etc.
 *
 * @param {Object} doc
 * @returns {Object}  CaseListItemDTO
 */
function buildCaseListItemDTO(doc) {
    if (!doc) return null;
    return {
        id:        doc._id.toString(),
        patientId: doc.patientId?.toString() ?? null,
        caseType:  doc.caseType ?? "comprehensive",
        status:    doc.status ?? "draft",
        createdAt: doc.createdAt instanceof Date ? doc.createdAt.getTime() : null,
        updatedAt: doc.updatedAt instanceof Date ? doc.updatedAt.getTime() : null,
    };
}

module.exports = { buildCaseDTO, buildCaseListItemDTO, buildPhaseDTO };
