/**
 * audit.routes.js
 * Platform Audit Trail Routes (v21.0)
 *
 * Route matrix:
 *
 *   GET /audit/logs               → paginated, filtered audit log list
 *   GET /audit/entity/:type/:id   → entity-level audit timeline
 *   GET /audit/export             → CSV / JSON export
 *   GET /audit/verify-chain       → hash chain integrity scan
 *
 * All routes require VIEW_AUDIT_LOGS capability (Sentinel §3: GET → VIEW_*).
 *
 * Note: POST /audit/frontend-event is registered in auth.routes.js (AUTH_ONLY exception)
 * and is NOT duplicated here.
 *
 * PLANE: Platform
 */

"use strict";

const express = require("express");
const router = express.Router();

const platformProtect = require("../../middleware/platformProtect");
const requirePlatformCapability = require("../../middleware/requirePlatformCapability");
const asyncHandler = require("../../utils/asyncHandler");
const { PLATFORM_CAPABILITIES } = require("@contracts/platformContract.cjs.js");

const auditCtrl = require("../../platform/controllers/platformAuditController");

// ── Guard ─────────────────────────────────────────────────────────────────────
const pAuditRead = [
    platformProtect,
    requirePlatformCapability(PLATFORM_CAPABILITIES.VIEW_AUDIT_LOGS)
];

// ─────────────────────────────────────────────────────────────────────────────
// AUDIT LOG LIST
// ─────────────────────────────────────────────────────────────────────────────

/**
 * @swagger
 * /api/platform/audit/logs:
 *   get:
 *     summary: List platform audit log entries (paginated + filtered)
 *     description: >
 *       Returns platform-plane audit log entries scoped to regionCode = GLOBAL.
 *       Supports filtering by action, actor, role, entity, geo location, date range,
 *       request ID, and success status.
 *     tags: [Audit]
 *     security: [{ platformBearerAuth: [] }]
 *     parameters:
 *       - { in: query, name: page,        schema: { type: integer, default: 1 } }
 *       - { in: query, name: limit,       schema: { type: integer, default: 50, maximum: 200 } }
 *       - { in: query, name: action,      schema: { type: string }, example: LOGIN_SUCCESS }
 *       - { in: query, name: actorId,     schema: { type: string } }
 *       - { in: query, name: actorRole,   schema: { type: string }, example: SUPER_ADMIN }
 *       - { in: query, name: actorName,   schema: { type: string }, description: "Partial first or last name search" }
 *       - { in: query, name: entityType,  schema: { type: string }, example: PlatformUser }
 *       - { in: query, name: entityId,    schema: { type: string } }
 *       - { in: query, name: geoLocation, schema: { type: string }, example: "Cairo" }
 *       - { in: query, name: from,        schema: { type: string, format: date } }
 *       - { in: query, name: to,          schema: { type: string, format: date } }
 *       - { in: query, name: success,     schema: { type: boolean } }
 *       - { in: query, name: requestId,   schema: { type: string } }
 *     responses:
 *       200:
 *         description: Paginated audit log entries with actor and device metadata
 */
router.get("/audit/logs", ...pAuditRead, asyncHandler(auditCtrl.getAuditLogs));

// ─────────────────────────────────────────────────────────────────────────────
// ENTITY TIMELINE
// ─────────────────────────────────────────────────────────────────────────────

/**
 * @swagger
 * /api/platform/audit/entity/{entityType}/{entityId}:
 *   get:
 *     summary: Get audit timeline for a specific entity
 *     description: >
 *       Returns all audit events for a given entity (e.g. PlatformUser, Organization,
 *       PlatformInvoice, OrgContract). Used on entity detail pages to show history.
 *     tags: [Audit]
 *     security: [{ platformBearerAuth: [] }]
 *     parameters:
 *       - { in: path, name: entityType, required: true, schema: { type: string }, example: PlatformUser }
 *       - { in: path, name: entityId,   required: true, schema: { type: string } }
 *       - { in: query, name: limit, schema: { type: integer, default: 100, maximum: 500 } }
 *     responses:
 *       200:
 *         description: Entity audit timeline
 *       400:
 *         description: Invalid entityId
 */
router.get("/audit/entity/:entityType/:entityId", ...pAuditRead, asyncHandler(auditCtrl.getEntityAuditTimeline));

// ─────────────────────────────────────────────────────────────────────────────
// EXPORT
// ─────────────────────────────────────────────────────────────────────────────

/**
 * @swagger
 * /api/platform/audit/export:
 *   get:
 *     summary: Export audit logs as CSV or JSON
 *     tags: [Audit]
 *     security: [{ platformBearerAuth: [] }]
 *     parameters:
 *       - { in: query, name: format, schema: { type: string, enum: [csv, json], default: csv } }
 *       - { in: query, name: token,  schema: { type: string }, description: JWT for browser-direct download }
 *       - { in: query, name: action,     schema: { type: string } }
 *       - { in: query, name: actorRole,  schema: { type: string } }
 *       - { in: query, name: entityType, schema: { type: string } }
 *       - { in: query, name: from,       schema: { type: string, format: date } }
 *       - { in: query, name: to,         schema: { type: string, format: date } }
 *     responses:
 *       200:
 *         description: Audit log export file
 *         content:
 *           text/csv: {}
 *           application/json: {}
 */
// Token via query param is supported here (GET-only, inherited from authMiddleware v20.3)
router.get("/audit/export", ...pAuditRead, asyncHandler(auditCtrl.exportAuditLogs));

// ─────────────────────────────────────────────────────────────────────────────
// CHAIN INTEGRITY
// ─────────────────────────────────────────────────────────────────────────────

/**
 * @swagger
 * /api/platform/audit/verify-chain:
 *   get:
 *     summary: Verify audit hash chain integrity
 *     description: >
 *       Walks the audit ledger chronologically and recomputes SHA-256 hashes.
 *       Any tampered entry breaks the chain and is flagged with the exact entry ID.
 *     tags: [Audit]
 *     security: [{ platformBearerAuth: [] }]
 *     parameters:
 *       - { in: query, name: limit, schema: { type: integer, default: 200, maximum: 1000 } }
 *       - { in: query, name: region, schema: { type: string, default: GLOBAL } }
 *     responses:
 *       200:
 *         description: Chain integrity scan result
 */
router.get("/audit/verify-chain", ...pAuditRead, asyncHandler(auditCtrl.verifyChain));

module.exports = router;
