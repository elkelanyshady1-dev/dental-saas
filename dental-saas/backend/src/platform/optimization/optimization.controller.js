/**
 * optimization.controller.js — Cost Optimization Engine Admin Endpoints
 *
 * Gated at the route layer with platformProtect + MANAGE_ORGANIZATIONS.
 *
 * PLANE: Platform.
 */

"use strict";

const asyncHandler = require("@utils/asyncHandler");
const logger = require("@utils/logger");
const analyzer = require("./optimizationAnalyzer.service");
const executor = require("./optimizationExecutor.service");
const scheduler = require("./optimization.scheduler");

function _actor(req) {
    return req?.user?.id ? `platform_user:${req.user.id}` : "platform_user:unknown";
}

function _err(err, res) {
    if (err instanceof executor.OptimizationExecutionError) {
        return res.status(err.statusCode || 400).json({
            success: false, error: err.code, message: err.message,
        });
    }
    logger.error({ err: err.message, stack: err.stack }, "[OptimizationController] Unexpected error");
    return res.status(500).json({
        success: false, error: "INTERNAL_ERROR", message: err.message,
    });
}

/**
 * GET /api/platform/optimization/report
 * Latest recommendation per org. Used by the dashboard table.
 *   ?status=PENDING|EXECUTED|FAILED|SKIPPED|EXECUTING
 *   ?limit=200
 */
exports.getReport = asyncHandler(async (req, res) => {
    try {
        const status = req.query.status || null;
        const limit = Math.min(parseInt(req.query.limit, 10) || 200, 500);
        const report = await analyzer.getLatestRecommendations({ status, limit });
        return res.json({
            success: true,
            data: report,
            scheduler: scheduler.getStatus(),
        });
    } catch (err) {
        return _err(err, res);
    }
});

/**
 * GET /api/platform/optimization/report/:orgId
 * Latest recommendation for one org.
 */
exports.getOrgRecommendation = asyncHandler(async (req, res) => {
    try {
        const rec = await analyzer.getLatestForOrg(req.params.orgId);
        if (!rec) {
            return res.status(404).json({
                success: false, error: "NO_RECOMMENDATION",
                message: "No recommendation exists yet for this org",
            });
        }
        return res.json({ success: true, data: rec });
    } catch (err) {
        return _err(err, res);
    }
});

/**
 * POST /api/platform/optimization/run
 * Triggers an analyzer sweep on demand. Synchronous — returns the new
 * cycle stats. Heavy on large fleets — ops should rely on the scheduler
 * for routine runs and use this only for forced refresh.
 */
exports.runAnalyzer = asyncHandler(async (req, res) => {
    try {
        const stats = await scheduler.runCycle();
        if (!stats) {
            return res.status(409).json({
                success: false, error: "CYCLE_IN_FLIGHT",
                message: "A cycle is already running — try again shortly",
            });
        }
        return res.json({ success: true, data: stats });
    } catch (err) {
        return _err(err, res);
    }
});

/**
 * POST /api/platform/optimization/execute/:orgId
 * Body: { recommendationId? }   — defaults to the latest rec for the org
 *
 * Acts on the recommendation (MOVE → starts a Phase 8 migration,
 * ARCHIVE → flips org flags, etc.).
 */
exports.execute = asyncHandler(async (req, res) => {
    try {
        const result = await executor.executeRecommendation({
            orgId: req.params.orgId,
            recommendationId: req.body?.recommendationId,
            actor: _actor(req),
        });
        return res.json({ success: true, data: result });
    } catch (err) {
        return _err(err, res);
    }
});

/**
 * GET /api/platform/optimization/scheduler
 * Tiny status endpoint — last cycle stats + auto-execute flag.
 */
exports.getSchedulerStatus = asyncHandler(async (req, res) => {
    return res.json({ success: true, data: scheduler.getStatus() });
});
