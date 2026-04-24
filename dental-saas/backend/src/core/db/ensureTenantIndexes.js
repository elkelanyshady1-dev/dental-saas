/**
 * ensureTenantIndexes.js
 * Core Infrastructure — Tenant Index Auto-Heal
 *
 * Ensures critical tenant-scoped indexes exist on every cached org DB.
 * Complements indexValidator.js (which only REPORTS missing indexes) by
 * actually CREATING them.
 *
 * ARCHITECTURE:
 *   - Runs fire-and-forget after server boot (via setImmediate in server.js).
 *   - Operates on every connection currently in dbManager's cache.
 *   - All createIndex calls use background:true → no collection lock.
 *   - Idempotent: the ensureIndex helper inspects existing indexes and
 *     short-circuits when an index with the same key pattern already
 *     exists — even if the existing name differs (e.g. MongoDB's default
 *     `organizationId_1` vs. our `idx_users_org`). Duplicate-pattern
 *     errors are no longer logged as failures.
 *   - Non-fatal: errors are logged, never thrown. Startup is never blocked.
 *   - Safe for production: NEVER drops or renames existing indexes.
 *
 * INDEXES ENSURED (per tenant DB):
 *   users:
 *     - { organizationId: 1 }
 *     - { organizationId: 1, email: 1 }
 *   auditlogs:
 *     - { organizationId: 1 }
 *     - { organizationId: 1, createdAt: -1 }
 *
 * PLANE: Core Infrastructure (used during boot + by runtime.guardian repair)
 */

"use strict";

const logger = require("@utils/logger");
const dbManager = require("./dbManager");

const TENANT_INDEX_PLAN = [
    {
        collection: "users",
        specs: [
            { key: { organizationId: 1 }, name: "idx_users_org" },
            { key: { organizationId: 1, email: 1 }, name: "idx_users_org_email" },
        ],
    },
    {
        collection: "auditlogs",
        specs: [
            { key: { organizationId: 1 }, name: "idx_auditlogs_org" },
            { key: { organizationId: 1, createdAt: -1 }, name: "idx_auditlogs_org_createdAt" },
        ],
    },
];

/**
 * Compare two index key specs for equality. Order matters because MongoDB
 * treats `{ a: 1, b: 1 }` and `{ b: 1, a: 1 }` as distinct indexes.
 */
function keysEqual(a, b) {
    const aEntries = Object.entries(a || {});
    const bEntries = Object.entries(b || {});
    if (aEntries.length !== bEntries.length) return false;
    for (let i = 0; i < aEntries.length; i++) {
        if (aEntries[i][0] !== bEntries[i][0]) return false;
        // Normalize "1"/1 and "-1"/-1
        if (Number(aEntries[i][1]) !== Number(bEntries[i][1])) return false;
    }
    return true;
}

/**
 * ensureIndex
 * Safe, idempotent index creation.
 *
 * Checks whether an index with the same key pattern already exists on the
 * collection — regardless of name — and only creates a new one if absent.
 * Prevents `IndexKeySpecsConflict` errors caused by a pre-existing index
 * under a different name (e.g. MongoDB's auto-assigned `organizationId_1`).
 *
 * @param {import('mongodb').Collection} collection
 * @param {Object} keys     Index key spec, e.g. { organizationId: 1 }
 * @param {Object} options  createIndex options (name, background, etc.)
 * @returns {Promise<{ created: boolean, existingName?: string }>}
 */
async function ensureIndex(collection, keys, options = {}) {
    const existingIndexes = await collection.indexes();
    const match = existingIndexes.find((idx) => keysEqual(idx.key, keys));

    if (match) {
        if (options.name && match.name !== options.name) {
            logger.debug(
                {
                    collection: collection.collectionName,
                    keys,
                    existingName: match.name,
                    requestedName: options.name,
                    source: "ensureTenantIndexes",
                },
                "INDEX_ALREADY_EXISTS_DIFFERENT_NAME"
            );
        }
        return { created: false, existingName: match.name };
    }

    await collection.createIndex(keys, { background: true, ...options });
    return { created: true };
}

async function ensureIndexesForConnection({ orgId, dbConnection }) {
    if (!dbConnection || dbConnection.readyState !== 1) {
        logger.warn(
            { orgId, readyState: dbConnection?.readyState, source: "ensureTenantIndexes" },
            "[IndexEnsure] Skipping org — connection not ready"
        );
        return { orgId, created: 0, skipped: true };
    }

    let created = 0;

    for (const { collection, specs } of TENANT_INDEX_PLAN) {
        const coll = dbConnection.collection(collection);
        for (const spec of specs) {
            try {
                const result = await ensureIndex(coll, spec.key, { name: spec.name });
                if (result.created) created++;
            } catch (err) {
                // Defense-in-depth: a race between ensureIndex's inspection
                // and createIndex call can still yield a duplicate error.
                // Treat that as a benign no-op, not a failure.
                if (
                    err &&
                    typeof err.message === "string" &&
                    err.message.includes("already exists with a different name")
                ) {
                    logger.warn(
                        {
                            orgId,
                            collection,
                            indexName: spec.name,
                            message: err.message,
                            source: "ensureTenantIndexes",
                        },
                        "INDEX_ALREADY_EXISTS"
                    );
                    continue;
                }

                logger.error(
                    {
                        orgId,
                        collection,
                        indexName: spec.name,
                        err: err.message,
                        source: "ensureTenantIndexes",
                    },
                    "INDEX_ENSURE_FAILED"
                );
            }
        }
    }

    return { orgId, created, skipped: false };
}

/**
 * ensureTenantIndexes
 * Iterates every cached tenant connection and guarantees the critical
 * tenant-isolation indexes exist. Safe to call multiple times.
 *
 * @returns {Promise<void>}
 */
async function ensureTenantIndexes() {
    const connections = dbManager.getAllActiveConnections();

    logger.info(
        { orgCount: connections.length, source: "ensureTenantIndexes" },
        "INDEX_ENSURE_START"
    );

    for (const entry of connections) {
        try {
            await ensureIndexesForConnection(entry);
        } catch (err) {
            logger.error(
                { orgId: entry.orgId, err: err.message, source: "ensureTenantIndexes" },
                "INDEX_ENSURE_FAILED"
            );
        }
    }

    logger.info(
        { orgCount: connections.length, source: "ensureTenantIndexes" },
        "INDEX_ENSURE_DONE"
    );
}

module.exports = {
    ensureTenantIndexes,
    ensureIndexesForConnection,
    ensureIndex,
    TENANT_INDEX_PLAN,
};
