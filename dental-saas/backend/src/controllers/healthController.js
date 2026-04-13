const mongoose = require("mongoose");
const asyncHandler = require("../utils/asyncHandler");

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
