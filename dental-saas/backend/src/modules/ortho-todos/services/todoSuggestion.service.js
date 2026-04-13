/**
 * todoSuggestion.service.js
 * Domain: ortho-todos
 * Layer: Application > Services
 *
 * Clinical auto-suggestion engine.
 *
 * ⚠️  RULES:
 *   - NEVER enforce — only suggest
 *   - Suggestions are hints, not locked state
 *   - No DB writes happen here — controller decides
 *   - No strict wire-based enforcement
 */

"use strict";

// ── Wire → Clinical Phase mapping ─────────────────────────────────────────────

const WIRE_PHASE_MAP = {
    "NiTi":        "LEVEL_ALIGNMENT",
    "Copper NiTi": "LEVEL_ALIGNMENT",
    "SS":          "SPACE_MANAGEMENT",
    "TMA":         "SPACE_MANAGEMENT",
};

/**
 * suggestClinicalPhase
 *
 * Suggests a clinical phase based on visit context.
 * Returns null when no clear suggestion is possible.
 * NEVER enforced — clinician always has final say.
 *
 * @param {Object} context
 * @param {string} [context.wireType]      — ArchwireMaterial (NiTi, SS, TMA, Copper NiTi)
 * @param {string} [context.clinicalPhase] — Override if clinician already set one
 * @returns {"LEVEL_ALIGNMENT"|"SPACE_MANAGEMENT"|"FINISHING"|null}
 */
function suggestClinicalPhase({ wireType, clinicalPhase } = {}) {
    if (clinicalPhase) return clinicalPhase; // explicit override wins
    if (!wireType)     return null;
    return WIRE_PHASE_MAP[wireType] ?? null;
}

// ── Alignment → TODO suggestion mapping ──────────────────────────────────────

const ALIGNMENT_TODO_MAP = {
    mesial_out: {
        type:        "WIRE_BEND",
        description: "Apply mesial-in bend",
        priority:    "medium",
        clinicalPhase: "LEVEL_ALIGNMENT",
    },
    distal_out: {
        type:        "WIRE_BEND",
        description: "Apply distal-in bend",
        priority:    "medium",
        clinicalPhase: "LEVEL_ALIGNMENT",
    },
    rotated: {
        type:        "BRACKET_REPOSITION",
        description: "Reposition bracket to correct rotation",
        priority:    "medium",
        clinicalPhase: "LEVEL_ALIGNMENT",
    },
    displaced_buccal: {
        type:        "BRACKET_REPOSITION",
        description: "Reposition bracket — buccal displacement",
        priority:    "low",
        clinicalPhase: "LEVEL_ALIGNMENT",
    },
    displaced_lingual: {
        type:        "BRACKET_REPOSITION",
        description: "Reposition bracket — lingual displacement",
        priority:    "low",
        clinicalPhase: "LEVEL_ALIGNMENT",
    },
};

/**
 * suggestTodosFromToothStates
 *
 * Inspects tooth alignment values and returns suggested todo payloads.
 * Each suggestion is a DRAFT — user must accept before it is saved.
 *
 * @param {Array}  teeth     — ToothData[] from chart state
 * @param {string} [visitId] — optional link to the current visit
 * @param {string} caseId
 * @param {string} patientId
 * @returns {Array} suggested todo payloads (NOT saved to DB)
 */
function suggestTodosFromToothStates(teeth, { caseId, patientId, visitId = null } = {}) {
    if (!Array.isArray(teeth)) return [];

    const suggestions = [];

    for (const tooth of teeth) {
        const alignment = tooth.alignment;
        if (!alignment || alignment === "normal") continue;

        const template = ALIGNMENT_TODO_MAP[alignment];
        if (!template) continue;

        // Label tooth by FDI number
        const toothLabel = String(tooth.id);

        suggestions.push({
            ...template,
            description: `${toothLabel}: ${template.description}`,
            tooth:       toothLabel,
            surface:     null,
            caseId,
            patientId,
            visitId,
        });
    }

    return suggestions;
}

/**
 * suggestTodoFromAction
 *
 * Suggests a TODO based on a single clinical observation.
 * Called by the SnapshotEditor when a clinician marks an issue.
 *
 * @param {Object} params
 * @param {string} params.alignment  — alignment value detected
 * @param {string} params.tooth      — FDI tooth identifier
 * @param {string} params.caseId
 * @param {string} params.patientId
 * @param {string} [params.visitId]
 * @returns {Object|null}  suggested todo payload (not saved)
 */
function suggestTodoFromAction({ alignment, tooth, caseId, patientId, visitId = null }) {
    const template = ALIGNMENT_TODO_MAP[alignment];
    if (!template) return null;
    return {
        ...template,
        description: `${tooth}: ${template.description}`,
        tooth,
        surface: null,
        caseId,
        patientId,
        visitId,
    };
}

module.exports = {
    suggestClinicalPhase,
    suggestTodosFromToothStates,
    suggestTodoFromAction,
};
