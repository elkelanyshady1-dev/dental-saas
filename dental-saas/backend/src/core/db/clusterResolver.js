/**
 * clusterResolver.js
 * Core Infrastructure — Org → Cluster Resolution
 *
 * Deterministic mapping from an organization to its cluster key. Replaces
 * `shardResolver.js` (which hard-coded "shard-1") once dbManager is flipped
 * to consume this module (Steps 3 & 5 of the 3-layer rollout).
 *
 * SOURCE OF TRUTH:
 *   Organization.cluster — set once at provisioning by
 *   clusterAssignment.service.js. Never derived at routing time; always
 *   read from the org doc.
 *
 * TWO CALL SHAPES:
 *   resolveCluster(org)           — sync, requires an org doc with `cluster`.
 *                                   Use from request path (req.context.org).
 *   resolveClusterByOrgId(orgId)  — async, looks up the org from the platform
 *                                   DB. Use from background workers that
 *                                   don't have a request context.
 *
 * PLANE: Core Infrastructure
 */

"use strict";

/**
 * resolveCluster
 * @param {{ cluster?: string, _id?: any }} org
 * @returns {string}
 */
function resolveCluster(org) {
    if (!org) {
        throw new Error("[clusterResolver] resolveCluster called with null/undefined org");
    }
    if (!org.cluster) {
        const id = org._id ? String(org._id) : "<unknown>";
        throw new Error(
            `[clusterResolver] Organization ${id} has no cluster assigned. ` +
            `New orgs must go through clusterAssignment.service.provisionOrg(); ` +
            `existing orgs need a backfill before the cluster layer is activated.`
        );
    }
    return org.cluster;
}

/**
 * resolveClusterByOrgId
 * Async variant for workers without a request context. Looks up the org
 * doc on the platform sibling connection via getPlatformModel.
 *
 * @param {string} orgId
 * @returns {Promise<string>}
 */
async function resolveClusterByOrgId(orgId) {
    if (!orgId) {
        throw new Error("[clusterResolver] resolveClusterByOrgId requires orgId");
    }

    const getPlatformModel = require("./getPlatformModel");
    // Resolved lazily so this module is safe to require before platformConnection.init().
    const OrganizationDef = require("@root/shared/models/Organization");

    const Organization = getPlatformModel(OrganizationDef);
    const org = await Organization.findById(orgId).select("cluster").lean();

    if (!org) {
        throw new Error(`[clusterResolver] Organization ${orgId} not found`);
    }
    return resolveCluster(org);
}

module.exports = {
    resolveCluster,
    resolveClusterByOrgId,
};
