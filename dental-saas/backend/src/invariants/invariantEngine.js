/**
 * invariantEngine.js — Centralized Invariant Assertion Engine
 * Layer: Core > Invariants
 * Version: v26 Hardening
 *
 * PURPOSE:
 *   Centralizes ALL system invariant checks into a single enforcement point.
 *   Replaces scattered `if (mismatch) logger.error(...)` patterns with a
 *   structured assertion system that can STRICT-throw, WARN-log, or REPAIR-enqueue.
 *
 * MODES:
 *   "strict"  — Throws DomainError immediately. Write is blocked.
 *   "warn"    — Logs a critical violation. Write continues (non-blocking).
 *   "repair"  — Currently logs only (degraded to warn since Phase 6 Redis
 *               removal eliminated the BullMQ-backed repair engine). Registry
 *               entries keep `mode: "repair"` so a future Mongo-backed or
 *               QStash-backed repair pipeline can be wired back in without
 *               touching every call site.
 *
 * USAGE:
 *   const { assertInvariant } = require("@invariants/invariantEngine");
 *
 *   assertInvariant("VISIT_CASE_MATCH", {
 *       condition: visit.caseId.toString() === snapshot.caseId.toString(),
 *       context:   { visitId, snapshotId, caseId },
 *       message:   "Visit and snapshot caseId mismatch",
 *   });
 *
 * ARCHITECTURE:
 *   - Invariant definitions live in invariantRegistry.js (Part 3)
 *   - Violations are tracked in-memory with a capped ring buffer
 *   - The audit dashboard (Part 4) exposes violations via API
 */

"use strict";

const DomainError = require("../errors/DomainError");
const logger      = require("@utils/logger");

// ─── Violation Tracker (In-Memory Ring Buffer) ───────────────────────────────
// Capped at 500 entries to prevent memory leaks.
// For production persistence, violations should also be logged to the audit queue.

const MAX_VIOLATIONS = 500;
const _violations    = [];
let   _totalCount    = 0;

function _recordViolation(invariantName, mode, context, message) {
    _totalCount++;
    const entry = {
        id:        _totalCount,
        invariant: invariantName,
        mode,
        context,
        message,
        timestamp: new Date().toISOString(),
    };

    _violations.push(entry);
    if (_violations.length > MAX_VIOLATIONS) {
        _violations.shift(); // drop oldest
    }

    return entry;
}

// ─── assertInvariant ─────────────────────────────────────────────────────────
/**
 * Asserts a system invariant. Behavior depends on the invariant's registered mode.
 *
 * @param {string}  invariantName — Key from invariantRegistry (e.g. "VISIT_CASE_MATCH")
 * @param {Object}  opts
 * @param {boolean} opts.condition — The boolean assertion (true = OK, false = violation)
 * @param {Object}  opts.context   — Contextual data for logging/repair (caseId, visitId, etc.)
 * @param {string}  [opts.message] — Optional human-readable override message
 * @param {string}  [opts.modeOverride] — Force a specific mode (bypasses registry)
 *
 * @throws {DomainError} When mode is "strict" and condition is false
 * @returns {boolean} true if invariant holds, false if violated (warn/repair modes)
 */
function assertInvariant(invariantName, { condition, context = {}, message = null, modeOverride = null } = {}) {
    // Fast path: invariant holds — nothing to do
    if (condition) return true;

    // Look up the invariant definition
    const registry  = require("./invariantRegistry");
    const invariant = registry[invariantName];

    if (!invariant) {
        logger.error({
            event:         "UNKNOWN_INVARIANT",
            invariantName,
            context,
        }, `[InvariantEngine] Unknown invariant: "${invariantName}" — defaulting to STRICT mode`);
    }

    const mode         = modeOverride || invariant?.mode || "strict";
    const description  = message || invariant?.message || `Invariant violation: ${invariantName}`;
    const statusCode   = invariant?.statusCode || 500;
    const errorCode    = invariant?.errorCode || invariantName;

    // Record the violation
    const violation = _recordViolation(invariantName, mode, context, description);

    // Log (ALL modes log — this is the audit trail guarantee)
    logger.error({
        event:         "INVARIANT_VIOLATION",
        invariant:     invariantName,
        mode,
        violationId:   violation.id,
        ...context,
    }, `[InvariantEngine] VIOLATION [${mode.toUpperCase()}]: ${description}`);

    // ── Mode-specific behavior ───────────────────────────────────────────────

    if (mode === "strict") {
        // HARD FAIL — block the write
        throw new DomainError(description, statusCode, errorCode, {
            invariant: invariantName,
            violationId: violation.id,
            ...context,
        });
    }

    // "warn" and "repair" modes fall through — already logged above.
    // Phase 6: "repair" is degraded to log-only since the BullMQ repair
    // engine was removed. Registry entries retain `mode: "repair"` so a
    // future Mongo/QStash pipeline can re-enable the side effect without
    // churning every call site.
    return false;
}

// ─── Reporting API (consumed by Part 4 dashboard) ────────────────────────────

/**
 * Returns the current violation state for the audit dashboard.
 * @returns {{ totalCount: number, violations: Object[], criticalCount: number, repairQueueSize: number }}
 */
function getViolationReport() {
    const registry = require("./invariantRegistry");

    let criticalCount   = 0;
    let repairQueueSize = 0;

    for (const v of _violations) {
        const def = registry[v.invariant];
        if (def?.mode === "strict") criticalCount++;
        if (def?.mode === "repair" || v.mode === "repair") repairQueueSize++;
    }

    return {
        totalCount: _totalCount,
        recentViolations: _violations.slice(-100), // last 100
        criticalCount,
        repairQueueSize,
        bufferSize:   _violations.length,
        maxBuffer:    MAX_VIOLATIONS,
    };
}

/**
 * Clears the in-memory violation buffer. For testing / admin reset only.
 */
function clearViolations() {
    _violations.length = 0;
    _totalCount = 0;
}

module.exports = {
    assertInvariant,
    getViolationReport,
    clearViolations,
};
