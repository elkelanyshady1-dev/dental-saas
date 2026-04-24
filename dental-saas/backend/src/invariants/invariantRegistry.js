/**
 * invariantRegistry.js — Invariant Definition Registry
 * Layer: Core > Invariants
 * Version: v26 Hardening — Part 3
 *
 * PURPOSE:
 *   Single source of truth for all system invariants, their enforcement modes,
 *   and error metadata. The invariantEngine reads from this registry to decide
 *   whether a violation should throw, warn, or enqueue a repair job.
 *
 * ADDING A NEW INVARIANT:
 *   1. Add an entry to this file with a unique key
 *   2. Call assertInvariant(key, { condition, context }) in the service layer
 *   3. If mode is "repair", add a handler in repairEngine.js
 *
 * MODE REFERENCE:
 *   "strict" — Throws DomainError. Write is BLOCKED. Data corruption risk if ignored.
 *   "warn"   — Logs critical. Write CONTINUES. Acceptable inconsistency (self-healing later).
 *   "repair" — Logs + enqueues auto-repair job. Write CONTINUES. System fixes itself.
 */

"use strict";

// ═══════════════════════════════════════════════════════════════════════════════
// INVARIANT DEFINITIONS — HARD FAIL vs SOFT FAIL MATRIX
// ═══════════════════════════════════════════════════════════════════════════════

const registry = {

    // ─── Clinical Domain: Snapshot ↔ Visit ────────────────────────────────────

    VISIT_CASE_MATCH: {
        mode:       "strict",
        message:    "Visit caseId does not match snapshot caseId — cross-case linking forbidden",
        statusCode: 400,
        errorCode:  "VISIT_CASE_MISMATCH",
        domain:     "clinical",
        severity:   "critical",
    },

    SNAPSHOT_VISIT_REQUIRED: {
        mode:       "strict",
        message:    "Treatment/post-treatment snapshot requires an active visit session",
        statusCode: 400,
        errorCode:  "VISIT_REQUIRED",
        domain:     "clinical",
        severity:   "critical",
    },

    SNAPSHOT_VISIT_ACTIVE: {
        mode:       "strict",
        message:    "Referenced visit session is not active",
        statusCode: 409,
        errorCode:  "INVALID_ACTIVE_VISIT",
        domain:     "clinical",
        severity:   "critical",
    },

    SNAPSHOT_TYPE_VALID: {
        mode:       "strict",
        message:    "Invalid snapshot type",
        statusCode: 400,
        errorCode:  "INVALID_SNAPSHOT_TYPE",
        domain:     "clinical",
        severity:   "critical",
    },

    DIAGNOSTIC_SINGLETON: {
        mode:       "strict",
        message:    "A diagnostic snapshot already exists for this case (singleton violated)",
        statusCode: 409,
        errorCode:  "DIAGNOSTIC_ALREADY_EXISTS",
        domain:     "clinical",
        severity:   "critical",
    },

    // ─── Clinical Domain: Visit Lifecycle ─────────────────────────────────────

    VISIT_STATE_TRANSITION: {
        mode:       "strict",
        message:    "Illegal visit status transition",
        statusCode: 409,
        errorCode:  "ILLEGAL_STATUS_TRANSITION",
        domain:     "clinical",
        severity:   "critical",
    },

    VISIT_REQUIRES_SNAPSHOT: {
        mode:       "strict",
        message:    "Visit cannot be closed without a linked clinical snapshot",
        statusCode: 422,
        errorCode:  "VISIT_REQUIRES_SNAPSHOT",
        domain:     "clinical",
        severity:   "critical",
    },

    VISIT_SINGLETON_ACTIVE: {
        mode:       "strict",
        message:    "Case already has an active visit session (singleton violated)",
        statusCode: 409,
        errorCode:  "VISIT_ALREADY_ACTIVE",
        domain:     "clinical",
        severity:   "critical",
    },

    // ─── Clinical Domain: Data Integrity (repairable) ─────────────────────────

    SNAPSHOT_ID_MISMATCH: {
        mode:       "repair",
        message:    "endVisit received a different snapshotId than the one linked by saveSnapshot transaction",
        statusCode: 500,
        errorCode:  "SNAPSHOT_ID_MISMATCH",
        domain:     "clinical",
        severity:   "high",
    },

    ORPHAN_ACTIVE_VISIT: {
        mode:       "repair",
        message:    "Active visit found without any recent heartbeat — may be orphaned",
        statusCode: 500,
        errorCode:  "ORPHAN_ACTIVE_VISIT",
        domain:     "clinical",
        severity:   "medium",
    },

    COMPLETED_VISIT_NO_SNAPSHOT: {
        mode:       "repair",
        message:    "Completed visit has no linked snapshotId",
        statusCode: 500,
        errorCode:  "COMPLETED_VISIT_NO_SNAPSHOT",
        domain:     "clinical",
        severity:   "high",
    },

    TREATMENT_SNAPSHOT_NO_VISIT: {
        mode:       "repair",
        message:    "Treatment snapshot exists without a linked visitId",
        statusCode: 500,
        errorCode:  "TREATMENT_SNAPSHOT_NO_VISIT",
        domain:     "clinical",
        severity:   "high",
    },

    // ─── Clinical Domain: Warnings (non-blocking) ─────────────────────────────

    MISSING_AUDIT_LOG: {
        mode:       "warn",
        message:    "Expected audit log entry not found for mutation",
        statusCode: 500,
        errorCode:  "MISSING_AUDIT_LOG",
        domain:     "audit",
        severity:   "low",
    },

    SNAPSHOT_HASH_GENERATION_FAILED: {
        mode:       "warn",
        message:    "chartState hash generation failed — idempotency check skipped",
        statusCode: 500,
        errorCode:  "HASH_GENERATION_FAILED",
        domain:     "clinical",
        severity:   "low",
    },

    BONDING_SNAPSHOT_CAPTURE_FAILED: {
        mode:       "warn",
        message:    "Failed to capture bonding state for snapshot — saving without appliance state",
        statusCode: 500,
        errorCode:  "BONDING_CAPTURE_FAILED",
        domain:     "clinical",
        severity:   "low",
    },

    TAD_SNAPSHOT_CAPTURE_FAILED: {
        mode:       "warn",
        message:    "Failed to capture TAD state for snapshot — saving without TAD state",
        statusCode: 500,
        errorCode:  "TAD_CAPTURE_FAILED",
        domain:     "clinical",
        severity:   "low",
    },

    // ─── Billing Domain ───────────────────────────────────────────────────────

    CONTRACT_ORG_MATCH: {
        mode:       "strict",
        message:    "Contract does not belong to the target organization",
        statusCode: 400,
        errorCode:  "CONTRACT_ORG_MISMATCH",
        domain:     "billing",
        severity:   "critical",
    },

    LEDGER_INVOICE_MATCH: {
        mode:       "strict",
        message:    "Ledger entry amount does not match invoice amount",
        statusCode: 500,
        errorCode:  "LEDGER_INVOICE_MISMATCH",
        domain:     "billing",
        severity:   "critical",
    },

    MISSING_LEDGER_ENTRY: {
        mode:       "repair",
        message:    "Expected ledger entry not found for completed payment",
        statusCode: 500,
        errorCode:  "MISSING_LEDGER_ENTRY",
        domain:     "billing",
        severity:   "high",
    },

    // ─── Inventory Domain ─────────────────────────────────────────────────────

    INVENTORY_MOVEMENT_BALANCE: {
        mode:       "repair",
        message:    "Inventory movement total does not match current stock level",
        statusCode: 500,
        errorCode:  "INVENTORY_BALANCE_MISMATCH",
        domain:     "inventory",
        severity:   "medium",
    },

    // ─── Cross-Domain: Consistency ────────────────────────────────────────────

    SNAPSHOT_CASE_ID_CROSS_CHECK: {
        mode:       "repair",
        message:    "Snapshot caseId does not match its visit's caseId (cross-domain check)",
        statusCode: 500,
        errorCode:  "SNAPSHOT_CASE_ID_CROSS_MISMATCH",
        domain:     "clinical",
        severity:   "high",
    },

    MULTIPLE_ACTIVE_VISITS: {
        mode:       "repair",
        message:    "Multiple active visits found for a single case (DB index may be missing)",
        statusCode: 500,
        errorCode:  "MULTIPLE_ACTIVE_VISITS",
        domain:     "clinical",
        severity:   "critical",
    },

    // ─── Backup Domain ────────────────────────────────────────────────────────

    BACKUP_FREQUENCY_PLAN_VIOLATION: {
        mode:       "strict",
        message:    "Requested backup frequency exceeds plan allowance (daily requires higher tier)",
        statusCode: 403,
        errorCode:  "BACKUP_FREQUENCY_PLAN_VIOLATION",
        domain:     "backup",
        severity:   "critical",
    },

    BACKUP_RETENTION_PLAN_VIOLATION: {
        mode:       "strict",
        message:    "Requested retention period exceeds plan maximum retention days",
        statusCode: 403,
        errorCode:  "BACKUP_RETENTION_PLAN_VIOLATION",
        domain:     "backup",
        severity:   "critical",
    },

    BACKUP_DUPLICATE_SCHEDULED: {
        mode:       "warn",
        message:    "Scheduled backup already exists for this date — duplicate suppressed",
        statusCode: 409,
        errorCode:  "BACKUP_DUPLICATE_SCHEDULED",
        domain:     "backup",
        severity:   "medium",
    },

    BACKUP_RETENTION_ACTIVE_JOB: {
        mode:       "strict",
        message:    "Retention policy attempted to delete an in-progress backup job",
        statusCode: 500,
        errorCode:  "BACKUP_RETENTION_ACTIVE_JOB",
        domain:     "backup",
        severity:   "critical",
    },

    BACKUP_RETENTION_LAST_COPY: {
        mode:       "warn",
        message:    "Retention policy skipped deletion — at least one completed backup must be retained",
        statusCode: 200,
        errorCode:  "BACKUP_RETENTION_LAST_COPY",
        domain:     "backup",
        severity:   "medium",
    },
};

module.exports = registry;
