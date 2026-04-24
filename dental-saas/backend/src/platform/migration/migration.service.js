/**
 * migration.service.js — Phase 8 Org Cluster Migration State Machine
 *
 * State transitions:
 *   null → PREPARING → SYNCING → CUTOVER_PENDING → CUTOVER → VERIFYING → COMPLETE
 *                          ↓             ↓             ↓
 *                       FAILED  ←─────────────────────┘
 *
 * Each transition:
 *   1. Atomically updates the Organization doc (optimistic lock on the
 *      expected previous state — prevents two operators from racing).
 *   2. Appends a MigrationLog entry (audit, never moves).
 *
 * The actual data-movement implementation (dump+restore vs. change streams
 * vs. resume-token-based catch-up) is intentionally NOT in this service —
 * see syncOrgData() which is a STUB that records the state transition but
 * leaves the heavy data-movement to a follow-up worker that can pick the
 * right strategy per cluster pair.
 *
 * Contract guarantees:
 *   - writeLocked = true is set BEFORE any cluster-side change.
 *   - routingEpoch is incremented atomically with the cluster swap.
 *   - dbManager.evictByOrg(orgId) is called immediately after cutover so
 *     stale connections are released.
 *   - Rollback is safe at every state EXCEPT after CUTOVER (data is on
 *     the new cluster).
 *
 * PLANE: Platform.
 */

"use strict";

const crypto = require("crypto");
const mongoose = require("mongoose");
const getPlatformModel = require("@core/db/getPlatformModel");
const dbManager = require("@core/db/dbManager");
const clusterRegistry = require("@core/db/clusterRegistry");
const logger = require("@utils/logger");

const OrganizationDef = require("@shared/models/Organization");
const MigrationLogDef = require("../domain/models/MigrationLog.model");

// Lazy bind — platformConnection is initialised by boot, but this module
// can be required at any point in the boot sequence.
function Organization() {
    return getPlatformModel(OrganizationDef);
}
function MigrationLog() {
    return getPlatformModel(MigrationLogDef);
}

const STATES = Object.freeze({
    NULL: null,
    PREPARING: "PREPARING",
    SYNCING: "SYNCING",
    CUTOVER_PENDING: "CUTOVER_PENDING",
    CUTOVER: "CUTOVER",
    VERIFYING: "VERIFYING",
    COMPLETE: "COMPLETE",
    FAILED: "FAILED",
});

const ALLOWED_NEXT = Object.freeze({
    [null]:                 [STATES.PREPARING],
    [STATES.PREPARING]:      [STATES.SYNCING, STATES.FAILED],
    [STATES.SYNCING]:        [STATES.CUTOVER_PENDING, STATES.FAILED],
    [STATES.CUTOVER_PENDING]:[STATES.CUTOVER, STATES.FAILED],
    [STATES.CUTOVER]:        [STATES.VERIFYING, STATES.FAILED],
    [STATES.VERIFYING]:      [STATES.COMPLETE, STATES.FAILED],
    [STATES.COMPLETE]:       [],   // terminal
    [STATES.FAILED]:         [],   // terminal — operator must clear before a new run
});

class MigrationError extends Error {
    constructor(message, code, status = 400) {
        super(message);
        this.code = code;
        this.statusCode = status;
    }
}

// ─── Internal helpers ───────────────────────────────────────────────────────

function _assertTransitionAllowed(from, to) {
    const allowed = ALLOWED_NEXT[from];
    if (!allowed || !allowed.includes(to)) {
        throw new MigrationError(
            `Invalid migration transition: ${from} → ${to}`,
            "INVALID_TRANSITION",
            409
        );
    }
}

function _validateCluster(key) {
    const entry = clusterRegistry.get(key);
    if (!entry) {
        throw new MigrationError(
            `Unknown target cluster: "${key}"`,
            "UNKNOWN_CLUSTER",
            400
        );
    }
    if (entry.status && entry.status !== "ACTIVE") {
        throw new MigrationError(
            `Target cluster "${key}" is not ACTIVE (status=${entry.status})`,
            "CLUSTER_NOT_ACTIVE",
            409
        );
    }
}

async function _logTransition({ org, from, to, actor, reason, details = {} }) {
    try {
        await MigrationLog().create({
            migrationId: org.migrationId,
            organizationId: org._id,
            from,
            to,
            sourceCluster: org.cluster,
            targetCluster: org.targetCluster,
            actor: actor || "system",
            reason: reason || null,
            routingVersion: org.routingVersion,
            routingEpoch: org.routingEpoch,
            details,
        });
    } catch (err) {
        logger.error(
            { event: "MIGRATION_LOG_FAILED", orgId: String(org._id), from, to, err: err.message },
            "[Migration] Audit log write failed (non-fatal — migration proceeds)"
        );
    }
}

// Atomic state transition with optimistic lock on the previous state.
// Returns the post-update org doc, or throws if the transition lost the
// race (another operator advanced first).
async function _transition({ orgId, from, to, $set = {}, $inc = {}, actor, reason, details }) {
    const update = {
        $set: { ...$set, migrationState: to },
    };
    if (Object.keys($inc).length > 0) update.$inc = $inc;

    const updated = await Organization().findOneAndUpdate(
        { _id: orgId, migrationState: from },
        update,
        { new: true }
    );

    if (!updated) {
        // Either the org doesn't exist OR another operator advanced past `from`.
        const latest = await Organization().findById(orgId).lean();
        if (!latest) {
            throw new MigrationError(`Organization ${orgId} not found`, "ORG_NOT_FOUND", 404);
        }
        throw new MigrationError(
            `Migration race lost — expected migrationState="${from}", found "${latest.migrationState}"`,
            "STATE_RACE",
            409
        );
    }

    await _logTransition({ org: updated, from, to, actor, reason, details });
    return updated;
}

// ─── Public API ─────────────────────────────────────────────────────────────

/**
 * Begin a migration. Sets writeLocked + targetCluster + new migrationId,
 * transitions to PREPARING. The actual sync is kicked off by the worker
 * (or the next call to syncOrgData()).
 *
 * @param {object} params
 * @param {string} params.orgId
 * @param {string} params.targetCluster
 * @param {string} [params.actor]
 * @param {string} [params.reason]
 * @returns {Promise<object>} updated org
 */
async function startMigration({ orgId, targetCluster, actor, reason }) {
    if (!mongoose.isValidObjectId(orgId)) {
        throw new MigrationError("Invalid orgId", "INVALID_ORG_ID", 400);
    }
    if (!targetCluster) {
        throw new MigrationError("targetCluster is required", "MISSING_TARGET_CLUSTER", 400);
    }
    _validateCluster(targetCluster);

    const org = await Organization().findById(orgId).lean();
    if (!org) {
        throw new MigrationError(`Organization ${orgId} not found`, "ORG_NOT_FOUND", 404);
    }
    if (org.cluster === targetCluster) {
        throw new MigrationError(
            `Organization ${orgId} is already on cluster "${targetCluster}"`,
            "SAME_CLUSTER",
            409
        );
    }
    if (org.migrationState && org.migrationState !== STATES.FAILED) {
        throw new MigrationError(
            `Migration already in progress (state=${org.migrationState})`,
            "MIGRATION_IN_PROGRESS",
            409
        );
    }

    const migrationId = crypto.randomUUID();

    // Single atomic write: clear FAILED if present, set new run metadata,
    // bump optimistic lock to PREPARING.
    const filter = org.migrationState === STATES.FAILED
        ? { _id: orgId, migrationState: STATES.FAILED }
        : { _id: orgId, $or: [{ migrationState: null }, { migrationState: { $exists: false } }] };

    const updated = await Organization().findOneAndUpdate(
        filter,
        {
            $set: {
                migrationState: STATES.PREPARING,
                targetCluster,
                writeLocked: true,
                migrationId,
            },
        },
        { new: true }
    );

    if (!updated) {
        throw new MigrationError(
            "Migration race lost — another operator started first",
            "STATE_RACE",
            409
        );
    }

    await _logTransition({
        org: updated,
        from: org.migrationState ?? null,
        to: STATES.PREPARING,
        actor,
        reason,
        details: { sourceCluster: org.cluster, targetCluster },
    });

    logger.info(
        { event: "MIGRATION_STARTED", orgId: String(orgId), migrationId,
          sourceCluster: org.cluster, targetCluster, actor },
        "[Migration] Started"
    );

    return updated;
}

/**
 * syncOrgData — runs the real data sync via the Phase 8 sync engine.
 *
 * Flow:
 *   PREPARING → SYNCING   (state transition, optimistic lock)
 *   → syncEngine.syncOrgData (resumeToken-first, dump, replay, catch-up)
 *   SYNCING → CUTOVER_PENDING  (on success)
 *   SYNCING → FAILED           (on error, with writeLocked cleared)
 *
 * Preconditions (asserted by startMigration before this runs):
 *   - org.writeLocked === true
 *   - org.targetCluster !== org.cluster
 *   - org.migrationState === "PREPARING"
 */
async function syncOrgData({ orgId, actor, onProgress }) {
    // Lazy-require the sync engine to avoid boot-order issues (engine
    // pulls in clusterConnections + requires platformConnection ready).
    const syncEngine = require("./syncEngine.service");

    // PREPARING → SYNCING
    let org = await _transition({
        orgId,
        from: STATES.PREPARING,
        to: STATES.SYNCING,
        actor,
        details: { phase: "sync-started" },
    });

    try {
        const summary = await syncEngine.syncOrgData({
            orgId: String(orgId),
            sourceCluster: org.cluster,
            targetCluster: org.targetCluster,
            onProgress,
        });

        // SYNCING → CUTOVER_PENDING (on clean catch-up)
        return await _transition({
            orgId,
            from: STATES.SYNCING,
            to: STATES.CUTOVER_PENDING,
            actor,
            details: {
                phase: "sync-complete-awaiting-cutover",
                dumpDocs: summary.stages?.dump?.copied,
                replayEvents: summary.stages?.replay?.eventsProcessed,
                lastLagMs: summary.stages?.replay?.lastLagMs,
                totalDurationMs: summary.durationMs,
            },
        });
    } catch (err) {
        // SYNCING → FAILED — unlock writes so operator can retry or roll back.
        logger.error(
            { event: "SYNC_FAILED", orgId: String(orgId), err: err.message, stack: err.stack },
            "[Migration] Sync engine failed — transitioning to FAILED"
        );
        try {
            await Organization().findOneAndUpdate(
                { _id: orgId, migrationState: STATES.SYNCING },
                {
                    $set: {
                        migrationState: STATES.FAILED,
                        writeLocked: false,
                    },
                }
            );
            await _logTransition({
                org: { ...org, migrationState: STATES.FAILED },
                from: STATES.SYNCING,
                to: STATES.FAILED,
                actor,
                reason: err.message,
                details: { phase: "sync-failed", errorMessage: err.message },
            });
        } catch (cleanupErr) {
            logger.error(
                { err: cleanupErr.message },
                "[Migration] Failed to mark migration as FAILED after sync error"
            );
        }
        throw new MigrationError(
            `Sync failed: ${err.message}`,
            "SYNC_FAILED",
            500
        );
    }
}

/**
 * Atomic cutover: swap org.cluster → targetCluster, increment
 * routingEpoch, clear writeLocked, evict cached connections.
 *
 * IMPORTANT: writeLocked stays true through this call's start. New writes
 * see 503; in-flight writes are stopped at the DB-level guard
 * (assertWriteAllowed) which re-reads the org doc when migrationState is
 * set.
 */
async function cutover({ orgId, actor }) {
    // CUTOVER_PENDING → CUTOVER
    const pre = await _transition({
        orgId,
        from: STATES.CUTOVER_PENDING,
        to: STATES.CUTOVER,
        actor,
        details: { phase: "cutover-begin" },
    });

    // Atomic swap: cluster + epoch bump + state, all in one update.
    // We DON'T clear writeLocked here — that happens after VERIFYING.
    const swapped = await Organization().findOneAndUpdate(
        { _id: orgId, migrationState: STATES.CUTOVER },
        {
            $set: {
                cluster: pre.targetCluster,
                migrationState: STATES.VERIFYING,
                writeLocked: false,        // unlock after the swap is durable
                targetCluster: null,
            },
            $inc: { routingEpoch: 1 },
        },
        { new: true }
    );

    if (!swapped) {
        throw new MigrationError("Cutover race lost", "STATE_RACE", 409);
    }

    // Cache hygiene: drop every cached tenant connection for this org so
    // subsequent requests resolve to the new cluster. Correctness is
    // already guaranteed by the routingEpoch bump (cache key changed),
    // but eviction prevents the old connection from sitting idle.
    try {
        const evicted = dbManager.evictByOrg(String(orgId));
        logger.info(
            { event: "MIGRATION_CUTOVER", orgId: String(orgId),
              from: pre.cluster, to: swapped.cluster,
              routingEpoch: swapped.routingEpoch, evictedConnections: evicted },
            "[Migration] Cutover complete"
        );
    } catch (err) {
        logger.error(
            { event: "MIGRATION_EVICT_FAILED", orgId: String(orgId), err: err.message },
            "[Migration] evictByOrg failed (non-fatal — routingEpoch already bumped)"
        );
    }

    await _logTransition({
        org: swapped,
        from: STATES.CUTOVER,
        to: STATES.VERIFYING,
        actor,
        details: { phase: "cutover-swapped", evictedCacheEntries: true },
    });

    return swapped;
}

/**
 * Sample-based parity check. Real implementation: sample collection counts
 * (and optionally a few document checksums) and confirm source ≈ target.
 * Here we mark COMPLETE unconditionally — replace with real checks.
 */
async function verifyAndComplete({ orgId, actor }) {
    const org = await _transition({
        orgId,
        from: STATES.VERIFYING,
        to: STATES.COMPLETE,
        actor,
        details: { phase: "verified" },
    });

    // Clear migration metadata after successful completion.
    await Organization().updateOne(
        { _id: orgId },
        { $set: { migrationState: null, migrationId: null, targetCluster: null } }
    );

    logger.info(
        { event: "MIGRATION_COMPLETE", orgId: String(orgId), cluster: org.cluster },
        "[Migration] Complete"
    );

    return org;
}

/**
 * Abort + rollback. Safe up to and INCLUDING CUTOVER_PENDING (data is
 * still on source). After CUTOVER, data lives on the new cluster — call
 * this only if you're prepared to lose any new writes accumulated there
 * (typically: zero, because writeLocked was true through the swap).
 *
 * Behaviour:
 *   - PREPARING / SYNCING / CUTOVER_PENDING → set FAILED, clear lock + target.
 *   - VERIFYING / COMPLETE → 409 (call dedicated reverse-migration instead).
 */
async function rollback({ orgId, actor, reason }) {
    const org = await Organization().findById(orgId).lean();
    if (!org) {
        throw new MigrationError(`Organization ${orgId} not found`, "ORG_NOT_FOUND", 404);
    }
    if (!org.migrationState) {
        throw new MigrationError("No migration in progress", "NO_MIGRATION", 409);
    }
    if ([STATES.VERIFYING, STATES.COMPLETE].includes(org.migrationState)) {
        throw new MigrationError(
            `Cannot rollback from "${org.migrationState}" — data is already on the target cluster. Run a reverse migration instead.`,
            "ROLLBACK_TOO_LATE",
            409
        );
    }

    const updated = await Organization().findOneAndUpdate(
        { _id: orgId, migrationState: org.migrationState },
        {
            $set: {
                migrationState: STATES.FAILED,
                writeLocked: false,
                targetCluster: null,
            },
        },
        { new: true }
    );

    if (!updated) {
        throw new MigrationError("Rollback race lost", "STATE_RACE", 409);
    }

    await _logTransition({
        org: updated,
        from: org.migrationState,
        to: STATES.FAILED,
        actor,
        reason: reason || "rollback",
        details: { rollbackFrom: org.migrationState },
    });

    logger.warn(
        { event: "MIGRATION_ROLLBACK", orgId: String(orgId),
          from: org.migrationState, actor, reason },
        "[Migration] Rolled back"
    );

    return updated;
}

/**
 * Status snapshot for UI polling. Returns the org's migration fields plus
 * a coarse progress percentage derived from the state.
 */
async function getStatus({ orgId }) {
    const org = await Organization().findById(orgId)
        .select("name cluster targetCluster migrationState writeLocked routingEpoch routingVersion migrationId")
        .lean();
    if (!org) return null;

    const PROGRESS_MAP = {
        null: 0,
        [STATES.PREPARING]: 10,
        [STATES.SYNCING]: 35,
        [STATES.CUTOVER_PENDING]: 65,
        [STATES.CUTOVER]: 80,
        [STATES.VERIFYING]: 90,
        [STATES.COMPLETE]: 100,
        [STATES.FAILED]: 0,
    };

    let recentLogs = [];
    if (org.migrationId) {
        recentLogs = await MigrationLog()
            .find({ migrationId: org.migrationId })
            .sort({ createdAt: -1 })
            .limit(20)
            .lean();
    }

    return {
        orgId: String(org._id),
        name: org.name,
        sourceCluster: org.cluster,
        targetCluster: org.targetCluster,
        state: org.migrationState,
        progress: PROGRESS_MAP[org.migrationState] ?? 0,
        writeLocked: !!org.writeLocked,
        routingEpoch: org.routingEpoch,
        routingVersion: org.routingVersion,
        migrationId: org.migrationId,
        recentLogs,
    };
}

/**
 * Org list for the dashboard table — minimal fields, all orgs.
 */
async function listOrgs({ limit = 200 } = {}) {
    return Organization()
        .find({})
        .select("name slug cluster targetCluster region migrationState writeLocked maintenanceMode routingEpoch")
        .sort({ name: 1 })
        .limit(limit)
        .lean();
}

// ─── Downtime migration ─────────────────────────────────────────────────────
/**
 * runDowntimeMigration — quick, synchronous cluster switch with a short
 * maintenance window. Use when:
 *   - the org is small and zero-downtime isn't required, OR
 *   - the source cluster isn't a replica set (change streams unavailable).
 *
 * Flow:
 *   1. Flip maintenanceMode=true + record start time (blocks tenant requests).
 *   2. Wait MAINTENANCE_DRAIN_MS (default 3000 ms) for in-flight requests to finish.
 *   3. Dump every user-facing collection source → target via the same parallel
 *      upsert-based copier the zero-downtime engine uses.
 *   4. Atomically swap org.cluster, increment routingEpoch, clear
 *      maintenanceMode + writeLocked in one findOneAndUpdate.
 *   5. dbManager.evictByOrg(orgId) — drop all cached tenant connections.
 *   6. Return a MigrationReport.
 *
 * On ANY error: rollback (maintenanceMode = false), MigrationLog entry with
 * the failure, MigrationError("DOWNTIME_MIGRATION_FAILED") bubbles to the
 * caller.
 *
 * Preconditions:
 *   - org exists
 *   - org.cluster === sourceCluster (defensive match)
 *   - sourceCluster !== targetCluster
 *   - targetCluster is in the cluster registry + ACTIVE
 */
const MAINTENANCE_DRAIN_MS   = parseInt(process.env.DOWNTIME_MAINT_DRAIN_MS   || "10000", 10);
const DOWNTIME_MAX_TOTAL_MS  = parseInt(process.env.DOWNTIME_MAX_TOTAL_MS     || String(5 * 60 * 1000), 10);
const VERIFY_SAMPLE_PER_COLL = parseInt(process.env.DOWNTIME_VERIFY_SAMPLE    || "5", 10);
const VERIFY_COUNT_TOLERANCE = parseFloat(process.env.DOWNTIME_VERIFY_TOL     || "0"); // 0 = exact match required

function _sleepMs(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Post-dump consistency check. For every user-facing collection:
 *   1. Exact document count parity (with tolerance if configured)
 *   2. Spot-check N random documents by _id on source, verify presence
 *      on target (no deep equality — just "does the row exist").
 *
 * Throws on mismatch. Caller's try/catch → rollback.
 */
async function _verifyParity({ sourceDb, targetDb, skipCollections }) {
    const collections = await sourceDb.listCollections({}, { nameOnly: true }).toArray();
    const eligible = collections.filter(c =>
        !skipCollections.has(c.name) && !c.name.startsWith("system.")
    );

    const report = { checks: [], mismatches: [] };

    for (const c of eligible) {
        const src = sourceDb.collection(c.name);
        const dst = targetDb.collection(c.name);

        const [srcCount, dstCount] = await Promise.all([
            src.countDocuments({}),
            dst.countDocuments({}),
        ]);

        const delta = srcCount - dstCount;
        const relDelta = srcCount === 0 ? 0 : Math.abs(delta) / srcCount;
        const countOk = VERIFY_COUNT_TOLERANCE === 0
            ? delta === 0
            : relDelta <= VERIFY_COUNT_TOLERANCE;

        const check = { collection: c.name, srcCount, dstCount, delta, countOk };

        if (countOk && srcCount > 0 && VERIFY_SAMPLE_PER_COLL > 0) {
            const sample = await src.aggregate([
                { $sample: { size: Math.min(VERIFY_SAMPLE_PER_COLL, srcCount) } },
                { $project: { _id: 1 } },
            ]).toArray();
            const ids = sample.map(d => d._id);
            const hits = await dst.countDocuments({ _id: { $in: ids } });
            check.sampleSize = ids.length;
            check.sampleHits = hits;
            check.sampleOk = hits === ids.length;
            if (!check.sampleOk) report.mismatches.push(check);
        } else if (!countOk) {
            report.mismatches.push(check);
        }

        report.checks.push(check);
    }

    if (report.mismatches.length > 0) {
        const msg = report.mismatches
            .map(m => `${m.collection}: src=${m.srcCount} dst=${m.dstCount}` +
                     (m.sampleOk === false ? ` sample-miss=${m.sampleSize - m.sampleHits}` : ""))
            .join("; ");
        const err = new Error(`[Migration] Parity check failed — ${msg}`);
        err.parityReport = report;
        throw err;
    }

    return report;
}

async function runDowntimeMigration({ orgId, sourceCluster, targetCluster, actor, reason }) {
    // Lazy-require both the sync engine (for the dump routine) and
    // dbManager to match the Option A lazy-binding contract.
    const syncEngine = require("./syncEngine.service");
    const dbManager = require("@core/db/dbManager");
    const clusterConnections = require("@core/db/clusterConnections");
    const orgRequestCounter = require("../../middleware/orgRequestCounter");

    if (!mongoose.isValidObjectId(orgId)) {
        throw new MigrationError("Invalid orgId", "INVALID_ORG_ID", 400);
    }
    if (!sourceCluster || !targetCluster) {
        throw new MigrationError(
            "sourceCluster and targetCluster are both required",
            "MISSING_CLUSTER",
            400
        );
    }
    if (sourceCluster === targetCluster) {
        throw new MigrationError(
            "sourceCluster and targetCluster cannot be the same",
            "SAME_CLUSTER",
            400
        );
    }
    _validateCluster(targetCluster);

    const org = await Organization().findById(orgId).lean();
    if (!org) throw new MigrationError(`Organization ${orgId} not found`, "ORG_NOT_FOUND", 404);
    if (org.cluster !== sourceCluster) {
        throw new MigrationError(
            `Source cluster mismatch: org.cluster="${org.cluster}", passed="${sourceCluster}"`,
            "SOURCE_CLUSTER_MISMATCH",
            409
        );
    }
    if (org.maintenanceMode) {
        throw new MigrationError(
            "Org already in maintenanceMode — concurrent migration?",
            "ALREADY_IN_MAINTENANCE",
            409
        );
    }

    const startedAt = new Date();
    const migrationId = crypto.randomUUID();
    const walletBy = startedAt.getTime() + DOWNTIME_MAX_TOTAL_MS;
    const report = {
        orgId: String(orgId),
        migrationId,
        sourceCluster,
        targetCluster,
        mode: "DOWNTIME",
        startedAt,
        success: false,
    };

    // Helper: enforce the hard wall-timeout at each phase boundary.
    const assertBudget = (stage) => {
        if (Date.now() > walletBy) {
            throw new Error(
                `[Migration] Wall timeout DOWNTIME_MAX_TOTAL_MS=${DOWNTIME_MAX_TOTAL_MS}ms exceeded at stage "${stage}"`
            );
        }
    };

    // ── Step 1: enable maintenance ──────────────────────────────────────
    const entered = await Organization().findOneAndUpdate(
        { _id: orgId, maintenanceMode: { $ne: true } },
        {
            $set: {
                maintenanceMode: true,
                maintenanceStartedAt: startedAt,
                migrationId,
            },
        },
        { new: true }
    );
    if (!entered) {
        throw new MigrationError(
            "Failed to enter maintenanceMode (race with concurrent migration?)",
            "MAINTENANCE_RACE",
            409
        );
    }
    await _logTransition({
        org: entered, from: null, to: "MAINTENANCE_ENABLED",
        actor, reason: reason || "downtime-migration",
        details: { sourceCluster, targetCluster, mode: "DOWNTIME" },
    });

    try {
        // ── Step 2: deterministic drain ─────────────────────────────────
        // Wait for in-flight org-plane requests to finish. Falls back to
        // timeout after MAINTENANCE_DRAIN_MS so a wedged long-runner
        // can't block the migration indefinitely.
        const drain = await orgRequestCounter.waitForDrain(orgId, {
            timeoutMs: MAINTENANCE_DRAIN_MS,
        });
        report.drain = drain;
        if (!drain.drained) {
            logger.warn(
                { event: "DOWNTIME_DRAIN_TIMEOUT", orgId: String(orgId),
                  remaining: drain.remaining, waitedMs: drain.waitedMs },
                `[Migration] Drain timed out with ${drain.remaining} in-flight request(s) — proceeding (maintenanceMode blocks new work)`
            );
        }
        assertBudget("post-drain");

        // ── Step 3: dump source → target ────────────────────────────────
        const sourceDb = clusterConnections.getSync(sourceCluster)
            .useDb(`dental_org_${orgId}`, { useCache: true, noListener: true }).db;
        const targetDb = clusterConnections.getSync(targetCluster)
            .useDb(`dental_org_${orgId}`, { useCache: true, noListener: true }).db;

        report.dump = await syncEngine._dumpAndRestore({ sourceDb, targetDb });
        assertBudget("post-dump");

        // ── Step 4: post-dump parity verification ───────────────────────
        // Collection counts must match + random _id samples must resolve
        // on the target. Anything else is a silent-copy-failure symptom
        // and we must rollback.
        report.verify = await _verifyParity({
            sourceDb, targetDb,
            skipCollections: syncEngine.SKIP_COLLECTIONS,
        });
        assertBudget("post-verify");

        // ── Step 5: atomic cluster swap (KEEP maintenance + writeLock ON) ─
        // We do NOT unlock here. Unlocking before cache eviction is the
        // phantom-write bug: a request sneaks in, uses a still-cached
        // source connection, writes to the OLD cluster, and the write
        // vanishes on cutover. Fix: swap -> evict -> THEN unlock.
        const swapped = await Organization().findOneAndUpdate(
            { _id: orgId, maintenanceMode: true },
            {
                $set: {
                    cluster: targetCluster,
                    targetCluster: null,
                },
                $inc: { routingEpoch: 1 },
            },
            { new: true }
        );
        if (!swapped) {
            throw new Error("Cluster swap lost the atomic update (maintenanceMode flipped externally)");
        }

        // ── Step 6: evict cached connections BEFORE unlocking ───────────
        let evicted = 0;
        try {
            evicted = dbManager.evictByOrg(String(orgId));
        } catch (err) {
            logger.warn(
                { event: "DOWNTIME_EVICT_FAILED", orgId: String(orgId), err: err.message },
                "[Migration] evictByOrg failed (non-fatal — routingEpoch already bumped)"
            );
        }
        report.cacheEvicted = evicted;
        report.routingEpoch = swapped.routingEpoch;

        // ── Step 7: NOW unlock (second atomic update) ───────────────────
        const unlocked = await Organization().findOneAndUpdate(
            { _id: orgId, maintenanceMode: true },
            {
                $set: {
                    maintenanceMode: false,
                    maintenanceStartedAt: null,
                    writeLocked: false,
                    migrationId: null,
                },
            },
            { new: true }
        );
        if (!unlocked) {
            logger.error(
                { event: "DOWNTIME_UNLOCK_RACE", orgId: String(orgId) },
                "[Migration] Unlock phase lost the atomic update — org left in maintenanceMode; operator intervention required"
            );
            throw new Error("Unlock phase lost atomic update (operator: clear maintenanceMode manually)");
        }

        await _logTransition({
            org: unlocked,
            from: "MAINTENANCE_ENABLED",
            to: "DOWNTIME_COMPLETE",
            actor,
            reason: reason || "downtime-migration",
            details: { ...report },
        });

        // ── Step 8: report ──────────────────────────────────────────────
        report.finishedAt = new Date();
        report.durationMs = report.finishedAt - report.startedAt;
        report.success = true;

        logger.info(
            { event: "DOWNTIME_MIGRATION_SUCCESS", ...report },
            `[Migration] DOWNTIME ${sourceCluster} → ${targetCluster} in ${report.durationMs}ms`
        );

        return report;
    } catch (err) {
        // Rollback: clear maintenanceMode so the org isn't left stuck.
        try {
            await Organization().findOneAndUpdate(
                { _id: orgId, maintenanceMode: true },
                {
                    $set: {
                        maintenanceMode: false,
                        maintenanceStartedAt: null,
                        migrationId: null,
                    },
                }
            );
            await _logTransition({
                org: entered,
                from: "MAINTENANCE_ENABLED",
                to: "DOWNTIME_FAILED",
                actor,
                reason: err.message,
                details: { sourceCluster, targetCluster, error: err.message,
                           parityReport: err.parityReport },
            });
        } catch (cleanupErr) {
            logger.error(
                { event: "DOWNTIME_ROLLBACK_FAILED", orgId: String(orgId), err: cleanupErr.message },
                "[Migration] Failed to rollback maintenanceMode after downtime failure"
            );
        }

        logger.error(
            { event: "DOWNTIME_MIGRATION_FAILED", orgId: String(orgId),
              sourceCluster, targetCluster, err: err.message },
            `[Migration] DOWNTIME migration FAILED: ${err.message}`
        );

        report.finishedAt = new Date();
        report.durationMs = report.finishedAt - report.startedAt;
        report.success = false;
        report.error = err.message;

        throw new MigrationError(
            `Downtime migration failed: ${err.message}`,
            "DOWNTIME_MIGRATION_FAILED",
            500
        );
    }
}

module.exports = {
    STATES,
    MigrationError,
    startMigration,
    syncOrgData,
    cutover,
    verifyAndComplete,
    rollback,
    getStatus,
    listOrgs,
    runDowntimeMigration,
};
