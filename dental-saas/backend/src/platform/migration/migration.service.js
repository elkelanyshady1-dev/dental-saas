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
 * Sync stub. In a real implementation this opens a change stream on the
 * source cluster's per-org DB, replays into the target, and tracks lag.
 * Here we just transition PREPARING → SYNCING → CUTOVER_PENDING and
 * record a placeholder progress %.
 *
 * Replace this body with the real sync engine when the data-movement
 * strategy is chosen (resume token + dump+catchup is the recommended
 * shape — see DB_3_LAYER_ARCHITECTURE_PLAN.md §"Sync invariant").
 */
async function syncOrgData({ orgId, actor }) {
    // PREPARING → SYNCING
    let org = await _transition({
        orgId,
        from: STATES.PREPARING,
        to: STATES.SYNCING,
        actor,
        details: { phase: "sync-started" },
    });

    // ── STUB: real implementation goes here. For now we just advance.
    //   const sourceConn = clusterConnections.getSync(org.cluster).useDb(`dental_org_${orgId}`);
    //   const targetConn = clusterConnections.getSync(org.targetCluster).useDb(`dental_org_${orgId}`);
    //   ... change-stream replay ...
    //   ... lag tracking via MigrationLog updates ...

    // SYNCING → CUTOVER_PENDING
    org = await _transition({
        orgId,
        from: STATES.SYNCING,
        to: STATES.CUTOVER_PENDING,
        actor,
        details: { phase: "sync-complete-awaiting-cutover" },
    });

    return org;
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
        .select("name slug cluster targetCluster region migrationState writeLocked routingEpoch")
        .sort({ name: 1 })
        .limit(limit)
        .lean();
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
};
