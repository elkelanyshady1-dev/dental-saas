/**
 * conflicts.controller.js — HTTP Layer for Conflict Detection
 *
 * Endpoint:
 *   GET /conflicts — runs the full conflict engine and returns results
 *
 * Delegates to conflictEngine.service.js for detection logic.
 *
 * PLANE: Org only.
 */

"use strict";

const conflictService = require("../services/conflictEngine.service");
const cache = require("../../security/securityCache");
const logger = require("@utils/logger");

// ─── Cache ──────────────────────────────────────────────────────────────────

const TTL = { CONFLICTS: 60 };
function conflictsKey(orgId) { return `fcc:conflicts:${orgId}`; }

// ─── GET /conflicts ─────────────────────────────────────────────────────────

async function getConflicts(req, res) {
    try {
        const orgId = req.context?.organizationId;
        const cacheK = conflictsKey(orgId);

        const cached = await cache.getCache(cacheK);
        if (cached) return res.json(cached);

        if (!orgId) {
            return res.status(404).json({ success: false, message: "Organization context missing" });
        }

        // Phase 8: Pass capabilities instead of req.organization
        const result = await conflictService.detectConflicts({ capabilities: req.capabilities, orgId, req });

        const response = {
            success: true,
            data: result,
            meta: { lastUpdated: new Date().toISOString() },
        };

        await cache.setCache(cacheK, response, TTL.CONFLICTS);
        return res.json(response);
    } catch (err) {
        logger.error({ err }, "[FCC:Conflicts] getConflicts failed");
        return res.status(500).json({ success: false, message: "Failed to detect conflicts" });
    }
}

// ─── Exports ────────────────────────────────────────────────────────────────

module.exports = {
    getConflicts,
};
