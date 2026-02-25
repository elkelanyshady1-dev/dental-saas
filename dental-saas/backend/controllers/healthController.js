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
