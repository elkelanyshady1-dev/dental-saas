/**
 * quotaGuard.js
 * ═══════════════════════════════════════════════════════════════
 * Pre-upload storage quota enforcement middleware.
 *
 * MUST be placed BEFORE multer middleware in the route chain.
 * Uses Content-Length header for size estimation (before the
 * file is actually buffered into memory).
 *
 * Architecture:
 *   orgProtect → organizationContext → requireOrgPermission
 *       → quotaGuard ← YOU ARE HERE (checks quota)
 *           → multer (buffers file)
 *               → controller (saves via storageService)
 *
 * Fail-Open Safety:
 *   If entitlement resolution or usage lookup fails, the upload
 *   is ALLOWED through (logged as warning). This matches the
 *   entitlementResolver's fail-safe contract: billing/quota
 *   errors must never block clinical workflows.
 *
 * Unlimited Plans:
 *   maxStorageMB = -1 means unlimited — quota check is skipped.
 *   maxStorageMB = 0 or undefined means "not configured" — also
 *   treated as unlimited to avoid breaking existing plans that
 *   haven't added the field yet.
 *
 * Error Response:
 *   HTTP 413 (Payload Too Large) with structured error body.
 *   Frontend should show a user-friendly quota exceeded message.
 *
 * PLANE: Organization (Org-plane uploads only)
 * SENTINEL: No RBAC bypass — requires orgProtect + organizationContext upstream.
 * ═══════════════════════════════════════════════════════════════
 */

"use strict";

const storageUsage = require("@core/storage/storageUsage.service");
const { buildEffectivePlan } = require("../../../core/subscription/effectivePlanBuilder");
const logger = require("@utils/logger");

/**
 * Create a quota guard middleware.
 *
 * Usage:
 *   router.post("/upload", quotaGuard(), upload.single("file"), controller);
 *
 * Options:
 *   router.post("/upload", quotaGuard({ category: "stl" }), upload.single("file"), controller);
 *
 * @param {Object} [options]
 * @param {string} [options.category] — For future per-category quotas (not enforced yet)
 * @returns {Function} Express middleware
 */
function quotaGuard(options = {}) {
    return async function _quotaGuard(req, res, next) {
        try {
            const organizationId = req.organizationId;

            // ── 1. Guard: org context must be present ────────────────────
            if (!organizationId) {
                // Should never happen if orgProtect is upstream — log and pass through
                logger.warn("[QuotaGuard] No organizationId on request — skipping quota check");
                return next();
            }

            // ── 2. Estimate upload size from Content-Length header ────────
            const contentLength = parseInt(req.headers["content-length"], 10);
            if (!contentLength || isNaN(contentLength) || contentLength <= 0) {
                // Content-Length missing or invalid — can't pre-check, let multer handle
                // This happens with chunked transfer encoding or missing headers
                return next();
            }

            // ── 3. Resolve storage limit ────────────────────────────────
            // Phase 4.0f: Resolution order:
            //   1. req.capabilities.quotas.storageMB  (new, preferred)
            //   2. req.capabilities.limits.maxStorageMB (legacy fallback)
            //   3. effectivePlan.limits.maxStorageMB    (final fallback)
            //
            // Convention: -1 = unlimited, 0/null/undefined = not configured (treat as unlimited)
            const capabilities = req.capabilities;
            let maxStorageMB =
                capabilities?.quotas?.storageMB ||
                capabilities?.limits?.maxStorageMB ||
                null;

            // If capabilities don't have it, fall back to effectivePlan query
            if (!maxStorageMB) {
                const effectivePlan = await buildEffectivePlan(organizationId);
                maxStorageMB =
                    effectivePlan?.quotas?.storageMB ||
                    effectivePlan?.limits?.maxStorageMB ||
                    null;
            }

            if (!maxStorageMB || maxStorageMB <= 0 || maxStorageMB === -1) {
                // Unlimited or not configured — skip quota check
                return next();
            }

            const maxStorageBytes = maxStorageMB * 1024 * 1024;

            // ── 4. Fetch current usage ───────────────────────────────────
            const usage = await storageUsage.getUsage(organizationId);
            const currentBytes = usage?.totalBytes || 0;

            // ── 5. Check if upload would exceed quota ────────────────────
            if (currentBytes + contentLength > maxStorageBytes) {
                const usedMB = Math.round((currentBytes / (1024 * 1024)) * 100) / 100;
                const uploadMB = Math.round((contentLength / (1024 * 1024)) * 100) / 100;

                logger.warn({
                    organizationId,
                    usedMB,
                    maxStorageMB,
                    uploadMB,
                    userId: req.user?._id,
                }, "[QuotaGuard] Upload blocked — storage quota exceeded");

                return res.status(413).json({
                    success: false,
                    error: {
                        code: "STORAGE_QUOTA_EXCEEDED",
                        message: `Storage quota exceeded. Used: ${usedMB} MB / ${maxStorageMB} MB. Upload size: ${uploadMB} MB.`,
                        details: {
                            usedBytes: currentBytes,
                            usedMB,
                            maxStorageMB,
                            maxStorageBytes,
                            uploadBytes: contentLength,
                            uploadMB,
                            remainingBytes: Math.max(0, maxStorageBytes - currentBytes),
                            remainingMB: Math.max(0, Math.round(((maxStorageBytes - currentBytes) / (1024 * 1024)) * 100) / 100),
                        },
                    },
                });
            }

            // ── 6. Quota OK — proceed to multer ──────────────────────────
            return next();

        } catch (err) {
            // ── FAIL-OPEN: Never block uploads due to quota check errors ──
            logger.error(
                { err, organizationId: req.organizationId },
                "[QuotaGuard] Quota check failed — allowing upload (fail-open)"
            );
            return next();
        }
    };
}

module.exports = quotaGuard;
