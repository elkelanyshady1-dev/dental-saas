/**
 * auditWorker.js
 * Platform Infrastructure — BullMQ Audit Worker
 * v1.0 — Sequential Hash-Chain Append (Global Order)
 *
 * This worker processes every audit log record globally to guarantee
 * that no organization ever suffers a hash chain split.
 *
 * Concurrency is set to 1 to ensure that organization records are
 * processed strictly in the order they were queued.
 *
 * PLANE: Platform / Shared
 */

"use strict";

const { Worker } = require("bullmq");
const redisConnection = require("../redis/redisClient");
const { AUDIT_QUEUE_NAME } = require("../queues/auditQueue");
const { getRegionContext } = require("../regionRouter");
const { auditLogSchema } = require("../../shared/models/AuditLog");
const { generateHash, _enrichWithRequestMetadata, _enrichWithActor } = require("../../services/auditService");
const mongoose = require("mongoose");
const logger = require("../../utils/logger");

// Optional metrics — non-fatal if not available
let metrics = null;
try { metrics = require("../../infrastructure/metrics/metrics").metrics; } catch { }

// ── One-time index repair cache ────────────────────────────────────────────────
// Tracks which DB connections have already been checked so we only run once
// per connection per process lifecycle, not on every job.
const _indexRepairDone = new Set();

/**
 * Drop the stale compound unique index `organizationId_1_previousHash_1` that
 * was created in a prior schema version. The current schema uses a simpler
 * `{ previousHash: 1, unique: true }` that works correctly with per-org DBs.
 * Mongoose never auto-drops old indexes — this self-heal runs at worker boot.
 */
async function _dropStaleIndexIfNeeded(model, connId) {
    if (_indexRepairDone.has(connId)) return;
    _indexRepairDone.add(connId);

    try {
        const coll    = model.collection;
        const indexes = await coll.indexes();
        const stale   = indexes.find(i => i.name === "organizationId_1_previousHash_1");

        if (stale) {
            await coll.dropIndex("organizationId_1_previousHash_1");
            logger.info({ connId }, "[auditWorker] ✅ Dropped stale compound index `organizationId_1_previousHash_1`");

            // Ensure the correct unique index exists
            const hasCorrect = indexes.some(i => i.name === "previousHash_1");
            if (!hasCorrect) {
                await coll.createIndex({ previousHash: 1 }, { unique: true, name: "previousHash_1" });
                logger.info({ connId }, "[auditWorker] ✅ Created correct unique index `previousHash_1`");
            }
        }
    } catch (err) {
        // Non-fatal — log and continue. The inline E11000 self-heal will cover any remaining collisions.
        logger.warn({ connId, err: err.message }, "[auditWorker] ⚠️ Index repair failed (non-fatal)");
    }
}

const worker = new Worker(
    AUDIT_QUEUE_NAME,
    async (job) => {
        const { data, actorType } = job.data;
        const orgId = data.organizationId ? data.organizationId.toString() : "platform";

        logger.info({ jobId: job.id, orgId, action: data.action }, "[auditWorker] Processing audit job");

        // ─── 1. Enrichment ──────────────────────────────────────────────────────
        _enrichWithRequestMetadata(data);
        _enrichWithActor(data);

        // ── Defensive actorType normalization ──────────────────────────────────
        // 'org_user' is a legacy value — schema only accepts 'tenant_user'.
        // Source callers have been fixed; worker normalizes as a safety net.
        const ACTOR_TYPE_MAP = { org_user: "tenant_user" };
        const resolvedActorType = ACTOR_TYPE_MAP[actorType] || actorType || "tenant_user";

        // ── regionCode resolution ────────────────────────────────────────────────
        let regionCode = data.regionCode;
        if (resolvedActorType === "platform_user") {
            regionCode = "GLOBAL";
        } else if (!regionCode) {
            logger.warn({ orgId }, "[auditWorker] Missing regionCode, falling back to MEA");
            regionCode = "MEA";
        }

        // Write resolved fields back into data BEFORE hash calculation and DB write
        data.regionCode = regionCode;
        data.actorType  = resolvedActorType;

        // ─── 2. Resolve Connection & Model ──────────────────────────────────────
        let AuditModel;
        let connId;
        if (resolvedActorType === "platform_user") {
            AuditModel = mongoose.connection.model("AuditLog", auditLogSchema);
            connId = "platform";
        } else {
            const { mongooseConnection } = await getRegionContext(regionCode);
            AuditModel = mongooseConnection.model("AuditLog", auditLogSchema);
            connId = mongooseConnection.id || mongooseConnection.name || regionCode;
        }

        // Drop the stale organizationId_1_previousHash_1 index on first use of this connection.
        // Non-blocking in the sense that we await it but it's a no-op if already done.
        await _dropStaleIndexIfNeeded(AuditModel, connId);

        // ─── 3. Find tail of the hash chain ─────────────────────────────────────
        // Do NOT filter by regionCode — a per-org DB holds one org's records.
        // Filtering by regionCode caused null results when the genesis record
        // had a different/undefined regionCode, triggering infinite E11000 loops.
        const findTail = () => AuditModel.findOne({}).sort({ createdAt: -1 }).lean();

        let lastEntry = await findTail();

        // ─── 4. Hash Calculation ─────────────────────────────────────────────────
        if (!data.createdAt) data.createdAt = new Date();

        const buildAndInsert = async (tail) => {
            const prevHash    = tail ? tail.currentHash : "0";
            const currentHash = generateHash(data, prevHash);

            const correlationId    = data.correlationId    || null;
            const requestId        = data.requestId        || null;
            const signatureVersion = data.signatureVersion || 1;

            const [record] = await AuditModel.create([{
                ...data,
                previousHash: prevHash,
                currentHash,
                correlationId,
                requestId,
                signatureVersion,
            }]);

            return record;
        };

        // ─── 5. Save with inline E11000 self-heal ───────────────────────────────
        // If two jobs race to write the genesis entry (prevHash: "0"), one wins
        // and one gets E11000. Instead of throwing and letting BullMQ retry
        // (which would loop forever), we catch the collision inline, re-read the
        // actual tail, and retry the insert immediately in the same job execution.
        try {
            const record = await buildAndInsert(lastEntry);
            if (metrics) metrics.auditAppendTotal.inc({ outcome: "success", regionCode });
            logger.info({ orgId, recordId: record._id }, "[auditWorker] ✅ Audit saved successfully");
            return record;
        } catch (err) {
            const isDuplicateHash = err.code === 11000 &&
                (err.message.includes("previousHash") || err.message.includes("currentHash"));

            if (isDuplicateHash) {
                // Re-read the real tail (written by the concurrent winner) and retry once
                logger.warn({ orgId, prevErr: err.message }, "[auditWorker] ⚠️ Hash collision — re-reading tail and retrying");
                lastEntry = await findTail();

                try {
                    const record = await buildAndInsert(lastEntry);
                    if (metrics) metrics.auditAppendTotal.inc({ outcome: "success_after_collision", regionCode });
                    logger.info({ orgId, recordId: record._id }, "[auditWorker] ✅ Audit saved after collision recovery");
                    return record;
                } catch (retryErr) {
                    logger.error({ orgId, err: retryErr.message }, "[auditWorker] ❌ Audit failed after collision recovery");
                    throw retryErr;
                }
            }

            logger.error({ orgId, err: err.message }, "[auditWorker] ❌ Audit failed (non-collision error)");
            throw err;
        }
    },
    {
        connection: redisConnection,
        concurrency: 1,
        limiter: { max: 100, duration: 1000 },
    }
);

worker.on("failed", (job, err) => {
    logger.error({ jobId: job.id, err: err.message }, "[auditWorker] Job failed");
});

module.exports = worker;
