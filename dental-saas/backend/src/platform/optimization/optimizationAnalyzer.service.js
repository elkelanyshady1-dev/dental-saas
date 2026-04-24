/**
 * optimizationAnalyzer.service.js — Cost Optimization Recommendation Engine
 *
 * Orchestrates: costMetrics → optimizationPolicy → persisted recommendation.
 *
 * The analyzer is read-only with respect to org/cluster state — it only
 * writes to the OptimizationRecommendation history collection on the
 * platform DB. Acting on a recommendation is the executor's job.
 *
 * PLANE: Platform.
 */

"use strict";

const getPlatformModel = require("@core/db/getPlatformModel");
const clusterRegistry = require("@core/db/clusterRegistry");
const logger = require("@utils/logger");

const OrganizationDef = require("@shared/models/Organization");
const RecommendationDef = require("./OptimizationRecommendation.model");
const ClusterDef = require("../domain/models/Cluster.model");
const costMetrics = require("./costMetrics.service");
const policy = require("./optimizationPolicy.service");

// Lazy bindings — platformConnection is initialised by boot, but this
// module can be required at any point in the boot sequence.
function Organization() {
    return getPlatformModel(OrganizationDef);
}
function Recommendation() {
    return getPlatformModel(RecommendationDef);
}
function ClusterModel() {
    return getPlatformModel(ClusterDef);
}

/**
 * Load all clusters with the metadata the policy needs (tier + load).
 * Combines ENV-seeded entries (clusterRegistry) with DB-decorated ones.
 */
async function _loadClustersForPolicy() {
    const envEntries = clusterRegistry.all() || {};
    const envList = Object.values(envEntries);
    let dbEntries = [];
    try {
        dbEntries = await ClusterModel().find({})
            .select("key region status tier costPerMonthUsd load capacity")
            .lean();
    } catch (_) {
        // Cluster collection empty or unreachable — proceed with ENV-only.
    }
    const dbByKey = new Map(dbEntries.map(d => [d.key, d]));
    return envList.map(env => {
        const db = dbByKey.get(env.key) || {};
        return {
            key: env.key,
            region: env.region,
            priority: env.priority,
            status: db.status ?? env.status ?? "ACTIVE",
            tier: db.tier || "MID",
            costPerMonthUsd: db.costPerMonthUsd || 0,
            load: typeof db.load === "number" ? db.load : (env.load ?? 0),
            capacity: db.capacity || 0,
        };
    });
}

/**
 * analyzeOrg
 * Single-org analysis. Persists a new Recommendation row and returns it.
 *
 * @param {string|object} orgOrId — either an orgId or a hydrated org doc
 * @returns {Promise<object>} the persisted Recommendation document (lean)
 */
async function analyzeOrg(orgOrId) {
    const org = typeof orgOrId === "string" || orgOrId?.toString?.length === 24
        ? await Organization().findById(orgOrId).lean()
        : orgOrId;

    if (!org) {
        throw new Error(`[optimizationAnalyzer] org not found: ${orgOrId}`);
    }

    const clusters = await _loadClustersForPolicy();
    const metrics = await costMetrics.collectForOrg(org);
    const decision = policy.evaluate(metrics, clusters);

    let savingUsd = 0;
    if (["MOVE", "DOWNGRADE"].includes(decision.action) && decision.targetCluster) {
        savingUsd = await costMetrics.estimateSavingForMove({
            org,
            fromCluster: metrics.currentCluster,
            toCluster: decision.targetCluster,
        });
    }

    const doc = await Recommendation().create({
        organizationId: org._id,
        currentCluster: metrics.currentCluster,
        targetCluster: decision.targetCluster,
        metrics: {
            dbSizeMB: metrics.dbSizeMB,
            storageMB: metrics.storageMB,
            indexMB: metrics.indexMB,
            collectionCount: metrics.collectionCount,
            documentCount: metrics.documentCount,
            lastActiveAt: metrics.lastActiveAt,
            daysSinceActive: metrics.daysSinceActive,
            activityScore: metrics.activityScore,
            clusterLoad: metrics.clusterLoad,
        },
        recommendedAction: decision.action,
        reason: decision.reason,
        costSavingEstimateUsd: savingUsd,
        riskLevel: decision.riskLevel,
        status: "PENDING",
    });

    logger.info(
        {
            event: "OPTIMIZATION_RECOMMENDATION",
            orgId: String(org._id),
            action: decision.action,
            target: decision.targetCluster,
            savingUsd,
        },
        `[Optimization] ${org.name || org._id} → ${decision.action}`
    );

    return doc.toObject();
}

/**
 * analyzeAll
 * Sweeps every org and writes recommendations. Errors per-org are
 * caught + logged so a single failure doesn't stop the cycle.
 *
 * @returns {Promise<{ analyzed, recommendations, errors }>}
 */
async function analyzeAll({ limit = 1000 } = {}) {
    const orgs = await Organization()
        .find({ isActive: { $ne: false }, isArchived: { $ne: true } })
        .select("_id name slug cluster lastActivityAt isActive isArchived")
        .limit(limit)
        .lean();

    const recommendations = [];
    const errors = [];

    for (const org of orgs) {
        try {
            const rec = await analyzeOrg(org);
            recommendations.push(rec);
        } catch (err) {
            errors.push({ orgId: String(org._id), error: err.message });
            logger.warn(
                { event: "OPTIMIZATION_ANALYZE_FAILED", orgId: String(org._id), err: err.message },
                "[Optimization] analyzeOrg failed (continuing sweep)"
            );
        }
    }

    return {
        analyzed: orgs.length,
        recommendations,
        errors,
    };
}

/**
 * getLatestRecommendations
 * For the dashboard: most recent recommendation per org, optionally
 * filtered by status.
 */
async function getLatestRecommendations({ status = null, limit = 200 } = {}) {
    const match = status ? { status } : {};
    return Recommendation()
        .aggregate([
            { $match: match },
            { $sort: { organizationId: 1, createdAt: -1 } },
            { $group: { _id: "$organizationId", doc: { $first: "$$ROOT" } } },
            { $replaceRoot: { newRoot: "$doc" } },
            { $sort: { createdAt: -1 } },
            { $limit: limit },
        ]);
}

/**
 * getLatestForOrg — latest recommendation row for one org.
 */
async function getLatestForOrg(orgId) {
    return Recommendation()
        .findOne({ organizationId: orgId })
        .sort({ createdAt: -1 })
        .lean();
}

module.exports = {
    analyzeOrg,
    analyzeAll,
    getLatestRecommendations,
    getLatestForOrg,
};
