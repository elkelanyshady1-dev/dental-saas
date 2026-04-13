/**
 * storageUsage.service.js
 * ═══════════════════════════════════════════════════════════════
 * Service for tracking and querying storage usage per organization.
 *
 * Uses atomic $inc operations for thread-safe counter updates.
 * Upsert on first use — no initialization step needed.
 *
 * USAGE:
 *   const storageUsage = require("@core/storage/storageUsage.service");
 *
 *   // After upload
 *   await storageUsage.increment({
 *       organizationId: req.organizationId,
 *       sizeBytes: result.sizeBytes,
 *       type: "photos"
 *   });
 *
 *   // After delete
 *   await storageUsage.decrement({
 *       organizationId,
 *       sizeBytes: deletedFile.sizeBytes,
 *       type: "photos"
 *   });
 *
 *   // Query usage
 *   const usage = await storageUsage.getUsage(organizationId);
 *
 * PLANE: Shared
 * SENTINEL: No RBAC — callers must enforce guards before calling.
 * ═══════════════════════════════════════════════════════════════
 */

"use strict";

const dbManager = require("@core/db/dbManager");
const getModel = require("@core/db/getModel");
const OrganizationStorageUsageDef = require("./models/organizationStorageUsage.model");
const orgUsageService = require("@core/usage/orgUsage.service");

// ─── Category Mapping ────────────────────────────────────────────────────────
// Maps upload categories to breakdown field names.
// Categories from storageService: "orthodontics/photos", "orthodontics/stl", etc.
const CATEGORY_MAP = {
    "photos":               "photos",
    "orthodontics/photos":  "photos",
    "stl":                  "stl",
    "orthodontics/stl":     "stl",
    "audio":                "audio",
    "orthodontics/audio":   "audio",
    "documents":            "documents",
    "patients":             "photos",
    "logos":                "other",
};

/**
 * Resolve a storage category to a breakdown field name.
 * Falls back to "other" if the category is not recognized.
 *
 * @param {string} category — Upload category or type
 * @returns {string} Breakdown field name
 */
function resolveType(category) {
    return CATEGORY_MAP[category] || "other";
}

/**
 * Get the OrganizationStorageUsage model bound to the correct per-org DB.
 */
function _resolveModel(organizationId) {
    const conn = dbManager.getConnection(String(organizationId));
    return getModel(conn, OrganizationStorageUsageDef);
}

/**
 * Increment storage usage for an organization after a successful upload.
 *
 * Uses findOneAndUpdate with $inc + upsert for atomic, thread-safe updates.
 * Creates the document on first use — no initialization step needed.
 *
 * @param {Object} params
 * @param {string|ObjectId} params.organizationId — Tenant ID
 * @param {number}          params.sizeBytes      — File size in bytes
 * @param {string}          params.type           — File category (e.g. "photos", "stl", "orthodontics/photos")
 * @returns {Promise<void>}
 */
async function increment({ organizationId, sizeBytes, type }) {
    if (!organizationId || !sizeBytes || sizeBytes <= 0) return;

    const breakdownField = resolveType(type);
    const StorageUsage = _resolveModel(organizationId);

    try {
        await StorageUsage.findOneAndUpdate(
            { organizationId },
            {
                $inc: {
                    totalBytes: sizeBytes,
                    totalFiles: 1,
                    [`breakdown.${breakdownField}`]: sizeBytes,
                    [`fileCount.${breakdownField}`]: 1,
                },
                $set: {
                    lastUploadAt: new Date(),
                },
            },
            { upsert: true, new: true }
        );
    } catch (err) {
        // Non-fatal — usage tracking should never block uploads
        console.error(`[StorageUsage] Increment failed for org ${organizationId}:`, err.message);
    }

    // Phase 4.1 — Sync OrgUsage storage counter (non-blocking)
    const sizeMB = Math.round(sizeBytes / (1024 * 1024) * 100) / 100;
    try { await orgUsageService.updateStorage(organizationId, sizeMB); } catch (_) { /* logged inside service */ }
}

/**
 * Decrement storage usage for an organization after a file deletion.
 *
 * Uses $inc with negative value. Applies $max: 0 guard to prevent
 * totalBytes from going negative due to race conditions or stale data.
 *
 * @param {Object} params
 * @param {string|ObjectId} params.organizationId — Tenant ID
 * @param {number}          params.sizeBytes      — File size in bytes
 * @param {string}          params.type           — File category
 * @returns {Promise<void>}
 */
async function decrement({ organizationId, sizeBytes, type }) {
    if (!organizationId || !sizeBytes || sizeBytes <= 0) return;

    const breakdownField = resolveType(type);
    const StorageUsage = _resolveModel(organizationId);

    try {
        // Step 1: Decrement atomically
        await StorageUsage.findOneAndUpdate(
            { organizationId },
            {
                $inc: {
                    totalBytes: -sizeBytes,
                    totalFiles: -1,
                    [`breakdown.${breakdownField}`]: -sizeBytes,
                    [`fileCount.${breakdownField}`]: -1,
                },
            }
        );

        // Step 2: Clamp to zero — prevents negative counters from
        // race conditions, orphan deletions, or historical data gaps.
        await StorageUsage.updateOne(
            { organizationId, totalBytes: { $lt: 0 } },
            { $set: { totalBytes: 0, totalFiles: 0 } }
        );
    } catch (err) {
        // Non-fatal
        console.error(`[StorageUsage] Decrement failed for org ${organizationId}:`, err.message);
    }

    // Phase 4.1 — Sync OrgUsage storage counter (non-blocking)
    const sizeMB = Math.round(sizeBytes / (1024 * 1024) * 100) / 100;
    try { await orgUsageService.updateStorage(organizationId, -sizeMB); } catch (_) { /* logged inside service */ }
}

/**
 * Get storage usage for an organization.
 *
 * Returns null if no usage document exists (org has never uploaded).
 *
 * @param {string|ObjectId} organizationId
 * @returns {Promise<Object|null>} Usage document (lean)
 */
async function getUsage(organizationId) {
    if (!organizationId) return null;

    const StorageUsage = _resolveModel(organizationId);
    const usage = await StorageUsage.findOne({ organizationId }).lean();

    if (!usage) {
        // Return zeroed structure for consistency
        return {
            organizationId,
            totalBytes: 0,
            totalFiles: 0,
            totalMB: 0,
            totalGB: 0,
            breakdown: { photos: 0, stl: 0, audio: 0, documents: 0, other: 0 },
            fileCount: { photos: 0, stl: 0, audio: 0, documents: 0, other: 0 },
            lastUploadAt: null,
        };
    }

    // Add computed virtual fields to lean document
    usage.totalMB = Math.round((usage.totalBytes / (1024 * 1024)) * 100) / 100;
    usage.totalGB = Math.round((usage.totalBytes / (1024 * 1024 * 1024)) * 100) / 100;

    return usage;
}

/**
 * Get storage usage for multiple organizations (batch query).
 * Used by platform admin dashboards.
 *
 * In per-org mode, each org's usage doc lives in its own DB,
 * so we must query each org individually.
 *
 * @param {Array<string|ObjectId>} organizationIds
 * @returns {Promise<Map<string, Object>>} Map of orgId → usage
 */
async function getUsageBatch(organizationIds) {
    if (!organizationIds?.length) return new Map();

    const map = new Map();
    for (const orgId of organizationIds) {
        try {
            const usage = await getUsage(orgId);
            if (usage) {
                map.set(String(orgId), usage);
            }
        } catch {
            // Non-fatal — skip orgs with connection issues
        }
    }

    return map;
}

module.exports = {
    increment,
    decrement,
    getUsage,
    getUsageBatch,
    resolveType,
};

