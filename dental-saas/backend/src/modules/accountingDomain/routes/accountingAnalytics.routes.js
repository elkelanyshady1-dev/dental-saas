/**
 * accountingAnalytics.routes.js
 * AccountingDomain — Full Analytics + Admin + Observability Routes (v3 — Phase 3.5)
 *
 * Mounted at: /api/v1/org/accounting
 * Guards:     orgProtect → organizationContext → requireEntitlement → requireOrgPermission → policyMiddleware
 *
 * ┌─────────────────────────────────────────────────────────────────────────────┐
 * │ ROUTES                                                                      │
 * │                                                                             │
 * │ ANALYTICS (ACCOUNTING_READ)                                                 │
 * │   GET  /accounting/daily              — Daily analytics (live query)        │
 * │   GET  /accounting/monthly            — Monthly analytics (live query)      │
 * │   GET  /accounting/outstanding        — Outstanding balances report         │
 * │                                                                             │
 * │ OBSERVABILITY (ACCOUNTING_READ)                                              │
 * │   GET  /accounting/health             — Metrics snapshot + DLQ depth        │
 * │                                                                             │
 * │ ADMIN (ACCOUNTING_MANAGE)                                                   │
 * │   POST /accounting/rebuild            — Trigger projection rebuild          │
 * │   GET  /accounting/dlq                — List failed events (DLQ)            │
 * │   POST /accounting/dlq/retry          — Retry pending DLQ events            │
 * └─────────────────────────────────────────────────────────────────────────────┘
 *
 * DOMAIN LAW:
 *   accounting.read   → clinic financial analytics (THIS FILE)
 *   accounting.manage → admin operations (rebuild, DLQ)
 *   billing.read      → SaaS subscription (settingsBilling.routes.js — DIFFERENT)
 *
 * @module accountingDomain/routes/accountingAnalytics.routes
 */

"use strict";

const express = require("express");
const router  = express.Router();

const orgProtect           = require("@middleware/orgProtect");
const organizationContext  = require("@middleware/organizationMiddleware");
const requireOrgPermission = require("@middleware/requireOrgPermission");
const policyMiddleware     = require("@rbac/policyMiddleware");
const { P }                = require("@rbac/orgPermissions");
const requireEntitlement   = require("@middleware/requireEntitlement");
const { autoAudit }        = require("@middleware/auditInterceptor");

// ─── Services ─────────────────────────────────────────────────────────────────
const clinicAnalyticsService = require("../services/clinicAnalytics.service");
const replayService          = require("../services/replay.service");
const dlqRetryService        = require("../services/dlqRetry.service");
const metrics                = require("../observability/accounting.metrics");
const { getQueueStats }      = require("../utils/batchProcessor");

// ─── Global middleware ────────────────────────────────────────────────────────
router.use(
    orgProtect,
    organizationContext,
    requireEntitlement("finance"),
    autoAudit("AccountingAnalytics")
);

// ═══════════════════════════════════════════════════════════════
// ANALYTICS ROUTES (P.ACCOUNTING_READ)
// ═══════════════════════════════════════════════════════════════

// ── GET /accounting/daily ─────────────────────────────────────────────────────
router.get(
    "/daily",
    requireOrgPermission(P.ACCOUNTING_READ),
    policyMiddleware(P.ACCOUNTING_READ),
    async (req, res) => {
        const { date, branchId } = req.query;

        if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
            return res.status(400).json({
                success: false,
                error: { code: "INVALID_DATE", message: "date required (YYYY-MM-DD)" },
            });
        }

        try {
            const data = await clinicAnalyticsService.getDailySummary({
                req, date, branchId: branchId || null
            });
            return res.json({ success: true, data });
        } catch (err) {
            return res.status(500).json({
                success: false,
                error: { code: "DAILY_SUMMARY_ERROR", message: err.message },
            });
        }
    }
);

// ── GET /accounting/monthly ───────────────────────────────────────────────────
router.get(
    "/monthly",
    requireOrgPermission(P.ACCOUNTING_READ),
    policyMiddleware(P.ACCOUNTING_READ),
    async (req, res) => {
        const year  = parseInt(req.query.year);
        const month = parseInt(req.query.month);

        if (!year || !month || month < 1 || month > 12) {
            return res.status(400).json({
                success: false,
                error: { code: "INVALID_PARAMS", message: "year and month (1–12) required" },
            });
        }

        try {
            const data = await clinicAnalyticsService.getMonthlySummary({
                req, year, month, branchId: req.query.branchId || null
            });
            return res.json({ success: true, data });
        } catch (err) {
            return res.status(500).json({
                success: false,
                error: { code: "MONTHLY_SUMMARY_ERROR", message: err.message },
            });
        }
    }
);

// ── GET /accounting/outstanding ───────────────────────────────────────────────
router.get(
    "/outstanding",
    requireOrgPermission(P.ACCOUNTING_READ),
    policyMiddleware(P.ACCOUNTING_READ),
    async (req, res) => {
        const limit = Math.min(parseInt(req.query.limit) || 50, 200);

        try {
            const data = await clinicAnalyticsService.getOutstandingBalances({
                req, branchId: req.query.branchId || null, limit
            });
            return res.json({ success: true, data });
        } catch (err) {
            return res.status(500).json({
                success: false,
                error: { code: "OUTSTANDING_ERROR", message: err.message },
            });
        }
    }
);

// ═══════════════════════════════════════════════════════════════
// OBSERVABILITY (P.ACCOUNTING_READ)
// ═══════════════════════════════════════════════════════════════

// ── GET /accounting/health ────────────────────────────────────────────────────
/**
 * Health check — returns metrics snapshot, DLQ depth, and batch queue stats.
 * Accessible to all users with ACCOUNTING_READ (not just admins).
 */
router.get(
    "/health",
    requireOrgPermission(P.ACCOUNTING_READ),
    policyMiddleware(P.ACCOUNTING_READ),
    async (req, res) => {
        try {
            const metricsSnapshot = metrics.getSnapshot();
            const batchStats      = getQueueStats();

            // DLQ depth for this org
            let dlqSummary = { pending: 0, retrying: 0, abandoned: 0, total: 0 };
            try {
                dlqSummary = await dlqRetryService.getDlqSummary(
                    req.dbConnection,
                    req.organizationId
                );
            } catch { /* non-blocking — DLQ query failure doesn't break health */ }

            // ── Enriched observability signal ────────────────────────────────
            const eventsProcessed  = metricsSnapshot.counters.eventsProcessed;
            const eventsFailed     = metricsSnapshot.counters.eventsFailed;
            const eventsInDlq      = metricsSnapshot.counters.eventsInDlq;

            const dlqBacklogRatio = eventsProcessed > 0
                ? eventsInDlq / eventsProcessed
                : 0;

            // ✅ Step 3 — Failure rate early warning (Phase 3.7)
            // Detects projection degradation BEFORE the DLQ backlog becomes large.
            // A >10% failure rate is critical even if DLQ appears small.
            const failureRate = eventsProcessed > 0
                ? eventsFailed / eventsProcessed
                : 0;

            const systemStatus =
                dlqBacklogRatio > 0.15 || failureRate > 0.1
                    ? "critical"
                    : dlqBacklogRatio > 0.05 || failureRate > 0.05
                    ? "warning"
                    : "healthy";

            return res.json({
                success: true,
                data: {
                    // Top-level status for quick health checks
                    status:              systemStatus,
                    domain:              "accountingDomain",

                    // Core pipeline counters
                    eventsProcessed,
                    eventsFailed,
                    eventsInDlq,
                    dlqBacklogRatio:     Math.round(dlqBacklogRatio * 10000) / 10000, // 4 dec places
                    failureRate:         Math.round(failureRate    * 10000) / 10000, // Phase 3.7

                    // Timing signals
                    lastEventAt:         metricsSnapshot.timestamps.lastEventAt,
                    lastReplayAt:        metricsSnapshot.timestamps.lastReplayAt,
                    lastReplayDurationMs: metricsSnapshot.timestamps.lastReplayDurationMs,
                    lastDlqRetryAt:      metricsSnapshot.timestamps.lastDlqRetryAt,
                    lastBatchFlushAt:    metricsSnapshot.timestamps.lastBatchFlushAt,

                    // Detailed breakdown (for dashboards)
                    dlq:        dlqSummary,
                    batchQueue: batchStats,
                    metrics:    metricsSnapshot,

                    checkedAt:  new Date().toISOString(),
                },
            });
        } catch (err) {
            return res.status(500).json({
                success: false,
                error: { code: "HEALTH_ERROR", message: err.message },
            });
        }
    }
);

// ═══════════════════════════════════════════════════════════════
// ADMIN ROUTES (P.ACCOUNTING_MANAGE)
// ═══════════════════════════════════════════════════════════════

// ── POST /accounting/rebuild ──────────────────────────────────────────────────
router.post(
    "/rebuild",
    requireOrgPermission(P.ACCOUNTING_MANAGE),
    policyMiddleware(P.ACCOUNTING_MANAGE),
    async (req, res) => {
        const { organizationId, dbConnection } = req;

        if (!dbConnection || !organizationId) {
            return res.status(400).json({
                success: false,
                error: { code: "MISSING_CONTEXT", message: "Org context not available" },
            });
        }

        const startedAt = Date.now();

        try {
            const stats = await replayService.rebuildProjections(dbConnection, organizationId);
            const durationMs = Date.now() - startedAt;

            metrics.recordReplay(durationMs);

            return res.json({
                success: true,
                message: "Accounting projections rebuilt successfully",
                data: { ...stats, durationMs },
            });
        } catch (err) {
            // Concurrency lock — another rebuild is already running for this org
            if (err.message === "REPLAY_ALREADY_RUNNING") {
                return res.status(409).json({
                    success: false,
                    error: {
                        code:    "REPLAY_ALREADY_RUNNING",
                        message: "A projection rebuild is already in progress for this organization. Please wait for it to complete.",
                    },
                });
            }

            return res.status(500).json({
                success: false,
                error: { code: "REBUILD_ERROR", message: err.message },
            });
        }
    }
);

// ── GET /accounting/dlq ───────────────────────────────────────────────────────
router.get(
    "/dlq",
    requireOrgPermission(P.ACCOUNTING_MANAGE),
    policyMiddleware(P.ACCOUNTING_MANAGE),
    async (req, res) => {
        const { status, limit } = req.query;
        const parsedLimit = Math.min(parseInt(limit) || 20, 100);

        try {
            const events = await dlqRetryService.getDlqEvents(
                req.dbConnection,
                req.organizationId,
                { limit: parsedLimit, status }
            );

            const summary = await dlqRetryService.getDlqSummary(
                req.dbConnection,
                req.organizationId
            );

            return res.json({
                success: true,
                data: {
                    summary,
                    events,
                },
            });
        } catch (err) {
            return res.status(500).json({
                success: false,
                error: { code: "DLQ_LIST_ERROR", message: err.message },
            });
        }
    }
);

// ── POST /accounting/dlq/retry ────────────────────────────────────────────────
router.post(
    "/dlq/retry",
    requireOrgPermission(P.ACCOUNTING_MANAGE),
    policyMiddleware(P.ACCOUNTING_MANAGE),
    async (req, res) => {
        const { limit } = req.body || {};
        const parsedLimit = Math.min(parseInt(limit) || 50, 200);

        try {
            const result = await dlqRetryService.retryFailedEvents(
                req.dbConnection,
                req.organizationId,
                { limit: parsedLimit }
            );

            return res.json({
                success: true,
                message: "DLQ retry batch complete",
                data: result,
            });
        } catch (err) {
            return res.status(500).json({
                success: false,
                error: { code: "DLQ_RETRY_ERROR", message: err.message },
            });
        }
    }
);

module.exports = router;
