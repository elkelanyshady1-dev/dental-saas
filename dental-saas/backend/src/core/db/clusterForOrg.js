/**
 * clusterForOrg.js
 * Core Infrastructure — orgId → cluster key cache
 *
 * The cluster-aware DB path (Step 3 rollout of the 3-layer refactor) needs
 * every request's org cluster. Looking it up from the platform DB on every
 * auth check adds latency; the mapping changes only during migrations.
 *
 * This module caches the lookup for a short TTL and exposes an `invalidate()`
 * hook that the Phase 8 migration flow calls when flipping `org.cluster`.
 *
 * PLANE: Core Infrastructure
 */

"use strict";

const TTL_MS = parseInt(process.env.CLUSTER_FOR_ORG_TTL_MS, 10) || 10 * 60 * 1000;

const cache = new Map();  // orgId (string) → { cluster, expiresAt }

/**
 * clusterForOrg
 * Async — returns the cluster key assigned to an org, hitting the platform DB
 * only on cache miss. Falls back to "default" if the org doc is missing a
 * cluster (compatibility for legacy orgs that have not been backfilled).
 *
 * @param {string} orgId
 * @returns {Promise<string>} cluster key
 */
async function clusterForOrg(orgId) {
    if (!orgId) {
        throw new Error("[clusterForOrg] orgId is required");
    }

    const key = String(orgId);
    const hit = cache.get(key);
    if (hit && hit.expiresAt > Date.now()) {
        return hit.cluster;
    }

    // Lazy requires — avoid boot-time circular deps against platformConnection.
    const getPlatformModel = require("./getPlatformModel");
    const OrganizationDef = require("@root/shared/models/Organization");

    const Organization = getPlatformModel(OrganizationDef);
    const org = await Organization
        .findById(key)
        .select("cluster")
        .lean();

    const cluster = (org && org.cluster) || "default";
    cache.set(key, { cluster, expiresAt: Date.now() + TTL_MS });
    return cluster;
}

/**
 * invalidate
 * Drops a cache entry. Called by the migration flow when an org's cluster
 * changes (cutover) so subsequent resolutions hit the DB and see the new
 * value immediately.
 */
function invalidate(orgId) {
    if (!orgId) return;
    cache.delete(String(orgId));
}

/**
 * clear
 * Full cache wipe. Used in tests; also safe to call from ops tooling.
 */
function clear() {
    cache.clear();
}

function _snapshot() {
    return Array.from(cache.entries()).map(([orgId, v]) => ({
        orgId, cluster: v.cluster, ttlMsLeft: Math.max(0, v.expiresAt - Date.now()),
    }));
}

module.exports = {
    clusterForOrg,
    invalidate,
    clear,
    _snapshot,
};
