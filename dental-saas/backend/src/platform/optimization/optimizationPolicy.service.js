/**
 * optimizationPolicy.service.js — Pure rules for the Cost Optimization Engine
 *
 * Inputs:  metrics blob from costMetrics.collectForOrg
 *          clusters list (from clusterRegistry) for picking a target on MOVE
 * Outputs: { action, targetCluster, reason, riskLevel }
 *
 * Pure functions only — no DB, no async, no side effects. Trivial to unit
 * test and to reason about.
 *
 * Rule precedence (first match wins):
 *   R1 — Idle org (≥ IDLE_DAYS without activity) → ARCHIVE
 *   R2 — Cold-data partial archive               → ARCHIVE_PARTIAL
 *   R3 — Small org on a HIGH cluster             → DOWNGRADE
 *   R4 — Cluster overloaded (>= LOAD_THRESHOLD)
 *        AND this org is "heavy"                  → MOVE
 *   else                                          → KEEP
 */

"use strict";

// ─── Tunables — env overrideable ────────────────────────────────────────────
const IDLE_DAYS = parseInt(process.env.OPTIMIZATION_IDLE_DAYS || "90", 10);
const SMALL_ORG_MB = parseInt(process.env.OPTIMIZATION_SMALL_ORG_MB || "100", 10);
const HEAVY_ORG_MB = parseInt(process.env.OPTIMIZATION_HEAVY_ORG_MB || "1024", 10);
const COLD_DATA_RATIO = parseFloat(process.env.OPTIMIZATION_COLD_DATA_RATIO || "0.7");
const COLD_AGE_DAYS = parseInt(process.env.OPTIMIZATION_COLD_AGE_DAYS || "365", 10);
const LOAD_THRESHOLD = parseFloat(process.env.OPTIMIZATION_CLUSTER_LOAD_THRESHOLD || "0.8");

// ─── Helpers ────────────────────────────────────────────────────────────────

function _findCheaperCluster({ currentCluster, currentTier, clusters }) {
    // Pick the lowest-tier ACTIVE cluster in the same region as a downgrade
    // target. Falls back to ANY ACTIVE cluster with a strictly lower tier
    // ranking. Returns null if no candidate exists.
    const TIER_RANK = { LOW: 0, MID: 1, HIGH: 2 };
    const currentRank = TIER_RANK[currentTier] ?? 1;

    const eligible = (clusters || [])
        .filter(c => c.key !== currentCluster)
        .filter(c => (c.status ?? "ACTIVE") === "ACTIVE")
        .filter(c => (TIER_RANK[c.tier ?? "MID"] ?? 1) < currentRank)
        .sort((a, b) => (TIER_RANK[a.tier ?? "MID"] ?? 1) - (TIER_RANK[b.tier ?? "MID"] ?? 1)
                     || (a.priority ?? 100) - (b.priority ?? 100));

    return eligible[0]?.key || null;
}

function _findRelaxedCluster({ currentCluster, currentRegion, clusters }) {
    // Pick the least-loaded ACTIVE cluster in the same region. Falls back to
    // any ACTIVE cluster (cross-region) when no in-region target exists.
    const inRegion = (clusters || [])
        .filter(c => c.key !== currentCluster)
        .filter(c => (c.status ?? "ACTIVE") === "ACTIVE")
        .filter(c => !currentRegion || c.region === currentRegion)
        .sort((a, b) => (a.load ?? 0) - (b.load ?? 0));

    if (inRegion[0]) return inRegion[0].key;

    const anyActive = (clusters || [])
        .filter(c => c.key !== currentCluster)
        .filter(c => (c.status ?? "ACTIVE") === "ACTIVE")
        .sort((a, b) => (a.load ?? 0) - (b.load ?? 0));

    return anyActive[0]?.key || null;
}

// ─── Public API ─────────────────────────────────────────────────────────────

/**
 * evaluate
 * @param {object} metrics — costMetrics.collectForOrg output
 * @param {Array<object>} clusters — clusterRegistry entries (with tier/load)
 * @returns {{ action, targetCluster, reason, riskLevel }}
 */
function evaluate(metrics, clusters = []) {
    if (!metrics) {
        return { action: "KEEP", targetCluster: null, reason: "no metrics", riskLevel: "LOW" };
    }

    const {
        currentCluster,
        dbSizeMB = 0,
        daysSinceActive = 0,
        clusterLoad = 0,
        clusterTier = "MID",
        metricsAvailable,
    } = metrics;

    // Without tenant DB stats we can't make confident decisions. Recommend
    // KEEP rather than risking an action on stale info.
    if (!metricsAvailable) {
        return {
            action: "KEEP",
            targetCluster: null,
            reason: "tenant DB metrics unavailable",
            riskLevel: "LOW",
        };
    }

    const currentClusterEntry = (clusters || []).find(c => c.key === currentCluster);
    const currentRegion = currentClusterEntry?.region;

    // ── R1: Idle org → ARCHIVE ──────────────────────────────────────────
    if (daysSinceActive >= IDLE_DAYS) {
        return {
            action: "ARCHIVE",
            targetCluster: null,
            reason: `org idle for ${daysSinceActive} days (>= ${IDLE_DAYS})`,
            riskLevel: "MEDIUM",
        };
    }

    // ── R2: Cold-data partial archive ──────────────────────────────────
    // Heuristic proxy: an org with substantial DB size and low recent
    // activity is likely to have cold historical data. Real implementation
    // would scan by createdAt across top collections — we keep this
    // conservative until that scanner lands.
    if (
        dbSizeMB >= HEAVY_ORG_MB &&
        daysSinceActive >= Math.floor(IDLE_DAYS / 3) &&
        metrics.activityScore <= 30
    ) {
        return {
            action: "ARCHIVE_PARTIAL",
            targetCluster: null,
            reason: `large org (${dbSizeMB}MB) with low activity (score=${metrics.activityScore}) — likely cold data`,
            riskLevel: "MEDIUM",
        };
    }

    // ── R3: Small org on HIGH cluster → DOWNGRADE ──────────────────────
    if (dbSizeMB <= SMALL_ORG_MB && clusterTier === "HIGH") {
        const target = _findCheaperCluster({
            currentCluster,
            currentTier: clusterTier,
            clusters,
        });
        if (target) {
            return {
                action: "DOWNGRADE",
                targetCluster: target,
                reason: `small org (${dbSizeMB}MB) on HIGH-tier cluster — DOWNGRADE to ${target}`,
                riskLevel: "LOW",
            };
        }
    }

    // ── R4: Cluster overloaded → MOVE heavy orgs out ────────────────────
    if (clusterLoad >= LOAD_THRESHOLD && dbSizeMB >= HEAVY_ORG_MB) {
        const target = _findRelaxedCluster({
            currentCluster,
            currentRegion,
            clusters,
        });
        if (target) {
            return {
                action: "MOVE",
                targetCluster: target,
                reason: `cluster ${currentCluster} overloaded (load=${clusterLoad}); moving heavy org (${dbSizeMB}MB) to ${target}`,
                riskLevel: "MEDIUM",
            };
        }
    }

    return {
        action: "KEEP",
        targetCluster: null,
        reason: "within thresholds",
        riskLevel: "LOW",
    };
}

module.exports = {
    evaluate,
    // exported for tests / introspection
    THRESHOLDS: {
        IDLE_DAYS,
        SMALL_ORG_MB,
        HEAVY_ORG_MB,
        COLD_DATA_RATIO,
        COLD_AGE_DAYS,
        LOAD_THRESHOLD,
    },
};
