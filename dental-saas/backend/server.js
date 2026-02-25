require("dotenv").config();

const logger = require("./utils/logger");
logger.info({ service: "server", action: "init" }, "Server file loaded");

// 🛡️ v1.3.5 - Production Startup Guard
if (process.env.NODE_ENV === "production" && process.env.ALLOW_SUPERADMIN_DEV_BYPASS === "true") {
    logger.error({ service: "server", action: "startup_abort" }, "CRITICAL: ALLOW_SUPERADMIN_DEV_BYPASS enabled in production. Aborting startup.");
    process.exit(1);
}

const app = require("./app");
const connectDB = require("./config/db");
const migrateSubscriptions = require("./utils/migrateSubscriptions");

const cron = require("node-cron");
const { scanSubscriptions, scanPendingInvoices } = require("./services/subscriptionMonitor");
const { acquireLock, releaseLock } = require("./services/cronLockService");

const swaggerUi = require("swagger-ui-express");
const swaggerSpec = require("./config/swagger");

const platformProtect = require("./middleware/platformProtect");
const superAdminOnly = require("./middleware/superAdminOnly");

const rateLimit = require("express-rate-limit");
const mongoose = require("mongoose");

let subTask;
let invoiceTask;

/* =====================================================
   DATABASE CONNECTION + CRON INITIALIZATION
===================================================== */

connectDB().then(() => {
    logger.info({ service: "server", action: "db_connected" }, "Database connected.");

    // Run startup migrations
    migrateSubscriptions();

    /* ===============================
       Daily Subscription Scan
    =============================== */
    subTask = cron.schedule("0 0 * * *", async () => {
        if (await acquireLock("scanSubscriptions", 10 * 60 * 1000)) {
            logger.info({ job: "scanSubscriptions" }, "Lock acquired.");
            await scanSubscriptions();
            await releaseLock("scanSubscriptions");
        } else {
            logger.info({ job: "scanSubscriptions" }, "Skipped (lock held).");
        }
    });

    /* ===============================
       Dunning Retry Sweep (Every 6h)
    =============================== */
    invoiceTask = cron.schedule("0 */6 * * *", async () => {
        if (await acquireLock("scanPendingInvoices", 10 * 60 * 1000)) {
            logger.info({ job: "scanPendingInvoices" }, "Lock acquired.");
            await scanPendingInvoices();
            await releaseLock("scanPendingInvoices");
        } else {
            logger.info({ job: "scanPendingInvoices" }, "Skipped (lock held).");
        }
    });

    /* ===============================
       Boot Catch-up Sweep
    =============================== */
    setTimeout(async () => {
        if (await acquireLock("scanSubscriptions_boot", 10 * 60 * 1000)) {
            await scanSubscriptions();
            await releaseLock("scanSubscriptions_boot");
        }

        if (await acquireLock("scanPendingInvoices_boot", 10 * 60 * 1000)) {
            await scanPendingInvoices();
            await releaseLock("scanPendingInvoices_boot");
        }
    }, 5000);
});

/* =====================================================
   SWAGGER (SUPERADMIN ONLY + RATE LIMITED)
===================================================== */

const swaggerLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 50,
    standardHeaders: true,
    legacyHeaders: false,
});

// 🛡️ v1.3.5 - Strict Platform Auth Rate Limiting
const platformAuthLimiter = rateLimit({
    windowMs: 5 * 60 * 1000, // 5 minutes
    max: process.env.NODE_ENV === "production" ? 5 : 10,
    message: {
        success: false,
        error: { code: "TOO_MANY_REQUESTS", message: "Too many login attempts. Please try again in 5 minutes." }
    },
    standardHeaders: true,
    legacyHeaders: false,
});

// Apply to platform auth routes
app.use("/api/platform-auth", platformAuthLimiter);

app.use(
    "/api-docs",
    swaggerLimiter,
    platformProtect,     // Enforces platform token type
    superAdminOnly,      // platformRole === superadmin
    swaggerUi.serve,
    swaggerUi.setup(swaggerSpec)
);

/* =====================================================
   SERVER START
===================================================== */

const PORT = process.env.PORT || 5000;

const server = app.listen(PORT, () => {
    logger.info(
        { service: "server", action: "started", port: PORT },
        `Server running on port ${PORT}`
    );
});

/* =====================================================
   GRACEFUL SHUTDOWN
===================================================== */

async function gracefulShutdown(signal) {
    logger.info(
        { service: "server", action: "shutdown_initiated", signal },
        `Received ${signal}. Starting graceful shutdown...`
    );

    if (subTask) subTask.stop();
    if (invoiceTask) invoiceTask.stop();

    logger.info({ service: "server", action: "crons_stopped" }, "Cron jobs stopped.");

    server.close(async () => {
        logger.info({ service: "server", action: "http_closed" }, "HTTP server closed.");

        try {
            await mongoose.connection.close(false);
            logger.info({ service: "server", action: "db_closed" }, "MongoDB closed.");
            process.exit(0);
        } catch (err) {
            logger.error(
                { err, service: "server", action: "db_close_error" },
                "Error closing MongoDB."
            );
            process.exit(1);
        }
    });

    // Force shutdown fallback
    setTimeout(() => {
        logger.error(
            { service: "server", action: "force_shutdown" },
            "Force shutdown due to timeout."
        );
        process.exit(1);
    }, 10000);
}

process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));
process.on("SIGINT", () => gracefulShutdown("SIGINT"));