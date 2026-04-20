require('module-alias/register');
require("dotenv").config();

// Phase X.2.2 — Fail-fast: NODE_ENV must be defined
if (!process.env.NODE_ENV) {
    console.error("FATAL: NODE_ENV must be defined. Aborting startup.");
    process.exit(1);
}

console.log("NODE_ENV:", process.env.NODE_ENV);
const logger = require("./src/utils/logger");
logger.info({ service: "server", action: "init" }, "Server file loaded");

// Phase A: Instance identifier for multi-instance coordination.
// Set before any worker/subscriber boots so they can pick it up at load time
// via global.INSTANCE_ID. Override via env (INSTANCE_ID=inst1) when running
// multiple replicas locally; otherwise a UUID per process is fine.
const { randomUUID } = require("crypto");
global.INSTANCE_ID = process.env.INSTANCE_ID || randomUUID();
logger.info(
    { service: "server", action: "instance_id_assigned", instanceId: global.INSTANCE_ID },
    `[System] Instance started: ${global.INSTANCE_ID}`
);

// 🛡️ v11.0 Hardening — Startup Config Validation
// REDIS_URL removed from required env — the system is Redis-free (Phase 6).
const requiredEnv = [
    "STRIPE_SECRET_KEY",
    "STRIPE_WEBHOOK_SECRET",
    "JWT_SECRET",
    "MONGO_URI"
];

const missingEnv = requiredEnv.filter(key => !process.env[key]);
if (missingEnv.length > 0) {
    logger.error({
        service: "server",
        action: "startup_abort",
        missing: missingEnv
    }, `CRITICAL: Missing required environment variables: ${missingEnv.join(", ")}`);
    process.exit(1);
}

if (process.env.NODE_ENV === "production" && process.env.ALLOW_SUPERADMIN_DEV_BYPASS === "true") {
    logger.error({ service: "server", action: "startup_abort" }, "CRITICAL: ALLOW_SUPERADMIN_DEV_BYPASS enabled in production. Aborting startup.");
    process.exit(1);
}

// ── Phase 2 — Communication worker/queue consistency interlock ──────────────
// In production, running with ENABLE_QUEUE=true but ENABLE_WORKERS=false would
// silently strand every queued message (nothing would drain BullMQ). Fail fast.
const { ENABLE_QUEUE, ENABLE_WORKERS } = require("./src/config/communication.config");
if (process.env.NODE_ENV === "production" && ENABLE_QUEUE && !ENABLE_WORKERS) {
    logger.error(
        { service: "server", action: "startup_abort", ENABLE_QUEUE, ENABLE_WORKERS },
        "CRITICAL: ENABLE_QUEUE=true with ENABLE_WORKERS=false in production would strand jobs. Aborting startup."
    );
    process.exit(1);
}

// ═══════════════════════════════════════════════════════════════════════════════
// Phase X.2: Boot validators moved to CI-only (npm run validate:*)
// These add boot latency for checks that should only run in CI/staging.
// ═══════════════════════════════════════════════════════════════════════════════
// const { validateSecurityModes } = require("./src/config/validateSecurityModes");
// validateSecurityModes({ strict: process.env.SECURITY_STRICT_BOOT === "true" });

// const { validateAuthPipeline } = require("./src/config/validateAuthPipeline");
// validateAuthPipeline({ strict: process.env.SECURITY_STRICT_BOOT === "true" });

const { app, setShuttingDown } = require("./app");

// const { validateNoLegacyRoutes } = require("./src/config/validateNoLegacyRoutes");
// validateNoLegacyRoutes(app, { strict: process.env.ENFORCE_CANONICAL_ROUTES === "true" });

const connectDB = require("./src/config/db");

const cron = require("node-cron");
const { acquireLock, releaseLock } = require("./src/services/cronLockService");

const swaggerUi = require("swagger-ui-express");
const swaggerSpec = require("./src/config/swagger");

const platformProtect = require("./src/middleware/platformProtect");
const superAdminOnly = require("./src/middleware/superAdminOnly");

const { createLimiter } = require("./src/middleware/rateLimiter");
const mongoose = require("mongoose");

const { scanSlaBreaches } = require("./src/platform/support/jobs/sla.job");
// ── Platform Guardian Layer ─────────────────────────────────────────────
const {
    runStartupGuardian,
    startRuntimeGuardian,
    stopRuntimeGuardian
} = require("./src/platform/guardian");
// ── Contract Expiry Scheduler (STUCK_EXPIRED_CONTRACTS recovery) ───────────
const {
    startContractExpiryScheduler,
    stopContractExpiryScheduler,
} = require("./src/platform/billing/services/contractExpiryScheduler.service");
// ── Guardian WebSocket (native ws — /guardian-live path) ────────────────────
const {
    initGuardianSocket,
    closeGuardianSocket
} = require("./src/platform/guardian/guardian.socket");

// ── Communication Infrastructure ────────────────────────────────────────────
// Boot all BullMQ workers and register EventBus listeners.
// Must be required at top level so workers are alive from server start.
function safeLoadWorker(path, name) {
    try {
        const mod = require(path);
        console.log(`[Worker] ${name} loaded`);
        return mod;
    } catch (err) {
        console.warn(`[Worker] ${name} not found — skipped`, err.message);
        return { close: async () => {}, startWorker: () => {} };
    }
}

// Phase 2 — Disabled-worker stub used when ENABLE_WORKERS=false.
// Matches the shape returned by safeLoadWorker so shutdown + callers remain safe.
function _disabledWorker(name) {
    console.log(`[Worker] ${name} skipped (ENABLE_WORKERS=false)`);
    return { close: async () => {}, startWorker: () => {} };
}

// Communication workers are gated by ENABLE_WORKERS.
// auditWorker and caseLinkWorker are unrelated to the hybrid-comm refactor and
// stay always-on (Redis is still their transport).
const emailWorker    = ENABLE_WORKERS
    ? safeLoadWorker("./src/infrastructure/workers/emailWorker", "emailWorker")
    : _disabledWorker("emailWorker");
const smsWorker      = ENABLE_WORKERS
    ? safeLoadWorker("./src/infrastructure/workers/smsWorker", "smsWorker")
    : _disabledWorker("smsWorker");
const whatsappWorker = ENABLE_WORKERS
    ? safeLoadWorker("./src/infrastructure/workers/whatsappWorker", "whatsappWorker")
    : _disabledWorker("whatsappWorker");
const auditWorker    = safeLoadWorker("./src/infrastructure/workers/auditWorker", "auditWorker");
// ── Clinical Case Engine: Reliable Appointment→Case Linking (Phase 3.1) ──────
// Starts immediately on require(). Uses bullConnection from redisClient.js.
// 5-attempt exponential backoff. jobId dedup prevents duplicate case creation.
const caseLinkWorker = safeLoadWorker("./src/modules/orthodontics/core/workers/caseLink.worker", "caseLink.worker");
require("./src/events/email.events");               // registers email.* EventBus listeners
require("./src/listeners/verification.listener");    // registers verification.* EventBus listeners

// ── AccountingDomain: Event-Driven Read Model (Phase 2) ─────────────────────
// Registers invoice.created / payment.received listeners onto the shared
// EventBus so the accounting projection tables stay in sync.
// Must boot BEFORE any org API requests can be served.
const accountingDomain = require("./src/modules/accountingDomain");
accountingDomain.registerListeners();

// ── InventoryDomain: CQRS Projection Builder (TASK-INV-002) ──────────────────
// Registers inventory.stock.added.v1 / inventory.used.v1 / inventory.lowStock.v1
// listeners so dashboard + alert read models stay in sync.
// Also emits inventory.expense.v1 to accounting (no direct DB cross-access).
const inventoryProjection = require("./src/modules/inventoryDomain/read/inventoryProjection.service");
inventoryProjection.register();

// ── LabDomain: Accounting Bridge (TASK-LAB-002) ───────────────────────────────
// Registers lab.case.completed.v1 → accounting.expense.created.v1 listener.
// No direct accounting DB access — pure event bridge.
const labDomain = require("./src/modules/labDomain");
labDomain.register();

let slaTask;

/* =====================================================
   DATABASE CONNECTION + CRON INITIALIZATION
===================================================== */

connectDB().then(async () => {
    logger.info({ service: "server", action: "db_connected" }, "Database connected.");

    // ── Platform Guardian: Startup Invariants ──────────────────────────────
    // Runs AFTER DB connect so Mongoose models are registered.
    // In PLATFORM_GUARDIAN_MODE=strict → crashes on violation.
    try {
        await runStartupGuardian();
    } catch (err) {
        // Non-strict: already logged inside guardian; continue boot
        logger.error({ err: err.message }, "[Guardian] Startup guardian error during boot (non-strict mode — continuing)");
    }

    // v13.2 Index Standardization Guard (Safe Index Sync — Dev Only)
    if (process.env.NODE_ENV === "development") {
        // ── One-time repair: PlatformInvoice indexes ────────────────────────
        // The model was previously exported with lineItemSchema instead of
        // platformInvoiceSchema, causing unique indexes to be created without
        // sparse:true. Also, the old schema had `default: null` which caused
        // explicit null values that defeat sparse indexes. This block:
        //   1. Deletes documents with explicit null for invoiceNumber/idempotencyKey
        //   2. Drops non-sparse unique indexes so syncIndexes recreates them correctly
        try {
            const invCol = mongoose.connection.db.collection("platforminvoices");

            // Always clean stale null-valued documents (from failed provisioning + old schema default)
            const staleResult = await invCol.deleteMany({
                $or: [
                    { invoiceNumber: null },
                    { idempotencyKey: null }
                ]
            });
            if (staleResult.deletedCount > 0) {
                logger.info({ deleted: staleResult.deletedCount }, "[BOOT] Cleaned stale platforminvoices with null unique fields");
            }

            // Drop non-sparse unique indexes so syncIndexes recreates them with sparse:true
            const indexes = await invCol.indexes();
            for (const idx of indexes) {
                if (idx.name === "_id_") continue;
                const isTarget = idx.key?.idempotencyKey !== undefined || idx.key?.invoiceNumber !== undefined;
                if (isTarget && idx.unique && !idx.sparse) {
                    logger.info({ index: idx.name }, "[BOOT] Dropping non-sparse unique index");
                    await invCol.dropIndex(idx.name);
                }
            }
        } catch (repairErr) {
            logger.warn({ err: repairErr.message }, "[BOOT] PlatformInvoice index repair skipped (non-fatal)");
        }

        try {
            await mongoose.connection.syncIndexes();
            logger.info({ service: "server", action: "indexes_synced" }, "Database indexes synchronized (development only).");
        } catch (err) {
            logger.error({ service: "server", action: "index_sync_error", err: err.message }, "Failed to sync indexes.");
        }

        // Phase 24: Dev-only superadmin seed integrity check (non-blocking)
        try {
            const PlatformUser = require("./src/platform/models/PlatformUser");
            const superadminCount = await PlatformUser.countDocuments({ role: "superadmin" });
            if (superadminCount === 0) {
                logger.warn({ service: "server", action: "seed_integrity" }, "[BOOT] ⚠️  No superadmin found. Run: node seedPlatformUser.js");
            } else if (superadminCount > 1) {
                logger.warn({ service: "server", action: "seed_integrity", count: superadminCount }, "[BOOT] ⚠️  Multiple superadmins detected. Run seedPlatformUser.js to reset.");
            } else {
                logger.info({ service: "server", action: "seed_integrity" }, "[BOOT] ✅ Superadmin seed integrity OK");
            }
        } catch (err) {
            logger.warn({ service: "server", action: "seed_integrity_error", err: err.message }, "[BOOT] Could not verify superadmin seed integrity.");
        }
    }

    // ── v31.1 Region Registry — Load, Validate, Start Refresh ──────────────────
    // Replaces the v31.0 inline validation with the centralized regionRegistry module.
    // 1. Auto-seed missing regions in development
    // 2. Load all ACTIVE regions into in-memory cache
    // 3. Validate that required regions are present
    // 4. Start background refresh (every 5 min)
    const {
        loadRegionRegistry,
        validateRegionRegistry,
        startRegistryRefresh
    } = require("./src/infrastructure/regions/regionRegistry");

    try {
        // Dev auto-seed: ensure regions exist before loading registry
        if (process.env.NODE_ENV === "development") {
            const Region = require("./src/platform/domain/models/Region.model");
            const REQUIRED_REGIONS = ["EU", "US", "MEA", "APAC"];
            const controlPlaneUri = process.env.MONGO_URI || process.env.MONGODB_URI;
            const defaultRedis = process.env.REDIS_URL || "redis://localhost:6379";
            const REGION_NAMES = { EU: "European Union", US: "North America", MEA: "Middle East & Africa", APAC: "Asia Pacific" };

            const existingCodes = (await Region.find({ code: { $in: REQUIRED_REGIONS } }).select("code").lean()).map(r => r.code);
            const missingCodes = REQUIRED_REGIONS.filter(c => !existingCodes.includes(c));

            for (const code of missingCodes) {
                await Region.create({
                    code,
                    name: REGION_NAMES[code] || code,
                    dbUri: controlPlaneUri || `mongodb://localhost:27017/dental_${code.toLowerCase()}`,
                    redisUrl: defaultRedis,
                    status: "ACTIVE"
                });
                logger.info({ service: "server", action: "region_auto_seeded", code }, `[BOOT] ✅ Auto-seeded region: ${code}`);
            }
        }

        // Load registry into memory
        await loadRegionRegistry();

        // Validate completeness
        validateRegionRegistry();

        // Start background refresh (every 5 min, unref'd — won't block shutdown)
        startRegistryRefresh(5 * 60 * 1000);

    } catch (regionErr) {
        logger.error({
            service: "server",
            action: "region_registry_boot_error",
            err: regionErr.message
        }, `[BOOT] ❌ Region registry error: ${regionErr.message}`);

        // In production, this is fatal — region routing will fail
        if (process.env.NODE_ENV === "production") {
            logger.error({ service: "server" }, "[BOOT] FATAL: Region registry failed in production. Aborting.");
            process.exit(1);
        }
    }

    // ── Phase 12.1: Feature Registry — Seed from static registry ────────────
    // Idempotent: only inserts modules/features that don't already exist in DB.
    // Must run AFTER DB connect and index sync, BEFORE server listen.
    try {
        const { seedFeatureRegistry } = require("./src/platform/domain/services/featureRegistrySeeder");
        await seedFeatureRegistry();
    } catch (seedErr) {
        logger.warn(
            { service: "server", action: "feature_registry_seed_error", err: seedErr.message },
            "[BOOT] Feature registry seed error (non-fatal — static registry will be used)"
        );
    }

    // ── Phase 3: AccountingDomain Projection Backfill ────────────────────────
    // Triggered ONLY when REBUILD_PROJECTIONS=true (never runs in normal boot).
    // Safe for multi-tenant: iterates all active org connections.
    // Idempotent: rebuilds from source data, clears stale projections first.
    if (process.env.REBUILD_PROJECTIONS === "true") {
        try {
            const { rebuildAllOrgs } = require("./src/modules/accountingDomain/services/replay.service");
            const dbManager = require("./src/core/db/dbManager");

            logger.info({ service: "server", action: "rebuild_projections_start" },
                "[BOOT] REBUILD_PROJECTIONS=true — triggering accounting projection rebuild");

            // dbManager.getAllActiveConnections() → [{ orgId, dbConnection }]
            const results = await rebuildAllOrgs(async () => {
                const connections = dbManager.getAllActiveConnections?.() || [];
                return connections;
            });

            logger.info({
                service: "server",
                action: "rebuild_projections_done",
                orgsRebuilt: results?.length || 0,
            }, "[BOOT] Accounting projection rebuild complete");
        } catch (rebuildErr) {
            logger.error(
                { service: "server", action: "rebuild_projections_error", err: rebuildErr.message },
                "[BOOT] Accounting projection rebuild error (non-fatal — projections may be stale)"
            );
        }
    }

    // ── Phase 17: Permission Auto-Heal — Self-healing RBAC on boot ──────────
    // Scans all Role documents and patches missing permission fields from SSOT.
    // Defaults to false (DENIED) — never auto-grants. Stamps permissionVersion.
    // Must run AFTER DB connect, BEFORE server listen.
    try {
        const { autoFixPermissions } = require("./src/core/auth/autoFixPermissions");
        await autoFixPermissions();
    } catch (healErr) {
        logger.error(
            { service: "server", action: "auto_heal_error", err: healErr.message },
            "[BOOT] Permission auto-heal error (non-fatal — existing permissions unchanged)"
        );
    }

    // ── Phase 18: RBAC Determinism Validators — Boot-time assertions ────────
    // Validates that every write permission has a policy and every resource
    // has field access definitions. Runs AFTER auto-heal, BEFORE listen.
    // Set RBAC_STRICT_BOOT=true to crash on violations (recommended for CI/staging).
    try {
        const { validatePolicyCoverage } = require("./src/rbac/validators/policyCoverageValidator");
        const { validateFieldAccess } = require("./src/rbac/validators/fieldAccessValidator");
        const strictBoot = process.env.RBAC_STRICT_BOOT === "true";
        const fieldAccessStrict = process.env.FIELD_ACCESS_STRICT === "true" || strictBoot;

        const policyResult = validatePolicyCoverage({ strict: strictBoot });
        const fieldResult = validateFieldAccess({ strict: fieldAccessStrict, checkWriteGuard: true });

        if (policyResult.valid && fieldResult.valid) {
            logger.info(
                { service: "server", action: "rbac_boot_validation" },
                "[BOOT] ✅ RBAC determinism validators passed (policy coverage + field access)"
            );
        }
    } catch (rbacErr) {
        if (process.env.RBAC_STRICT_BOOT === "true") {
            logger.error(
                { service: "server", action: "rbac_boot_abort", err: rbacErr.message },
                "[BOOT] ❌ RBAC validation failed in strict mode. Aborting startup."
            );
            process.exit(1);
        }
        logger.warn(
            { service: "server", action: "rbac_boot_warn", err: rbacErr.message },
            "[BOOT] ⚠️ RBAC validation issue (non-strict — continuing)"
        );
    }

    // ── Phase 20: Auth Intelligence Bootstrap — Register post-persist hooks ──
    // Registers anomaly detector as an async post-persist hook on auth traces.
    // Must run AFTER DB connect. Non-fatal on failure.
    try {
        const { bootstrapAuthIntelligence } = require("./src/services/authIntelligenceBootstrap");
        bootstrapAuthIntelligence();
    } catch (aiErr) {
        logger.warn(
            { service: "server", action: "auth_intelligence_boot_error", err: aiErr.message },
            "[BOOT] Auth intelligence bootstrap error (non-fatal — trace persistence still active)"
        );
    }

    // ── Phase 18.1: Permission Drift Detector — featureRegistry vs P enum ──────
    // Cross-checks every permission string referenced in FEATURE_REGISTRY.features
    // against the canonical P enum (orgPermissions.js).
    // If featureRegistry references a permission that doesn't exist in P, it will
    // never be granted by middleware → silent auth failure. This catches it at boot.
    // Set PERMISSION_DRIFT_STRICT=true to crash on violations (default: production).
    try {
        const { assertNoDrift } = require("./src/rbac/permissionDrift");
        assertNoDrift({ strict: process.env.PERMISSION_DRIFT_STRICT === "true" || process.env.NODE_ENV === "production" });
        logger.info(
            { service: "server", action: "permission_drift_check" },
            "[BOOT] ✅ Permission drift check passed (featureRegistry ↔ P enum SSOT aligned)"
        );
    } catch (driftErr) {
        if (process.env.PERMISSION_DRIFT_STRICT === "true" || process.env.NODE_ENV === "production") {
            logger.error(
                { service: "server", action: "permission_drift_abort", err: driftErr.message },
                "[BOOT] ❌ Permission drift detected in strict mode. Aborting startup."
            );
            process.exit(1);
        }
        logger.warn(
            { service: "server", action: "permission_drift_warn", err: driftErr.message },
            "[BOOT] ⚠️ Permission drift detected (non-strict — continuing)"
        );
    }

    // ── Phase F: RLS Compliance Validator — REMOVED ──────────────────────────
    // secureModel and queryScoper were removed in favor of pure database-level
    // isolation (DB_MODE=per-org). Each org has its own database (dental_org_<id>),
    // making query-level tenant filtering unnecessary.
    logger.info(
        { service: "server", action: "rls_mode", dbMode: process.env.DB_MODE || "per-org" },
        "[BOOT] ✅ Tenant isolation via database-per-org (secureModel removed — DB_MODE=per-org)"
    );

    /* ===============================
       SLA Breach Monitor (Every Hour)
    =============================== */
    slaTask = cron.schedule("0 * * * *", async () => {
        if (await acquireLock("scanSlaBreaches", 10 * 60 * 1000)) {
            await scanSlaBreaches();
            await releaseLock("scanSlaBreaches");
        }
    });

    // ── Contract Expiry Scheduler — STUCK_EXPIRED_CONTRACTS recovery ─────────
    // Runs every hour. Expires autoRenew=false contracts past effectiveTo.
    // Complements the read-time enforceContractInvariant in contractResolver.
    // runImmediately=true: heals any stuck contracts on server boot.
    startContractExpiryScheduler({ intervalMs: 60 * 60 * 1000, runImmediately: true });
    logger.info(
        { service: "server", action: "contract_expiry_scheduler_started" },
        "[BOOT] ✅ Contract expiry scheduler started (hourly — STUCK_EXPIRED_CONTRACTS recovery)"
    );

});

/* =====================================================
   SWAGGER (SUPERADMIN ONLY + RATE LIMITED)
===================================================== */

const swaggerLimiter = createLimiter({
    windowMs: 15 * 60 * 1000,
    max: 50,
    keyType: "ip",
});

// 🛡️ v1.3.5 - Strict Platform Auth Rate Limiting (IPv6-safe via centralized factory)
const platformAuthLimiter = createLimiter({
    windowMs: 5 * 60 * 1000,
    max: process.env.NODE_ENV === "production" ? 5 : 10,
    keyType: "ip",
    message: "Too many login attempts. Please try again in 5 minutes.",
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

const { initSocket } = require("./src/infrastructure/realtime/socketServer");

const server = app.listen(PORT, () => {
    logger.info(
        { service: "server", action: "started", port: PORT },
        `Server running on port ${PORT}`
    );

    // ── AUTH_TRACE: Environment Audit ──────────────────────────────
    if (process.env.AUTH_TRACE === "true") {
        console.log("╔══════════════════════════════════════════════════╗");
        console.log("║         AUTH_TRACE — ENVIRONMENT AUDIT           ║");
        console.log("╠══════════════════════════════════════════════════╣");
        console.log(`║ NODE_ENV           = ${process.env.NODE_ENV}`);
        console.log(`║ PORT               = ${PORT}`);
        console.log(`║ JWT_SECRET length  = ${(process.env.JWT_SECRET || "").length}`);
        console.log(`║ JWT_SECRET prefix  = ${(process.env.JWT_SECRET || "").substring(0, 4)}...`);
        console.log(`║ CORS origin        = ${process.env.NODE_ENV === "production" ? (process.env.ALLOWED_ORIGINS || "none") : "http://localhost:3000"}`);
        console.log(`║ trust proxy        = 1`);
        console.log(`║ secure cookies     = ${process.env.NODE_ENV === "production"}`);
        console.log(`║ cookie-parser      = mounted`);
        console.log(`║ AUTH_TRACE         = ENABLED`);
        console.log("╚══════════════════════════════════════════════════╝");
    }
});

// Initialize Socket.io (v1.6.0)
initSocket(server);

// ── Guardian WebSocket Server (/guardian-live) ──────────────────────────────
// Mounted on the SAME http.Server as Express — different path from Socket.io.
// Must be called AFTER server is created, BEFORE or AFTER listen (both work
// since WebSocket upgrade is handled at the HTTP server level).
initGuardianSocket(server);

// ── Platform Guardian: Runtime Integrity Monitor ───────────────────────────
// Starts AFTER server is listening. Polls every 5 minutes for DB-level
// corruption: overlapping active contracts, null lockedPrice, orphan drafts, etc.
// Uses setInterval with unref() — will not block graceful shutdown.
startRuntimeGuardian(5 * 60 * 1000);

/* =====================================================
   GRACEFUL SHUTDOWN
===================================================== */

async function gracefulShutdown(signal) {
    logger.info(
        { service: "server", action: "shutdown_initiated", signal },
        `Received ${signal}. Starting graceful shutdown...`
    );

    // 0. Block new transactions & requests
    setShuttingDown(true);
    logger.info({ service: "server", action: "blocking_new_requests" }, "System entering draining state (503 enabled).");

    // 1. Stop all CRONs + Guardian interval + WebSocket + Region refresh immediately
    if (slaTask) slaTask.stop();
    stopRuntimeGuardian();
    stopContractExpiryScheduler();    // ← STUCK_EXPIRED_CONTRACTS recovery cron
    closeGuardianSocket();
    const { stopRegistryRefresh } = require("./src/infrastructure/regions/regionRegistry");
    stopRegistryRefresh();
    logger.info({ service: "server", action: "crons_stopped" }, "Cron jobs, Guardian, WebSocket, and Region refresh stopped.");


    // 2. HTTP Drain
    server.close(async () => {
        logger.info({ service: "server", action: "http_closed" }, "HTTP server closed (requests drained).");

        try {
            // 3. Database Cleanup — Close org connections first, then platform
            const dbManager = require("./src/core/db/dbManager");
            await dbManager.shutdown();
            logger.info({ service: "server", action: "org_connections_closed" }, "All org database connections closed.");

            await mongoose.connection.close();
            logger.info({ service: "server", action: "db_closed" }, "Platform MongoDB connection closed.");

            // Close communication workers gracefully (drains inflight jobs)
            try {
                await emailWorker.close();
                logger.info({ service: "server", action: "email_worker_closed" }, "Email worker closed.");
            } catch (ewErr) {
                logger.warn({ err: ewErr.message }, "Email worker close error (non-fatal)");
            }
            try {
                await smsWorker.close();
                logger.info({ service: "server", action: "sms_worker_closed" }, "SMS worker closed.");
            } catch (swErr) {
                logger.warn({ err: swErr.message }, "SMS worker close error (non-fatal)");
            }
            try {
                await whatsappWorker.close();
                logger.info({ service: "server", action: "whatsapp_worker_closed" }, "WhatsApp worker closed.");
            } catch (wwErr) {
                logger.warn({ err: wwErr.message }, "WhatsApp worker close error (non-fatal)");
            }
            try {
                await caseLinkWorker.close();
                logger.info({ service: "server", action: "case_link_worker_closed" }, "CaseLink worker closed.");
            } catch (clErr) {
                logger.warn({ err: clErr.message }, "CaseLink worker close error (non-fatal)");
            }

            const { redis } = require("./src/utils/redisLock");
            await redis.quit();
            logger.info({ service: "server", action: "redis_closed" }, "Redis connection closed.");

            logger.info({ service: "server", action: "shutdown_complete" }, "Graceful shutdown finished.");
            process.exit(0);
        } catch (err) {
            logger.error({ err }, "Error during graceful shutdown cleanup.");
            process.exit(1);
        }
    });

    // 4. Force termination after timeout
    setTimeout(() => {
        logger.error({ service: "server", action: "shutdown_timeout" }, "Could not close connections in time, forceful termination.");
        process.exit(1);
    }, 15000); // 15s leeway for transactions
}

process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));
process.on("SIGINT", () => gracefulShutdown("SIGINT"));