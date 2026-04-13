/**
 * security.routes.js — Security Control Center Routes
 *
 * All endpoints are READ-ONLY introspection APIs (except /simulate which is POST).
 * Guard: requireOrgPermission(P.SECURITY_MANAGE) — org_admin only.
 *
 * Production Hardening (v3.0):
 *   - Rate limiting: dashboard (60/min), simulation (20/min), export (5/min)
 *   - Export endpoints for logs (CSV) and policies (JSON)
 *
 * Mounted at: /api/v1/org/settings/security  (Phase H.3 — canonical Settings Hub path)
 * Legacy:      /api/v1/org/security → 307 → /api/v1/org/settings/security
 */

"use strict";

const express = require("express");
const router = express.Router();
const { P } = require("../../rbac/orgPermissions");
const requireOrgPermission = require("../../middleware/requireOrgPermission");
const controller = require("./security.controller");
const { dashboardLimiter, simulationLimiter, exportLimiter } = require("@middleware/rateLimiter");

// ─── RBAC Guard ─────────────────────────────────────────────────────────────
// orgProtect + organizationContext are already applied by the parent router
// (orgV1Routes.js router.use()). Here we apply SECURITY_MANAGE permission.

router.use(requireOrgPermission(P.SECURITY_MANAGE));

// ─── Dashboard rate limiter (60 req/min) ────────────────────────────────────
router.use(dashboardLimiter);

// ─── Introspection Routes ───────────────────────────────────────────────────

/**
 * @swagger
 * /api/v1/org/security/overview:
 *   get:
 *     summary: Security dashboard KPIs + weekly access chart
 *     tags: [Security]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Overview data with KPIs, weeklyChart, and meta
 */
router.get("/overview", controller.getOverview);

// All permissions + role mappings
router.get("/permissions", controller.getPermissions);

// Route → permission matrix audit
router.get("/matrix", controller.getMatrix);

// Policy definitions (serialized, no functions)
router.get("/policies", controller.getPolicies);

// Field access registry
router.get("/fields", controller.getFieldAccess);

// Policy coverage analysis
router.get("/coverage", controller.getCoverage);

// Audit logs (paginated + filtered)
router.get("/logs", controller.getLogs);

// ─── Simulation (tighter rate limit: 20 req/min) ────────────────────────────

/**
 * @swagger
 * /api/v1/org/security/simulate:
 *   post:
 *     summary: Simulate an access decision using real policy engine
 *     tags: [Security]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - permission
 *             properties:
 *               permission:
 *                 type: string
 *                 example: "patients.update"
 *               resource:
 *                 type: object
 *     responses:
 *       200:
 *         description: Policy decision with evaluation trace
 *       429:
 *         description: Rate limit exceeded (max 20/min)
 */
router.post("/simulate", simulationLimiter, controller.simulateAccess);

// ─── Export Routes (tight rate limit: 5 req/min) ────────────────────────────

/**
 * @swagger
 * /api/v1/org/security/logs/export:
 *   get:
 *     summary: Export audit logs as CSV (max 5000 records)
 *     tags: [Security]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: result
 *         schema:
 *           type: string
 *           enum: [allowed, denied]
 *       - in: query
 *         name: startDate
 *         schema:
 *           type: string
 *           format: date
 *       - in: query
 *         name: endDate
 *         schema:
 *           type: string
 *           format: date
 *     responses:
 *       200:
 *         description: CSV file download
 *         content:
 *           text/csv: {}
 *       429:
 *         description: Rate limit exceeded (max 5/min)
 */
router.get("/logs/export", exportLimiter, controller.exportLogs);

/**
 * @swagger
 * /api/v1/org/security/policies/export:
 *   get:
 *     summary: Export policy definitions as JSON
 *     tags: [Security]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: JSON file download
 *         content:
 *           application/json: {}
 *       429:
 *         description: Rate limit exceeded (max 5/min)
 */
router.get("/policies/export", exportLimiter, controller.exportPolicies);

// ─── Denial Monitoring + Shadow Mode ────────────────────────────────────────

/**
 * @swagger
 * /api/v1/org/security/denials:
 *   get:
 *     summary: Denial monitoring dashboard — top denied endpoints, permissions, and recent denials
 *     tags: [Security]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Denial statistics with shadow mode status
 */
router.get("/denials", controller.getDenialStats);

/**
 * @swagger
 * /api/v1/org/security/shadow-status:
 *   get:
 *     summary: Get current shadow mode configuration
 *     tags: [Security]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Shadow mode enabled/disabled status
 */
router.get("/shadow-status", controller.getShadowStatus);

// ─── Phase 1+2: Security Alerts ─────────────────────────────────────────────

/**
 * @swagger
 * /api/v1/org/security/alerts:
 *   get:
 *     summary: Get paginated security alerts
 *     tags: [Security]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [active, acknowledged, resolved]
 *       - in: query
 *         name: severity
 *         schema:
 *           type: string
 *           enum: [LOW, MEDIUM, HIGH, CRITICAL]
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
 *         description: Paginated alert list
 */
router.get("/alerts", controller.getAlerts);

/**
 * @swagger
 * /api/v1/org/security/alerts/summary:
 *   get:
 *     summary: Get active alert count by severity
 *     tags: [Security]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Alert severity counts
 */
router.get("/alerts/summary", controller.getAlertSummary);

/**
 * @swagger
 * /api/v1/org/security/alerts/{id}/acknowledge:
 *   patch:
 *     summary: Acknowledge a security alert
 *     tags: [Security]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Alert acknowledged
 *       404:
 *         description: Alert not found
 */
router.patch("/alerts/:id/acknowledge", simulationLimiter, controller.acknowledgeAlert);

/**
 * @swagger
 * /api/v1/org/security/alerts/{id}/resolve:
 *   patch:
 *     summary: Resolve a security alert
 *     tags: [Security]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Alert resolved
 *       404:
 *         description: Alert not found
 */
router.patch("/alerts/:id/resolve", simulationLimiter, controller.resolveAlert);

// ─── Phase 4: Policy Version History ────────────────────────────────────────

/**
 * @swagger
 * /api/v1/org/security/policies/history:
 *   get:
 *     summary: Get policy version history
 *     tags: [Security]
 *     security:
 *       - bearerAuth: []
 *     parameters:
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
 *         description: Paginated policy version timeline
 */
router.get("/policies/history", controller.getPolicyHistory);

// ─── Phase 5: System Metrics ────────────────────────────────────────────────

/**
 * @swagger
 * /api/v1/org/security/metrics:
 *   get:
 *     summary: Get security system operational metrics (SLO dashboard)
 *     tags: [Security]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Policy eval latency, cache hit rate, denial ratio, alert rate
 */
router.get("/metrics", controller.getSecurityMetrics);

// ─── Phase 6: Entitlement & Rollout ─────────────────────────────────────────

/**
 * @swagger
 * /api/v1/org/security/entitlements:
 *   get:
 *     summary: Get organization module/feature entitlement status
 *     tags: [Security]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Module and feature entitlement map with audit mode status
 */
router.get("/entitlements", controller.getEntitlementStatus);

/**
 * @swagger
 * /api/v1/org/security/rollout-status:
 *   get:
 *     summary: Get unified security system rollout status
 *     tags: [Security]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Shadow mode, entitlement mode, classification, and alerting status
 */
router.get("/rollout-status", controller.getRolloutStatus);

// ─── Phase 20: Auth Analytics & Trace Query ─────────────────────────────────

/**
 * @swagger
 * /api/v1/org/security/auth/analytics:
 *   get:
 *     summary: Authorization analytics dashboard (denials by layer/user/resource, trends, performance)
 *     tags: [Security]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: startDate
 *         schema:
 *           type: string
 *           format: date-time
 *       - in: query
 *         name: endDate
 *         schema:
 *           type: string
 *           format: date-time
 *     responses:
 *       200:
 *         description: Full auth analytics payload
 */
router.get("/auth/analytics", controller.getAuthAnalytics);

/**
 * @swagger
 * /api/v1/org/security/auth/traces:
 *   get:
 *     summary: Query persisted auth traces (paginated + filtered)
 *     tags: [Security]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *       - in: query
 *         name: hasDenial
 *         schema:
 *           type: boolean
 *       - in: query
 *         name: userId
 *         schema:
 *           type: string
 *       - in: query
 *         name: resourceType
 *         schema:
 *           type: string
 *       - in: query
 *         name: startDate
 *         schema:
 *           type: string
 *           format: date-time
 *       - in: query
 *         name: endDate
 *         schema:
 *           type: string
 *           format: date-time
 *     responses:
 *       200:
 *         description: Paginated auth trace list
 */
router.get("/auth/traces", controller.getAuthTraces);

/**
 * @swagger
 * /api/v1/org/security/auth/traces/{requestId}:
 *   get:
 *     summary: Get a single auth trace by requestId
 *     tags: [Security]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: requestId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Single auth trace document
 *       404:
 *         description: Trace not found
 */
router.get("/auth/traces/:requestId", controller.getAuthTraceByRequestId);

// ─── Phase 20.1: Split Analytics Dashboard ──────────────────────────────────

/**
 * @swagger
 * /api/v1/org/security/analytics/summary:
 *   get:
 *     summary: Authorization analytics summary KPIs (total, allow/deny rates, avg duration)
 *     tags: [Security Analytics]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: startDate
 *         schema: { type: string, format: date-time }
 *       - in: query
 *         name: endDate
 *         schema: { type: string, format: date-time }
 *     responses:
 *       200:
 *         description: Summary KPIs
 */
router.get("/analytics/summary", controller.getAnalyticsSummary);

/**
 * @swagger
 * /api/v1/org/security/analytics/timeline:
 *   get:
 *     summary: Time-bucketed allow/deny counts for line chart
 *     tags: [Security Analytics]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: startDate
 *         schema: { type: string, format: date-time }
 *       - in: query
 *         name: endDate
 *         schema: { type: string, format: date-time }
 *     responses:
 *       200:
 *         description: Timeline chart data
 */
router.get("/analytics/timeline", controller.getAnalyticsTimeline);

/**
 * @swagger
 * /api/v1/org/security/analytics/distribution:
 *   get:
 *     summary: Allow vs Deny distribution for donut chart
 *     tags: [Security Analytics]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: startDate
 *         schema: { type: string, format: date-time }
 *       - in: query
 *         name: endDate
 *         schema: { type: string, format: date-time }
 *     responses:
 *       200:
 *         description: Distribution data
 */
router.get("/analytics/distribution", controller.getAnalyticsDistribution);

/**
 * @swagger
 * /api/v1/org/security/analytics/denied-permissions:
 *   get:
 *     summary: Top denied permissions for bar chart
 *     tags: [Security Analytics]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: startDate
 *         schema: { type: string, format: date-time }
 *       - in: query
 *         name: endDate
 *         schema: { type: string, format: date-time }
 *     responses:
 *       200:
 *         description: Denied permission ranking
 */
router.get("/analytics/denied-permissions", controller.getAnalyticsDeniedPermissions);

/**
 * @swagger
 * /api/v1/org/security/analytics/recent-denials:
 *   get:
 *     summary: Latest denial log entries
 *     tags: [Security Analytics]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: startDate
 *         schema: { type: string, format: date-time }
 *       - in: query
 *         name: endDate
 *         schema: { type: string, format: date-time }
 *       - in: query
 *         name: limit
 *         schema: { type: integer, default: 20, maximum: 50 }
 *     responses:
 *       200:
 *         description: Recent denial entries
 */
router.get("/analytics/recent-denials", controller.getAnalyticsRecentDenials);

/**
 * @swagger
 * /api/v1/org/security/analytics/risk-users:
 *   get:
 *     summary: Users with highest denial frequency (risk analysis)
 *     tags: [Security Analytics]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: startDate
 *         schema: { type: string, format: date-time }
 *       - in: query
 *         name: endDate
 *         schema: { type: string, format: date-time }
 *     responses:
 *       200:
 *         description: Risk user ranking
 */
router.get("/analytics/risk-users", controller.getAnalyticsRiskUsers);

/**
 * @swagger
 * /api/v1/org/security/analytics/layer-performance:
 *   get:
 *     summary: Per-layer (RBAC/PBAC/FIELD) deny counts and performance
 *     tags: [Security Analytics]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: startDate
 *         schema: { type: string, format: date-time }
 *       - in: query
 *         name: endDate
 *         schema: { type: string, format: date-time }
 *     responses:
 *       200:
 *         description: Layer performance data
 */
router.get("/analytics/layer-performance", controller.getAnalyticsLayerPerformance);

/**
 * @swagger
 * /api/v1/org/security/analytics/field-violations:
 *   get:
 *     summary: Field-level access violation attempts
 *     tags: [Security Analytics]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: startDate
 *         schema: { type: string, format: date-time }
 *       - in: query
 *         name: endDate
 *         schema: { type: string, format: date-time }
 *     responses:
 *       200:
 *         description: Field violation data
 */
router.get("/analytics/field-violations", controller.getAnalyticsFieldViolations);

/**
 * @swagger
 * /api/v1/org/security/analytics/queue-health:
 *   get:
 *     summary: Auth trace ingestion queue health metrics
 *     tags: [Security Analytics]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Queue health metrics
 */
router.get("/analytics/queue-health", controller.getAnalyticsQueueHealth);

module.exports = router;
