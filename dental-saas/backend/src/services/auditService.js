/**
 * auditService.js
 *
 * Cryptographic Audit Chain Service (v5.0)
 * Enforces per-tenant immutable hashing.
 *
 * v3.2 — Platform Plane Isolation:
 * - actor.actorType === "platform_user": use Control Plane DB (mongoose.connection).
 *   Never routes through regionRouter. regionCode set to "GLOBAL" sentinel.
 * - all other actors: regional routing preserved exactly as before.
 *
 * v5.0 — Direct-write with hash-chain retry (Phase 6 Redis-eradication):
 * - Prior v4.0 BullMQ queue removed. Audit writes go directly to the per-DB
 *   AuditLog collection on the request path, guarded by _withHashChainRetry().
 * - Concurrency safety comes from the unique index on {previousHash} in
 *   AuditLog.js: two writers racing to append after the same last-hash produce
 *   E11000 on the loser, which we catch + re-read + re-hash + retry (up to 3
 *   attempts, 10-50ms jitter between). The index is the serialization point;
 *   no external queue is required.
 * - session (optional) is passed through to Mongoose so callers that bundle
 *   the audit write with a domain transaction get atomic semantics. Fire-
 *   and-forget callers pass no session and the write stands alone.
 */

const crypto = require("crypto");
const mongoose = require("mongoose");
const { getRegionContext } = require("../infrastructure/regionRouter");
const { auditLogSchema } = require("../shared/models/AuditLog");
const logger = require("../utils/logger");
const { getRequestId } = require("../platform/context/requestContextStore");

// Retry budget for hash-chain collisions. 3 attempts covers the common
// case where two concurrent writers collide once; beyond that, sustained
// contention is the real problem and we want the failure to be visible.
const HASH_CHAIN_MAX_ATTEMPTS = 3;
const HASH_CHAIN_JITTER_MIN_MS = 10;
const HASH_CHAIN_JITTER_MAX_MS = 50;


// v21.0 — Request metadata extractor for device/geo enrichment (optional import)
let extractRequestMetadata = null;
try {
    extractRequestMetadata = require("../platform/audit/utils/requestMetadata").extractRequestMetadata;
} catch {
    extractRequestMetadata = () => ({
        ipAddress: "Unknown", geoLocation: "Unknown",
        browser: "Unknown", os: "Unknown", device: "Unknown", userAgent: ""
    });
}


/**
 * generateHash
 * SHA256(org + actor + action + entityType + entityId + payload + ts + prevHash)
 */
function generateHash(data, previousHash) {
    const hashInput = JSON.stringify({
        organizationId: data.organizationId ? data.organizationId.toString() : "platform",
        branchId: data.branchId ? data.branchId.toString() : "none",
        userId: data.actorId.toString(),
        action: data.action,
        payload: data.details || {},
        signatureVersion: data.signatureVersion || 1,
        previousHash,
        regionCode: data.regionCode // Added to hash for v13.0 sovereignty
    });

    return crypto.createHash("sha256").update(hashInput).digest("hex");
}

/**
 * _enrichWithRequestMetadata (v21.0)
 * Extracts device/geo fields from an attached req object and merges them
 * into the audit data. Non-destructive — only fills fields not already set.
 */
function _enrichWithRequestMetadata(data) {
    const req = data.req || null;
    if (!req) return data;

    const meta = extractRequestMetadata(req);

    // IP is already captured directly by callers — only fill if empty
    if (!data.ipAddress && meta.ipAddress) data.ipAddress = meta.ipAddress;
    if (!data.userAgent && meta.userAgent) data.userAgent = meta.userAgent;
    if (!data.geoLocation) data.geoLocation = meta.geoLocation;
    if (!data.browser) data.browser = meta.browser;
    if (!data.os) data.os = meta.os;
    if (!data.device) data.device = meta.device;

    return data;
}

/**
 * _enrichWithActor (v21.0)
 * Populates actorFirstName / actorLastName / actorRole from the actor
 * object if it was passed in as data.actor. Callers may also set these
 * fields directly — this only fills what is missing.
 *
 * Actor name splitting:
 *   "Shady Elkelany" → first = "Shady", last = "Elkelany"
 *   For platform users, `name` is a single string.
 */
function _enrichWithActor(data) {
    const actor = data.actor || null;
    if (actor) {
        // Role snapshot
        if (!data.actorRole) data.actorRole = actor.role || null;

        // Name split
        if (!data.actorFirstName || !data.actorLastName) {
            const name = actor.name || actor.firstName + " " + actor.lastName || "";
            const parts = name.trim().split(/\s+/);
            if (!data.actorFirstName) data.actorFirstName = parts[0] || null;
            if (!data.actorLastName) data.actorLastName = parts.slice(1).join(" ") || null;
        }
    }

    // Also populate from details.actorSnapshot if available (backwards compat)
    const snap = data.details?.actorSnapshot;
    if (snap) {
        if (!data.actorRole && snap.role) data.actorRole = snap.role;
        if (!data.actorFirstName && snap.name) {
            const parts = (snap.name || "").trim().split(/\s+/);
            data.actorFirstName = parts[0] || null;
            data.actorLastName = parts.slice(1).join(" ") || null;
        }
    }

    return data;
}

/**
 * resolvePlatformAuditConnection
 * Returns the Control Plane AuditLog model without touching regionRouter.
 * Used exclusively for actorType === "platform_user" events.
 */
function resolvePlatformAuditConnection() {
    // Use the default mongoose connection — the Control Plane DB.
    // This is the same connection established in app.js on startup.
    // Never call getRegionContext() for platform actors.
    return mongoose.connection.model("AuditLog", auditLogSchema);
}

// ── Hash-Chain Retry (v5.0) ───────────────────────────────────────────────
/**
 * _withHashChainRetry
 *
 * Appends a new AuditLog record to the chain, retrying on hash-chain
 * collisions. Serialization is delegated to the {previousHash: 1} unique
 * index in AuditLog.js — two concurrent writers reading the same "last
 * record" will both hash off the same previousHash; the second write gets
 * E11000 and we re-read + re-hash for a fresh previousHash.
 *
 * A collision here is normal under load (< 1 per 100 writes in practice,
 * governed by the read→write window). An exhausted retry budget usually
 * means sustained multi-writer contention on the same org and warrants
 * investigation rather than a silent extension of the retry count.
 */
async function _withHashChainRetry(AuditLogModel, data, session) {
    let lastErr = null;

    for (let attempt = 1; attempt <= HASH_CHAIN_MAX_ATTEMPTS; attempt++) {
        try {
            // Fetch the tail of the chain for this DB. The AuditLog.createdAt
            // desc index keeps this to a single indexed seek.
            const tailQuery = AuditLogModel
                .findOne({})
                .sort({ createdAt: -1 })
                .select("currentHash")
                .lean();
            if (session) tailQuery.session(session);
            const lastRecord = await tailQuery.exec();

            const previousHash = lastRecord?.currentHash || "0";
            const currentHash = generateHash(data, previousHash);

            const doc = {
                ...data,
                previousHash,
                currentHash,
                signatureVersion: data.signatureVersion || 1,
            };
            // Internal workflow fields (not part of the AuditLog schema) —
            // strip before writing. `req` and `actor` are enrichment inputs;
            // `session` is a mongoose-level arg, never a document field.
            delete doc.req;
            delete doc.actor;
            delete doc.session;

            const createOpts = session ? { session } : undefined;
            const [record] = await AuditLogModel.create([doc], createOpts);
            return record;
        } catch (err) {
            // Only E11000 on the {previousHash} unique index is retryable —
            // any other error (validation, connection loss) bubbles up.
            if (err?.code !== 11000) throw err;
            lastErr = err;
            if (attempt < HASH_CHAIN_MAX_ATTEMPTS) {
                const range = HASH_CHAIN_JITTER_MAX_MS - HASH_CHAIN_JITTER_MIN_MS;
                const jitter = HASH_CHAIN_JITTER_MIN_MS + Math.floor(Math.random() * range);
                await new Promise((resolve) => setTimeout(resolve, jitter));
            }
        }
    }

    // Budget exhausted — surface it. Callers in fire-and-forget paths
    // (autoAudit) will log; transactional callers will see the failure
    // and can decide whether to abort the outer transaction.
    logger.error(
        {
            event: "AUDIT_HASH_CHAIN_RETRY_EXHAUSTED",
            attempts: HASH_CHAIN_MAX_ATTEMPTS,
            action: data.action,
            actorType: data.actorType,
            err: lastErr?.message,
        },
        "[Audit] hash-chain retry exhausted — sustained writer contention or bug"
    );
    throw new Error(
        `[Audit] hash-chain retry exhausted after ${HASH_CHAIN_MAX_ATTEMPTS} attempts: ${lastErr?.message || "unknown"}`
    );
}

// ── Ingestion (v5.0) ────────────────────────────────────────────────────────
/**
 * createAuditRecord
 * Direct write to the per-DB AuditLog collection with hash-chain retry.
 *
 * Platform actors (actorType === "platform_user") write to the Control
 * Plane DB via mongoose.connection. All other actors route through
 * regionRouter. The per-DB {previousHash} unique index is the
 * serialization primitive — no external queue required.
 *
 * @param {Object} data — audit payload (see AuditLog schema for required fields)
 * @param {import("mongoose").ClientSession} [session] — optional transaction session
 * @returns {Promise<Object>} — the persisted AuditLog document
 */
async function createAuditRecord(data, session = null) {
    // Pre-flight enrichment runs synchronously to capture request-scoped
    // state (AsyncLocalStorage, req headers) before it goes out of scope.
    _enrichWithRequestMetadata(data);
    _enrichWithActor(data);

    // Trace context for correlation
    data.requestId = getRequestId() || data.requestId || null;

    let AuditLogModel;
    if (data.actorType === "platform_user") {
        if (!data.regionCode) data.regionCode = "GLOBAL";
        AuditLogModel = resolvePlatformAuditConnection();
    } else {
        if (!data.regionCode) {
            throw new Error("[Audit] regionCode is required for non-platform audit records");
        }
        const { mongooseConnection } = await getRegionContext(data.regionCode, {
            actorType: data.actorType,
        });
        AuditLogModel = mongooseConnection.model("AuditLog", auditLogSchema);
    }

    return _withHashChainRetry(AuditLogModel, data, session);
}

module.exports = {
    createAuditRecord,
    generateHash,
    _enrichWithRequestMetadata,
    _enrichWithActor,
    _withHashChainRetry,
};
