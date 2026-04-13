/**
 * bulkPolicyChecker.js — Bulk Operation Policy Safety
 *
 * Evaluates policy access for each item in a bulk operation,
 * splitting items into allowed/rejected sets.
 *
 * Features:
 *   - Per-item policy evaluation
 *   - Rejection tracking with reasons
 *   - Shadow mode awareness
 *   - Denial tracking integration
 *   - Performance: minimal resource fetching via .select()
 *
 * USAGE:
 *   const { checkBulkAccess } = require("@rbac/bulkPolicyChecker");
 *
 *   const { allowed, rejected } = await checkBulkAccess({
 *     items,
 *     permission: P.PATIENTS_UPDATE,
 *     user: req.user,
 *     branchId: req.branchId,
 *     organizationId: req.organizationId,
 *   });
 *
 * PLANE: Org only.
 */

"use strict";

const { checkAccess } = require("./policyEngine");
const { isShadowMode, logShadowDenial } = require("./shadowMode");
const { recordDenial } = require("./denialTracker");
const logger = require("@utils/logger");

/**
 * Check policy access for each item in a bulk operation.
 *
 * @param {Object} params
 * @param {Object[]} params.items — array of resource objects
 * @param {string} params.permission — the RBAC permission to check
 * @param {Object} params.user — authenticated user (req.user)
 * @param {string|null} params.branchId — active branch context
 * @param {string} params.organizationId — org context
 * @param {string} [params.endpoint] — route path for tracking
 * @param {string} [params.requestId] — correlation ID
 * @returns {Promise<{ allowed: Object[], rejected: { item: Object, reason: string }[] }>}
 */
async function checkBulkAccess({
    items,
    permission,
    user,
    branchId = null,
    organizationId,
    endpoint = "BULK_OPERATION",
    requestId = null,
}) {
    if (!Array.isArray(items) || items.length === 0) {
        return { allowed: [], rejected: [] };
    }

    const allowed = [];
    const rejected = [];
    const shadowMode = isShadowMode();

    for (const item of items) {
        const decision = checkAccess({
            user,
            permission,
            resource: item,
            branchId,
            organizationId,
        });

        if (!decision.allowed) {
            const userRole = user?.roleId?.name || user?.role || "unknown";

            // Record denial for monitoring
            recordDenial({
                endpoint,
                permission,
                reason: decision.reason,
                userRole,
                userId: user?._id?.toString(),
                organizationId: organizationId?.toString(),
                isShadow: shadowMode,
            }).catch(() => {});

            if (shadowMode) {
                // Shadow mode: log but allow
                logShadowDenial({
                    user,
                    permission,
                    decision,
                    route: endpoint,
                    method: "BULK",
                    requestId,
                    organizationId: organizationId?.toString(),
                    branchId,
                });
                allowed.push(item);
            } else {
                // Enforcement mode: reject the item
                rejected.push({
                    item,
                    reason: decision.reason,
                    effect: decision.effect,
                    itemId: item?._id?.toString(),
                });
            }
        } else {
            allowed.push(item);
        }
    }

    // Log bulk operation summary
    if (rejected.length > 0) {
        logger.warn({
            event: "BULK_POLICY_PARTIAL_DENY",
            permission,
            totalItems: items.length,
            allowed: allowed.length,
            rejected: rejected.length,
            userId: user?._id,
            organizationId,
        }, `[BulkPolicy] ${rejected.length}/${items.length} items denied for ${permission}`);
    }

    return { allowed, rejected };
}

// ─── Exports ────────────────────────────────────────────────────────────────

module.exports = {
    checkBulkAccess,
};
