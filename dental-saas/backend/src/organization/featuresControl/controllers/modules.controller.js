/**
 * modules.controller.js — HTTP Layer for Module Management
 *
 * Endpoints:
 *   GET  /modules          — list all modules with states + usage
 *   PATCH /modules/:key    — toggle a module ON/OFF
 *   GET  /modules/usage    — usage analytics (7-day)
 *
 * NO business logic here — delegates entirely to modules.service.js.
 * Handles: HTTP response, caching, auth tracing, Socket.IO events.
 *
 * PLANE: Org only.
 */

"use strict";

const modulesService = require("../services/modules.service");
const cache = require("../../security/securityCache");
const logger = require("@utils/logger");

// ─── Cache Keys ─────────────────────────────────────────────────────────────

const TTL = { MODULES: 30, USAGE: 60 };
function modulesKey(orgId) { return `fcc:modules:${orgId}`; }
function usageKey(orgId)   { return `fcc:usage:${orgId}`; }

// ─── GET /modules ───────────────────────────────────────────────────────────

async function getModules(req, res) {
    try {
        const orgId = req.context?.organizationId;
        const cacheK = modulesKey(orgId);

        // Cache check
        const cached = await cache.getCache(cacheK);
        if (cached) return res.json(cached);

        if (!orgId) {
            return res.status(404).json({ success: false, message: "Organization context missing" });
        }

        // Phase 8: Pass capabilities (SSOT) instead of req.organization
        const result = await modulesService.resolveModules({ capabilities: req.capabilities, orgId });

        const response = { success: true, data: result, meta: result.meta };
        await cache.setCache(cacheK, response, TTL.MODULES);
        return res.json(response);
    } catch (err) {
        logger.error({ err }, "[FCC:Modules] getModules failed");
        return res.status(500).json({ success: false, message: "Failed to load modules" });
    }
}

// ─── PATCH /modules/:key ────────────────────────────────────────────────────

async function toggleModule(req, res) {
    try {
        const { key } = req.params;
        const { enabled } = req.body;

        if (typeof enabled !== "boolean") {
            return res.status(400).json({ success: false, message: "enabled must be a boolean" });
        }

        const result = await modulesService.toggleModule({
            orgId: req.organizationId,
            key,
            enabled,
            user: req.user
        });

        if (!result.success) {
            return res.status(result.code || 400).json({ success: false, message: result.error });
        }

        // ── Cache Invalidation ──
        await cache.invalidate(
            modulesKey(req.organizationId),
            `fcc:features:${req.organizationId}`,
            `fcc:conflicts:${req.organizationId}`,
            usageKey(req.organizationId),
        );

        // ── Auth Trace ──
        if (typeof req.addAuthTrace === "function") {
            req.addAuthTrace({
                layer: "MODULE_TOGGLE",
                result: enabled ? "ENABLED" : "DISABLED",
                permission: "security.manage",
                reason: `Module "${key}" ${enabled ? "enabled" : "disabled"} by admin`,
                details: { moduleKey: key, enabled, affectedDependents: result.data.affectedDependents },
            });
        }

        // ── Socket.IO Event ──
        try {
            const io = req.app?.get?.("io");
            if (io) {
                io.to(`org:${req.organizationId}`).emit("module.updated", {
                    moduleKey: key,
                    enabled,
                    updatedBy: req.user?._id,
                    affectedDependents: result.data.affectedDependents,
                    timestamp: new Date().toISOString(),
                });
            }
        } catch { /* non-critical */ }

        return res.json({
            success: true,
            data: result.data,
            message: `Module "${key}" ${enabled ? "enabled" : "disabled"} successfully`,
        });
    } catch (err) {
        logger.error({ err }, "[FCC:Modules] toggleModule failed");
        return res.status(500).json({ success: false, message: "Failed to toggle module" });
    }
}

// ─── GET /modules/usage ─────────────────────────────────────────────────────

async function getUsage(req, res) {
    try {
        const orgId = req.organizationId;
        const cacheK = usageKey(orgId);

        const cached = await cache.getCache(cacheK);
        if (cached) return res.json(cached);

        const days = parseInt(req.query.days, 10) || 7;
        const result = await modulesService.getUsageAnalytics(orgId, Math.min(days, 30));

        const response = { success: true, data: result.data, meta: result.meta };
        await cache.setCache(cacheK, response, TTL.USAGE);
        return res.json(response);
    } catch (err) {
        logger.error({ err }, "[FCC:Modules] getUsage failed");
        return res.status(500).json({ success: false, message: "Failed to load usage analytics" });
    }
}

// ─── Exports ────────────────────────────────────────────────────────────────

module.exports = {
    getModules,
    toggleModule,
    getUsage,
};
