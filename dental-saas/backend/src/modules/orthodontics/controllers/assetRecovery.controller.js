/**
 * assetRecovery.controller.js — Retry Dashboard HTTP surface (U-CAP Part 3).
 *
 * Endpoints
 *   GET  /org/orthodontic-cases/failed-assets
 *     List every photo in the org with processingStatus in
 *     {pending, processing, failed}. The UI uses a single list + filter
 *     chips so operators can see stuck jobs across all cases.
 *
 *   POST /org/orthodontic-cases/retry-all-failed
 *     Reset + re-enqueue every failed asset in the org (capped at 500
 *     per call to keep the response bounded). Uses Promise.allSettled
 *     so partial failures never mask successes.
 *
 * Authorization
 *   Both endpoints require the `orthodontics.full` permission. They do
 *   NOT require case-scope because the dashboard is org-wide; the per-
 *   photo retry path (photo.controller.retryPhotoProcessing) already
 *   covers case-scoped retries.
 */

"use strict";

const mongoose = require("mongoose");

const { authorize } = require("../../../utils/authorize");
const logger        = require("@utils/logger");
const getModel      = require("../../../core/db/getModel");

const PhotoDef           = require("../models/Photo.model");
const assetJobService    = require("../services/assetJob.service");
const assetMetrics       = require("../services/assetMetrics.service");

/** Bounded page size to keep the dashboard list responsive. */
const LIST_LIMIT = 500;
const RETRY_LIMIT = 500;

// ─── GET /failed-assets ─────────────────────────────────────────────────────

async function listFailedAssets(req, res) {
    try {
        authorize(req, "orthodontics.full");

        const orgId = req.context.organizationId;
        const filter = _parseStatusFilter(req.query.status);

        const Photo = getModel(req.dbConnection, PhotoDef);
        const docs = await Photo.find({
            deletedAt:      null,
            processingStatus: { $in: filter },
        })
            .select({
                _id: 1, caseId: 1,
                fileType: 1, mimeType: 1,
                processingStatus: 1, processingError: 1,
                processingProgress: 1, retryCount: 1,
                metadata: 1, uploadedAt: 1,
            })
            .sort({ uploadedAt: -1 })
            .limit(LIST_LIMIT)
            .lean();

        // Shape the response small — the dashboard doesn't need signedUrl
        // (no preview in the table) so we skip the DTO's async resolution.
        const data = docs.map((d) => ({
            id:                  String(d._id),
            caseId:              d.caseId?.toString() ?? null,
            fileType:            d.fileType ?? null,
            mimeType:            d.mimeType ?? null,
            fileName:            d.metadata?.originalName ?? null,
            processingStatus:    d.processingStatus,
            processingProgress:  d.processingProgress ?? 0,
            processingError:     d.processingError ?? null,
            retryCount:          d.retryCount ?? 0,
            uploadedAt:          d.uploadedAt instanceof Date ? d.uploadedAt.toISOString() : d.uploadedAt,
        }));

        return res.json({
            success: true,
            data,
            meta: { total: data.length, limit: LIST_LIMIT, statuses: filter },
        });
    } catch (err) {
        logger.error({ event: "LIST_FAILED_ASSETS_ERROR", err: err.message });
        return res.status(err.statusCode ?? 500).json({
            success: false,
            error: { code: err.code ?? "LIST_FAILED_ASSETS_ERROR", message: err.message },
        });
    }
}

// ─── POST /retry-all-failed ─────────────────────────────────────────────────

async function retryAllFailed(req, res) {
    try {
        authorize(req, "orthodontics.full");

        const orgId = req.context.organizationId;
        const Photo = getModel(req.dbConnection, PhotoDef);

        const toRetry = await Photo.find({
            deletedAt:      null,
            processingStatus: "failed",
        })
            .select({ _id: 1, fileType: 1 })
            .limit(RETRY_LIMIT)
            .lean();

        if (toRetry.length === 0) {
            return res.json({
                success: true,
                data: { requeued: 0, skipped: 0, total: 0 },
            });
        }

        // Reset state + re-enqueue via the sole approved dispatcher.
        // Filter to file types the worker actually handles; PDFs can't
        // "retry" since they have no job in the first place.
        let requeued = 0;
        let skipped  = 0;
        const results = await Promise.allSettled(
            toRetry.map(async (row) => {
                if (!["image", "dicom", "3d"].includes(row.fileType)) {
                    skipped++;
                    return null;
                }
                await Photo.updateOne(
                    { _id: row._id },
                    { $set: {
                        processingStatus:   null,
                        processingError:    null,
                        processingProgress: 0,
                        retryCount:         0,
                    } },
                );
                // Re-enqueue — returns void; the worker self-binds the tenant connection.
                assetJobService.enqueueAssetJobs({ _id: row._id, fileType: row.fileType }, String(orgId));
                requeued++;
                return row._id;
            }),
        );

        const failed = results.filter((r) => r.status === "rejected").length;

        logger.info({
            event:    "ASSET_RETRY_ALL",
            metric:   "asset_retry_all",
            orgId:    String(orgId),
            total:    toRetry.length,
            requeued,
            skipped,
            failed,
        }, "[assetRecovery] batch retry dispatched");

        return res.json({
            success: true,
            data: {
                requeued,
                skipped,
                failed,
                total: toRetry.length,
            },
        });
    } catch (err) {
        logger.error({ event: "RETRY_ALL_FAILED_ERROR", err: err.message });
        return res.status(err.statusCode ?? 500).json({
            success: false,
            error: { code: err.code ?? "RETRY_ALL_FAILED_ERROR", message: err.message },
        });
    }
}

// ─── Helpers ────────────────────────────────────────────────────────────────

/**
 * Parse `?status=failed,pending` into a whitelisted array. Defaults to
 * {failed, pending, processing} — the "stuck jobs" bucket that drives the
 * dashboard. Invalid entries are silently dropped rather than rejected so
 * a bookmarked dashboard URL never 400s.
 */
function _parseStatusFilter(raw) {
    const allowed = new Set(["pending", "processing", "failed"]);
    if (!raw) return ["pending", "processing", "failed"];
    const requested = String(raw).split(",").map((s) => s.trim()).filter(Boolean);
    const valid = requested.filter((s) => allowed.has(s));
    return valid.length > 0 ? valid : ["pending", "processing", "failed"];
}

// ─── GET /admin/metrics/assets ──────────────────────────────────────────────
// Snapshot of in-process counters + activity feed, consumed by the
// AdminDashboard. Process-wide (single-node) — multi-node aggregation is
// intentionally out of scope.
async function getAssetMetrics(req, res) {
    try {
        authorize(req, "orthodontics.full");
        return res.json({ success: true, data: assetMetrics.snapshot() });
    } catch (err) {
        logger.error({ event: "ASSET_METRICS_ERROR", err: err.message });
        return res.status(err.statusCode ?? 500).json({
            success: false,
            error: { code: err.code ?? "ASSET_METRICS_ERROR", message: err.message },
        });
    }
}

module.exports = {
    listFailedAssets,
    retryAllFailed,
    getAssetMetrics,
};
