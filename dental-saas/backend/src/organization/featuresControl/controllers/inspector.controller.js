/**
 * inspector.controller.js — HTTP Layer for Auth Decision Simulation
 *
 * Endpoints:
 *   POST /inspect       — simulate authorization for a single permission
 *   POST /inspect/batch — simulate authorization for multiple permissions
 *
 * This is the "X-ray machine" for the auth system — trace any permission
 * through all 4 auth layers and see exactly where it passes or fails.
 *
 * Delegates to inspector.service.js for simulation logic.
 *
 * PLANE: Org only.
 */

"use strict";

const inspectorService = require("../services/inspector.service");
const logger = require("@utils/logger");

// ─── POST /inspect ──────────────────────────────────────────────────────────

async function inspect(req, res) {
    try {
        const { permission, resourceId } = req.body;

        if (!permission || typeof permission !== "string") {
            return res.status(400).json({ success: false, message: "permission is required (string)" });
        }

        const result = inspectorService.simulateDecision({
            permission,
            resourceId,
            capabilities: req.capabilities,
            user: req.user,
        });

        // ── Auth Trace ──
        if (typeof req.addAuthTrace === "function") {
            req.addAuthTrace({
                layer: "INSPECTOR_SIMULATE",
                permission,
                result: result.allowed ? "ALLOW" : "DENY",
                reason: `Simulation of "${permission}" — ${result.allowed ? "all layers passed" : "blocked at " + (result.steps.find(s => !s.passed)?.layer || "unknown")}`,
                details: { resourceId, finalDecision: result.allowed },
            });
        }

        return res.json({ success: true, data: result });
    } catch (err) {
        logger.error({ err }, "[FCC:Inspector] inspect failed");
        return res.status(500).json({ success: false, message: "Simulation failed" });
    }
}

// ─── POST /inspect/batch ────────────────────────────────────────────────────

async function inspectBatch(req, res) {
    try {
        const { permissions } = req.body;

        if (!Array.isArray(permissions) || permissions.length === 0) {
            return res.status(400).json({ success: false, message: "permissions must be a non-empty array" });
        }

        // Cap batch size to prevent abuse
        if (permissions.length > 25) {
            return res.status(400).json({ success: false, message: "Maximum 25 permissions per batch" });
        }

        const results = inspectorService.simulateBatch({
            permissions,
            capabilities: req.capabilities,
            user: req.user,
        });

        // Summary
        const total = permissions.length;
        const allowed = Object.values(results).filter(r => r.allowed).length;
        const denied = total - allowed;

        // ── Auth Trace ──
        if (typeof req.addAuthTrace === "function") {
            req.addAuthTrace({
                layer: "INSPECTOR_BATCH",
                result: denied > 0 ? "PARTIAL_DENY" : "ALLOW_ALL",
                reason: `Batch simulation: ${allowed}/${total} allowed, ${denied} denied`,
                details: { total, allowed, denied },
            });
        }

        return res.json({
            success: true,
            data: results,
            meta: { total, allowed, denied, evaluatedAt: new Date().toISOString() },
        });
    } catch (err) {
        logger.error({ err }, "[FCC:Inspector] inspectBatch failed");
        return res.status(500).json({ success: false, message: "Batch simulation failed" });
    }
}

// ─── Exports ────────────────────────────────────────────────────────────────

module.exports = {
    inspect,
    inspectBatch,
};
