/**
 * migration.controller.js — Phase 8 Org Migration Admin Endpoints
 *
 * All endpoints require platformProtect + MANAGE_ORGANIZATIONS capability
 * (mounted at the route layer).
 *
 * PLANE: Platform.
 */

"use strict";

const asyncHandler = require("@utils/asyncHandler");
const logger = require("@utils/logger");
const migrationService = require("./migration.service");

function _actorFromReq(req) {
    return req?.user?.id ? `platform_user:${req.user.id}` : "platform_user:unknown";
}

function _handleServiceError(err, res) {
    if (err instanceof migrationService.MigrationError) {
        return res.status(err.statusCode || 400).json({
            success: false,
            error: err.code,
            message: err.message,
        });
    }
    logger.error({ err: err.message, stack: err.stack }, "[MigrationController] Unexpected error");
    return res.status(500).json({
        success: false,
        error: "INTERNAL_ERROR",
        message: "Migration operation failed",
    });
}

/**
 * GET /api/platform/migration/orgs
 * Dashboard table data. Returns ALL orgs with migration-relevant fields.
 */
exports.listOrgs = asyncHandler(async (req, res) => {
    try {
        const orgs = await migrationService.listOrgs({
            limit: Math.min(parseInt(req.query.limit, 10) || 200, 500),
        });
        return res.json({ success: true, data: orgs });
    } catch (err) {
        return _handleServiceError(err, res);
    }
});

/**
 * GET /api/platform/migration/:orgId
 * Status snapshot for a single org — used by the dashboard's polling.
 */
exports.getStatus = asyncHandler(async (req, res) => {
    try {
        const status = await migrationService.getStatus({ orgId: req.params.orgId });
        if (!status) {
            return res.status(404).json({
                success: false,
                error: "ORG_NOT_FOUND",
                message: "Organization not found",
            });
        }
        return res.json({ success: true, data: status });
    } catch (err) {
        return _handleServiceError(err, res);
    }
});

/**
 * POST /api/platform/migration/start
 * Body: { orgId, targetCluster, reason? }
 */
exports.startMigration = asyncHandler(async (req, res) => {
    try {
        const { orgId, targetCluster, reason } = req.body || {};
        const updated = await migrationService.startMigration({
            orgId,
            targetCluster,
            actor: _actorFromReq(req),
            reason,
        });
        return res.status(202).json({
            success: true,
            data: {
                orgId: String(updated._id),
                migrationId: updated.migrationId,
                state: updated.migrationState,
                sourceCluster: updated.cluster,
                targetCluster: updated.targetCluster,
            },
        });
    } catch (err) {
        return _handleServiceError(err, res);
    }
});

/**
 * POST /api/platform/migration/:orgId/sync
 * Advances PREPARING → SYNCING → CUTOVER_PENDING.
 *
 * The sync engine itself is a stub today (state-machine seam only); when
 * the real change-stream replay engine lands, replace migrationService.syncOrgData.
 */
exports.runSync = asyncHandler(async (req, res) => {
    try {
        const updated = await migrationService.syncOrgData({
            orgId: req.params.orgId,
            actor: _actorFromReq(req),
        });
        return res.json({
            success: true,
            data: { state: updated.migrationState },
        });
    } catch (err) {
        return _handleServiceError(err, res);
    }
});

/**
 * POST /api/platform/migration/:orgId/cutover
 * Atomic CUTOVER_PENDING → CUTOVER → VERIFYING with cluster swap +
 * routingEpoch++ + dbManager.evictByOrg().
 */
exports.cutover = asyncHandler(async (req, res) => {
    try {
        const updated = await migrationService.cutover({
            orgId: req.params.orgId,
            actor: _actorFromReq(req),
        });
        return res.json({
            success: true,
            data: {
                state: updated.migrationState,
                cluster: updated.cluster,
                routingEpoch: updated.routingEpoch,
            },
        });
    } catch (err) {
        return _handleServiceError(err, res);
    }
});

/**
 * POST /api/platform/migration/:orgId/verify
 * VERIFYING → COMPLETE (and clears migration metadata).
 */
exports.verifyAndComplete = asyncHandler(async (req, res) => {
    try {
        const updated = await migrationService.verifyAndComplete({
            orgId: req.params.orgId,
            actor: _actorFromReq(req),
        });
        return res.json({
            success: true,
            data: { state: updated.migrationState ?? "CLEARED" },
        });
    } catch (err) {
        return _handleServiceError(err, res);
    }
});

/**
 * POST /api/platform/migration/downtime
 * Body: { orgId, sourceCluster, targetCluster, reason? }
 *
 * Synchronous downtime migration — flips maintenanceMode, copies data,
 * swaps cluster, clears flags. All in one request (no sync engine,
 * no change streams). Use for small orgs or when the source cluster
 * isn't a replica set.
 */
exports.runDowntimeMigration = asyncHandler(async (req, res) => {
    try {
        const { orgId, sourceCluster, targetCluster, reason } = req.body || {};
        const report = await migrationService.runDowntimeMigration({
            orgId,
            sourceCluster,
            targetCluster,
            actor: _actorFromReq(req),
            reason,
        });
        return res.status(200).json({ success: true, data: report });
    } catch (err) {
        return _handleServiceError(err, res);
    }
});

/**
 * POST /api/platform/migration/:orgId/rollback
 * Body: { reason? }
 *
 * Aborts an in-progress migration. Safe up to and including
 * CUTOVER_PENDING. Refused after VERIFYING.
 */
exports.rollback = asyncHandler(async (req, res) => {
    try {
        const updated = await migrationService.rollback({
            orgId: req.params.orgId,
            actor: _actorFromReq(req),
            reason: req.body?.reason,
        });
        return res.json({
            success: true,
            data: { state: updated.migrationState },
        });
    } catch (err) {
        return _handleServiceError(err, res);
    }
});
