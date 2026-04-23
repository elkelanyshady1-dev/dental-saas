/**
 * clusterRegistry.js
 * Core Infrastructure — Cluster Registry (ENV source of truth, DB decoration)
 *
 * Maintains the canonical list of tenant clusters for this deployment.
 *
 * HYBRID RULE (load-bearing — do not change without updating the plan):
 *     Connection info (URI, priority, fallback)  →  ENV
 *     Dynamic metadata (status, load, capacity)  →  DB  (optional refresh)
 *
 * If the platform DB is unreachable, the routing table remains valid from
 * ENV — only provisioning-time picks degrade (no capacity data).
 *
 * ENV CONTRACT:
 *   CLUSTER_KEYS              — optional comma-separated allowlist of keys
 *                               (e.g. "MEA-EG-1,MEA-EG-2"). If unset,
 *                               discover by prefix scan of MONGO_URI_* vars.
 *   MONGO_URI_<KEY>           — REQUIRED per cluster. Key case-insensitive;
 *                               dashes become underscores in the env name.
 *                               e.g. cluster "MEA-EG-1" → MONGO_URI_MEA_EG_1
 *   CLUSTER_REGION_<KEY>      — optional. Defaults to the first dash-segment
 *                               of the key (e.g. "MEA-EG-1" → "MEA").
 *   CLUSTER_PRIORITY_<KEY>    — optional. Lower wins in assignment. Default 100.
 *
 *   MONGO_URI_DEV_SINGLE      — dev convenience. When set AND no cluster keys
 *                               are configured, a synthetic "default" cluster
 *                               is registered pointing at this URI (region
 *                               "MEA", priority 1). Forbidden in production
 *                               (enforced at boot in server.js).
 *
 * ORDERING:
 *   getByRegion(region) returns a list pre-sorted by (priority asc, key asc).
 *   The sort runs ONCE at seed / refresh time and is cached per region.
 *
 * PLANE: Core Infrastructure
 */

"use strict";

const logger = require("@utils/logger");

const RESERVED_SUFFIXES = new Set(["PLATFORM", "SHARED", "DEV_SINGLE"]);

let CLUSTER_REGISTRY = {};     // key → { key, uri, region, priority, fallback }
let clusterMeta = {};          // key → { status, load, capacity, lastHealthCheck }
const sortedByRegion = new Map();

const envKey = (clusterKey) => clusterKey.replace(/-/g, "_").toUpperCase();
const keyFromEnvSuffix = (suffix) => suffix.replace(/_/g, "-");

function inferRegionFromKey(key) {
    const first = (key.split("-")[0] || "").toUpperCase();
    return first || "MEA";
}

function discoverByPrefix() {
    const keys = [];
    for (const envVar of Object.keys(process.env)) {
        if (!envVar.startsWith("MONGO_URI_")) continue;
        const suffix = envVar.slice("MONGO_URI_".length);
        if (!suffix || RESERVED_SUFFIXES.has(suffix)) continue;
        keys.push(keyFromEnvSuffix(suffix));
    }
    return keys;
}

/**
 * seedFromEnv
 * Rebuilds the registry from environment variables. Pure, synchronous,
 * no DB access. Called once at module load and may be re-run (e.g., tests).
 */
function seedFromEnv() {
    CLUSTER_REGISTRY = {};
    clusterMeta = {};
    sortedByRegion.clear();

    const explicit = (process.env.CLUSTER_KEYS || "")
        .split(",").map(s => s.trim()).filter(Boolean);
    const keys = explicit.length > 0 ? explicit : discoverByPrefix();

    for (const rawKey of keys) {
        const key = rawKey.trim();
        if (!key) continue;

        const base = envKey(key);
        const uri = process.env["MONGO_URI_" + base] || process.env.MONGO_URI_DEV_SINGLE;
        if (!uri) {
            logger.warn(
                { service: "clusterRegistry", key, expectedEnv: "MONGO_URI_" + base },
                "[clusterRegistry] Cluster key declared but no URI env var found — skipping"
            );
            continue;
        }

        const region = (
            process.env["CLUSTER_REGION_" + base] || inferRegionFromKey(key)
        ).toUpperCase();

        const priorityRaw = process.env["CLUSTER_PRIORITY_" + base];
        const priority = priorityRaw != null ? Number(priorityRaw) : 100;

        CLUSTER_REGISTRY[key] = {
            key,
            uri,
            region,
            priority: Number.isFinite(priority) ? priority : 100,
            fallback: null,
        };
    }

    // Dev fallback: no clusters declared → synthesize a default one from
    // the dev-single URI or the legacy MONGO_URI so the system boots
    // without any new env vars.
    if (Object.keys(CLUSTER_REGISTRY).length === 0) {
        const fallbackUri = process.env.MONGO_URI_DEV_SINGLE
            || process.env.MONGO_URI_PLATFORM
            || process.env.MONGO_URI;
        if (fallbackUri) {
            CLUSTER_REGISTRY["default"] = {
                key: "default",
                uri: fallbackUri,
                region: "MEA",
                priority: 1,
                fallback: null,
            };
            logger.info(
                { service: "clusterRegistry", key: "default", region: "MEA" },
                "[clusterRegistry] No CLUSTER_KEYS configured — synthesized 'default' cluster (MEA) from MONGO_URI fallback"
            );
        }
    }

    logger.info(
        {
            service: "clusterRegistry",
            count: Object.keys(CLUSTER_REGISTRY).length,
            keys: Object.keys(CLUSTER_REGISTRY),
        },
        "[clusterRegistry] Seeded from ENV"
    );
}

/**
 * refreshFromDb
 * Pulls dynamic metadata (status, load, capacity) from the platform DB's
 * `clusters` collection and layers it on top of the ENV-seeded registry.
 *
 * Non-fatal — if the platform DB is unreachable, the registry remains valid
 * from ENV. Only provisioning-time picks that consult load degrade.
 */
async function refreshFromDb() {
    try {
        const getPlatformModel = require("./getPlatformModel");
        const ClusterDef = require("@platform/domain/models/Cluster.model");
        const Cluster = getPlatformModel(ClusterDef);

        const docs = await Cluster.find({}).lean();
        const next = {};
        for (const doc of docs) {
            if (!doc.key) continue;
            next[doc.key] = {
                status: doc.status,
                load: doc.load,
                capacity: doc.capacity,
                lastHealthCheck: doc.lastHealthCheck,
            };
        }
        clusterMeta = next;
        sortedByRegion.clear();

        logger.info(
            {
                service: "clusterRegistry",
                decorated: Object.keys(clusterMeta).length,
            },
            "[clusterRegistry] Metadata refreshed from platform DB"
        );
    } catch (err) {
        logger.warn(
            { service: "clusterRegistry", err: err.message },
            "[clusterRegistry] Metadata refresh from DB failed (non-fatal — ENV registry remains valid)"
        );
    }
}

/**
 * validate
 * Boot-time sanity: every ENV-declared cluster has a usable URI.
 * Bidirectional ENV↔DB drift check happens in validateClusterRegistryVsDb()
 * which is called after refreshFromDb (see config/db.js).
 */
function validate() {
    const problems = [];
    for (const [key, entry] of Object.entries(CLUSTER_REGISTRY)) {
        if (!entry.uri) problems.push(`${key}: no URI`);
        if (!entry.region) problems.push(`${key}: no region`);
    }
    if (problems.length) {
        throw new Error(`[clusterRegistry] Validation failed: ${problems.join("; ")}`);
    }
}

/**
 * validateClusterRegistryVsDb
 * Bidirectional ENV ↔ DB sanity check. Called once after refreshFromDb.
 *   - ENV entries without DB metadata → auto-insert a default row (non-fatal).
 *   - DB entries without matching ENV var → warn (can't route; ops should
 *     remove the orphaned row OR deploy the missing URI).
 *
 * Per the hybrid rule, ENV is always truth; DB is decoration. So DB-only
 * entries never block boot — they just log.
 */
async function validateClusterRegistryVsDb() {
    try {
        const getPlatformModel = require("./getPlatformModel");
        const ClusterDef = require("@platform/domain/models/Cluster.model");
        const Cluster = getPlatformModel(ClusterDef);

        const envKeys = new Set(Object.keys(CLUSTER_REGISTRY));
        const dbKeys = new Set(Object.keys(clusterMeta));

        // ENV entries missing from DB → seed a default row so refresh works.
        const missingInDb = [...envKeys].filter(k => !dbKeys.has(k));
        if (missingInDb.length > 0) {
            await Cluster.insertMany(
                missingInDb.map((key) => ({
                    key,
                    region: CLUSTER_REGISTRY[key].region,
                    status: "ACTIVE",
                    capacity: 0,
                    load: 0,
                })),
                { ordered: false }
            ).catch(() => { /* ignore dup-key races on concurrent boots */ });
            logger.info(
                { service: "clusterRegistry", seeded: missingInDb },
                "[clusterRegistry] Auto-seeded missing cluster metadata rows"
            );
        }

        // DB entries orphaned from ENV → warn.
        const orphaned = [...dbKeys].filter(k => !envKeys.has(k));
        if (orphaned.length > 0) {
            logger.warn(
                { service: "clusterRegistry", orphaned },
                "[clusterRegistry] Cluster metadata rows exist in DB with no matching MONGO_URI_<key> env var — cannot route to them"
            );
        }
    } catch (err) {
        logger.warn(
            { service: "clusterRegistry", err: err.message },
            "[clusterRegistry] Bidirectional validation skipped (non-fatal)"
        );
    }
}

// ─── Public query API ───────────────────────────────────────────────────────

/**
 * get — Single entry by key (null if unknown).
 * Returns a merged view of ENV base + DB metadata.
 */
function get(key) {
    const base = CLUSTER_REGISTRY[key];
    if (!base) return null;
    const meta = clusterMeta[key] || {};
    return {
        ...base,
        status: meta.status ?? "ACTIVE",
        load: meta.load ?? 0,
        capacity: meta.capacity ?? 0,
        lastHealthCheck: meta.lastHealthCheck ?? null,
    };
}

/**
 * getByRegion — All clusters in a region, pre-sorted by priority asc.
 * Sort runs ONCE per region and is cached; refreshFromDb invalidates.
 */
function getByRegion(region) {
    const upper = String(region || "").toUpperCase();
    if (sortedByRegion.has(upper)) return sortedByRegion.get(upper);

    const list = Object.values(CLUSTER_REGISTRY)
        .filter(c => c.region === upper)
        .map(c => {
            const meta = clusterMeta[c.key] || {};
            return {
                ...c,
                status: meta.status ?? "ACTIVE",
                load: meta.load ?? 0,
                capacity: meta.capacity ?? 0,
                lastHealthCheck: meta.lastHealthCheck ?? null,
            };
        })
        .sort((a, b) => (a.priority ?? 100) - (b.priority ?? 100) || a.key.localeCompare(b.key));

    sortedByRegion.set(upper, list);
    return list;
}

/**
 * all — All registered clusters (order not guaranteed). Use getByRegion
 * when ordering matters.
 */
function all() {
    return Object.keys(CLUSTER_REGISTRY).map(get);
}

// Seed immediately on require (no DB access — safe at module load).
seedFromEnv();

module.exports = {
    seedFromEnv,
    refreshFromDb,
    validate,
    validateClusterRegistryVsDb,
    get,
    getByRegion,
    all,
    // test-only internals
    _registry: () => CLUSTER_REGISTRY,
    _meta: () => clusterMeta,
};
