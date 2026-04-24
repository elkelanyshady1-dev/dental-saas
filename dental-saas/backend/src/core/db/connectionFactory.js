/**
 * connectionFactory.js
 * Core Infrastructure — Shard-Aware Connection Factory
 *
 * Provides pure functions for building shard-aware cache keys,
 * resolving shard URIs, and deriving database names.
 *
 * This module is STATELESS — no connections, no caches, no side effects.
 * All connection lifecycle management remains in dbManager.js.
 *
 * DESIGN PRINCIPLE:
 *   dbManager owns LIFECYCLE (create, cache, evict, close).
 *   connectionFactory owns ADDRESSING (where to connect, what to name it).
 *
 * CURRENT STATE (Phase 1):
 *   buildConnectionKey("shard-1", orgId) → "shard-1:orgId"
 *   getShardUri("shard-1") → process.env.MONGO_URI_PLATFORM (same cluster)
 *   buildDbName(orgId) → "dental_org_<orgId>" (unchanged convention)
 *
 *   Since there's only one shard, the key prefix is cosmetic —
 *   it does not change routing behavior.
 *
 * FUTURE:
 *   When shard-2 exists, buildConnectionKey returns a unique key per
 *   shard+org combination, and getShardUri returns the correct URI.
 *   dbManager is already keyed on the composite key, so it
 *   automatically creates connections to the right cluster.
 *
 * INVARIANTS:
 *   1. buildConnectionKey() is DETERMINISTIC
 *   2. getShardUri() throws on unknown shard (fail-fast)
 *   3. buildDbName() follows the dental_org_ convention exactly
 *
 * PLANE: Core Infrastructure
 */

"use strict";

const { SHARDS } = require("./shardConfig");

/**
 * buildConnectionKey
 * Creates a composite cache key that is unique per shard + org.
 *
 * Format: "<shard>:<orgId>"
 *
 * WHY: When orgs can live on different shards, the cache key must
 * encode BOTH the shard and the org to avoid cross-shard collisions.
 * Today with a single shard this is just "shard-1:<orgId>".
 *
 * @param {Object} params
 * @param {string} params.shard — Shard identifier (e.g., "shard-1")
 * @param {string} params.orgId — Organization _id
 * @returns {string} — Composite cache key
 */
function buildConnectionKey({ shard, orgId }) {
    return `${shard}:${orgId}`;
}

/**
 * getShardUri
 * Returns the MongoDB connection URI for a given shard.
 *
 * FAIL-FAST: Throws immediately if the shard doesn't exist in
 * shardConfig. This prevents silent misrouting.
 *
 * @param {string} shard — Shard identifier
 * @returns {string} — MongoDB URI
 * @throws {Error} — If shard is not defined in shardConfig
 */
function getShardUri(shard) {
    const config = SHARDS[shard];

    if (!config) {
        throw new Error(
            `[connectionFactory] Unknown shard: "${shard}". ` +
            `Available shards: [${Object.keys(SHARDS).join(", ")}]`
        );
    }

    if (!config.uri) {
        throw new Error(
            `[connectionFactory] Shard "${shard}" has no URI configured. ` +
            `Check the environment variable for this shard.`
        );
    }

    return config.uri;
}

/**
 * buildDbName
 * Derives the per-org database name from an organization ID.
 *
 * Convention: dental_org_<orgId>
 * This convention is used consistently across:
 *   - Connection creation (dbManager)
 *   - Provisioning (org lifecycle)
 *   - Backup tooling
 *   - Migration scripts
 *
 * @param {string} orgId — Organization _id
 * @returns {string} — Database name
 */
function buildDbName(orgId) {
    return `dental_org_${orgId}`;
}

/**
 * extractOrgIdFromKey
 * Reverse of buildConnectionKey — extracts orgId from a composite key.
 *
 * Useful for logging, debugging, and stats reporting where you have
 * the cache key but need the orgId.
 *
 * @param {string} key — Composite cache key (e.g., "shard-1:abc123")
 * @returns {string} — orgId portion
 */
function extractOrgIdFromKey(key) {
    const colonIndex = key.indexOf(":");
    return colonIndex >= 0 ? key.substring(colonIndex + 1) : key;
}

/**
 * extractShardFromKey
 * Extracts the shard identifier from a composite cache key.
 *
 * @param {string} key — Composite cache key (e.g., "shard-1:abc123")
 * @returns {string} — Shard identifier
 */
function extractShardFromKey(key) {
    const colonIndex = key.indexOf(":");
    return colonIndex >= 0 ? key.substring(0, colonIndex) : "shard-1";
}

module.exports = {
    buildConnectionKey,
    getShardUri,
    buildDbName,
    extractOrgIdFromKey,
    extractShardFromKey,
};
