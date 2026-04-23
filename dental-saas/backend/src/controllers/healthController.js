const mongoose = require("mongoose");
const asyncHandler = require("../utils/asyncHandler");
const platformConnection = require("@core/db/platformConnection");
const sharedConnection = require("@core/db/sharedConnection");
const dbManager = require("@core/db/dbManager");

exports.getHealthStatus = asyncHandler(async (req, res) => {
    // 1. Check MongoDB Connection
    const dbStatus = mongoose.connection.readyState === 1 ? "connected" : "disconnected";

    // 2. Memory Usage
    const memoryUsage = process.memoryUsage();

    // 3. Uptime
    const uptime = process.uptime();

    const responsePayload = {
        success: true,
        status: dbStatus === "connected" ? "healthy" : "degraded",
        timestamp: new Date().toISOString(),
        checks: {
            database: dbStatus,
            memory: {
                rss: `${Math.round(memoryUsage.rss / 1024 / 1024)} MB`,
                heapTotal: `${Math.round(memoryUsage.heapTotal / 1024 / 1024)} MB`,
                heapUsed: `${Math.round(memoryUsage.heapUsed / 1024 / 1024)} MB`,
            },
            uptime: `${Math.floor(uptime / 60)} minutes`,
        }
    };

    // Use responseFormatter if available, otherwise fallback
    if (typeof res.success === 'function') {
        return res.success(responsePayload.checks, "Health check passed", 200);
    }

    return res.status(200).json(responsePayload);
});

/**
 * getDbHealth
 * 3-Layer DB health endpoint.
 *
 * Day-1 (Step 1) surface: the two sibling connections (platform, shared) plus
 * a partial cluster view derived from dbManager's cache stats. Tenant cluster
 * keys + per-cluster active connection counts come online in Step 2 when
 * clusterConnections + clusterRegistry land.
 *
 * Returns:
 *   - HTTP 503 if platform or shared is disconnected.
 *   - HTTP 200 with status breakdown otherwise.
 */
exports.getDbHealth = asyncHandler(async (req, res) => {
    const platformReady = platformConnection.isReady();
    const sharedReady = sharedConnection.isReady();

    // Aggregate per-cluster tenant-connection counts from dbManager.
    // Until Step 2 there is effectively one "cluster" (the legacy global root),
    // so this groups all cached org connections together.
    const stats = dbManager.getStats();
    const clusters = [
        {
            key: "default",
            region: null,
            status: platformReady ? "connected" : "disconnected",
            activeOrgConnections: stats.activeConnections ?? 0,
            idleOrgConnections: stats.idleConnections ?? 0,
            reuseRate: stats.connectionReuseRate ?? "N/A",
            avgResolutionTimeMs: stats.avgResolutionTimeMs ?? 0,
        },
    ];

    const payload = {
        success: platformReady && sharedReady,
        platform: platformReady ? "connected" : "disconnected",
        shared: sharedReady ? "connected" : "disconnected",
        clusters,
        shutdownInProgress: stats.isShutdown === true,
    };

    const httpStatus = (platformReady && sharedReady) ? 200 : 503;
    return res.status(httpStatus).json(payload);
});

/**
 * getMetrics
 * v24.0 — PHASE 5: EventBus Observability
 * Exposes outbox and system metrics for monitoring.
 */
exports.getMetrics = asyncHandler(async (req, res) => {
    // Outbox collection metrics
    const EventOutbox = mongoose.connection.models["EventOutbox"];
    let outboxMetrics = { pending: 0, published: 0, failed: 0 };

    if (EventOutbox) {
        const [pending, published, failed] = await Promise.all([
            EventOutbox.countDocuments({ status: "pending" }),
            EventOutbox.countDocuments({ status: "published" }),
            EventOutbox.countDocuments({ status: "failed" }),
        ]);
        outboxMetrics = { pending, published, failed };
    }

    // Worker metrics (if running in this process)
    let workerMetrics = null;
    try {
        const { getOutboxMetrics } = require("../infrastructure/workers/outboxPublisher.worker");
        workerMetrics = getOutboxMetrics();
    } catch { /* worker not loaded */ }

    return res.status(200).json({
        success: true,
        timestamp: new Date().toISOString(),
        metrics: {
            event_outbox_pending: outboxMetrics.pending,
            event_outbox_published: outboxMetrics.published,
            event_outbox_failed: outboxMetrics.failed,
            outbox_worker: workerMetrics,
        }
    });
});
