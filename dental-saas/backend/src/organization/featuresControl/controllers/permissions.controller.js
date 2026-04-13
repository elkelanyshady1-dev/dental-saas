/**
 * permissions.controller.js — HTTP Layer for Permission Matrix
 *
 * Endpoint:
 *   GET /permissions — returns live role × permission matrix
 *
 * Delegates to permissions.service.js for matrix building.
 *
 * PLANE: Org only.
 */

"use strict";

const permissionsService = require("../services/permissions.service");
const cache = require("../../security/securityCache");
const logger = require("@utils/logger");

// ─── Cache ──────────────────────────────────────────────────────────────────

const TTL = { PERMISSIONS: 120 };
function permissionsKey(orgId) { return `fcc:permissions:${orgId}`; }

// ─── GET /permissions ───────────────────────────────────────────────────────

async function getPermissions(req, res) {
    try {
        const orgId = req.organizationId;
        const cacheK = permissionsKey(orgId);

        const cached = await cache.getCache(cacheK);
        if (cached) return res.json(cached);

        const matrixData = await permissionsService.buildPermissionMatrix(orgId, req);
        const coverage = permissionsService.computeCoverageSummary(matrixData);

        const response = {
            success: true,
            data: { ...matrixData, coverage },
            meta: { lastUpdated: new Date().toISOString() },
        };

        await cache.setCache(cacheK, response, TTL.PERMISSIONS);
        return res.json(response);
    } catch (err) {
        logger.error({ err }, "[FCC:Permissions] getPermissions failed");
        return res.status(500).json({ success: false, message: "Failed to load permissions" });
    }
}

// ─── Exports ────────────────────────────────────────────────────────────────

module.exports = {
    getPermissions,
};
