/**
 * auditService.js
 *
 * Cryptographic Audit Chain Service (v3.3)
 * Enforces per-tenant immutable hashing.
 *
 * v3.2 — Platform Plane Isolation:
 * - actor.actorType === "platform_user": use Control Plane DB (mongoose.connection).
 *   Never routes through regionRouter. regionCode set to "GLOBAL" sentinel.
 * - all other actors: regional routing preserved exactly as before.
 *
 * v3.3 — Concurrency-Safe Hash Chain:
 * - Both platform AND regional paths now use _withHashChainRetry().
 * - Retries up to 3 times on hash chain collisions (MongoDB 11000 / concurrency errors).
 * - 10-50ms jitter between retries to avoid thundering herd.
 */

const crypto = require("crypto");
const mongoose = require("mongoose");
const { getRegionContext } = require("../infrastructure/regionRouter");
const { auditLogSchema } = require("../shared/models/AuditLog");
const logger = require("../utils/logger");
const { getRequestId } = require("../platform/context/requestContextStore");
const { auditQueue } = require("../infrastructure/queues/auditQueue");

// ── Concurrency-Safe Audit Queue (v4.0) ───────────────────────────────────
// v3.5 polling lock replaced with BullMQ global sequential queue.
// Ensures that every organization's hash chain is updated one at a time,
// preventing "Audit Chain Split" across multiple backend instances.


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

// ── Concurrency-Safe Ingestion (v4.0) ───────────────────────────────────────
/**
 * createAuditRecord
 * v4.0 — BullMQ Ingestion Layer.
 * Pushes audit data to the "audit-queue" for sequential execution via worker.
 * Prevents hash collisions by serializing all records globally.
 *
 * NOTE: This is now asynchronous (job queued).
 */
async function createAuditRecord(data, session = null) {
    // ── Pre-flight Enrichment (happens synchronously to capture process state) ──
    _enrichWithRequestMetadata(data);
    _enrichWithActor(data);

    const orgId = data.organizationId ? data.organizationId.toString() : "platform";

    // Trace context for correlation
    data.requestId = getRequestId() || data.requestId || null;

    logger.debug({ orgId, action: data.action }, `[Audit] 📥 Queueing audit job for org: ${orgId}`);

    const job = await auditQueue.add(
        "audit-job",
        {
            data,
            actorType: data.actorType,
            organizationId: orgId
        },
        {
            // Consistent jobId prevents accidental duplicates within the same ms
            jobId: `audit-${orgId}-${Date.now()}-${Math.random().toString(36).substring(7)}`,
            attempts: 3,
            backoff: { type: "exponential", delay: 1000 }
        }
    );

    return job; // Caller receives BullMQ Job object (eventually consistent)
}

// ── Legacy Internal Helpers (v3.x) — Removed in v4.0 for Worker Logic ─────────
// Logic moved to src/infrastructure/workers/auditWorker.js

module.exports = {
    createAuditRecord,
    generateHash,
    _enrichWithRequestMetadata,
    _enrichWithActor
};
