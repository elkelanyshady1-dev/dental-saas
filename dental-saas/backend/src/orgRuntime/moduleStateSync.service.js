/**
 * moduleStateSync.service.js — Module State Synchronization
 * Phase B.2 — Runtime Maturity & Architecture Optimization
 *
 * PURPOSE:
 * Synchronizes the OrganizationModuleState collection with the current
 * module capabilities (req.capabilities.modules) on each request.
 *
 * Uses a per-org TTL cache to avoid writing on every request.
 * Default sync interval: 5 minutes.
 *
 * PERFORMANCE:
 *   - TTL cache prevents writes on every request (max 1 per 5min per org)
 *   - Uses bulkWrite for single-round-trip upsert of all module states
 *   - Async — never blocks the request pipeline
 *
 * PLANE: Org-plane only.
 */

"use strict";

const OrganizationModuleState = require("./models/OrganizationModuleState.model").default;
const logger = require("@utils/logger");

// ─── TTL Cache ──────────────────────────────────────────────────────────────

/** @type {Map<string, number>} orgId → lastSyncTimestamp */
const _syncCache = new Map();

/** Time-to-live for sync cache entries (5 minutes) */
const SYNC_TTL_MS = 5 * 60 * 1000;

/** Maximum cache size to prevent memory leaks from stale entries */
const MAX_CACHE_SIZE = 10000;

// ─── Sync Logic ─────────────────────────────────────────────────────────────

/**
 * syncModuleState(organizationId, modules)
 *
 * Upserts OrganizationModuleState records for all modules in the
 * capabilities map. Respects TTL to avoid excessive writes.
 *
 * @param {string} organizationId — MongoDB ObjectId string
 * @param {Object<string, boolean>} modules — module capability map from req.capabilities.modules
 * @returns {Promise<void>}
 */
async function syncModuleState(organizationId, modules) {
    if (!organizationId || !modules || typeof modules !== "object") return;

    const orgIdStr = String(organizationId);
    const now = Date.now();

    // TTL gate — skip if synced recently
    const lastSync = _syncCache.get(orgIdStr);
    if (lastSync && (now - lastSync) < SYNC_TTL_MS) {
        return; // Already synced within TTL window
    }

    try {
        const ops = [];

        for (const [moduleKey, enabled] of Object.entries(modules)) {
            const update = {
                enabled: !!enabled,
                lastSyncedAt: new Date(),
            };

            // Set enabledAt/disabledAt timestamps based on state
            if (enabled) {
                update.enabledAt = new Date();
            } else {
                update.disabledAt = new Date();
            }

            ops.push({
                updateOne: {
                    filter: { organizationId, moduleKey },
                    update: { $set: update },
                    upsert: true,
                },
            });
        }

        if (ops.length > 0) {
            await OrganizationModuleState.bulkWrite(ops, { ordered: false });
        }

        // Update TTL cache
        _syncCache.set(orgIdStr, now);

        // Evict oldest entries if cache grows too large
        if (_syncCache.size > MAX_CACHE_SIZE) {
            const entries = [..._syncCache.entries()];
            entries.sort((a, b) => a[1] - b[1]); // Sort by timestamp ascending
            const toDelete = entries.slice(0, Math.floor(MAX_CACHE_SIZE / 4));
            for (const [key] of toDelete) {
                _syncCache.delete(key);
            }
        }

    } catch (err) {
        // Never block request — sync is best-effort observability
        logger.warn(
            { err: err.message, organizationId, service: "moduleStateSync" },
            "[moduleStateSync] Failed to sync module state — non-blocking"
        );
    }
}

/**
 * getModuleStateHistory(organizationId)
 *
 * Returns all module state records for an organization.
 *
 * @param {string} organizationId
 * @returns {Promise<Object[]>}
 */
async function getModuleStateHistory(organizationId) {
    return OrganizationModuleState.find({ organizationId })
        .sort({ moduleKey: 1 })
        .lean();
}

/**
 * getActiveModulesCount()
 *
 * Returns aggregate counts of enabled modules across all organizations.
 * Used for platform-level analytics and SLO tracking.
 *
 * @returns {Promise<Object[]>} — [{ _id: moduleKey, count: N }]
 */
async function getActiveModulesCount() {
    return OrganizationModuleState.aggregate([
        { $match: { enabled: true } },
        { $group: { _id: "$moduleKey", count: { $sum: 1 } } },
        { $sort: { count: -1 } },
    ]);
}

/**
 * getSyncCacheStats — Returns cache diagnostics.
 * @returns {{ size: number, maxSize: number, ttlMs: number }}
 */
function getSyncCacheStats() {
    return {
        size: _syncCache.size,
        maxSize: MAX_CACHE_SIZE,
        ttlMs: SYNC_TTL_MS,
    };
}

module.exports = {
    syncModuleState,
    getModuleStateHistory,
    getActiveModulesCount,
    getSyncCacheStats,
};
