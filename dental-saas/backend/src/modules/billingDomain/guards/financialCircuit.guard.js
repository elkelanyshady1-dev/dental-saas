/**
 * financialCircuit.guard.js — Granular Financial Circuit Breaker
 * Billing Domain — Ledger Hardening v2
 *
 * Protects the financial system from processing new transactions
 * when severe drift or system instability is detected.
 *
 * v2 UPGRADE: Granular per-operation blocking instead of global lock.
 * Each operation type can be independently blocked based on targeted drift analysis.
 *
 * CIRCUIT STATES (per operation):
 *   CLOSED  — normal operation (default)
 *   OPEN    — specific drift detected → block that operation
 *
 * OPERATION-SPECIFIC TRIGGERS:
 *   invoiceWrite  — blocked on AR (accounts receivable) drift
 *   paymentWrite  — blocked on Cash drift
 *   refundWrite   — blocked on Refund account drift OR fatal alerts
 *   globalWrite   — blocked on fatal alerts (all operations)
 *
 * INVARIANTS:
 * 1. Read operations are NEVER blocked
 * 2. Thresholds are configurable via environment
 * 3. Circuit state is computed on-demand (no stale cache)
 * 4. Each operation fails independently — system degrades gracefully
 *
 * PLANE: Org only.
 *
 * @per-org-transactional — Internal guard. Uses explicit organizationId.
 */

"use strict";

const driftAlertService = require("../integrity/driftAlert.service");
const journalRetryService = require("../resilience/journalRetry.service");
const logger = require("@utils/logger");

// ─── Configuration ──────────────────────────────────────────────────────────

const DEAD_JOB_THRESHOLD = parseInt(process.env.FINANCIAL_CIRCUIT_DEAD_THRESHOLD || "3", 10);
const CIRCUIT_BREAKER_ENABLED = process.env.FINANCIAL_CIRCUIT_ENABLED !== "false";

// ─── Operation Types ────────────────────────────────────────────────────────

const OPERATIONS = {
    INVOICE_WRITE: "invoiceWrite",
    PAYMENT_WRITE: "paymentWrite",
    REFUND_WRITE: "refundWrite",
};

// ─── Granular Circuit Check ─────────────────────────────────────────────────

/**
 * Evaluate the circuit state for a specific operation.
 * Returns { blocked: boolean, reasons: string[] }
 *
 * @param {string|ObjectId} organizationId
 * @param {string} operation — one of OPERATIONS
 * @returns {Promise<Object>}
 */
async function evaluateOperation(organizationId, operation) {
    const reasons = [];

    const openAlerts = await driftAlertService.getOpenAlerts(organizationId);
    const retryStats = await journalRetryService.getQueueStats(organizationId);

    // ── GLOBAL BLOCK: Fatal alerts block ALL operations ──────────
    const fatalAlerts = openAlerts.filter(a => a.severity === "fatal");
    if (fatalAlerts.length > 0) {
        reasons.push(`${fatalAlerts.length} fatal drift alert(s) open`);
    }

    // ── GLOBAL BLOCK: Excessive dead retry jobs ──────────────────
    if (retryStats.dead >= DEAD_JOB_THRESHOLD) {
        reasons.push(`${retryStats.dead} dead retry job(s) (threshold: ${DEAD_JOB_THRESHOLD})`);
    }

    // ── PER-OPERATION: Targeted drift checks ─────────────────────
    const criticalAlerts = openAlerts.filter(a => a.severity === "critical");

    switch (operation) {
        case OPERATIONS.INVOICE_WRITE: {
            // Invoice writes blocked if AR-related drift
            const arDrift = criticalAlerts.filter(a =>
                a.type === "accounts_receivable_mismatch" || a.type === "revenue_mismatch"
            );
            if (arDrift.length > 0) {
                reasons.push(`${arDrift.length} AR/revenue drift alert(s) — invoice writes blocked`);
            }
            break;
        }

        case OPERATIONS.PAYMENT_WRITE: {
            // Payment writes blocked if cash-related drift
            const cashDrift = criticalAlerts.filter(a =>
                a.type === "cash_mismatch"
            );
            if (cashDrift.length > 0) {
                reasons.push(`${cashDrift.length} cash drift alert(s) — payment writes blocked`);
            }
            break;
        }

        case OPERATIONS.REFUND_WRITE: {
            // Refund writes blocked on ANY critical or fatal drift (most sensitive operation)
            if (criticalAlerts.length > 0) {
                reasons.push(`${criticalAlerts.length} critical drift alert(s) — refund writes blocked`);
            }
            break;
        }

        default:
            break;
    }

    return { blocked: reasons.length > 0, reasons };
}

/**
 * Check if a specific financial operation is allowed.
 * Throws a typed error with the specific operation code if blocked.
 *
 * @param {string|ObjectId} organizationId
 * @param {string} operation — one of OPERATIONS
 * @throws {Error} with operation-specific error code
 */
async function checkFinancialHealth(organizationId, operation) {
    if (!CIRCUIT_BREAKER_ENABLED) return;

    // Default to most restrictive if no operation specified (backward compat)
    const op = operation || OPERATIONS.REFUND_WRITE;

    const { blocked, reasons } = await evaluateOperation(organizationId, op);

    if (blocked) {
        const errorCodes = {
            [OPERATIONS.INVOICE_WRITE]: "INVOICE_WRITE_BLOCKED",
            [OPERATIONS.PAYMENT_WRITE]: "PAYMENT_WRITE_BLOCKED",
            [OPERATIONS.REFUND_WRITE]: "REFUND_WRITE_BLOCKED",
        };

        const code = errorCodes[op] || "FINANCIAL_SYSTEM_LOCKED";

        logger.error(
            {
                organizationId: organizationId.toString(),
                operation: op,
                reasons,
                code,
            },
            `[FinancialCircuit] ⛔ ${code} — Operation blocked`
        );

        const error = new Error(
            `${code}: The operation "${op}" is temporarily blocked ` +
            `due to detected integrity issues. Reasons: ${reasons.join("; ")}. ` +
            `Other operations may still be available. Contact your system administrator.`
        );
        error.statusCode = 503;
        error.code = code;
        error.reasons = reasons;
        error.operation = op;
        throw error;
    }
}

/**
 * Get the granular circuit state for all operations (monitoring/dashboard).
 *
 * @param {string|ObjectId} organizationId
 * @returns {Promise<Object>}
 */
async function getCircuitState(organizationId) {
    if (!CIRCUIT_BREAKER_ENABLED) {
        return {
            state: "DISABLED",
            operations: {},
            reasons: [],
        };
    }

    const results = {};
    const allReasons = [];

    for (const [key, op] of Object.entries(OPERATIONS)) {
        const { blocked, reasons } = await evaluateOperation(organizationId, op);
        results[key] = { state: blocked ? "OPEN" : "CLOSED", reasons };
        if (blocked) allReasons.push(...reasons);
    }

    // Deduplicate reasons
    const uniqueReasons = [...new Set(allReasons)];

    const retryStats = await journalRetryService.getQueueStats(organizationId);

    return {
        state: uniqueReasons.length > 0 ? "DEGRADED" : "CLOSED",
        operations: results,
        reasons: uniqueReasons,
        stats: {
            deadRetryJobs: retryStats.dead,
            pendingRetryJobs: retryStats.pending + retryStats.retrying,
        },
    };
}

module.exports = {
    checkFinancialHealth,
    getCircuitState,
    evaluateOperation,
    OPERATIONS,
    DEAD_JOB_THRESHOLD,
};
