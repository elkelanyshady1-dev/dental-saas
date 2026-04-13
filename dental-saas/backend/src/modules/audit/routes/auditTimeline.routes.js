/**
 * auditTimeline.routes.js
 * ═══════════════════════════════════════════════════════════════
 * Organization Plane — Audit Timeline REST Endpoints
 *
 * Provides audit trail visibility for org admins and security managers.
 * Uses the zeroTrustGateway for consistent middleware enforcement.
 *
 * ── ENDPOINTS ───────────────────────────────────────────────────
 *
 *   GET /api/v1/org/audit/timeline     — Org-wide audit trail
 *   GET /api/v1/org/audit/entity/:id   — Entity-scoped timeline
 *   GET /api/v1/org/audit/user/:id     — User activity history
 *   GET /api/v1/org/audit/stats        — Aggregated statistics
 *
 * ── ACCESS ──────────────────────────────────────────────────────
 *
 *   security.read  — Read audit logs (admin, security manager)
 *
 * PLANE: Org only.
 *
 * @swagger
 * tags:
 *   name: AuditTimeline
 *   description: Organization audit trail and activity timeline
 */

"use strict";

const express = require("express");
const router = express.Router();
const controller = require("../controllers/auditTimeline.controller");
const requireOrgPermission = require("../../../middleware/requireOrgPermission");
const policyMiddleware = require("../../../rbac/policyMiddleware");
const { P } = require("../../../rbac/orgPermissions");

/**
 * @swagger
 * /api/v1/org/audit/timeline:
 *   get:
 *     summary: Get organization-wide audit trail
 *     tags: [AuditTimeline]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: category
 *         schema:
 *           type: string
 *           enum: [patient, appointment, treatment, clinical, financial, admin, security, other, all]
 *       - in: query
 *         name: action
 *         schema:
 *           type: string
 *       - in: query
 *         name: search
 *         schema:
 *           type: string
 *       - in: query
 *         name: from
 *         schema:
 *           type: string
 *           format: date-time
 *       - in: query
 *         name: to
 *         schema:
 *           type: string
 *           format: date-time
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 50
 *     responses:
 *       200:
 *         description: Audit timeline
 */
router.get(
    "/timeline",
    requireOrgPermission(P.SECURITY_READ),
    policyMiddleware(P.SECURITY_READ),
    controller.getOrgTimeline
);

/**
 * @swagger
 * /api/v1/org/audit/entity/{entityId}:
 *   get:
 *     summary: Get audit timeline for a specific entity
 *     tags: [AuditTimeline]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: entityId
 *         required: true
 *         schema:
 *           type: string
 *       - in: query
 *         name: entityType
 *         schema:
 *           type: string
 *       - in: query
 *         name: category
 *         schema:
 *           type: string
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Entity audit timeline
 */
router.get(
    "/entity/:entityId",
    requireOrgPermission(P.SECURITY_READ),
    policyMiddleware(P.SECURITY_READ),
    controller.getEntityTimeline
);

/**
 * @swagger
 * /api/v1/org/audit/user/{userId}:
 *   get:
 *     summary: Get activity history for a specific user
 *     tags: [AuditTimeline]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: userId
 *         required: true
 *         schema:
 *           type: string
 *       - in: query
 *         name: category
 *         schema:
 *           type: string
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: User activity timeline
 */
router.get(
    "/user/:userId",
    requireOrgPermission(P.SECURITY_READ),
    policyMiddleware(P.SECURITY_READ),
    controller.getUserActivity
);

/**
 * @swagger
 * /api/v1/org/audit/stats:
 *   get:
 *     summary: Get aggregated audit statistics
 *     tags: [AuditTimeline]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: days
 *         schema:
 *           type: integer
 *           default: 7
 *     responses:
 *       200:
 *         description: Audit statistics
 */
router.get(
    "/stats",
    requireOrgPermission(P.SECURITY_READ),
    policyMiddleware(P.SECURITY_READ),
    controller.getAuditStats
);

// ═══════════════════════════════════════════════════════════════════════════════
// Phase 14 — Audit Intelligence + Export + Governance
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * @swagger
 * /api/v1/org/audit/alerts:
 *   get:
 *     summary: Get security alerts from audit intelligence engine
 *     description: Runs anomaly detection rules against recent audit logs. Returns structured alerts sorted by severity.
 *     tags: [AuditTimeline]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: hours
 *         schema:
 *           type: integer
 *           default: 24
 *         description: Lookback window in hours for analysis
 *     responses:
 *       200:
 *         description: Security alerts
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 alerts:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       type: { type: string }
 *                       severity: { type: string, enum: [critical, high, medium, low] }
 *                       message: { type: string }
 *                       detectedAt: { type: string, format: date-time }
 *                 alertCount: { type: integer }
 *                 logsAnalyzed: { type: integer }
 */
router.get(
    "/alerts",
    requireOrgPermission(P.SECURITY_READ),
    policyMiddleware(P.SECURITY_READ),
    controller.getAuditAlerts
);

/**
 * @swagger
 * /api/v1/org/audit/export:
 *   get:
 *     summary: Export audit logs for legal compliance
 *     description: Downloads audit records as JSON for the specified date range. Max 90 days, 10,000 records per export.
 *     tags: [AuditTimeline]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: from
 *         required: true
 *         schema:
 *           type: string
 *           format: date-time
 *         description: Start date (ISO format)
 *       - in: query
 *         name: to
 *         required: true
 *         schema:
 *           type: string
 *           format: date-time
 *         description: End date (ISO format)
 *       - in: query
 *         name: category
 *         schema:
 *           type: string
 *           enum: [patient, appointment, treatment, clinical, financial, admin, security, all]
 *     responses:
 *       200:
 *         description: Audit log export (Content-Disposition triggers download)
 *       400:
 *         description: Missing date range or range exceeds 90 days
 */
router.get(
    "/export",
    requireOrgPermission(P.SECURITY_READ),
    policyMiddleware(P.SECURITY_READ),
    controller.exportAuditLogs
);

/**
 * @swagger
 * /api/v1/org/audit/governance:
 *   get:
 *     summary: Get real-time governance violation status
 *     description: Returns recent governance violations and aggregate statistics from the governance engine.
 *     tags: [AuditTimeline]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: rule
 *         schema:
 *           type: string
 *         description: Filter by violation rule name
 *       - in: query
 *         name: severity
 *         schema:
 *           type: string
 *           enum: [critical, high, medium, low]
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 50
 *     responses:
 *       200:
 *         description: Governance status with violations and stats
 */
router.get(
    "/governance",
    requireOrgPermission(P.SECURITY_READ),
    policyMiddleware(P.SECURITY_READ),
    controller.getGovernanceStatus
);

module.exports = router;
