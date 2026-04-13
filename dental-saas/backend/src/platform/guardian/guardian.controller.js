/**
 * guardian.controller.js
 * Platform Guardian — HTTP Controller
 *
 * Endpoints:
 *   GET  /guardian/overview    — Fresh metrics snapshot
 *   POST /guardian/run-scan    — Triggers scan + saves audit log
 *   GET  /guardian/export      — JSON report as file download
 *   GET  /guardian/history     — Last 50 scan audit logs
 *
 * All endpoints require: platformProtect + superAdminOnly
 * PLANE: Platform
 */

"use strict";

const { collectGuardianMetrics } = require("./guardian.metrics.service");
const GuardianAuditLog = require("./models/GuardianAuditLog.model").default;
const logger = require("@utils/logger");

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * persistAuditLog
 * Saves a metrics snapshot to GuardianAuditLog.
 * Non-blocking — errors are logged but never propagated to the HTTP response.
 *
 * @param {object} metrics       - Full output of collectGuardianMetrics()
 * @param {string|null} actorId  - PlatformUser._id or null for auto-scans
 * @param {string} scanType      - "manual" | "auto"
 */
async function persistAuditLog(metrics, actorId, scanType) {
    try {
        await GuardianAuditLog.create({
            summary: metrics.summary,
            runtime: metrics.runtime,
            system: metrics.system,
            alertsSnapshot: metrics.alerts,
            scanTriggeredBy: actorId || null,
            scanType,
            alertHash: metrics.alertHash || null
        });
    } catch (err) {
        // Non-fatal — audit log failure must never affect the response
        logger.error(
            { service: "guardian", err: err.message },
            "[Guardian] Failed to persist audit log (non-fatal)"
        );
    }
}

// ─── Controllers ──────────────────────────────────────────────────────────────

/**
 * @swagger
 * /api/platform/guardian/overview:
 *   get:
 *     summary: Get platform guardian health overview
 *     description: >
 *       Returns a full platform health snapshot including active contract counts,
 *       integrity alerts, null locked prices, orphan drafts, and system metrics.
 *       Superadmin only.
 *     tags: [Platform Guardian]
 *     security:
 *       - platformToken: []
 *     responses:
 *       200:
 *         description: Guardian overview
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:   { type: boolean }
 *                 data:
 *                   type: object
 *                   properties:
 *                     summary:
 *                       type: object
 *                       properties:
 *                         totalAlerts: { type: integer }
 *                         critical: { type: integer }
 *                         warnings: { type: integer }
 *                     alerts:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           type: { type: string }
 *                           severity: { type: string, enum: [critical, warning] }
 *                           organizationId: { type: string, nullable: true }
 *                           organizationName: { type: string }
 *                           message: { type: string }
 *                     runtime:
 *                       type: object
 *                       properties:
 *                         activeContracts: { type: integer }
 *                         overlappingContracts: { type: integer }
 *                         nullLockedPrice: { type: integer }
 *                         expiredAutoRenew: { type: integer }
 *                         orphanDrafts: { type: integer }
 *                     system:
 *                       type: object
 *                       properties:
 *                         pid: { type: integer }
 *                         uptimeSeconds: { type: integer }
 *                         memoryMB: { type: integer }
 *                         strictMode: { type: boolean }
 *                         collectedAt: { type: string, format: date-time }
 *       401: { description: 'Unauthorized' }
 *       403: { description: 'Forbidden — superadmin only' }
 */
exports.getGuardianOverview = async (req, res) => {
    try {
        const data = await collectGuardianMetrics();

        logger.info(
            {
                service: "guardian",
                action: "overview",
                actorId: req.platformUser?._id,
                totalAlerts: data.summary.totalAlerts
            },
            "[Guardian] Overview requested"
        );

        return res.status(200).json({ success: true, data });
    } catch (err) {
        logger.error({ service: "guardian", err: err.message }, "[Guardian] Overview failed");
        return res.status(500).json({ success: false, error: { code: "GUARDIAN_ERROR", message: err.message } });
    }
};

/**
 * @swagger
 * /api/platform/guardian/run-scan:
 *   post:
 *     summary: Run full platform integrity scan
 *     description: >
 *       Triggers a fresh integrity scan, broadcasts changes over WebSocket,
 *       and persists the result to GuardianAuditLog for audit history.
 *       Superadmin only.
 *     tags: [Platform Guardian]
 *     security:
 *       - platformToken: []
 *     responses:
 *       200:
 *         description: Fresh scan result
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean }
 *                 scannedAt: { type: string, format: date-time }
 *                 data: { type: object }
 *       403: { description: 'Forbidden' }
 */
exports.runIntegrityScan = async (req, res) => {
    try {
        const data = await collectGuardianMetrics();
        const actorId = req.platformUser?._id;

        logger.info(
            {
                service: "guardian",
                action: "run_scan",
                actorId,
                totalAlerts: data.summary.totalAlerts,
                critical: data.summary.critical
            },
            "[Guardian] Manual integrity scan executed"
        );

        // Persist to audit history (non-blocking — fire and forget)
        persistAuditLog(data, actorId, "manual");

        return res.status(200).json({
            success: true,
            scannedAt: data.system.collectedAt,
            data
        });
    } catch (err) {
        logger.error({ service: "guardian", err: err.message }, "[Guardian] Scan failed");
        return res.status(500).json({ success: false, error: { code: "SCAN_ERROR", message: err.message } });
    }
};

/**
 * @swagger
 * /api/platform/guardian/export:
 *   get:
 *     summary: Export guardian report as JSON file
 *     description: >
 *       Returns a fresh guardian report as a downloadable JSON attachment
 *       for offline analysis or audit archiving. Superadmin only.
 *     tags: [Platform Guardian]
 *     security:
 *       - platformToken: []
 *     responses:
 *       200:
 *         description: JSON file attachment
 *         content:
 *           application/json:
 *             schema: { type: object }
 *       403: { description: 'Forbidden' }
 */
exports.exportGuardianReport = async (req, res) => {
    try {
        const data = await collectGuardianMetrics();
        const filename = `guardian-report-${new Date().toISOString().slice(0, 19).replace(/:/g, "-")}.json`;

        logger.info(
            { service: "guardian", action: "export", actorId: req.platformUser?._id, filename },
            "[Guardian] Report exported"
        );

        res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
        res.setHeader("Content-Type", "application/json");

        return res.status(200).json(data);
    } catch (err) {
        logger.error({ service: "guardian", err: err.message }, "[Guardian] Export failed");
        return res.status(500).json({ success: false, error: { code: "EXPORT_ERROR", message: err.message } });
    }
};

/**
 * @swagger
 * /api/platform/guardian/history:
 *   get:
 *     summary: Get Guardian scan history
 *     description: >
 *       Returns the last 50 Guardian integrity scans in reverse chronological order.
 *       Each entry includes the full alert snapshot, summary, runtime metrics,
 *       scan type, and actor. Superadmin only.
 *     tags: [Platform Guardian]
 *     security:
 *       - platformToken: []
 *     parameters:
 *       - in: query
 *         name: limit
 *         schema: { type: integer, default: 50, maximum: 200 }
 *         description: Maximum number of scan records to return
 *     responses:
 *       200:
 *         description: Scan history list
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean }
 *                 total: { type: integer }
 *                 scans:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       _id: { type: string }
 *                       summary: { type: object }
 *                       scanType: { type: string, enum: [auto, manual] }
 *                       scanTriggeredBy: { type: string, nullable: true }
 *                       createdAt: { type: string, format: date-time }
 *                       alertsSnapshot: { type: array }
 *       403: { description: 'Forbidden' }
 */
exports.getGuardianHistory = async (req, res) => {
    try {
        const limit = Math.min(parseInt(req.query.limit) || 50, 200);

        const [scans, total] = await Promise.all([
            GuardianAuditLog
                .find({})
                .sort({ createdAt: -1 })
                .limit(limit)
                .populate("scanTriggeredBy", "email fullName platformRole")
                .lean(),
            GuardianAuditLog.countDocuments({})
        ]);

        logger.info(
            { service: "guardian", action: "history", actorId: req.platformUser?._id, count: scans.length },
            "[Guardian] History requested"
        );

        return res.status(200).json({ success: true, total, scans });
    } catch (err) {
        logger.error({ service: "guardian", err: err.message }, "[Guardian] History fetch failed");
        return res.status(500).json({ success: false, error: { code: "HISTORY_ERROR", message: err.message } });
    }
};
