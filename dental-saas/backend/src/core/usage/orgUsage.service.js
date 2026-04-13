/**
 * orgUsage.service.js
 * ═══════════════════════════════════════════════════════════════
 * Phase 4.0e — Centralized usage tracking service.
 *
 * Provides atomic increment/decrement operations and usage queries
 * for the limitGuard middleware and admin dashboards.
 *
 * All writes use findOneAndUpdate with $inc + upsert = true for
 * thread-safe, lock-free counter updates. No initialization step
 * is needed — the document is created on first write.
 *
 * IMPORTANT:
 *   This service is NON-BLOCKING and NON-FATAL. If a counter update
 *   fails, it is logged as a warning but the calling operation
 *   (user creation, patient creation, etc.) is NOT blocked.
 *   Counts can be reconciled via the recalculate() method.
 *
 * PLANE: Platform (uses platform connection for cross-org reads)
 * SENTINEL: No RBAC — callers must enforce guards before calling.
 * ═══════════════════════════════════════════════════════════════
 */

"use strict";

const { getPlatformConnection } = require("@core/db/dbResolver");
const getModel = require("@core/db/getModel");
const OrgUsageDef = require("./OrgUsage.model");
const logger = require("@utils/logger");

/**
 * Get the OrgUsage model from the platform connection.
 * @returns {import('mongoose').Model}
 */
function _getModel() {
    const conn = getPlatformConnection();
    return getModel(conn, OrgUsageDef);
}

// ─── INCREMENT OPERATIONS ────────────────────────────────────────────────────

/**
 * Increment a counter field for an organization.
 * Uses findOneAndUpdate with upsert — creates the document on first call.
 *
 * @param {string|ObjectId} organizationId
 * @param {string} field — One of: usersCount, branchesCount, patientsCount, storageUsedMB
 * @param {number} [amount=1] — Amount to increment (default 1)
 * @returns {Promise<void>}
 */
async function _increment(organizationId, field, amount = 1) {
    if (!organizationId) return;
    try {
        const OrgUsage = _getModel();
        await OrgUsage.findOneAndUpdate(
            { organizationId },
            { $inc: { [field]: amount } },
            { upsert: true, new: true }
        );
    } catch (err) {
        // Non-fatal — usage tracking must never block business operations
        logger.warn(
            { err, organizationId: String(organizationId), field, amount },
            `[OrgUsage] Increment failed for ${field}`
        );
    }
}

/**
 * Decrement a counter field for an organization.
 * Includes a clamp-to-zero safety step to prevent negative counters.
 *
 * @param {string|ObjectId} organizationId
 * @param {string} field
 * @param {number} [amount=1]
 * @returns {Promise<void>}
 */
async function _decrement(organizationId, field, amount = 1) {
    if (!organizationId) return;
    try {
        const OrgUsage = _getModel();
        await OrgUsage.findOneAndUpdate(
            { organizationId },
            { $inc: { [field]: -amount } }
        );
        // Clamp to zero — prevent negative counters from race conditions
        await OrgUsage.updateOne(
            { organizationId, [field]: { $lt: 0 } },
            { $set: { [field]: 0 } }
        );
    } catch (err) {
        logger.warn(
            { err, organizationId: String(organizationId), field, amount },
            `[OrgUsage] Decrement failed for ${field}`
        );
    }
}

// ─── Public API: Named Increment/Decrement ───────────────────────────────────

async function incrementUsers(organizationId)    { return _increment(organizationId, "usersCount"); }
async function decrementUsers(organizationId)    { return _decrement(organizationId, "usersCount"); }

async function incrementBranches(organizationId) { return _increment(organizationId, "branchesCount"); }
async function decrementBranches(organizationId) { return _decrement(organizationId, "branchesCount"); }

async function incrementPatients(organizationId) { return _increment(organizationId, "patientsCount"); }
async function decrementPatients(organizationId) { return _decrement(organizationId, "patientsCount"); }

/**
 * Update storage counter. Called alongside storageUsage.increment/decrement.
 * 
 * @param {string|ObjectId} organizationId
 * @param {number} sizeMB — Positive = increment, negative = decrement
 */
async function updateStorage(organizationId, sizeMB) {
    if (!organizationId || !sizeMB) return;
    if (sizeMB > 0) {
        return _increment(organizationId, "storageUsedMB", sizeMB);
    } else {
        return _decrement(organizationId, "storageUsedMB", Math.abs(sizeMB));
    }
}

// ─── QUERY OPERATIONS ────────────────────────────────────────────────────────

/**
 * Get usage counters for an organization.
 * Returns a zeroed structure if no document exists yet.
 *
 * @param {string|ObjectId} organizationId
 * @returns {Promise<Object>} Usage counters
 */
async function getOrgUsage(organizationId) {
    if (!organizationId) return _zeroUsage(organizationId);

    try {
        const OrgUsage = _getModel();
        const usage = await OrgUsage.findOne({ organizationId }).lean();

        if (!usage) {
            return _zeroUsage(organizationId);
        }

        return {
            organizationId: String(usage.organizationId),
            usersCount: usage.usersCount || 0,
            branchesCount: usage.branchesCount || 0,
            patientsCount: usage.patientsCount || 0,
            storageUsedMB: usage.storageUsedMB || 0,
            updatedAt: usage.updatedAt,
        };
    } catch (err) {
        logger.warn(
            { err, organizationId: String(organizationId) },
            "[OrgUsage] getOrgUsage failed — returning zeroed usage"
        );
        return _zeroUsage(organizationId);
    }
}

/**
 * Get usage for multiple organizations (batch query for admin dashboards).
 *
 * @param {Array<string|ObjectId>} organizationIds
 * @returns {Promise<Map<string, Object>>}
 */
async function getOrgUsageBatch(organizationIds) {
    if (!organizationIds?.length) return new Map();

    try {
        const OrgUsage = _getModel();
        const docs = await OrgUsage.find({
            organizationId: { $in: organizationIds }
        }).lean();

        const map = new Map();
        for (const doc of docs) {
            map.set(String(doc.organizationId), {
                organizationId: String(doc.organizationId),
                usersCount: doc.usersCount || 0,
                branchesCount: doc.branchesCount || 0,
                patientsCount: doc.patientsCount || 0,
                storageUsedMB: doc.storageUsedMB || 0,
                updatedAt: doc.updatedAt,
            });
        }
        return map;
    } catch (err) {
        logger.warn({ err }, "[OrgUsage] getOrgUsageBatch failed");
        return new Map();
    }
}

/**
 * Recalculate usage counters from actual data.
 * Used for reconciliation after migrations, manual DB edits, or drift detection.
 *
 * This is an EXPENSIVE operation — it queries actual collections to count records.
 * Should only be called from admin tools / background jobs, never from hot paths.
 *
 * @param {string|ObjectId} organizationId
 * @param {Object} counts — { usersCount, branchesCount, patientsCount, storageUsedMB }
 * @returns {Promise<Object>} Updated usage document
 */
async function recalculate(organizationId, counts) {
    if (!organizationId || !counts) return null;

    try {
        const OrgUsage = _getModel();
        const updated = await OrgUsage.findOneAndUpdate(
            { organizationId },
            {
                $set: {
                    usersCount: counts.usersCount ?? 0,
                    branchesCount: counts.branchesCount ?? 0,
                    patientsCount: counts.patientsCount ?? 0,
                    storageUsedMB: counts.storageUsedMB ?? 0,
                },
            },
            { upsert: true, new: true }
        );

        logger.info(
            { organizationId: String(organizationId), counts },
            "[OrgUsage] Counters recalculated"
        );

        return updated;
    } catch (err) {
        logger.error(
            { err, organizationId: String(organizationId) },
            "[OrgUsage] Recalculate failed"
        );
        return null;
    }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function _zeroUsage(organizationId) {
    return {
        organizationId: organizationId ? String(organizationId) : null,
        usersCount: 0,
        branchesCount: 0,
        patientsCount: 0,
        storageUsedMB: 0,
        updatedAt: null,
    };
}

// ─── Exports ─────────────────────────────────────────────────────────────────

module.exports = {
    // Increment
    incrementUsers,
    incrementBranches,
    incrementPatients,
    updateStorage,
    // Decrement
    decrementUsers,
    decrementBranches,
    decrementPatients,
    // Query
    getOrgUsage,
    getOrgUsageBatch,
    // Admin
    recalculate,
};
