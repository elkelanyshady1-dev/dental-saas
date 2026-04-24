/**
 * storageQuota.service.js
 * Module: storage
 * Layer: Service
 *
 * Service-level storage quota enforcement.
 *
 * PURPOSE:
 *   The HTTP-layer quotaGuard middleware handles quota checks for
 *   multipart uploads (it has access to Content-Length before multer
 *   buffers the file). This service provides an equivalent check for
 *   programmatic upload paths that bypass the HTTP middleware chain
 *   (e.g. backup worker writing archive files, future API integrations).
 *
 * DESIGN:
 *   - Reads current usage from storageUsage.service (atomic counter)
 *   - Reads plan limit via buildEffectivePlan (same resolution as quotaGuard)
 *   - Throws STORAGE_QUOTA_EXCEEDED (413) if limit would be exceeded
 *   - Fail-open: quota check errors are logged + suppressed (never block uploads)
 *   - -1 / 0 / null = unlimited (consistent with quotaGuard contract)
 *
 * PLANE: Organization
 */

"use strict";

const storageUsage = require("@core/storage/storageUsage.service");
const {
  buildEffectivePlan
} = require("@core/subscription/effectivePlanBuilder");
const logger = require("@utils/logger");
const {
  getPlatformConnection
} = require("@core/db/dbResolver");
const getModel = require("@core/db/getModel");
const OrgAddOnDef = require("@platform/billing/models/OrgAddOn.model");

// ─── enforceQuotaBeforeUpload ─────────────────────────────────────────────────

/**
 * Assert that an upload of `sizeBytes` would not push the org over its
 * storage quota. Throws 413 if quota would be exceeded.
 *
 * FAIL-OPEN: if quota resolution fails (network error, missing plan),
 * the upload is allowed through with a warning log.
 *
 * @param {Object} params
 * @param {string|ObjectId} params.organizationId — Org being checked
 * @param {number}          params.sizeBytes      — Proposed upload size in bytes
 * @param {Object}          [params.capabilities] — req.capabilities if available (skips effectivePlan query)
 *
 * @throws {{ code: "STORAGE_QUOTA_EXCEEDED", statusCode: 413 }}
 */
async function enforceQuotaBeforeUpload({
  organizationId,
  sizeBytes,
  capabilities
}) {
  if (!organizationId || !sizeBytes || sizeBytes <= 0) return;
  try {
    // ── 1. Resolve storage limit ─────────────────────────────────────────
    // Resolution order mirrors quotaGuard middleware:
    //   1. capabilities.quotas.storageMB  (from JWT — cheapest)
    //   2. capabilities.limits.maxStorageMB (legacy fallback)
    //   3. effectivePlan query             (no capabilities available)
    let maxStorageMB = capabilities?.quotas?.storageMB || capabilities?.limits?.maxStorageMB || null;
    if (!maxStorageMB) {
      const effectivePlan = await buildEffectivePlan(organizationId);
      maxStorageMB = effectivePlan?.quotas?.storageMB || effectivePlan?.limits?.maxStorageMB || null;
    }

    // -1 = unlimited; 0/null/undefined = not configured → skip
    if (!maxStorageMB || maxStorageMB <= 0 || maxStorageMB === -1) return;
    const maxStorageBytes = maxStorageMB * 1024 * 1024;

    // ── 2. Fetch current usage ───────────────────────────────────────────
    const usage = await storageUsage.getUsage(organizationId);
    const currentBytes = usage?.totalBytes || 0;

    // ── 3. Check quota ───────────────────────────────────────────────────
    if (currentBytes + sizeBytes > maxStorageBytes) {
      const usedMB = Math.round(currentBytes / (1024 * 1024) * 100) / 100;
      const uploadMB = Math.round(sizeBytes / (1024 * 1024) * 100) / 100;
      logger.warn({
        event: "QUOTA_EXCEEDED",
        organizationId,
        usedMB,
        maxStorageMB,
        uploadMB
      }, "[StorageQuota] Upload blocked — storage quota exceeded");
      throw Object.assign(new Error(`Storage quota exceeded. Used: ${usedMB} MB / ${maxStorageMB} MB. ` + `Upload size: ${uploadMB} MB.`), {
        statusCode: 413,
        code: "STORAGE_QUOTA_EXCEEDED",
        details: {
          usedBytes: currentBytes,
          usedMB,
          maxStorageMB,
          maxStorageBytes,
          uploadBytes: sizeBytes,
          uploadMB,
          remainingBytes: Math.max(0, maxStorageBytes - currentBytes),
          remainingMB: Math.max(0, Math.round((maxStorageBytes - currentBytes) / (1024 * 1024) * 100) / 100)
        }
      });
    }
  } catch (err) {
    // Re-throw quota exceeded errors — these are intentional blocks
    if (err.code === "STORAGE_QUOTA_EXCEEDED") throw err;

    // All other errors (plan lookup failures, DB timeouts) → FAIL-OPEN
    logger.error({
      event: "QUOTA_CHECK_FAILED",
      organizationId,
      err: err.message
    }, "[StorageQuota] Quota check failed — allowing upload (fail-open)");
  }
}

// ─── getQuotaStatus ───────────────────────────────────────────────────────────

/**
 * Return the current quota status for an organization.
 * Used by the Storage Settings page and admin dashboards.
 *
 * @param {string|ObjectId} organizationId
 * @param {Object}          [capabilities] — req.capabilities if available
 * @returns {Promise<{
 *   usedBytes: number,
 *   usedMB: number,
 *   maxStorageMB: number,
 *   percentUsed: number,
 *   isUnlimited: boolean,
 *   remainingMB: number,
 *   totalFiles: number,
 *   breakdown: Object,
 *   fileCount: Object,
 *   lastUploadAt: Date|null,
 * }>}
 */
async function getQuotaStatus(organizationId, capabilities) {
  const usage = await storageUsage.getUsage(organizationId);
  let maxStorageMB = capabilities?.quotas?.storageMB || capabilities?.limits?.maxStorageMB || null;
  if (!maxStorageMB) {
    try {
      const effectivePlan = await buildEffectivePlan(organizationId);
      maxStorageMB = effectivePlan?.quotas?.storageMB || effectivePlan?.limits?.maxStorageMB || null;
    } catch {
      maxStorageMB = null;
    }
  }
  const isUnlimited = !maxStorageMB || maxStorageMB <= 0 || maxStorageMB === -1;
  const usedMB = usage?.totalMB || 0;
  const percentUsed = isUnlimited ? 0 : Math.min(Math.round(usedMB / maxStorageMB * 10000) / 100, 100);
  const remainingMB = isUnlimited ? null : Math.max(0, Math.round((maxStorageMB - usedMB) * 100) / 100);

  // v6 — Storage add-on list for the Settings UI.
  // Returns only active STORAGE-type add-ons contributing to the quota.
  let storageAddOns = [];
  try {
    const platformConn = getPlatformConnection();
    const OrgAddOn = getModel(platformConn, OrgAddOnDef);
    const rows = await OrgAddOn.find({
      status: "active"
    }).populate("addOnId").lean();
    storageAddOns = rows.filter(r => r.addOnId && r.addOnId.type === "STORAGE").map(r => ({
      orgAddOnId: String(r._id),
      addOnId: String(r.addOnId._id),
      code: r.addOnId.code,
      name: r.addOnId.name,
      quotaMB: r.addOnId.storageConfig?.quotaMB || 0,
      overageAllowed: Boolean(r.addOnId.storageConfig?.overageAllowed),
      overagePricePerGB: r.addOnId.storageConfig?.overagePricePerGB || 0,
      interval: r.interval,
      currency: r.currency,
      price: r.price,
      billingCycleEnd: r.billingCycleEnd
    }));
  } catch (err) {
    // Non-fatal — quota numbers still returned even if add-on listing fails.
    logger.warn({
      organizationId,
      err: err.message
    }, "[StorageQuota] Failed to list storage add-ons");
  }
  const totalQuotaMB = isUnlimited ? -1 : maxStorageMB;
  return {
    usedBytes: usage?.totalBytes || 0,
    usedMB,
    // v6 canonical field name used by the org Settings UI.
    totalQuotaMB,
    // Back-compat alias for existing consumers (admin dashboards).
    maxStorageMB: totalQuotaMB,
    percentUsed,
    isUnlimited,
    remainingMB,
    addons: storageAddOns,
    alertLevel: checkStorageThresholds(percentUsed, isUnlimited),
    totalFiles: usage?.totalFiles || 0,
    breakdown: usage?.breakdown || {
      photos: 0,
      stl: 0,
      audio: 0,
      documents: 0,
      other: 0
    },
    fileCount: usage?.fileCount || {
      photos: 0,
      stl: 0,
      audio: 0,
      documents: 0,
      other: 0
    },
    lastUploadAt: usage?.lastUploadAt || null
  };
}

// ─── checkStorageThresholds ───────────────────────────────────────────────────

/**
 * Determine the alert level based on storage percent used.
 *
 * Returns:
 *   "critical" — quota at or over 100%
 *   "warning"  — quota at or over 80%
 *   "none"     — below threshold or unlimited
 *
 * @param {number}  percentUsed
 * @param {boolean} isUnlimited
 * @returns {"critical"|"warning"|"none"}
 */
function checkStorageThresholds(percentUsed, isUnlimited) {
  if (isUnlimited) return "none";
  if (percentUsed >= 100) return "critical";
  if (percentUsed >= 80) return "warning";
  return "none";
}
module.exports = {
  enforceQuotaBeforeUpload,
  getQuotaStatus,
  checkStorageThresholds
};