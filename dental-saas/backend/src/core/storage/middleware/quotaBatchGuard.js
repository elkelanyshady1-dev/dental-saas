/**
 * quotaBatchGuard.js — TDS-BULK-UPLOAD-v1.1
 * ═══════════════════════════════════════════════════════════════
 * Post-multer quota enforcement for batch uploads.
 *
 * UNLIKE quotaGuard (which runs BEFORE multer using Content-Length),
 * this middleware runs AFTER multer has populated req.files[] so it
 * can sum the actual per-file sizes. Required because Content-Length
 * of a multipart batch body does not reliably map to stored bytes
 * (boundary overhead, compression, etc.).
 *
 * Placement:
 *   router.post("/photos/batch",
 *       requireOrgPermission(P.ORTHO_FULL),
 *       policyMiddleware(P.ORTHO_FULL),
 *       photoBatchUpload.array("files", 30),  // populate req.files
 *       quotaBatchGuard(),                     // ← HERE
 *       ctrl.bulkUploadPhotos
 *   );
 *
 * Fail-Open Safety:
 *   Matches quotaGuard contract — if resolution fails, uploads pass
 *   through (logged). Clinical workflows must never be blocked by
 *   billing infrastructure errors.
 *
 * Unlimited Plans:
 *   maxStorageMB = -1 / 0 / null → quota check skipped.
 *
 * Rejection:
 *   HTTP 413 with detailed quota block matching GET /org/storage/quota.
 * ═══════════════════════════════════════════════════════════════
 */

"use strict";

const storageUsage = require("@core/storage/storageUsage.service");
const { buildEffectivePlan } = require("../../subscription/effectivePlanBuilder");
const logger = require("@utils/logger");

function quotaBatchGuard() {
    return async function _quotaBatchGuard(req, res, next) {
        try {
            const organizationId = req.organizationId;
            if (!organizationId) {
                logger.warn("[QuotaBatchGuard] No organizationId on request — skipping");
                return next();
            }

            const files = Array.isArray(req.files) ? req.files : [];
            if (files.length === 0) {
                // Let controller respond with a clean validation error
                return next();
            }

            // ── Sum batch size (authoritative — post-multer) ─────────────
            const batchBytes = files.reduce((sum, f) => sum + (f.size || 0), 0);

            // ── Resolve storage limit (same order as quotaGuard) ─────────
            const capabilities = req.capabilities;
            let maxStorageMB =
                capabilities?.quotas?.storageMB ||
                capabilities?.limits?.maxStorageMB ||
                null;

            if (!maxStorageMB) {
                const effectivePlan = await buildEffectivePlan(organizationId);
                maxStorageMB =
                    effectivePlan?.quotas?.storageMB ||
                    effectivePlan?.limits?.maxStorageMB ||
                    null;
            }

            if (!maxStorageMB || maxStorageMB <= 0 || maxStorageMB === -1) {
                // Unlimited — skip
                return next();
            }

            const maxStorageBytes = maxStorageMB * 1024 * 1024;

            // ── Fetch current usage ──────────────────────────────────────
            const usage = await storageUsage.getUsage(organizationId);
            const currentBytes = usage?.totalBytes || 0;

            if (currentBytes + batchBytes > maxStorageBytes) {
                const usedMB    = Math.round((currentBytes / (1024 * 1024)) * 100) / 100;
                const batchMB   = Math.round((batchBytes   / (1024 * 1024)) * 100) / 100;
                const remaining = Math.max(0, maxStorageBytes - currentBytes);

                logger.warn({
                    organizationId,
                    usedMB,
                    maxStorageMB,
                    batchMB,
                    fileCount: files.length,
                    userId: req.context?.userId,
                }, "[QuotaBatchGuard] Batch upload blocked — quota exceeded");

                return res.status(413).json({
                    success: false,
                    error: {
                        code: "STORAGE_QUOTA_EXCEEDED",
                        message: `Batch upload exceeds storage quota. Used: ${usedMB} MB / ${maxStorageMB} MB. Batch: ${batchMB} MB (${files.length} files).`,
                        details: {
                            usedBytes:      currentBytes,
                            usedMB,
                            maxStorageMB,
                            maxStorageBytes,
                            batchBytes,
                            batchMB,
                            fileCount:      files.length,
                            remainingBytes: remaining,
                            remainingMB:    Math.round((remaining / (1024 * 1024)) * 100) / 100,
                        },
                    },
                });
            }

            return next();
        } catch (err) {
            // FAIL-OPEN — never block clinical workflow on billing errors
            logger.error(
                { err, organizationId: req.organizationId },
                "[QuotaBatchGuard] Batch quota check failed — allowing upload (fail-open)"
            );
            return next();
        }
    };
}

module.exports = quotaBatchGuard;
