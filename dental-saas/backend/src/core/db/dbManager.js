/**
 * dbManager.js
 * Core Infrastructure — Centralized Database Connection Lifecycle Manager
 * Phase 3.5 — Shard-Aware Architecture (Inactive Distribution)
 *
 * SHARDING (Phase 3.5):
 *   Cache keys are now composite: "shard:orgId" via connectionFactory.
 *   All tenants currently resolve to shard-1 (no behavioral change).
 *   Future: change shardResolver.js to enable distribution.
 *
 * THE SINGLE SOURCE OF TRUTH for all multi-tenant database connections.
 * No other module may create, cache, evict, or manage connections.
 *
 * RESPONSIBILITIES:
 *   1. Lazy connection creation via shard-aware useDb()
 *   2. LRU + TTL eviction with protection for in-use connections
 *   3. Circuit breaker with automatic cleanup to prevent memory leaks
 *   4. Full observability (structured logging + always-on metrics)
 *   5. Resource-bounded (MAX_CONNECTIONS hard cap)
 *   6. Clean shutdown (close all connections, clear cache)
 *   7. Connection creation dedup (prevents connection storms)       ← Phase 3.4
 *   8. Connection health checks (validates readyState before reuse) ← Phase 3.4
 *   9. Creation throttling via semaphore (prevents CPU spikes)      ← Phase 3.4
 *  10. Advanced metrics (avg lifetime, reuse rate, resolution time) ← Phase 3.4
 *
 * MODE: PER-ORG ONLY (STRICT)
 *   Every organization gets its own database (dental_org_<id>).
 *   Connection failures THROW — no silent fallback, no null returns.
 *   Shared and hybrid modes have been permanently removed.
 *
 * SAFE USAGE PATTERN (mandatory for all consumers):
 *   const conn = dbManager.getConnection(orgId);  // increments inUseCount
 *   try {
 *       // ... DB operations using conn ...
 *   } finally {
 *       dbManager.releaseConnection(orgId);        // decrements inUseCount
 *   }
 *
 * WHY: getConnection() increments inUseCount to protect from eviction.
 * releaseConnection() MUST be called when done, or the connection leaks
 * (stays permanently marked "in-use" and can never be evicted).
 *
 * For HTTP requests, dbContext middleware handles this automatically via
 * res.on("finish") / res.on("close"). Background workers must use
 * the try/finally pattern above explicitly.
 *
 * ENV CONFIGURATION:
 *   DB_MODE                      — MUST be "per-org" (enforced at boot)
 *   DB_MAX_CONNECTIONS           — Max cached org connections (default: 100)
 *   DB_IDLE_TTL_MS               — Idle connection TTL in ms (default: 900000 / 15 min)
 *   DB_EVICTION_INTERVAL_MS      — How often to sweep for idle connections (default: 60000 / 1 min)
 *   DB_CIRCUIT_BREAKER_TTL_MS    — How long a failed org is blocked (default: 30000 / 30s)
 *   DB_MAX_PARALLEL_CREATES      — Max concurrent connection creations (default: 10)
 *   DB_HEALTHCHECK_INTERVAL_MS   — How often to run health checks (default: 30000 / 30s)
 *   ENABLE_DB_DEBUG              — Verbose connection logs (default: false)
 *
 * PLANE: Core Infrastructure (used by Org + Platform dbResolver + connectionResolver)
 *
 * INVARIANTS:
 *   1. Only ONE connection per shard:orgId key exists at any time (dedup guarantee)
 *   2. Active connections (inUseCount > 0) are NEVER evicted
 *   3. Eviction order: TTL-expired first, then LRU by lastUsedAt
 *   4. Connection failures always THROW (no silent degradation)
 *   5. getConnection() NEVER returns null
 *   6. shutdown() closes ALL connections and resets all state
 *   7. Circuit breaker blocks retries for CIRCUIT_BREAKER_TTL_MS after a failure
 *   8. Pending dedup ensures only 1 connection creation per orgId at any time
 *   9. Health checks auto-heal stale/dropped connections
 *  10. All Maps are bounded — no unbounded memory growth
 */

"use strict";

const mongoose = require("mongoose");
const logger = require("@utils/logger");
const Semaphore = require("./Semaphore");

// Phase 3.5 — Shard-aware addressing
const { resolveShard } = require("./shardResolver");
const { buildConnectionKey, getShardUri, buildDbName, extractOrgIdFromKey, extractShardFromKey } = require("./connectionFactory");

// ─── Configuration (all ENV-driven, sensible defaults) ──────────────────────

const DB_MODE = process.env.DB_MODE || "per-org";

// ─── BOOT-TIME ENFORCEMENT: per-org ONLY ────────────────────────────────────
// Shared and hybrid modes have been permanently removed.
// The system MUST run in per-org mode — no silent degradation allowed.
if (DB_MODE !== "per-org") {
    throw new Error(
        `[DBManager] FATAL: DB_MODE must be "per-org". Got "${DB_MODE}". ` +
        `Shared and hybrid modes have been permanently removed.`
    );
}

const MAX_CONNECTIONS             = parseInt(process.env.DB_MAX_CONNECTIONS) || parseInt(process.env.MAX_ORG_CONNECTIONS) || 100;
const IDLE_TTL_MS                 = parseInt(process.env.DB_IDLE_TTL_MS) || 15 * 60 * 1000;          // 15 minutes
const EVICTION_INTERVAL_MS        = parseInt(process.env.DB_EVICTION_INTERVAL_MS) || 60 * 1000;      // 1 minute
const CIRCUIT_BREAKER_TTL_MS      = parseInt(process.env.DB_CIRCUIT_BREAKER_TTL_MS) || 30 * 1000;    // 30 seconds
const MAX_PARALLEL_CREATES        = parseInt(process.env.DB_MAX_PARALLEL_CREATES) || 10;             // Phase 3.4
const HEALTHCHECK_INTERVAL_MS     = parseInt(process.env.DB_HEALTHCHECK_INTERVAL_MS) || 30 * 1000;   // Phase 3.4
const ENABLE_DEBUG                = process.env.ENABLE_DB_DEBUG === "true";

// ─── Internal State ─────────────────────────────────────────────────────────

/**
 * Connection cache:  Map<key, CacheEntry>
 * Key format: "shard:orgId" (via buildConnectionKey)
 * CacheEntry = {
 *   conn:        mongoose.Connection,
 *   createdAt:   number (Date.now()),
 *   lastUsedAt:  number (Date.now()),
 *   inUseCount:  number (active consumers holding a reference),
 *   dbName:      string (dental_org_<orgId>),
 *   shard:       string (shard identifier),
 *   orgId:       string (original orgId for logging/release)
 * }
 */
const connectionCache = new Map();

/**
 * Pending connection dedup:  Map<key, Promise<Connection>>
 * Key format: "shard:orgId" (same composite key as connectionCache)
 *
 * When multiple requests hit the same org simultaneously and the connection
 * isn't cached yet, only the FIRST request creates the connection.
 * Subsequent requests await the same promise instead of creating duplicates.
 *
 * INVARIANT: Entry exists ONLY during connection creation.
 *            Never persists after creation completes or fails.
 */
const pendingConnections = new Map();

/**
 * Circuit breaker state: Map<key, number (timestamp of failure)>
 * Key format: "shard:orgId" (same composite key as connectionCache)
 *
 * When a connection creation fails, we record the failure timestamp.
 * Subsequent attempts within CIRCUIT_BREAKER_TTL_MS are rejected immediately.
 *
 * CLEANUP: Expired entries are purged during eviction sweeps.
 */
const circuitBreaker = new Map();

/**
 * Connection creation throttle (Phase 3.4)
 *
 * Limits the number of concurrent connection creations globally.
 * Prevents CPU spikes and MongoDB overload during burst scenarios
 * (e.g., cold start with 50 simultaneous requests for different orgs).
 */
const connectionSemaphore = new Semaphore(MAX_PARALLEL_CREATES);

/** Eviction sweep timer reference (for shutdown cleanup) */
let evictionTimer = null;

/** Health check timer reference (for shutdown cleanup) */
let healthCheckTimer = null;

/** Whether the manager has been shut down */
let isShutdown = false;

/**
 * _migratedOrgs — tracks which orgs have already had their startup
 * index migration run during this process lifetime.
 * Prevents re-running the migration on connection recreation (evict + recreate).
 */
const _migratedOrgs = new Set();

// ─── Metrics (always-on — counters are cheap) ───────────────────────────────
// WHY always-on: Counters are simple integer increments (< 1ns each).
// Gating them behind ENABLE_METRICS adds branch complexity for zero benefit.
// These are critical for production observability and incident response.

const metrics = {
    totalResolutions: 0,
    cacheHits: 0,
    cacheMisses: 0,
    connectionsCreated: 0,
    evictions: 0,
    evictionsTTL: 0,
    evictionsLRU: 0,
    evictionsHealth: 0,          // Phase 3.4: connections evicted by health check
    errors: 0,
    releases: 0,
    circuitBreakerBlocks: 0,
    circuitBreakerTrips: 0,
    circuitBreakerCleanups: 0,   // Phase 3.4: expired CB entries cleaned
    dedupHits: 0,                // Phase 3.4: requests served by pending dedup
    healthChecks: 0,             // Phase 3.4: total health checks run
    healthCheckFailures: 0,      // Phase 3.4: stale connections detected
    throttleWaits: 0,            // Phase 3.4: requests that waited on semaphore
    totalResolutionTimeMs: 0,    // Phase 3.4: cumulative resolution time for avg calc
};

// ─── Helpers ────────────────────────────────────────────────────────────────

/**
 * getDbName
 * Derives the per-org database name from an organization ID.
 * Phase 3.5: Now delegates to connectionFactory.buildDbName().
 * Kept as a re-export for backward compatibility.
 *
 * @param {string} orgId
 * @returns {string}
 */
function getDbName(orgId) {
    return buildDbName(orgId);
}

/**
 * orgIdToKey
 * Internal: converts a public-facing orgId to the composite cache key.
 * Centralizes the shard resolution + key building so every function
 * uses the same deterministic path.
 *
 * @param {string} orgId
 * @returns {{ key: string, shard: string }}
 */
function orgIdToKey(orgId) {
    const shard = resolveShard(orgId);
    const key = buildConnectionKey({ shard, orgId });
    return { key, shard };
}

// ─── Circuit Breaker ────────────────────────────────────────────────────────

/**
 * isCircuitOpen
 * Checks if the circuit breaker is currently blocking connections.
 * Phase 3.5: Accepts composite key (shard:orgId).
 *
 * @param {string} key — Composite cache key
 * @returns {boolean} — true if blocked
 */
function isCircuitOpen(key) {
    const failedAt = circuitBreaker.get(key);
    if (!failedAt) return false;

    // Circuit has expired — clear it and allow retry
    if (Date.now() - failedAt >= CIRCUIT_BREAKER_TTL_MS) {
        circuitBreaker.delete(key);
        if (ENABLE_DEBUG) {
            logger.debug(
                { key, ttlMs: CIRCUIT_BREAKER_TTL_MS, source: "dbManager" },
                "[DBManager] Circuit breaker RESET for key=%s (TTL expired)"
            );
        }
        return false;
    }

    return true;
}

/**
 * tripCircuitBreaker
 * Records a connection failure, blocking retries for CIRCUIT_BREAKER_TTL_MS.
 * Phase 3.5: Accepts composite key.
 *
 * @param {string} key — Composite cache key
 */
function tripCircuitBreaker(key) {
    circuitBreaker.set(key, Date.now());
    metrics.circuitBreakerTrips++;

    logger.warn(
        {
            key,
            blockDurationMs: CIRCUIT_BREAKER_TTL_MS,
            source: "dbManager",
        },
        "[DBManager] Circuit breaker TRIPPED for key=%s — blocking retries for %dms"
    );
}

/**
 * cleanupExpiredCircuitBreakers (Phase 3.4)
 * Removes expired circuit breaker entries to prevent memory leaks.
 * Called during the eviction sweep timer.
 *
 * WHY: Without cleanup, the circuitBreaker Map grows unbounded.
 * If 10,000 distinct orgs each fail once, that's 10,000 entries
 * that persist forever even though their TTL has long expired.
 */
function cleanupExpiredCircuitBreakers() {
    const now = Date.now();
    let cleaned = 0;

    for (const [cbKey, failedAt] of circuitBreaker) {
        if (now - failedAt >= CIRCUIT_BREAKER_TTL_MS) {
            circuitBreaker.delete(cbKey);
            cleaned++;
        }
    }

    if (cleaned > 0) {
        metrics.circuitBreakerCleanups += cleaned;
        if (ENABLE_DEBUG) {
            logger.debug(
                { cleaned, remaining: circuitBreaker.size, source: "dbManager" },
                "[DBManager] Circuit breaker cleanup: removed %d expired entries"
            );
        }
    }
}

// ─── Connection Health Check (Phase 3.4) ────────────────────────────────────

/**
 * isConnectionHealthy
 * Validates that a cached connection is still usable.
 *
 * Checks readyState:
 *   0 = disconnected
 *   1 = connected (healthy)
 *   2 = connecting
 *   3 = disconnecting
 *
 * Only readyState === 1 is considered healthy.
 *
 * WHY: MongoDB connections can become stale due to:
 *   - Network partitions / firewall timeouts
 *   - MongoDB server restarts
 *   - Idle connection cleanup by cloud providers (e.g., Atlas)
 *   Using a stale connection causes cryptic timeout errors
 *   on the first query, degrading user experience.
 *
 * @param {mongoose.Connection} conn
 * @returns {boolean}
 */
function isConnectionHealthy(conn) {
    try {
        return conn.readyState === 1;
    } catch (e) {
        return false;
    }
}

/**
 * runHealthChecks (Phase 3.4)
 * Iterates all cached connections and evicts any that are unhealthy.
 * Called periodically by the health check timer.
 *
 * Only checks IDLE connections (inUseCount === 0) to avoid
 * interfering with active operations.
 */
function runHealthChecks() {
    metrics.healthChecks++;
    let evicted = 0;

    for (const [cacheKey, entry] of connectionCache) {
        if (entry.inUseCount > 0) continue;

        if (!isConnectionHealthy(entry.conn)) {
            metrics.healthCheckFailures++;
            evicted++;

            logger.warn(
                {
                    orgId: entry.orgId,
                    shard: entry.shard,
                    dbName: entry.dbName,
                    readyState: entry.conn.readyState,
                    ageMs: Date.now() - entry.createdAt,
                    source: "dbManager",
                },
                "[DBManager] UNHEALTHY connection detected — evicting"
            );

            evictEntry(cacheKey, "HEALTH");
            metrics.evictionsHealth++;
        }
    }

    if (ENABLE_DEBUG && evicted > 0) {
        logger.debug(
            { evicted, cacheSize: connectionCache.size, source: "dbManager" },
            "[DBManager] Health check complete: evicted %d unhealthy connections"
        );
    }
}

// ─── Core API ───────────────────────────────────────────────────────────────

/**
 * getConnection
 * Returns a per-org Mongoose connection for the given organization.
 *
 * STRICT MODE: Always returns a real connection or throws.
 * Never returns null. No fallback to shared/platform DB.
 *
 * Phase 3.4 Enhancements:
 *   - Connection health check before cache reuse
 *   - Dedup: concurrent requests for same org share one creation promise
 *   - Resolution time tracking for metrics
 *
 * Lifecycle:
 *   Each call INCREMENTS the connection's inUseCount.
 *   Callers MUST call releaseConnection(orgId) when done.
 *   Connections with inUseCount > 0 are protected from eviction.
 *
 * @param {string} orgId — Organization _id (REQUIRED)
 * @returns {mongoose.Connection} — org-specific connection (never null)
 * @throws {Error} — If shutdown, circuit open, orgId missing, or creation fails
 */
function getConnection(orgId) {
    const resolutionStart = Date.now();

    if (isShutdown) {
        throw new Error("[DBManager] Cannot get connection — manager is shut down");
    }

    metrics.totalResolutions++;

    // ─── Guard: orgId ALWAYS required ───────────────────────────────────
    if (!orgId) {
        metrics.errors++;
        const err = new Error("[DBManager] orgId is REQUIRED — per-org mode does not allow null connections");
        logger.error({ source: "dbManager" }, err.message);
        throw err;
    }

    // Phase 3.5: Derive composite key for all internal Map lookups
    const { key, shard } = orgIdToKey(orgId);

    // ─── Circuit breaker: fast-reject if recently failed ────────────────
    if (isCircuitOpen(key)) {
        metrics.circuitBreakerBlocks++;
        const remainingMs = CIRCUIT_BREAKER_TTL_MS - (Date.now() - circuitBreaker.get(key));
        throw new Error(
            `[DBManager] Circuit breaker OPEN for org ${orgId} — connection blocked for ${remainingMs}ms`
        );
    }

    // ─── Cache hit: reuse existing connection ───────────────────────────
    if (connectionCache.has(key)) {
        const entry = connectionCache.get(key);

        // Phase 3.4: Health check — validate connection is still alive
        if (!isConnectionHealthy(entry.conn)) {
            logger.warn(
                { orgId, shard, dbName: entry.dbName, readyState: entry.conn.readyState, source: "dbManager" },
                "[DBManager] Cached connection UNHEALTHY — destroying and recreating"
            );
            metrics.healthCheckFailures++;
            evictEntry(key, "HEALTH_ON_ACCESS");
            metrics.evictionsHealth++;
        } else {
            // Connection is healthy — reuse it
            entry.lastUsedAt = Date.now();
            entry.inUseCount++;

            metrics.cacheHits++;
            metrics.totalResolutionTimeMs += Date.now() - resolutionStart;

            if (ENABLE_DEBUG) {
                logger.debug(
                    { orgId, shard, dbName: entry.dbName, inUseCount: entry.inUseCount, source: "dbManager" },
                    "[DBManager] CACHE HIT org=%s shard=%s (inUse: %d)"
                );
            }

            return entry.conn;
        }
    }

    // ─── Cache miss: create new connection ──────────────────────────────
    metrics.cacheMisses++;

    if (connectionCache.size >= MAX_CONNECTIONS) {
        evictLRU();
    }

    if (connectionCache.size >= MAX_CONNECTIONS) {
        logger.warn(
            {
                orgId,
                shard,
                cacheSize: connectionCache.size,
                maxConnections: MAX_CONNECTIONS,
                source: "dbManager",
            },
            "[DBManager] Connection pool at capacity — creating overflow connection."
        );
    }

    const conn = createConnection(orgId, key, shard);
    metrics.totalResolutionTimeMs += Date.now() - resolutionStart;
    return conn;
}

/**
 * getConnectionAsync (Phase 3.4)
 * Async variant of getConnection with dedup and throttling.
 *
 * Use this when:
 *   - You're in an async context (background workers, event handlers)
 *   - Multiple concurrent requests may hit the same org
 *   - You want throttled connection creation
 *
 * DEDUP ALGORITHM:
 *   1. Cache hit → return immediately (no async needed)
 *   2. Pending promise exists → await it (dedup hit)
 *   3. No cache, no pending → create with semaphore throttling
 *
 * For HTTP middleware (dbContext), the sync getConnection() is used
 * since useDb() is synchronous and lightweight.
 *
 * @param {string} orgId — Organization _id (REQUIRED)
 * @returns {Promise<mongoose.Connection>}
 */
async function getConnectionAsync(orgId) {
    const resolutionStart = Date.now();

    if (isShutdown) {
        throw new Error("[DBManager] Cannot get connection — manager is shut down");
    }

    metrics.totalResolutions++;

    if (!orgId) {
        metrics.errors++;
        throw new Error("[DBManager] orgId is REQUIRED — per-org mode does not allow null connections");
    }

    // Step 5d: prime the orgId → cluster cache before resolving. The sync
    // createConnection path reads clusterForOrg.peekSync; priming here
    // guarantees a cache hit downstream for workers / background jobs that
    // entered through the async gate.
    try {
        const { clusterForOrg } = require("./clusterForOrg");
        await clusterForOrg(String(orgId));
    } catch (err) {
        // Non-fatal: createConnection falls back to the legacy shard key
        // if peek returns undefined. Log for observability.
        if (ENABLE_DEBUG) {
            logger.debug(
                { orgId, err: err.message, source: "dbManager" },
                "[DBManager] clusterForOrg priming failed — falling back to shard resolver"
            );
        }
    }

    // Phase 3.5: Derive composite key
    const { key, shard } = orgIdToKey(orgId);

    if (isCircuitOpen(key)) {
        metrics.circuitBreakerBlocks++;
        const remainingMs = CIRCUIT_BREAKER_TTL_MS - (Date.now() - circuitBreaker.get(key));
        throw new Error(
            `[DBManager] Circuit breaker OPEN for org ${orgId} — connection blocked for ${remainingMs}ms`
        );
    }

    // ─── Cache hit ──────────────────────────────────────────────────────
    if (connectionCache.has(key)) {
        const entry = connectionCache.get(key);

        if (!isConnectionHealthy(entry.conn)) {
            metrics.healthCheckFailures++;
            evictEntry(key, "HEALTH_ON_ACCESS");
            metrics.evictionsHealth++;
        } else {
            entry.lastUsedAt = Date.now();
            entry.inUseCount++;
            metrics.cacheHits++;
            metrics.totalResolutionTimeMs += Date.now() - resolutionStart;
            return entry.conn;
        }
    }

    // ─── Dedup: if another request is already creating this connection ───
    if (pendingConnections.has(key)) {
        metrics.dedupHits++;
        if (ENABLE_DEBUG) {
            logger.debug(
                { orgId, shard, source: "dbManager" },
                "[DBManager] DEDUP HIT: awaiting pending connection for org=%s"
            );
        }

        const conn = await pendingConnections.get(key);

        const entry = connectionCache.get(key);
        if (entry) {
            entry.lastUsedAt = Date.now();
            entry.inUseCount++;
        }

        metrics.totalResolutionTimeMs += Date.now() - resolutionStart;
        return conn;
    }

    // ─── New creation: throttled via semaphore ──────────────────────────
    metrics.cacheMisses++;

    const wasBusy = connectionSemaphore.active >= connectionSemaphore.max;
    if (wasBusy) {
        metrics.throttleWaits++;
        if (ENABLE_DEBUG) {
            logger.debug(
                { orgId, shard, active: connectionSemaphore.active, max: connectionSemaphore.max, queue: connectionSemaphore.waiting, source: "dbManager" },
                "[DBManager] THROTTLE: waiting for semaphore slot (active: %d/%d, queue: %d)"
            );
        }
    }

    const creationPromise = (async () => {
        const release = await connectionSemaphore.acquire();
        try {
            // Double-check cache — another request may have created it while we waited
            if (connectionCache.has(key)) {
                const entry = connectionCache.get(key);
                if (isConnectionHealthy(entry.conn)) {
                    entry.lastUsedAt = Date.now();
                    entry.inUseCount++;
                    metrics.cacheHits++;
                    return entry.conn;
                }
                evictEntry(key, "HEALTH_POST_WAIT");
                metrics.evictionsHealth++;
            }

            if (connectionCache.size >= MAX_CONNECTIONS) {
                evictLRU();
            }

            return createConnection(orgId, key, shard);
        } finally {
            release();
        }
    })();

    pendingConnections.set(key, creationPromise);

    try {
        const conn = await creationPromise;
        metrics.totalResolutionTimeMs += Date.now() - resolutionStart;
        return conn;
    } catch (err) {
        throw err;
    } finally {
        pendingConnections.delete(key);
    }
}

/**
 * createConnection
 * Creates a new org connection via `clusterConn.useDb(dbName)`, where the
 * cluster root is resolved from `clusterForOrg` (cache-backed) and opened
 * via `clusterConnections.getSync(clusterKey)`.
 *
 * Step 5d — previously used the global `mongoose.connection.useDb()`. That
 * root was removed when `mongoose.connect()` was deleted from config/db.js;
 * dbManager is now fully cluster-aware.
 *
 * Precondition: the cluster for `orgId` must already be present in the
 * clusterForOrg in-memory cache. authMiddleware / dbContext / worker paths
 * that don't have it yet MUST use `getConnectionAsync` which primes the
 * cache via the platform DB before calling this.
 *
 * @param {string} orgId — Original org identifier
 * @param {string} key   — Composite cache key ({cluster}:{orgId})
 * @param {string} shard — Legacy shard/cluster identifier (used for logging)
 * @returns {mongoose.Connection} — never null
 * @throws {Error} — If the cluster is unknown or not pre-warmed
 */
function createConnection(orgId, key, shard) {
    const dbName = getDbName(orgId);

    try {
        // Step 5d: resolve the cluster root and useDb against it.
        const clusterForOrgMod = require("./clusterForOrg");
        const clusterConnections = require("./clusterConnections");

        let clusterKey = clusterForOrgMod.peekSync(orgId);
        if (!clusterKey) {
            // Fallback: legacy shard/cluster resolver (may be "shard-1"
            // or the canonical cluster for single-cluster deployments).
            // When the platform DB doesn't yet have the org's cluster
            // cached, `getConnectionAsync` primes it before we're reached.
            clusterKey = shard || "default";
        }

        const clusterRoot = clusterConnections.getSync(clusterKey);
        const conn = clusterRoot.useDb(dbName, {
            useCache: true,
            noListener: true,
        });

        const entry = {
            conn,
            dbName,
            shard,
            orgId,
            createdAt: Date.now(),
            lastUsedAt: Date.now(),
            inUseCount: 1,
        };

        connectionCache.set(key, entry);
        metrics.connectionsCreated++;

        logger.info(
            {
                orgId,
                shard,
                dbName,
                cacheSize: connectionCache.size,
                source: "dbManager",
            },
            "[DBManager] CREATE org=%s shard=%s db=%s (cache: %d)"
        );

        // ── Startup Index Migration (fire-and-forget) ──────────────────
        // Run at most once per org per process lifetime (migratedOrgs guards this).
        // Non-blocking: never delays the request that triggered connection creation.
        // Safe: the migration function is internally non-fatal (never throws).
        if (!_migratedOrgs.has(orgId)) {
            _migratedOrgs.add(orgId);
            setImmediate(() => {
                try {
                    const { migrateAppointmentExternalRequestIdIndex } =
                        require("../migrations/migrateAppointmentIndex");
                    migrateAppointmentExternalRequestIdIndex(conn, dbName).catch(() => {});
                } catch (_) { /* migration module not found — skip */ }

                // ── Hardening §1 (Pre-Production): Ortho TreatmentPlanVersion ──
                // Ensure the partial-unique indexes enforcing
                // single-approved / single-active invariants exist on every org DB.
                // In production, ensureTreatmentPlanIndexes throws if either is
                // missing — that will be surfaced here (we catch to keep the
                // connection usable for other tenants, but the error is logged
                // as CRITICAL and ops can alert on PLAN_INDEX_READY absence).
                try {
                    const { ensureTreatmentPlanIndexes } =
                        require("../../modules/orthodontics/services/treatmentPlanVersion.service");
                    Promise.resolve(ensureTreatmentPlanIndexes(conn))
                        .then((result) => {
                            if (result && result.ok) {
                                logger.info(
                                    { orgId, dbName, source: "dbManager" },
                                    "PLAN_INDEX_READY"
                                );
                            } else {
                                logger.error(
                                    { orgId, dbName, missing: result?.missing || [], source: "dbManager" },
                                    "[DBManager] PLAN_INDEX_NOT_READY — missing partial-unique indexes"
                                );
                            }
                        })
                        .catch((err) => {
                            logger.error(
                                { orgId, dbName, err: err.message, source: "dbManager" },
                                "[DBManager] ensureTreatmentPlanIndexes failed"
                            );
                        });
                } catch (_) { /* service module not found — skip */ }
            });
        }

        return conn;
    } catch (err) {
        metrics.errors++;

        tripCircuitBreaker(key);

        logger.error(
            {
                orgId,
                shard,
                dbName,
                err: err.message,
                source: "dbManager",
            },
            "[DBManager] Connection creation FAILED for org=%s shard=%s db=%s"
        );

        throw new Error(`[DBManager] Failed to create connection for org ${orgId}: ${err.message}`);
    }
}

/**
 * releaseConnection
 * Decrements the inUseCount for an org's connection.
 * Phase 3.5: Derives composite key internally — public API unchanged.
 *
 * @param {string} orgId
 */
function releaseConnection(orgId) {
    if (!orgId) return;

    const { key } = orgIdToKey(orgId);
    if (!connectionCache.has(key)) return;

    const entry = connectionCache.get(key);
    entry.inUseCount = Math.max(0, entry.inUseCount - 1);
    metrics.releases++;

    if (ENABLE_DEBUG) {
        logger.debug(
            { orgId, shard: entry.shard, inUseCount: entry.inUseCount, source: "dbManager" },
            "[DBManager] RELEASE org=%s (inUse: %d)"
        );
    }
}

// ─── Eviction Engine ────────────────────────────────────────────────────────

/**
 * evictExpired
 * Removes all cached connections that have exceeded IDLE_TTL_MS
 * and are not currently in use (inUseCount === 0).
 *
 * Phase 3.4: Also cleans up expired circuit breaker entries.
 *
 * Called periodically by the eviction sweep timer.
 */
function evictExpired() {
    const now = Date.now();
    const toEvict = [];

    for (const [cacheKey, entry] of connectionCache) {
        const idleMs = now - entry.lastUsedAt;
        if (idleMs >= IDLE_TTL_MS && entry.inUseCount === 0) {
            toEvict.push(cacheKey);
        }
    }

    for (const cacheKey of toEvict) {
        evictEntry(cacheKey, "TTL");
        metrics.evictionsTTL++;
    }

    cleanupExpiredCircuitBreakers();
}

/**
 * evictLRU
 * Removes the least recently used idle connection to make room.
 * Only evicts connections with inUseCount === 0.
 *
 * Called when the cache is at MAX_CONNECTIONS capacity.
 */
function evictLRU() {
    let oldestKey = null;
    let oldestLastUsed = Infinity;

    for (const [cacheKey, entry] of connectionCache) {
        if (entry.inUseCount === 0 && entry.lastUsedAt < oldestLastUsed) {
            oldestLastUsed = entry.lastUsedAt;
            oldestKey = cacheKey;
        }
    }

    if (oldestKey) {
        evictEntry(oldestKey, "LRU");
        metrics.evictionsLRU++;
    }
}

/**
 * evictEntry
 * Removes a single connection from the cache and closes it.
 * Phase 3.5: Accepts composite key.
 *
 * @param {string} key    — Composite cache key (shard:orgId)
 * @param {string} reason — "TTL" | "LRU" | "HEALTH" | "HEALTH_ON_ACCESS" | "HEALTH_POST_WAIT" | "SHUTDOWN"
 */
function evictEntry(key, reason) {
    const entry = connectionCache.get(key);
    if (!entry) return;

    connectionCache.delete(key);
    metrics.evictions++;

    logger.info(
        {
            orgId: entry.orgId,
            shard: entry.shard,
            dbName: entry.dbName,
            reason,
            ageMs: Date.now() - entry.createdAt,
            idleMs: Date.now() - entry.lastUsedAt,
            cacheSize: connectionCache.size,
            source: "dbManager",
        },
        "[DBManager] EVICT reason=%s (cache: %d)"
    );

    try {
        entry.conn.close().catch((closeErr) => {
            logger.warn(
                { orgId: entry.orgId, err: closeErr.message, source: "dbManager" },
                "[DBManager] Error closing evicted connection (non-fatal)"
            );
        });
    } catch (e) {
        // Swallow sync close errors — connection may already be dead
    }
}

// ─── Timers ─────────────────────────────────────────────────────────────────

/**
 * startEvictionSweep
 * Starts the periodic eviction timer that removes idle connections.
 * Uses unref() to avoid blocking process shutdown.
 *
 * Called automatically on first require() in non-shared modes.
 */
function startEvictionSweep() {
    if (evictionTimer) return;

    // ALLOWED_POLLING: CLEANUP
    evictionTimer = setInterval(() => {
        try {
            evictExpired();
        } catch (err) {
            logger.error(
                { err: err.message, source: "dbManager" },
                "[DBManager] Eviction sweep error"
            );
        }
    }, EVICTION_INTERVAL_MS);

    // unref() ensures this timer doesn't prevent Node.js from exiting
    if (evictionTimer.unref) {
        evictionTimer.unref();
    }

    logger.info(
        {
            intervalMs: EVICTION_INTERVAL_MS,
            idleTtlMs: IDLE_TTL_MS,
            maxConnections: MAX_CONNECTIONS,
            circuitBreakerTtlMs: CIRCUIT_BREAKER_TTL_MS,
            maxParallelCreates: MAX_PARALLEL_CREATES,
            source: "dbManager",
        },
        "[DBManager] Eviction sweep started (interval=%dms, TTL=%dms, max=%d, CB=%dms, throttle=%d)"
    );
}

/**
 * startHealthChecks (Phase 3.4)
 * Starts the periodic health check timer that detects stale connections.
 * Uses unref() to avoid blocking process shutdown.
 */
function startHealthChecks() {
    if (healthCheckTimer) return;

    // ALLOWED_POLLING: HEALTH
    healthCheckTimer = setInterval(() => {
        try {
            runHealthChecks();
        } catch (err) {
            logger.error(
                { err: err.message, source: "dbManager" },
                "[DBManager] Health check error"
            );
        }
    }, HEALTHCHECK_INTERVAL_MS);

    if (healthCheckTimer.unref) {
        healthCheckTimer.unref();
    }

    if (ENABLE_DEBUG) {
        logger.debug(
            { intervalMs: HEALTHCHECK_INTERVAL_MS, source: "dbManager" },
            "[DBManager] Health check timer started (interval=%dms)"
        );
    }
}

// ─── Observability ──────────────────────────────────────────────────────────

/**
 * getStats
 * Returns a comprehensive snapshot of the connection manager state.
 * Safe to call at any time — returns zeroes when empty.
 *
 * Phase 3.4: Enhanced with advanced metrics:
 *   - avgConnectionLifetimeMs
 *   - connectionReuseRate
 *   - pendingConnections count
 *   - avgResolutionTimeMs
 *   - throttle state
 *
 * All fields are flat (no nested "metrics" object) for easy
 * consumption by health endpoints and monitoring systems.
 *
 * @returns {Object} — Connection pool statistics
 */
function getStats() {
    let activeConnections = 0;
    let idleConnections = 0;
    let totalLifetimeMs = 0;
    const connectionDetails = [];

    const now = Date.now();

    for (const [cacheKey, entry] of connectionCache) {
        if (entry.inUseCount > 0) {
            activeConnections++;
        } else {
            idleConnections++;
        }
        totalLifetimeMs += now - entry.createdAt;

        if (ENABLE_DEBUG) {
            connectionDetails.push({
                cacheKey,
                orgId: entry.orgId,
                shard: entry.shard,
                dbName: entry.dbName,
                inUseCount: entry.inUseCount,
                ageMs: now - entry.createdAt,
                idleMs: now - entry.lastUsedAt,
                readyState: entry.conn.readyState,
            });
        }
    }

    const totalRes = metrics.totalResolutions;
    const hitRate = totalRes > 0
        ? ((metrics.cacheHits / totalRes) * 100).toFixed(2) + "%"
        : "N/A";
    const missRate = totalRes > 0
        ? ((metrics.cacheMisses / totalRes) * 100).toFixed(2) + "%"
        : "N/A";

    // Phase 3.4: Advanced calculated metrics
    const avgLifetimeMs = connectionCache.size > 0
        ? Math.round(totalLifetimeMs / connectionCache.size)
        : 0;

    // Reuse rate: cache hits / (cache hits + connections created)
    const totalUsages = metrics.cacheHits + metrics.connectionsCreated;
    const reuseRate = totalUsages > 0
        ? ((metrics.cacheHits / totalUsages) * 100).toFixed(2) + "%"
        : "N/A";

    const avgResolutionTimeMs = totalRes > 0
        ? Math.round((metrics.totalResolutionTimeMs / totalRes) * 100) / 100
        : 0;

    return {
        // ─── Pool State ─────────────────────────────────────────────────
        dbMode: DB_MODE,
        cacheSize: connectionCache.size,
        totalConnections: connectionCache.size,
        activeConnections,
        idleConnections,
        maxConnections: MAX_CONNECTIONS,
        idleTtlMs: IDLE_TTL_MS,
        circuitBreakerTtlMs: CIRCUIT_BREAKER_TTL_MS,
        circuitBreakerOpenCount: circuitBreaker.size,
        pendingConnections: pendingConnections.size,
        isShutdown,

        // ─── Phase 3.4: Advanced Calculated Metrics ─────────────────────
        avgConnectionLifetimeMs: avgLifetimeMs,
        connectionReuseRate: reuseRate,
        avgResolutionTimeMs,

        // ─── Throttle State ─────────────────────────────────────────────
        throttle: {
            maxParallelCreates: MAX_PARALLEL_CREATES,
            activeCreates: connectionSemaphore.active,
            queuedCreates: connectionSemaphore.waiting,
        },

        // ─── Metrics (always-on counters) ───────────────────────────────
        totalResolutions: metrics.totalResolutions,
        cacheHits: metrics.cacheHits,
        cacheMisses: metrics.cacheMisses,
        hitRate,
        missRate,
        connectionsCreated: metrics.connectionsCreated,
        evictions: metrics.evictions,
        evictionsTTL: metrics.evictionsTTL,
        evictionsLRU: metrics.evictionsLRU,
        evictionsHealth: metrics.evictionsHealth,
        errors: metrics.errors,
        releases: metrics.releases,
        circuitBreakerTrips: metrics.circuitBreakerTrips,
        circuitBreakerBlocks: metrics.circuitBreakerBlocks,
        circuitBreakerCleanups: metrics.circuitBreakerCleanups,
        dedupHits: metrics.dedupHits,
        healthChecks: metrics.healthChecks,
        healthCheckFailures: metrics.healthCheckFailures,
        throttleWaits: metrics.throttleWaits,

        // ─── Debug (only when ENABLE_DB_DEBUG=true) ─────────────────────
        ...(ENABLE_DEBUG && { connectionDetails }),
    };
}

// ─── Shutdown ───────────────────────────────────────────────────────────────

/**
 * shutdown
 * Gracefully closes all cached org connections and resets all state.
 *
 * Called during server graceful shutdown (SIGTERM/SIGINT).
 * After shutdown(), getConnection() will throw.
 *
 * @returns {Promise<void>}
 */
async function shutdown() {
    if (isShutdown) {
        logger.warn({ source: "dbManager" }, "[DBManager] Already shut down — ignoring duplicate call");
        return;
    }

    isShutdown = true;

    // Stop all timers
    if (evictionTimer) {
        clearInterval(evictionTimer);
        evictionTimer = null;
    }
    if (healthCheckTimer) {
        clearInterval(healthCheckTimer);
        healthCheckTimer = null;
    }

    const cacheKeys = Array.from(connectionCache.keys());
    const total = cacheKeys.length;

    logger.info(
        { total, source: "dbManager" },
        "[DBManager] Shutting down — closing %d org connections"
    );

    const results = await Promise.allSettled(
        cacheKeys.map(async (cacheKey) => {
            const entry = connectionCache.get(cacheKey);
            if (!entry) return;

            try {
                await entry.conn.close();
                logger.info(
                    { orgId: entry.orgId, shard: entry.shard, dbName: entry.dbName, source: "dbManager" },
                    "[DBManager] Closed connection org=%s shard=%s"
                );
            } catch (err) {
                logger.warn(
                    { orgId: entry.orgId, err: err.message, source: "dbManager" },
                    "[DBManager] Error closing connection (non-fatal)"
                );
            }
        })
    );

    // Clear all state
    connectionCache.clear();
    circuitBreaker.clear();
    pendingConnections.clear();

    // Reset metrics
    Object.keys(metrics).forEach((key) => { metrics[key] = 0; });

    const failed = results.filter((r) => r.status === "rejected").length;

    logger.info(
        { total, closed: total - failed, failed, source: "dbManager" },
        "[DBManager] Shutdown complete — %d/%d connections closed"
    );
}

// ─── Auto-Start Timers ──────────────────────────────────────────────────────
// Start timers on first require().
// Safe because:
//   1. Timers use unref() → won't block process exit
//   2. Timers are stopped in shutdown()

startEvictionSweep();
startHealthChecks();

// ─── Exports ────────────────────────────────────────────────────────────────

module.exports = {
    // ─── Core API (stable public contract) ──────────────────────────────
    getConnection,
    getConnectionAsync,       // Phase 3.4: async variant with dedup + throttle
    releaseConnection,
    getStats,
    shutdown,

    // ─── Utilities ──────────────────────────────────────────────────────
    getDbName,

    // ─── Constants ──────────────────────────────────────────────────────
    DB_MODE,

    // ─── Internal (testing only — prefixed with underscore) ─────────────
    _cache: connectionCache,
    _circuitBreaker: circuitBreaker,
    _pendingConnections: pendingConnections,
    _metrics: metrics,
    _evictExpired: evictExpired,
    _evictLRU: evictLRU,
    _createConnection: createConnection,
    _isCircuitOpen: isCircuitOpen,
    _isConnectionHealthy: isConnectionHealthy,
    _runHealthChecks: runHealthChecks,
    _cleanupExpiredCircuitBreakers: cleanupExpiredCircuitBreakers,
    _connectionSemaphore: connectionSemaphore,
};
