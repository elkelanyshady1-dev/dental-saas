/**
 * costMetrics.service.js — Per-org metrics for the Cost Optimization Engine
 *
 * Pulls together the data the policy engine needs to decide MOVE/ARCHIVE/etc.
 * Read-only: this service NEVER mutates org state.
 *
 * Sources:
 *   - Tenant DB: db.stats() for storage size + collection/document counts.
 *     Activity = max(updatedAt) across a small set of high-signal collections.
 *   - Platform DB: Organization doc for createdAt + lastActivityAt overrides.
 *   - clusterRegistry: cluster status + load + tier + cost (DB-decorated).
 *
 * PLANE: Platform.
 */

"use strict";

const { resolveOrgConnection } = require("@core/db/connectionResolver");
const clusterRegistry = require("@core/db/clusterRegistry");
const getPlatformModel = require("@core/db/getPlatformModel");
const logger = require("@utils/logger");
const ClusterDef = require("../domain/models/Cluster.model");

// Lazy bind — platformConnection isn't ready at require time.
function ClusterModel() {
    return getPlatformModel(ClusterDef);
}

// Collections we sample for "last activity" — pick high-signal user-facing
// writes. Missing collections (per-org variability) are simply skipped.
const ACTIVITY_PROBES = [
    "appointments",
    "patients",
    "treatments",
    "treatmentinvoices",
    "patientpayments",
    "clinicalsnapshots",
    "orthodonticcases",
];

/**
 * Sample the most recent updatedAt across ACTIVITY_PROBES on the org's
 * tenant DB. Returns the latest Date found, or null if no probed
 * collection exists / has documents.
 */
async function _resolveLastActiveAt(tenantDb) {
    let latest = null;
    for (const name of ACTIVITY_PROBES) {
        try {
            const doc = await tenantDb.collection(name)
                .find({ updatedAt: { $exists: true } })
                .project({ updatedAt: 1 })
                .sort({ updatedAt: -1 })
                .limit(1)
                .toArray();
            const candidate = doc[0]?.updatedAt;
            if (candidate && (!latest || candidate > latest)) latest = candidate;
        } catch (err) {
            // Collection missing or read denied — skip silently. Activity
            // probing is best-effort.
        }
    }
    return latest;
}

/**
 * Convert a "days since last active" number into a 0..100 activity score.
 * 0 days → 100, ≥365 days → 0, linear in between.
 */
function _scoreActivity(daysSinceActive) {
    if (daysSinceActive == null) return 0;
    if (daysSinceActive <= 0) return 100;
    if (daysSinceActive >= 365) return 0;
    return Math.round(100 - (daysSinceActive / 365) * 100);
}

/**
 * collectForOrg
 * Returns the metrics blob the analyzer/policy needs.
 *
 * @param {object} org — platform-side Organization doc (must include _id, cluster)
 * @returns {Promise<object>} metrics
 */
async function collectForOrg(org) {
    if (!org || !org._id) {
        throw new Error("[costMetrics] org doc with _id is required");
    }
    if (!org.cluster) {
        throw new Error(`[costMetrics] org ${org._id} has no cluster — provision it first`);
    }

    const orgIdStr = String(org._id);
    let dbStats = null;
    let lastActiveAt = null;

    try {
        const conn = await resolveOrgConnection(orgIdStr);
        // db.stats() runs cheaply against the per-org DB.
        dbStats = await conn.db.stats();
        lastActiveAt = await _resolveLastActiveAt(conn.db);
    } catch (err) {
        // Cluster down or org DB never created — return zero metrics with
        // a flag so the policy engine can still produce a recommendation
        // (typically: KEEP, with a "metrics_unavailable" reason).
        logger.warn(
            { event: "COST_METRICS_UNAVAILABLE", orgId: orgIdStr, err: err.message },
            "[costMetrics] Could not read tenant DB stats — falling back to zeros"
        );
    }

    const dbSizeMB    = dbStats ? Math.round((dbStats.dataSize || 0) / 1024 / 1024) : 0;
    const storageMB   = dbStats ? Math.round((dbStats.storageSize || 0) / 1024 / 1024) : 0;
    const indexMB     = dbStats ? Math.round((dbStats.indexSize || 0) / 1024 / 1024) : 0;
    const collectionCount = dbStats ? (dbStats.collections || 0) : 0;
    const documentCount   = dbStats ? (dbStats.objects || 0) : 0;

    // Prefer org.lastActivityAt if the platform tracks it explicitly;
    // otherwise fall back to the tenant-side probe.
    const finalLastActive = org.lastActivityAt || lastActiveAt;
    const daysSinceActive = finalLastActive
        ? Math.floor((Date.now() - new Date(finalLastActive).getTime()) / (1000 * 60 * 60 * 24))
        : null;

    // Cluster-side info (load, tier).
    let clusterLoad = 0;
    let clusterTier = "MID";
    let clusterCostUsd = 0;
    try {
        const clusterEntry = clusterRegistry.get(org.cluster) || {};
        clusterLoad = clusterEntry.load ?? 0;
        // Pull tier + cost from the DB-decorated metadata. ENV-only entries
        // won't have it — default to MID/0.
        const meta = await ClusterModel().findOne({ key: org.cluster })
            .select("tier costPerMonthUsd load")
            .lean();
        if (meta) {
            clusterTier = meta.tier || "MID";
            clusterCostUsd = meta.costPerMonthUsd || 0;
            if (typeof meta.load === "number") clusterLoad = meta.load;
        }
    } catch (_) {
        // Cluster registry missing — keep defaults.
    }

    return {
        orgId: orgIdStr,
        currentCluster: org.cluster,
        dbSizeMB,
        storageMB,
        indexMB,
        collectionCount,
        documentCount,
        lastActiveAt: finalLastActive ? new Date(finalLastActive) : null,
        daysSinceActive: daysSinceActive ?? 0,
        activityScore: _scoreActivity(daysSinceActive),
        clusterLoad,
        clusterTier,
        clusterCostUsd,
        metricsAvailable: !!dbStats,
    };
}

/**
 * Estimate monthly cost saving in USD if `org` is moved to `targetCluster`.
 *
 * Coarse: assumes orgs of similar size pay proportionally to cluster
 * cost-per-month. Real cloud-vendor pricing is more nuanced; this is a
 * conservative proxy good enough for ranking recommendations.
 */
async function estimateSavingForMove({ org, fromCluster, toCluster }) {
    if (!fromCluster || !toCluster || fromCluster === toCluster) return 0;
    try {
        const [fromDoc, toDoc] = await Promise.all([
            ClusterModel().findOne({ key: fromCluster }).select("costPerMonthUsd capacity").lean(),
            ClusterModel().findOne({ key: toCluster }).select("costPerMonthUsd capacity").lean(),
        ]);
        const fromCost = fromDoc?.costPerMonthUsd || 0;
        const toCost   = toDoc?.costPerMonthUsd || 0;
        const fromCap  = Math.max(1, fromDoc?.capacity || 0);
        const toCap    = Math.max(1, toDoc?.capacity || 0);
        const perOrgFrom = fromCost / fromCap;
        const perOrgTo   = toCost / toCap;
        const saving = perOrgFrom - perOrgTo;
        return Math.max(0, Math.round(saving * 100) / 100);
    } catch (_) {
        return 0;
    }
}

module.exports = {
    collectForOrg,
    estimateSavingForMove,
    _scoreActivity,         // exported for unit tests
    ACTIVITY_PROBES,
};
