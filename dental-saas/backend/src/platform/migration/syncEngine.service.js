/**
 * syncEngine.service.js — Phase 8 Zero-Downtime Sync Engine
 *
 * v2 (post-review hardening):
 *   • Replay loop uses cs.tryNext() — no listener re-entry possible.
 *   • Catch-up is now token-based: we probe the source's latest
 *     clusterTime via { hello: 1 } and refuse to stop replaying until
 *     our last-applied event's clusterTime is ≥ source's clusterTime.
 *     The idle-ms heuristic is retained as a FLOOR (must be idle for at
 *     least CATCHUP_IDLE_MS) but is no longer the ceiling.
 *   • Dump phase runs collections in parallel (capped) for speed.
 *   • `invalidate` surfaces as a fatal ChangeStreamInvalidatedError —
 *     caller must retry from a fresh resumeToken.
 *   • Returns a formal MigrationReport object.
 *
 * CRITICAL ORDERING (do NOT reorder — correctness depends on this):
 *
 *   1. Resolve source + target tenant connections.
 *   2. Open a change stream on SOURCE and capture the initial resumeToken
 *      BEFORE anything else. Any event after this token is guaranteed to
 *      appear when we later open a stream with `startAfter: token`.
 *   3. Dump every user-facing collection (parallel, upsert, idempotent).
 *   4. Open a NEW change stream with `startAfter: savedToken` and apply
 *      every event until TOKEN-BASED convergence + minimum idle time.
 *   5. Return MigrationReport. Migration service flips
 *      SYNCING → CUTOVER_PENDING.
 *
 * PLANE: Platform. Runs from the migration worker / admin endpoint.
 */

"use strict";

const getPlatformModel = require("@core/db/getPlatformModel");
const clusterConnections = require("@core/db/clusterConnections");
const logger = require("@utils/logger");

const OrganizationDef = require("@shared/models/Organization");
const MigrationLogDef = require("../domain/models/MigrationLog.model");
const { applyChange, ChangeStreamInvalidatedError } = require("./changeApplier");

// Lazy bindings — platformConnection is initialised by boot, but this
// module may be required at any point in the boot sequence.
function Organization() { return getPlatformModel(OrganizationDef); }
function MigrationLog() { return getPlatformModel(MigrationLogDef); }

// ─── Tunables (env-overrideable) ────────────────────────────────────────────

const DUMP_BATCH_SIZE      = parseInt(process.env.SYNC_DUMP_BATCH_SIZE      || "500", 10);
const DUMP_PARALLELISM     = parseInt(process.env.SYNC_DUMP_PARALLELISM     || "4", 10);
const CATCHUP_IDLE_MS      = parseInt(process.env.SYNC_CATCHUP_IDLE_MS      || "2000", 10);
const CATCHUP_PROBE_MS     = parseInt(process.env.SYNC_CATCHUP_PROBE_MS     || "1000", 10);
const MAX_REPLAY_WALL_MS   = parseInt(process.env.SYNC_MAX_REPLAY_WALL_MS   || String(30 * 60 * 1000), 10);
const LOG_EVERY_N_EVENTS   = parseInt(process.env.SYNC_LOG_EVERY_N_EVENTS   || "500", 10);
const REPLAY_MAX_AWAIT_MS  = parseInt(process.env.SYNC_REPLAY_MAX_AWAIT_MS  || "1000", 10);

// Collections we never copy — ephemeral or plane-bound elsewhere.
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
    const root = clusterConnections.getSync(clusterKey);
    return root.useDb(`dental_org_${orgId}`, { useCache: true, noListener: true });
}

function _nowMs() { return Date.now(); }

function _sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Compare two BSON Timestamp values (server-side clusterTime).
 * Returns: 1 if a > b, -1 if a < b, 0 if equal. Null-safe (nulls compare last).
 */
function _cmpTs(a, b) {
    if (!a && !b) return 0;
    if (!a) return -1;
    if (!b) return 1;
    if (a.high !== b.high) return a.high > b.high ? 1 : -1;
    if (a.low !== b.low) return a.low > b.low ? 1 : -1;
    return 0;
}

/**
 * Probe the source for its latest clusterTime via { hello: 1 }.
 * Returns the BSON Timestamp, or null if the probe failed.
 */
async function _probeSourceClusterTime(sourceDb) {
    try {
        const res = await sourceDb.admin().command({ hello: 1 });
        return res?.$clusterTime?.clusterTime || null;
    } catch (err) {
        logger.warn(
            { event: "SYNC_CLUSTER_TIME_PROBE_FAILED", err: err.message },
            "[SyncEngine] hello probe failed — convergence will fall back to idle-only"
        );
        return null;
    }
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

// ─── Concurrency limiter (tiny, no external dep) ────────────────────────────

function _createLimiter(maxConcurrent) {
    let active = 0;
    const queue = [];
    const run = async (fn, resolve, reject) => {
        active++;
        try { resolve(await fn()); }
        catch (err) { reject(err); }
        finally {
            active--;
            const next = queue.shift();
            if (next) run(next.fn, next.resolve, next.reject);
        }
    };
    return (fn) => new Promise((resolve, reject) => {
        if (active < maxConcurrent) run(fn, resolve, reject);
        else queue.push({ fn, resolve, reject });
    });
}

// ─── Step 2: Capture resume token ───────────────────────────────────────────

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
    let token = cs.resumeToken;
    if (!token) {
        const got = await Promise.race([
            new Promise((resolve) => {
                const check = setInterval(() => {
                    if (cs.resumeToken) { clearInterval(check); resolve(cs.resumeToken); }
                }, 50);
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

// ─── Step 3 + 4: Parallel dump + restore ────────────────────────────────────

async function _flushBatch(dstCol, docs) {
    if (!docs.length) return;
    const ops = docs.map((d) => ({
        updateOne: {
            filter: { _id: d._id },
            update: { $set: d },
            upsert: true,
        },
    }));
    await dstCol.bulkWrite(ops, { ordered: false });
}

async function _dumpOneCollection({ sourceDb, targetDb, name, onProgress, sharedCounter }) {
    const srcCol = sourceDb.collection(name);
    const dstCol = targetDb.collection(name);
    let copied = 0;
    let batch = [];

    const cursor = srcCol.find({}, { noCursorTimeout: false });
    for await (const doc of cursor) {
        batch.push(doc);
        if (batch.length >= DUMP_BATCH_SIZE) {
            await _flushBatch(dstCol, batch);
            copied += batch.length;
            sharedCounter.add(batch.length);
            batch = [];
            if (onProgress) onProgress({ collection: name, copiedSoFar: sharedCounter.get() });
        }
    }
    if (batch.length) {
        await _flushBatch(dstCol, batch);
        copied += batch.length;
        sharedCounter.add(batch.length);
        if (onProgress) onProgress({ collection: name, copiedSoFar: sharedCounter.get() });
    }
    return { name, copied };
}

async function _dumpAndRestore({ sourceDb, targetDb, onProgress }) {
    const startedAt = _nowMs();
    const collections = await sourceDb.listCollections({}, { nameOnly: true }).toArray();
    const eligible = collections.filter((c) =>
        !SKIP_COLLECTIONS.has(c.name) && !c.name.startsWith("system.")
    );

    // Pre-count for progress (cheap — metadata only).
    let totalDocs = 0;
    const totals = {};
    for (const c of eligible) {
        try {
            totals[c.name] = await sourceDb.collection(c.name).estimatedDocumentCount();
            totalDocs += totals[c.name];
        } catch (_) {
            totals[c.name] = 0;
        }
    }

    const sharedCounter = (() => {
        let v = 0;
        return {
            add: (n) => { v += n; },
            get: () => v,
        };
    })();

    const limit = _createLimiter(DUMP_PARALLELISM);
    const stats = {};

    await Promise.all(eligible.map((c) =>
        limit(async () => {
            try {
                const res = await _dumpOneCollection({
                    sourceDb, targetDb, name: c.name,
                    onProgress: (p) => {
                        if (onProgress) onProgress({
                            stage: "DUMP",
                            progress: totalDocs > 0
                                ? Math.round((sharedCounter.get() / totalDocs) * 100)
                                : 0,
                            ...p,
                            total: totalDocs,
                        });
                    },
                    sharedCounter,
                });
                stats[res.name] = { copied: res.copied };
            } catch (err) {
                stats[c.name] = { copied: 0, error: err.message };
                throw err; // fail fast — one broken collection is a fatal issue
            }
        })
    ));

    return {
        stats,
        totalDocs,
        copied: sharedCounter.get(),
        durationMs: _nowMs() - startedAt,
        parallelism: DUMP_PARALLELISM,
    };
}

// ─── Step 5: Replay using tryNext() + token-based convergence ───────────────
/**
 * Replay loop structure:
 *
 *   while (!converged):
 *     change = cs.tryNext()                 // awaits up to maxAwaitTimeMS
 *     if (change) {
 *       if invalidate → throw (fatal)
 *       apply(change)                       // sequential, no re-entry
 *       update lastAppliedTs
 *       continue                            // drain as fast as events arrive
 *     }
 *     // no event — probe for convergence
 *     if (idle ≥ CATCHUP_IDLE_MS):
 *       srcTs = source.hello.$clusterTime
 *       if (lastAppliedTs >= srcTs OR !srcTs and idle ≥ CATCHUP_IDLE_MS):
 *         → converged
 *     sleep CATCHUP_PROBE_MS
 *
 *   Hard wall: MAX_REPLAY_WALL_MS.
 */
async function _replayUntilCaughtUp({ sourceDb, targetDb, startToken, onProgress, migrationContext }) {
    const startedAt = _nowMs();
    let eventsProcessed = 0;
    let lastEventAt = _nowMs();
    let lastAppliedTs = null;   // BSON Timestamp of last applied event
    let lastToken = startToken;
    let convergenceProbes = 0;

    const cs = sourceDb.watch([], {
        startAfter: startToken,
        fullDocument: "updateLookup",
        maxAwaitTimeMS: REPLAY_MAX_AWAIT_MS,
    });

    try {
        while (true) {
            // Hard wall
            if (_nowMs() - startedAt > MAX_REPLAY_WALL_MS) {
                throw new Error(
                    `[SyncEngine] Replay did not converge within ${MAX_REPLAY_WALL_MS}ms ` +
                    `(events=${eventsProcessed}, probes=${convergenceProbes})`
                );
            }

            let change = null;
            try {
                change = await cs.tryNext();
            } catch (err) {
                // Transient read errors are rare — bail and let caller decide.
                throw err;
            }

            if (change) {
                // applyChange throws ChangeStreamInvalidatedError on invalidate.
                const res = await applyChange(targetDb, change);
                eventsProcessed++;
                lastEventAt = _nowMs();
                lastAppliedTs = change.clusterTime || lastAppliedTs;
                lastToken = change._id || cs.resumeToken || lastToken;

                if (eventsProcessed % LOG_EVERY_N_EVENTS === 0) {
                    logger.debug(
                        {
                            event: "SYNC_REPLAY_PROGRESS",
                            orgId: migrationContext?.orgId,
                            eventsProcessed,
                            lastOp: res.op,
                        },
                        `[SyncEngine] Replayed ${eventsProcessed} events`
                    );
                }
                if (onProgress) {
                    onProgress({
                        stage: "REPLAY",
                        eventsProcessed,
                        lastOp: res.op,
                        lastNs: res.ns,
                    });
                }
                continue;
            }

            // ── No new events right now — check convergence ──────────────
            const idleFor = _nowMs() - lastEventAt;
            if (idleFor < CATCHUP_IDLE_MS) {
                await _sleep(CATCHUP_PROBE_MS);
                continue;
            }

            convergenceProbes++;
            const srcTs = await _probeSourceClusterTime(sourceDb);

            if (!srcTs) {
                // Probe unavailable → fall back to idle-only convergence.
                // Conservative: require TWICE the idle window before accepting.
                if (idleFor >= CATCHUP_IDLE_MS * 2) {
                    return _summary({ startedAt, eventsProcessed, lastToken,
                        reason: "caught-up-idle-fallback",
                        convergenceProbes, idleMs: idleFor });
                }
                await _sleep(CATCHUP_PROBE_MS);
                continue;
            }

            // Token-based convergence: our last-applied clusterTime must have
            // caught up to (or passed) the source's latest clusterTime.
            if (lastAppliedTs && _cmpTs(lastAppliedTs, srcTs) >= 0) {
                return _summary({ startedAt, eventsProcessed, lastToken,
                    reason: "caught-up-token",
                    convergenceProbes, idleMs: idleFor });
            }
            // Special case: no events replayed yet AND source has no writes
            // since our token was captured. srcTs reflects the baseline; if
            // we've been idle and there's simply been no writes at all,
            // accept convergence after the idle window expires.
            if (!lastAppliedTs && idleFor >= CATCHUP_IDLE_MS) {
                // Reconfirm on the NEXT probe cycle to avoid a race where a
                // write just landed during our convergence probe.
                await _sleep(CATCHUP_PROBE_MS);
                const second = await _probeSourceClusterTime(sourceDb);
                if (!second || _cmpTs(srcTs, second) === 0) {
                    return _summary({ startedAt, eventsProcessed, lastToken,
                        reason: "caught-up-no-writes",
                        convergenceProbes: convergenceProbes + 1,
                        idleMs: _nowMs() - lastEventAt });
                }
                // Source advanced between probes — loop and catch up.
                continue;
            }

            // Source is still ahead of us — keep draining.
            await _sleep(CATCHUP_PROBE_MS);
        }
    } finally {
        try { await cs.close(); } catch (_) { /* best-effort */ }
    }
}

function _summary({ startedAt, eventsProcessed, lastToken, reason, convergenceProbes, idleMs }) {
    return {
        eventsProcessed,
        convergenceProbes,
        idleMs,
        durationMs: _nowMs() - startedAt,
        lastToken,
        reason,
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
 * @param {function} [params.onProgress] — { stage, progress, ... } callbacks
 * @returns {Promise<MigrationReport>}
 *
 * MigrationReport shape:
 * {
 *   orgId, migrationId, sourceCluster, targetCluster,
 *   startedAt, finishedAt, durationMs, status: "SUCCESS",
 *   token: { captured: true },
 *   dump:  { copied, totalDocs, durationMs, parallelism, stats },
 *   replay:{ eventsProcessed, convergenceProbes, idleMs, durationMs, reason },
 *   retries: 0,
 * }
 */
async function syncOrgData({ orgId, sourceCluster, targetCluster, onProgress }) {
    if (!orgId || !sourceCluster || !targetCluster) {
        throw new Error("[SyncEngine] orgId, sourceCluster, targetCluster are all required");
    }
    if (sourceCluster === targetCluster) {
        throw new Error("[SyncEngine] source and target clusters cannot be the same");
    }

    // Defensive: org MUST be writeLocked before we touch its data.
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

    const report = {
        orgId: String(orgId),
        migrationId: org.migrationId,
        sourceCluster,
        targetCluster,
        startedAt: new Date(),
        retries: 0,
    };

    const emit = (evt) => {
        try { onProgress?.(evt); } catch (_) { /* subscriber errors are non-fatal */ }
    };

    const sourceDb = _tenantDb(sourceCluster, orgId).db;
    const targetDb = _tenantDb(targetCluster, orgId).db;

    logger.info(
        { event: "SYNC_STARTED", ...migrationContext },
        `[SyncEngine] START orgId=${orgId} ${sourceCluster} → ${targetCluster}`
    );

    try {
        // Step 2 — token FIRST.
        emit({ stage: "TOKEN", progress: 1 });
        const resumeToken = await _captureInitialResumeToken(sourceDb);
        report.token = { captured: true, capturedAt: new Date() };
        await _logProgress({
            orgId, migrationId: org.migrationId, stage: "token-captured",
            details: { ...migrationContext },
        });

        // Steps 3 + 4 — parallel dump.
        emit({ stage: "DUMP", progress: 5 });
        report.dump = await _dumpAndRestore({ sourceDb, targetDb, onProgress: emit });
        logger.info(
            { event: "SYNC_DUMP_COMPLETE", ...migrationContext,
              copied: report.dump.copied, durationMs: report.dump.durationMs },
            `[SyncEngine] DUMP complete: ${report.dump.copied} docs in ${report.dump.durationMs}ms ` +
            `(parallel=${report.dump.parallelism})`
        );
        await _logProgress({
            orgId, migrationId: org.migrationId, stage: "dump-complete",
            details: { ...migrationContext, copied: report.dump.copied,
                       durationMs: report.dump.durationMs, parallelism: report.dump.parallelism },
        });

        // Step 5 — token-based replay.
        emit({ stage: "REPLAY", progress: 75 });
        report.replay = await _replayUntilCaughtUp({
            sourceDb, targetDb,
            startToken: resumeToken,
            onProgress: emit,
            migrationContext,
        });
        logger.info(
            { event: "SYNC_REPLAY_COMPLETE", ...migrationContext,
              events: report.replay.eventsProcessed,
              durationMs: report.replay.durationMs,
              reason: report.replay.reason },
            `[SyncEngine] REPLAY ${report.replay.reason}: ` +
            `${report.replay.eventsProcessed} events in ${report.replay.durationMs}ms`
        );
        await _logProgress({
            orgId, migrationId: org.migrationId, stage: "replay-complete",
            details: { ...migrationContext, ...report.replay },
        });

        report.finishedAt = new Date();
        report.durationMs = report.finishedAt - report.startedAt;
        report.status = "SUCCESS";

        emit({ stage: "SYNCED", progress: 100 });
        return report;
    } catch (err) {
        report.finishedAt = new Date();
        report.durationMs = report.finishedAt - report.startedAt;
        report.status = err instanceof ChangeStreamInvalidatedError ? "INVALIDATED" : "FAILED";
        report.error = err.message;
        logger.error(
            { event: "SYNC_FAILED", ...migrationContext, err: err.message, status: report.status },
            `[SyncEngine] FAILED: ${err.message}`
        );
        throw err;
    }
}

module.exports = {
    syncOrgData,
    // Exported for tests / diagnostic reuse:
    _captureInitialResumeToken,
    _dumpAndRestore,
    _replayUntilCaughtUp,
    _probeSourceClusterTime,
    _cmpTs,
    SKIP_COLLECTIONS,
};
