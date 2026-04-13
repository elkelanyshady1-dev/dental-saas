/**
 * guardianAutoRepair.service.js
 * Platform Guardian — Repair Dispatch Execution Engine
 *
 * PURPOSE:
 * Provides `runAutoRepair({ checkName, context, logger })` — the single entry
 * point for executing any Guardian auto-repair.
 *
 * Replaces the manual if-chain in startup.guardian.js with a registry-driven
 * dispatch pattern:
 *
 *   Guardian detects violation
 *     → runAutoRepair({ checkName })
 *         → REPAIR_REGISTRY[checkName] resolves repair function
 *         → (optional) session.withTransaction() wraps atomic repairs
 *         → repair executes
 *         → structured log emitted
 *         → result returned to caller for post-repair validation
 *
 * ── Safety Rules ──────────────────────────────────────────────────────────────
 * - Financial invariants (BILLING_LEDGER_INTEGRITY, INVOICE_CONTRACT_INTEGRITY,
 *   ORPHAN_PAYMENT_INTEGRITY) are NEVER in the registry — repairs return
 *   { skipped: true, reason: "no_repair_defined" } for unknown check names.
 * - Production guard is enforced by startup.guardian.js (IS_DEV() check).
 *   This service does NOT re-enforce it — callers are responsible.
 *
 * ── Retry Safety ─────────────────────────────────────────────────────────────
 * Repairs wrapped in session.withTransaction() use MongoDB's built-in transient
 * error retry. All repair functions must be idempotent — re-running them on
 * already-healthy data must be a no-op.
 *
 * PLANE: Platform
 */

"use strict";

const mongoose = require("mongoose");
const { REPAIR_REGISTRY } = require("./guardianRepairRegistry");

/**
 * runAutoRepair
 *
 * Resolves and executes the repair function for a failing Guardian invariant.
 *
 * @param {object} params
 * @param {string} params.checkName    - Guardian invariant name (e.g. "ORG_CURRENT_CONTRACT_POINTER_INTEGRITY")
 * @param {object} [params.context]    - Optional context from the failing check (e.g. { orgId })
 * @param {object} params.logger       - pino logger instance (guardianLogger)
 *
 * @returns {Promise<{
 *   skipped?:     boolean,      - true if no repair defined for this checkName
 *   reason?:      string,       - skip reason
 *   success?:     boolean,      - true on successful execution
 *   fixed?:       number,       - count of items repaired (if repair returns a number)
 *   result?:      any,          - raw return value from repair function
 *   error?:       string,       - error message if repair threw
 *   checkName:    string,
 *   description?: string,       - registry description for logs
 *   durationMs?:  number,       - wall-clock repair duration
 * }>}
 */
async function runAutoRepair({ checkName, context = {}, logger }) {
    const entry = REPAIR_REGISTRY[checkName];

    // ── No repair defined — graceful skip ─────────────────────────────────────
    if (!entry) {
        logger.warn(
            { check: checkName, timestamp: new Date() },
            `[Guardian Repair] No repair defined for "${checkName}" — skipping`
        );
        return { skipped: true, reason: "no_repair_defined", checkName };
    }

    const startedAt = new Date();
    const repairContext = { ...context, logger };

    // ── PART 7: Standardized repair log ──────────────────────────────────────
    logger.warn(
        {
            check: checkName,
            safetyClass: entry.safetyClass,
            useTransaction: entry.useTransaction,
            action: "starting",
            timestamp: startedAt,
        },
        `[Guardian Repair] Starting — ${checkName}: ${entry.description}`
    );

    try {
        let rawResult;

        // ── PART 3: Dispatch with optional transaction wrap ────────────────────
        if (entry.useTransaction) {
            // Atomic repairs: wrap in session.withTransaction() for auto-retry
            // on transient write conflicts. Repair function is called within
            // the transaction scope.
            const session = await mongoose.startSession();
            try {
                await session.withTransaction(async () => {
                    rawResult = await entry.fn({ ...repairContext, session });
                });
            } finally {
                session.endSession();
            }
        } else {
            // Non-atomic repairs (bulk updateMany, independent per-doc ops,
            // or repairs that manage their own sessions internally).
            rawResult = await entry.fn(repairContext);
        }

        const durationMs = Date.now() - startedAt.getTime();
        const fixed = typeof rawResult === "number" ? rawResult : undefined;

        // ── PART 7: Completion log ─────────────────────────────────────────────
        logger.warn(
            {
                check: checkName,
                safetyClass: entry.safetyClass,
                action: "completed",
                fixed,
                result: typeof rawResult !== "number" ? rawResult : undefined,
                durationMs,
                timestamp: new Date(),
            },
            `[Guardian Repair] Completed — ${checkName} repaired ${fixed ?? "?"} item(s)`
        );

        return {
            success: true,
            fixed,
            result: rawResult,
            checkName,
            description: entry.description,
            durationMs,
        };

    } catch (err) {
        const durationMs = Date.now() - startedAt.getTime();

        logger.error(
            {
                check: checkName,
                safetyClass: entry.safetyClass,
                action: "failed",
                error: err.message,
                durationMs,
                timestamp: new Date(),
            },
            `[Guardian Repair] FAILED — ${checkName}: ${err.message}`
        );

        return {
            success: false,
            error: err.message,
            checkName,
            description: entry.description,
            durationMs,
        };
    }
}

/**
 * runAutoRepairBatch
 *
 * Runs repairs for all failing checks in a batch, in declaration order.
 * Collects all results — does NOT abort on individual repair failure
 * (failed repairs are logged and included in the results array).
 *
 * Post-repair validation (re-running checks) is the caller's responsibility.
 *
 * @param {object} params
 * @param {Array<{ name: string, reason: string }>} params.failingChecks
 * @param {object} params.logger
 * @returns {Promise<{
 *   results:  Array<runAutoRepair result>,
 *   repaired: number,      - count of successful repairs
 *   skipped:  number,      - count of repairs with no handler
 *   errors:   string[],    - error messages from failed repairs
 * }>}
 */
async function runAutoRepairBatch({ failingChecks, logger }) {
    const results = [];
    let repaired = 0;
    let skipped = 0;
    const errors = [];

    for (const failure of failingChecks) {
        const result = await runAutoRepair({
            checkName: failure.name,
            context: failure.context || {},
            logger,
        });

        results.push(result);

        if (result.skipped) {
            skipped++;
        } else if (result.success) {
            repaired++;
        } else {
            errors.push(`${failure.name}: ${result.error}`);
        }
    }

    return { results, repaired, skipped, errors };
}

module.exports = { runAutoRepair, runAutoRepairBatch, REPAIR_REGISTRY };
