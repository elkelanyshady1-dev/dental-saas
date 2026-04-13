/**
 * billingControl.controller.js
 * Platform Billing Kill Switch — Admin Control + Public Status Endpoints
 *
 * PLANE: Platform
 * ROUTES:
 *   POST /api/platform/billing/kill-switch/activate    → superAdminOnly + MANAGE_SUBSCRIPTIONS
 *   POST /api/platform/billing/kill-switch/deactivate  → superAdminOnly + MANAGE_SUBSCRIPTIONS
 *   GET  /api/platform/billing/kill-switch/status      → superAdminOnly + VIEW_PLATFORM_ANALYTICS
 *   GET  /api/platform/billing/status                  → platformProtect (AUTH_ONLY — dashboard banner)
 */

"use strict";

const {
    getBillingControl,
    activateBillingKillSwitch,
    deactivateBillingKillSwitch
} = require("../services/billingControlService");


const logger = require("@utils/logger");

// ─── POST /billing/kill-switch/activate ──────────────────────────────────────

/**
 * @swagger
 * /api/platform/billing/kill-switch/activate:
 *   post:
 *     summary: Manually activate the billing kill switch
 *     tags: [Platform Billing Kill Switch]
 *     security:
 *       - platformToken: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [reason]
 *             properties:
 *               reason:
 *                 type: string
 *                 example: "Emergency billing stop — suspected fraud"
 *     responses:
 *       200:
 *         description: Kill switch activated
 *       400:
 *         description: Missing reason
 */
exports.activateKillSwitch = async (req, res) => {
    try {
        const { reason } = req.body;

        if (!reason || typeof reason !== "string" || !reason.trim()) {
            return res.status(400).json({
                success: false,
                message: "reason is required and must be a non-empty string"
            });
        }

        const actor = req.platformUser?.email || req.platformUser?._id?.toString() || "unknown";

        const doc = await activateBillingKillSwitch(reason.trim(), "manual", actor);

        logger.error(
            {
                billing: true,
                event: "BILLING_KILL_SWITCH_ACTIVATED",
                reason: reason.trim(),
                source: "manual",
                actor
            },
            `[Guardian][CRITICAL] BILLING_KILL_SWITCH_ACTIVATED by admin: ${actor}`
        );

        return res.json({
            success: true,
            killSwitchActive: true,
            reason: doc.reason,
            activatedBy: doc.activatedBy,
            activatedAt: doc.activatedAt,
            source: doc.source
        });

    } catch (err) {
        logger.error({ billing: true, err: err.message }, "[BillingControl] activateKillSwitch failed");
        return res.status(500).json({ success: false, message: err.message });
    }
};

// ─── POST /billing/kill-switch/deactivate ────────────────────────────────────

/**
 * @swagger
 * /api/platform/billing/kill-switch/deactivate:
 *   post:
 *     summary: Manually deactivate the billing kill switch (resume billing)
 *     tags: [Platform Billing Kill Switch]
 *     security:
 *       - platformToken: []
 *     responses:
 *       200:
 *         description: Kill switch deactivated
 */
exports.deactivateKillSwitch = async (req, res) => {
    try {
        const actor = req.platformUser?.email || req.platformUser?._id?.toString() || "unknown";

        const doc = await deactivateBillingKillSwitch(actor);

        logger.warn(
            {
                billing: true,
                event: "BILLING_KILL_SWITCH_DEACTIVATED",
                actor
            },
            `[BILLING] BILLING_KILL_SWITCH_DEACTIVATED by admin: ${actor}`
        );

        return res.json({
            success: true,
            killSwitchActive: false,
            deactivatedBy: actor,
            deactivatedAt: doc.activatedAt
        });

    } catch (err) {
        logger.error({ billing: true, err: err.message }, "[BillingControl] deactivateKillSwitch failed");
        return res.status(500).json({ success: false, message: err.message });
    }
};

// ─── GET /billing/kill-switch/status ─────────────────────────────────────────

/**
 * @swagger
 * /api/platform/billing/kill-switch/status:
 *   get:
 *     summary: Get full kill switch status with history
 *     tags: [Platform Billing Kill Switch]
 *     security:
 *       - platformToken: []
 *     responses:
 *       200:
 *         description: Kill switch status
 */
exports.getKillSwitchStatus = async (req, res) => {
    try {
        const doc = await getBillingControl();

        return res.json({
            success: true,
            killSwitchActive: doc.killSwitch,
            reason: doc.reason,
            activatedBy: doc.activatedBy,
            activatedAt: doc.activatedAt,
            source: doc.source,
            history: (doc.history || []).slice(-20), // last 20 history entries
            updatedAt: doc.updatedAt
        });

    } catch (err) {
        logger.error({ billing: true, err: err.message }, "[BillingControl] getKillSwitchStatus failed");
        return res.status(500).json({ success: false, message: err.message });
    }
};

// ─── GET /billing/status (AUTH_ONLY — dashboard banner) ──────────────────────

/**
 * @swagger
 * /api/platform/billing/status:
 *   get:
 *     summary: Get public billing operational status (for dashboard banner)
 *     description: AUTH_ONLY — no capability check required. Used to display red banner.
 *     tags: [Platform Billing Kill Switch]
 *     security:
 *       - platformToken: []
 *     responses:
 *       200:
 *         description: Billing operational status
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 billingOperational:
 *                   type: boolean
 *                   example: true
 *                 killSwitchActive:
 *                   type: boolean
 *                   example: false
 */
exports.getBillingStatus = async (req, res) => {
    try {
        const doc = await getBillingControl();

        return res.json({
            success: true,
            billingOperational: !doc.killSwitch,
            killSwitchActive: doc.killSwitch,
            // Limited fields only — no sensitive history for status endpoint
            ...(doc.killSwitch ? {
                reason: doc.reason,
                activatedAt: doc.activatedAt
            } : {})
        });

    } catch (err) {
        // Status endpoint must degrade gracefully for the frontend
        logger.error({ billing: true, err: err.message }, "[BillingControl] getBillingStatus failed");
        return res.json({
            success: false,
            billingOperational: false,  // fail-safe: show banner if status is unknown
            killSwitchActive: true,
            reason: "Status check unavailable"
        });
    }
};
