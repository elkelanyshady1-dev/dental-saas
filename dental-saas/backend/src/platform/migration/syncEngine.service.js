/**
 * syncEngine.service.js — Phase 8 Zero-Downtime Sync Engine
 *
 * CRITICAL ORDERING (do NOT reorder — correctness depends on this):
 *
 *   1. Resolve source + target tenant connections
 *   2. Open a change stream on the SOURCE and capture the initial resumeToken
 *      BEFORE doing anything else. This is the one step that's non-negotiable:
 *      any event that happens after this token will be delivered to the
 *      replay stream. Any event that happens BEFORE this token will be in
 *      the dump. No gap. No duplicate (applier is idempotent).
 *   3. Dump every user-facing collection from source → target. Replay is
 *      idempotent, so dumping + replaying the same document is safe.
 *   4. Open a NEW change stream with `startAfter: savedToken` and replay
 *      every event to the target until "caught up" (no new events for
 *      CATCHUP_IDLE_MS AND live-lag < MAX_LAG_MS).
 *   5. Close the replay stream. Return success. Migration service flips
 *      SYNCING → CUTOVER_PENDING.
 *
 * This is safe to call multiple times on the same org — resuming after a
 * failed run is the normal recovery path. The applier uses upsert for
 * inserts so overlap between dump and replay is harmless.
 *
 * PREREQUISITES:
 *   - Source AND target clusters must support change streams (= replica set
 *     or sharded deployment). Single-node mongod will fail at step 2 with
 *     a clear error.
 *   - org.writeLocked MUST be true at entry. The migration service sets
 *     this in startMigration(); we assert it here so the engine never
 *     silently copies a live, mutating DB when it thinks writes are frozen.
 *   - Target per-org DB is either empty or contains a partial prior run.
 *     Partial runs are safe — dump inserts are upserts.
 *
 * PLANE: Platform. Runs from the migration worker / admin endpoint.
 */

"use strict";

const getPlatformModel = require("@core/db/getPlatformModel");
const clusterConnections = require("@core/db/clusterConnections");
const logger = require("@utils/logger");

const OrganizationDef = require("@shared/models/Organization");
const MigrationLogDef = require("../domain/models/MigrationLog.model");
const { applyChange } = require("./changeApplier");

// Lazy bindings — platformConnection is initialised by boot, but this file
// can be required at any point in the boot sequence.
function Organization() { return getPlatformModel(OrganizationDef); }
function MigrationLog() { return getPlatformModel(MigrationLogDef); }

// ─── Tunables (env-overrideable) ────────────────────────────────────────────

const DUMP_BATCH_SIZE     = parseInt(process.env.SYNC_DUMP_BATCH_SIZE     || "500", 10);
const CATCHUP_IDLE_MS     = parseInt(process.env.SYNC_CATCHUP_IDLE_MS     || "2000", 10);
const MAX_LAG_MS          = parseInt(process.env.SYNC_MAX_LAG_MS          || "1500", 10);
const MAX_REPLAY_WALL_MS  = parseInt(process.env.SYNC_MAX_REPLAY_WALL_MS  || String(30 * 60 * 1000), 10);
const LOG_EVERY_N_EVENTS  = parseInt(process.env.SYNC_LOG_EVERY_N_EVENTS  || "500", 10);

// Collections that are noisy + ephemeral and should NOT be dumped/replayed.
// Sessions, idempotency keys, rate-limit rows — all are short-lived or live
// on the shared/platform planes, not the tenant. But if an operator has
// placed such a collection in a tenant DB, we skip it here defensively.
const SKIP_COLLECTIONS = new Set([
    "sessions",
    "idempotencykeys",
    "ratelimitentries",
    "system.views",
    "system.indexes",
    "system.profile",
]);

// ─── Helpers ────────────────────────────────────────────────────────────────

function _tenantDb(clusterKey, orgId) {
    // clusterConnections.getSync() returns the shared cluster root connection.
    // .useDb() gives us the per-org database off it.
    const root = clusterConnections.getSync(clusterKey);
    return root.useDb(`dental_org_${orgId}`, { useCache: true, noListener: true });
}

async function _logProgress({ orgId, migrationId, stage, details }) {
    try {
        await MigrationLog().create({
            migrationId,
            organizationId: orgId,
            from: "SYNCING",
            to: "SYNCING",
            sourceCluster: details?.sourceCluster || "?",
            targetCluster: details?.targetCluster || "?",
            actor: "syncEngine",
            reason: `sync:${stage}`,
            details,
        });
    } catch (err) {
        logger.warn(
            { event: "SYNC_PROGRESS_LOG_FAILED", orgId: String(orgId), stage, err: err.message },
            "[SyncEngine] Progress log write failed (non-fatal)"
        );
    }
}

function _nowMs() { return Date.now(); }

// ─── Step 2: Capture resume token ───────────────────────────────────────────
/**
 * Open a probe change stream just long enough to capture the initial
 * resumeToken, then close it. The token represents the position in the
 * oplog; any subsequent write is guaranteed to appear when we later open
 * a stream with `startAfter: token`.
 *
 * If the deployment isn't a replica set we fail fast with a clear error.
 */
async function _captureInitialResumeToken(sourceDb) {
    let cs;
    try {
        cs = sourceDb.watch([], { fullDocument: "updateLookup" });
    } catch (err) {
        throw new Error(
            `[SyncEngine] Failed to open change stream on source DB — ` +
            `the source cluster must be a replica set or sharded deployment. ` +
            `Original error: ${err.message}`
        );
    }
    // On Mongo ≥ 4.2, resumeToken is available as soon as the stream opens.
    // If null here we wait briefly for the first post-batch token.
    let token = cs.resumeToken;
    if (!token) {
        // 1s window — if nothing's available we fail cleanly.
        const got = await Promise.race([
            new Promise((resolve) => {
                const check = setInterval(() => {
                    if (cs.resumeToken) {
                        clearInterval(check);
                        resolve(cs.resumeToken);
                    }
                }, 50);
                // Bail after 1s
                setTimeout(() => { clearInterval(check); resolve(null); }, 1000);
            }),
        ]);
        token = got;
    }
    try { await cs.close(); } catch (_) { /* best-effort */ }
    if (!token) {
        throw new Error("[SyncEngine] Could not obtain initial resumeToken from source change stream");
    }
    return token;
}

// ─── Step 3: Dump source → Step 4: Restore into target ──────────────────────
/**
 * Programmatic dump-and-restore: stream every document from every
 * user-facing collection into the target DB. Uses updateOne with upsert
 * so re-runs are idempotent.
 *
 * Returns per-collection stats: { [collName]: { copied, skipped } }.
 */
async function _dumpAndRestore({ sourceDb, targetDb, onProgress }) {
    const collections = await sourceDb.listCollections({}, { nameOnly: true }).toArray();
    const stats = {};
    let totalDocs = 0;
    const startedAt = _nowMs();

    // Pass 1: count totals upfront for progress reporting. Cheap — metadata only.
    const totals = {};
    for (const c of collections) {
        if (SKIP_COLLECTIONS.has(c.name) || c.name.startsWith("system.")) continue;
        try {
            totals[c.name] = await sourceDb.collection(c.name).estimatedDocumentCount();
            totalDocs += totals[c.name];
        } catch (_) {
            totals[c.name] = 0;
        }
    }

    let copiedOverall = 0;

    for (const c of collections) {
        if (SKIP_COLLECTIONS.has(c.name) || c.name.startsWith("system.")) continue;

        const srcCol = sourceDb.collection(c.name);
        const dstCol = targetDb.collection(c.name);
        let copied = 0;
        let batch = [];

        const cursor = srcCol.find({}, { noCursorTimeout: false });
        for await (const doc of cursor) {
            batch.push(doc);
            if (batch.length >= DUMP_BATCH_SIZE) {
                await _flushBatch(dstCol, batch);
                copied += batch.length;
                copiedOverall += batch.length;
                batch = [];
                if (onProgress) {
                    onProgress({
                        stage: "DUMP",
                        progress: totalDocs > 0 ? Math.round((copiedOverall / totalDocs) * 100) : 0,
                        collection: c.name,
                        copiedSoFar: copiedOverall,
                        total: totalDocs,
                    });
                }
            }
        }
        if (batch.length) {
            await _flushBatch(dstCol, batch);
            copied += batch.length;
            copiedOverall += batch.length;
            batch = [];
            if (onProgress) {
                onProgress({
                    stage: "DUMP",
                    progress: totalDocs > 0 ? Math.round((copiedOverall / totalDocs) * 100) : 0,
                    collection: c.name,
                    copiedSoFar: copiedOverall,
                    total: totalDocs,
                });
            }
        }
        stats[c.name] = { copied };
    }

    return {
        stats,
        totalDocs,
        copied: copiedOverall,
        durationMs: _nowMs() - startedAt,
    };
}

async function _flushBatch(dstCol, docs) {
    if (!docs.length) return;
    // bulkWrite with upsert semantics so partial prior runs don't trip
    // duplicate-key errors on retry.
    const ops = docs.map((d) => ({
        updateOne: {
            filter: { _id: d._id },
            update: { $set: d },
            upsert: true,
        },
    }));
    await dstCol.bulkWrite(ops, { ordered: false });
}

// ─── Step 5: Replay change stream → catch-up ────────────────────────────────
/**
 * Open a change stream on the source, starting from `resumeToken`, and
 * apply every event to the target until caught up.
 *
 * Catch-up signal:
 *   - No new events for CATCHUP_IDLE_MS consecutive milliseconds, AND
 *   - live-lag (wallclock − event.clusterTime) < MAX_LAG_MS on the last
 *     event we did see.
 *
 * If the stream emits an `invalidate` event (collection drop / rename)
 * we bail with a clear error — the caller must start over.
 *
 * Hard wall: MAX_REPLAY_WALL_MS. If we haven't caught up by then,
 * something is wrong (massive write volume, dead stream, etc.) and the
 * caller should retry.
 */
async function _replayUntilCaughtUp({ sourceDb, targetDb, startToken, onProgress, migrationContext }) {
    const startedAt = _nowMs();
    let eventsProcessed = 0;
    let lastEventAt = _nowMs();
    let lastLagMs = 0;
    let lastToken = startToken;

    const cs = sourceDb.watch([], {
        startAfter: startToken,
        fullDocument: "updateLookup",
    });

    // Promise that resolves when we detect catch-up, rejects on error.
    const result = await new Promise((resolve, reject) => {
        let idleTimer = null;
        let watchdog = null;
        let finished = false;

        const finish = async (outcome, err) => {
            if (finished) return;
            finished = true;
            if (idleTimer) clearInterval(idleTimer);
            if (watchdog) clearTimeout(watchdog);
            try { await cs.close(); } catch (_) { /* best-effort */ }
            if (err) reject(err);
            else resolve(outcome);
        };

        cs.on("change", async (change) => {
            try {
                if (change.operationType === "invalidate") {
                    return finish(
                        null,
                        new Error("[SyncEngine] Change stream invalidated (drop/rename). Abort and retry.")
                    );
                }
                const res = await applyChange(targetDb, change);
                eventsProcessed++;
                lastEventAt = _nowMs();
                lastToken = change._id || cs.resumeToken || lastToken;

                // Compute live-lag: clusterTime is a BSON Timestamp.
                // High bits = seconds since epoch.
                if (change.clusterTime?.high) {
                    const seconds = change.clusterTime.high;
                    lastLagMs = _nowMs() - seconds * 1000;
                }

                if (eventsProcessed % LOG_EVERY_N_EVENTS === 0) {
                    logger.debug(
                        {
                            event: "SYNC_REPLAY_PROGRESS",
                            orgId: migrationContext?.orgId,
                            eventsProcessed,
                            lagMs: lastLagMs,
                            lastOp: res.op,
                        },
                        `[SyncEngine] Replayed ${eventsProcessed} events (lag=${lastLagMs}ms)`
                    );
                }
                if (onProgress) {
                    onProgress({
                        stage: "REPLAY",
                        eventsProcessed,
                        lagMs: lastLagMs,
                        lastOp: res.op,
                        lastNs: res.ns,
                    });
                }
            } catch (err) {
                await finish(null, err);
            }
        });

        cs.on("error", async (err) => { await finish(null, err); });
        cs.on("close", () => { if (!finished) finish({ reason: "stream-closed" }); });

        // Periodic catch-up probe: if the stream has been idle ≥ CATCHUP_IDLE_MS
        // AND our last measured lag is under MAX_LAG_MS, we've caught up.
        // (If lag is high, the source is still writing quickly — keep waiting.)
        idleTimer = setInterval(() => {
            const idleFor = _nowMs() - lastEventAt;
            if (idleFor >= CATCHUP_IDLE_MS && lastLagMs < MAX_LAG_MS) {
                finish({
                    reason: "caught-up",
                    eventsProcessed,
                    lastLagMs,
                    idleMs: idleFor,
                });
            }
        }, Math.max(200, Math.floor(CATCHUP_IDLE_MS / 4)));

        // Hard wall.
        watchdog = setTimeout(() => {
            finish(
                null,
                new Error(
                    `[SyncEngine] Replay did not catch up within ${MAX_REPLAY_WALL_MS}ms ` +
                    `(events=${eventsProcessed}, lag=${lastLagMs}ms)`
                )
            );
        }, MAX_REPLAY_WALL_MS);
        watchdog.unref?.();
    });

    return {
        eventsProcessed,
        lastLagMs,
        durationMs: _nowMs() - startedAt,
        lastToken,
        ...result,
    };
}

// ─── Public API ─────────────────────────────────────────────────────────────

/**
 * syncOrgData
 * Orchestrates the full sync: resumeToken → dump → replay → caught up.
 *
 * @param {object} params
 * @param {string} params.orgId
 * @param {string} params.sourceCluster
 * @param {string} params.targetCluster
 * @param {function} [params.onProgress] — called with { stage, progress?, ... }
 * @returns {Promise<object>} summary — dump + replay stats, savedToken, etc.
 */
async function syncOrgData({ orgId, sourceCluster, targetCluster, onProgress }) {
    if (!orgId || !sourceCluster || !targetCluster) {
        throw new Error("[SyncEngine] orgId, sourceCluster, targetCluster are all required");
    }
    if (sourceCluster === targetCluster) {
        throw new Error("[SyncEngine] source and target clusters cannot be the same");
    }

    // Defensive check: org MUST be writeLocked before we touch its data.
    const org = await Organization().findById(orgId)
        .select("_id writeLocked migrationState migrationId cluster targetCluster")
        .lean();
    if (!org) throw new Error(`[SyncEngine] Org ${orgId} not found`);
    if (!org.writeLocked) {
        throw new Error(
            `[SyncEngine] Refusing to sync: org.writeLocked is false. ` +
            `Migration service must set writeLocked=true before calling the engine.`
        );
    }
    if (org.cluster !== sourceCluster) {
        throw new Error(
            `[SyncEngine] Source cluster mismatch: org.cluster="${org.cluster}", ` +
            `caller passed sourceCluster="${sourceCluster}"`
        );
    }

    const migrationContext = {
        orgId: String(orgId),
        migrationId: org.migrationId,
        sourceCluster,
        targetCluster,
    };

    const summary = {
        orgId: String(orgId),
        sourceCluster,
        targetCluster,
        startedAt: new Date(),
        stages: {},
    };

    const emit = (evt) => {
        try { onProgress?.(evt); } catch (_) { /* subscriber errors are non-fatal */ }
    };

    // Step 1: resolve per-org DB on both clusters.
    const sourceDb = _tenantDb(sourceCluster, orgId).db;
    const targetDb = _tenantDb(targetCluster, orgId).db;

    logger.info(
        { event: "SYNC_STARTED", ...migrationContext },
        `[SyncEngine] START orgId=${orgId} ${sourceCluster} → ${targetCluster}`
    );

    // Step 2: CAPTURE RESUME TOKEN FIRST — the critical ordering invariant.
    emit({ stage: "TOKEN", progress: 1 });
    const resumeToken = await _captureInitialResumeToken(sourceDb);
    summary.stages.token = { capturedAt: new Date() };
    await _logProgress({
        orgId, migrationId: org.migrationId, stage: "token-captured",
        details: { ...migrationContext },
    });

    // Step 3 + 4: dump source → restore target.
    emit({ stage: "DUMP", progress: 5 });
    const dumpStats = await _dumpAndRestore({
        sourceDb, targetDb,
        onProgress: emit,
    });
    summary.stages.dump = dumpStats;
    logger.info(
        {
            event: "SYNC_DUMP_COMPLETE",
            ...migrationContext,
            copied: dumpStats.copied,
            durationMs: dumpStats.durationMs,
        },
        `[SyncEngine] DUMP complete: copied ${dumpStats.copied} docs in ${dumpStats.durationMs}ms`
    );
    await _logProgress({
        orgId, migrationId: org.migrationId, stage: "dump-complete",
        details: { copied: dumpStats.copied, durationMs: dumpStats.durationMs, ...migrationContext },
    });

    // Step 5: replay change stream from saved token until caught up.
    emit({ stage: "REPLAY", progress: 75 });
    const replayStats = await _replayUntilCaughtUp({
        sourceDb, targetDb,
        startToken: resumeToken,
        onProgress: emit,
        migrationContext,
    });
    summary.stages.replay = replayStats;
    logger.info(
        {
            event: "SYNC_REPLAY_COMPLETE",
            ...migrationContext,
            events: replayStats.eventsProcessed,
            durationMs: replayStats.durationMs,
            lagMs: replayStats.lastLagMs,
        },
        `[SyncEngine] REPLAY caught up: ${replayStats.eventsProcessed} events, lag=${replayStats.lastLagMs}ms`
    );
    await _logProgress({
        orgId, migrationId: org.migrationId, stage: "replay-complete",
        details: {
            events: replayStats.eventsProcessed,
            lagMs: replayStats.lastLagMs,
            durationMs: replayStats.durationMs,
            ...migrationContext,
        },
    });

    summary.completedAt = new Date();
    summary.durationMs = summary.completedAt - summary.startedAt;

    emit({ stage: "SYNCED", progress: 100 });
    return summary;
}

module.exports = {
    syncOrgData,
    // Exported for tests / reuse:
    _captureInitialResumeToken,
    _dumpAndRestore,
    _replayUntilCaughtUp,
    SKIP_COLLECTIONS,
};
