"use strict";

/**
 * planningGuard.js — Orthodontic Treatment Plan State Machine Guards
 *
 * Two responsibilities:
 *
 * 1. REJECT LEGACY PLAN WRITES
 *    The legacy write paths (`OrthodonticCase.workflowData.finalPlan`,
 *    `WorkflowRecordSet.treatmentPlan`, embedded `recordSet.treatmentPlan`)
 *    are retired. All plan data is now owned by the TreatmentPlanVersion
 *    collection. Any attempt to write those fields through the legacy
 *    `updateRecordSet` / `updateWorkflowData` endpoints returns
 *    400 PLAN_WRITE_FORBIDDEN.
 *
 * 2. ENFORCE RECORD-SET ACTION MATRIX
 *    Plan state-machine transitions must match the phase of the record set:
 *      PRE    → CREATE_DRAFT / EDIT_DRAFT / DELETE_DRAFT / APPROVE / VIEW
 *      MID    → CREATE_REVISION / VIEW
 *      POST   → VIEW
 *      CUSTOM → VIEW  (conservative default — opt-in planning is a future feature flag)
 *
 *    Violations return 403 RECORD_SET_ACTION_DENIED.
 */

// ─── Logger (optional — fall back to console when @utils/logger unavailable) ─

let logger;
try {
    logger = require("@utils/logger");
} catch (_e) {
    logger = { warn: console.warn, info: console.info, error: console.error };
}

// ─── Constants ────────────────────────────────────────────────────────────────

const LEGACY_PLAN_FIELDS = Object.freeze([
    "treatmentPlan",
    "finalPlan",
    "problemList",
    "treatmentGoals",
    "treatmentOptions",
    "selectedOptionId",
]);

const ACTION_MATRIX = Object.freeze({
    PRE:    Object.freeze(["CREATE_DRAFT", "EDIT_DRAFT", "DELETE_DRAFT", "APPROVE", "VIEW"]),
    MID:    Object.freeze(["CREATE_REVISION", "VIEW"]),
    POST:   Object.freeze(["VIEW"]),
    CUSTOM: Object.freeze(["VIEW"]),
});

// ─── Errors ───────────────────────────────────────────────────────────────────

function _err(code, message, statusCode) {
    const e = new Error(message);
    e.code = code;
    e.statusCode = statusCode;
    return e;
}

// ─── Guards ───────────────────────────────────────────────────────────────────

/**
 * Reject payloads that touch retired plan fields.
 *
 * @param {object} payload  — the incoming body section to inspect (may be null / undefined)
 * @param {string} [path='payload'] — label for the error message (e.g. "recordSetData", "workflowData")
 * @throws 400 PLAN_WRITE_FORBIDDEN when any LEGACY_PLAN_FIELDS key is present
 */
function assertNoLegacyPlanWrites(payload, path = "payload") {
    if (!payload || typeof payload !== "object") return;
    const hit = LEGACY_PLAN_FIELDS.filter((f) => Object.prototype.hasOwnProperty.call(payload, f));
    if (hit.length) {
        // Hardening §6.2 — emit a structured warn so ops can alert on elevated
        // block rates (e.g. a client stuck on the old write path).
        logger.warn("PLAN_GUARD_BLOCK", {
            reason: "LEGACY_PLAN_WRITE",
            path,
            fields: hit,
        });
        throw _err(
            "PLAN_WRITE_FORBIDDEN",
            `${path} contains retired plan fields [${hit.join(", ")}]. Use /plan-versions to manage treatment plans.`,
            400,
        );
    }
}

/**
 * Enforce the record-set → action matrix.
 *
 * @param {string} recordSetType — one of PRE / MID / POST / CUSTOM (case-sensitive).
 * @param {string} action        — one of CREATE_DRAFT / EDIT_DRAFT / DELETE_DRAFT / APPROVE / CREATE_REVISION / VIEW.
 * @throws 403 RECORD_SET_ACTION_DENIED when not allowed; 400 RECORD_SET_UNKNOWN on unknown type.
 */
function assertRecordSetSupportsAction(recordSetType, action) {
    const allowed = ACTION_MATRIX[recordSetType];
    if (!allowed) {
        logger.warn("PLAN_GUARD_BLOCK", { reason: "RECORD_SET_UNKNOWN", recordSetType, action });
        throw _err(
            "RECORD_SET_UNKNOWN",
            `Unknown record-set type "${recordSetType}" — expected one of PRE, MID, POST, CUSTOM.`,
            400,
        );
    }
    if (!allowed.includes(action)) {
        logger.warn("PLAN_GUARD_BLOCK", { reason: "ACTION_DENIED", recordSetType, action });
        throw _err(
            "RECORD_SET_ACTION_DENIED",
            `Action "${action}" is not permitted on a ${recordSetType} record set.`,
            403,
        );
    }
}

/**
 * Predicate form — returns boolean without throwing. Useful for guard selection
 * in controllers that branch (e.g., "hide button" vs "throw").
 */
function canRecordSetPerform(recordSetType, action) {
    const allowed = ACTION_MATRIX[recordSetType];
    return Array.isArray(allowed) && allowed.includes(action);
}

// ─── Export ───────────────────────────────────────────────────────────────────

module.exports = {
    LEGACY_PLAN_FIELDS,
    ACTION_MATRIX,
    assertNoLegacyPlanWrites,
    assertRecordSetSupportsAction,
    canRecordSetPerform,
};
