/**
 * optimizationExecutor.service.js — Acts on a recommendation
 *
 * Translates analyzer output into concrete platform-side actions:
 *   MOVE             → migrationService.startMigration (full Phase 8 pipeline)
 *   DOWNGRADE        → migrationService.startMigration (target = cheaper cluster)
 *   ARCHIVE          → mark org as archived + writeLocked (data retained)
 *   ARCHIVE_PARTIAL  → mark for partial-archive review (TODO: cold-data exporter)
 *   KEEP             → no-op
 *
 * Idempotent: re-running the same recommendation is safe — each branch
 * checks current state before acting.
 *
 * PLANE: Platform.
 */

"use strict";

const getPlatformModel = require("@core/db/getPlatformModel");
const logger = require("@utils/logger");

const OrganizationDef = require("@shared/models/Organization");
const RecommendationDef = require("./OptimizationRecommendation.model");
const migrationService = require("../migration/migration.service");

function Organization() {
    return getPlatformModel(OrganizationDef);
}
function Recommendation() {
    return getPlatformModel(RecommendationDef);
}

class OptimizationExecutionError extends Error {
    constructor(message, code, status = 400) {
        super(message);
        this.code = code;
        this.statusCode = status;
    }
}

// ─── Internal helpers ───────────────────────────────────────────────────────

async function _markRecommendation(recId, status, result = {}, executedBy = "system") {
    if (!recId) return;
    await Recommendation().updateOne(
        { _id: recId },
        {
            $set: {
                status,
                executedAt: new Date(),
                executedBy,
                executionResult: result,
            },
        }
    );
}

async function _resolveRecommendation({ recommendationId, orgId }) {
    if (recommendationId) {
        const rec = await Recommendation().findById(recommendationId).lean();
        if (!rec) throw new OptimizationExecutionError("Recommendation not found", "REC_NOT_FOUND", 404);
        return rec;
    }
    if (!orgId) throw new OptimizationExecutionError("orgId or recommendationId required", "MISSING_TARGET", 400);
    const rec = await Recommendation()
        .findOne({ organizationId: orgId })
        .sort({ createdAt: -1 })
        .lean();
    if (!rec) throw new OptimizationExecutionError("No recommendation exists for this org", "NO_RECOMMENDATION", 404);
    return rec;
}

// ─── Action handlers ────────────────────────────────────────────────────────

async function _handleMoveOrDowngrade(rec, actor) {
    if (!rec.targetCluster) {
        throw new OptimizationExecutionError(
            "Recommendation has no targetCluster — cannot move",
            "MISSING_TARGET_CLUSTER",
            409
        );
    }
    // Defensive: confirm the org isn't already on the target.
    const org = await Organization().findById(rec.organizationId).lean();
    if (!org) throw new OptimizationExecutionError("Org not found", "ORG_NOT_FOUND", 404);
    if (org.cluster === rec.targetCluster) {
        return { skipped: true, reason: "already on target cluster", cluster: org.cluster };
    }

    // Hand off to the Phase 8 migration service. The executor only KICKS
    // OFF the migration — the operator drives sync/cutover/verify through
    // the Migration dashboard. This guarantees a human touchpoint per the
    // "MUST be idempotent" + "ZERO downtime migration" constraints.
    const updated = await migrationService.startMigration({
        orgId: String(rec.organizationId),
        targetCluster: rec.targetCluster,
        actor,
        reason: `cost-optimization:${rec.recommendedAction.toLowerCase()}` +
                (rec.reason ? ` — ${rec.reason}` : ""),
    });

    return {
        migrationStarted: true,
        migrationId: updated.migrationId,
        state: updated.migrationState,
        sourceCluster: org.cluster,
        targetCluster: rec.targetCluster,
    };
}

async function _handleArchive(rec, actor) {
    const org = await Organization().findById(rec.organizationId).lean();
    if (!org) throw new OptimizationExecutionError("Org not found", "ORG_NOT_FOUND", 404);
    if (org.isArchived) {
        return { skipped: true, reason: "already archived" };
    }

    // Soft archive — flip flags, lock writes. The actual cold-storage
    // export (R2 dump, snapshot, etc.) is operator work that can run
    // off-line against the still-present per-org DB. We do NOT drop the
    // tenant DB here.
    await Organization().updateOne(
        { _id: rec.organizationId },
        {
            $set: {
                isArchived: true,
                archivedAt: new Date(),
                archivedBy: actor || "system",
                archivedReason: rec.reason || "cost-optimization:idle",
                writeLocked: true,
            },
        }
    );

    logger.info(
        { event: "OPTIMIZATION_ARCHIVED", orgId: String(rec.organizationId),
          actor, reason: rec.reason },
        "[Optimization] Org archived (soft) — writes locked, data retained"
    );

    return { archived: true };
}

async function _handleArchivePartial(rec /* actor */) {
    // Placeholder — partial archive (cold-data export) requires a per-org
    // collection scanner that isn't built yet. We log + flag the rec as
    // SKIPPED so the dashboard surfaces it for operator review.
    logger.warn(
        { event: "OPTIMIZATION_PARTIAL_ARCHIVE_PENDING", orgId: String(rec.organizationId) },
        "[Optimization] ARCHIVE_PARTIAL not yet automated — flagged for operator review"
    );
    return { partialArchivePending: true };
}

// ─── Public API ─────────────────────────────────────────────────────────────

/**
 * executeRecommendation
 * @param {object} params
 * @param {string} [params.recommendationId] — explicit rec id (preferred)
 * @param {string} [params.orgId]            — fallback: latest rec for this org
 * @param {string} [params.actor]            — who triggered execution
 * @returns {Promise<{ recommendationId, action, status, result }>}
 */
async function executeRecommendation({ recommendationId, orgId, actor }) {
    const rec = await _resolveRecommendation({ recommendationId, orgId });

    if (rec.status === "EXECUTED" || rec.status === "EXECUTING") {
        return {
            recommendationId: String(rec._id),
            action: rec.recommendedAction,
            status: rec.status,
            result: { idempotent: true, prior: rec.executionResult || null },
        };
    }

    await _markRecommendation(rec._id, "EXECUTING", { startedAt: new Date() }, actor);

    let result;
    let finalStatus = "EXECUTED";
    try {
        switch (rec.recommendedAction) {
            case "MOVE":
            case "DOWNGRADE":
                result = await _handleMoveOrDowngrade(rec, actor);
                if (result.skipped) finalStatus = "SKIPPED";
                break;
            case "ARCHIVE":
                result = await _handleArchive(rec, actor);
                if (result.skipped) finalStatus = "SKIPPED";
                break;
            case "ARCHIVE_PARTIAL":
                result = await _handleArchivePartial(rec, actor);
                finalStatus = "SKIPPED";   // pending operator action
                break;
            case "KEEP":
                result = { noop: true };
                finalStatus = "SKIPPED";
                break;
            default:
                throw new OptimizationExecutionError(
                    `Unknown action: ${rec.recommendedAction}`,
                    "UNKNOWN_ACTION",
                    400
                );
        }
        await _markRecommendation(rec._id, finalStatus, result, actor);
    } catch (err) {
        await _markRecommendation(rec._id, "FAILED", { error: err.message }, actor);
        throw err;
    }

    return {
        recommendationId: String(rec._id),
        action: rec.recommendedAction,
        status: finalStatus,
        result,
    };
}

/**
 * executeBatch
 * Execute every PENDING recommendation. Used by the scheduler when
 * OPTIMIZATION_AUTO_EXECUTE=true.
 *
 * Stops at first FAILED unless `continueOnError` is set (default false).
 */
async function executeBatch({ actor, continueOnError = false } = {}) {
    const pending = await Recommendation()
        .find({ status: "PENDING" })
        .sort({ createdAt: 1 })
        .limit(50)
        .lean();

    const results = [];
    for (const rec of pending) {
        try {
            const r = await executeRecommendation({ recommendationId: rec._id, actor });
            results.push(r);
        } catch (err) {
            results.push({
                recommendationId: String(rec._id),
                action: rec.recommendedAction,
                status: "FAILED",
                error: err.message,
            });
            if (!continueOnError) break;
        }
    }
    return results;
}

module.exports = {
    OptimizationExecutionError,
    executeRecommendation,
    executeBatch,
};
