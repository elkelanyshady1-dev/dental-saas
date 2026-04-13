/**
 * features.controller.js — HTTP Layer for Feature Decision Chains
 *
 * Endpoint:
 *   GET /features — returns all features with 4-layer decision chains
 *
 * Delegates to features.service.js for resolution logic.
 *
 * PLANE: Org only.
 */

"use strict";

const featuresService = require("../services/features.service");
const cache = require("../../security/securityCache");
const logger = require("@utils/logger");

// ─── Cache ──────────────────────────────────────────────────────────────────

const TTL = { FEATURES: 30 };
function featuresKey(orgId) { return `fcc:features:${orgId}`; }

// ─── GET /features ──────────────────────────────────────────────────────────

async function getFeatures(req, res) {
    try {
        const orgId = req.context?.organizationId;
        const cacheK = featuresKey(orgId);

        const cached = await cache.getCache(cacheK);
        if (cached) return res.json(cached);

        if (!orgId) {
            return res.status(404).json({ success: false, message: "Organization context missing" });
        }

        // Phase 8: Pass capabilities instead of req.organization
        const features = featuresService.resolveFeatures({
            capabilities: req.capabilities,
            user: req.user,
        });

        const response = {
            success: true,
            data: { features },
            meta: { lastUpdated: new Date().toISOString() },
        };

        await cache.setCache(cacheK, response, TTL.FEATURES);
        return res.json(response);
    } catch (err) {
        logger.error({ err }, "[FCC:Features] getFeatures failed");
        return res.status(500).json({ success: false, message: "Failed to load features" });
    }
}

// ─── Exports ────────────────────────────────────────────────────────────────

module.exports = {
    getFeatures,
};
