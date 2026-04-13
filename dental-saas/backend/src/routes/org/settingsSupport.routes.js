/**
 * settingsSupport.routes.js — Org Settings Hub: Support Routes
 * @bridge-layer (LOCKED)
 * @rls-bridge-passthrough — Route definitions only. No DB access.
 *
 * RULES:
 *   - No business logic
 *   - No conditional flows
 *   - DTO mapping ONLY (via bridge service)
 *   - MUST use enforceDTO() (enforced in bridge)
 *   - ALL responses include DTO version envelope
 *
 * Org-facing support ticket endpoints that proxy to the support bridge service.
 * All routes are protected by orgProtect (upstream) + authorize() chain.
 *
 * GUARDS:
 *   - Read:  authorize({ permission: "support.read" })
 *   - Write: authorize({ permission: "support.write" })
 *
 * RATE LIMITS:
 *   - POST /tickets:             supportCreateLimiter  (10 req/min)
 *   - POST /tickets/:id/comments: supportCommentLimiter (15 req/min)
 *
 * PLANE: Org (mounted under /api/v1/org/settings)
 *
 * @module routes/org/settingsSupport.routes
 */

"use strict";

const express = require("express");
const router = express.Router();
const authorize = require("@middleware/authorize");
const asyncHandler = require("@utils/asyncHandler");
const supportBridge = require("@services/bridges/orgSupportBridge.service");
const { SETTINGS_DTO_VERSION } = require("../../specs/contracts/bridges/SETTINGS_DTO_VERSION");
const { supportCreateLimiter, supportCommentLimiter } = require("@middleware/rateLimiter");
const { validateObjectId } = require("@utils/validateObjectId");
const logger = require("@utils/logger");

// ── GET /settings/support/tickets ─────────────────────────────────────────────
/**
 * @swagger
 * /api/v1/org/settings/support/tickets:
 *   get:
 *     summary: List support tickets for current organization
 *     tags: [SettingsHub - Support]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 20
 *           maximum: 50
 *       - in: query
 *         name: skip
 *         schema:
 *           type: integer
 *           default: 0
 *     responses:
 *       200:
 *         description: Array of ticket DTOs
 *       403:
 *         description: Permission denied
 */
router.get(
    "/tickets",
    ...authorize({ permission: "support.read" }),
    asyncHandler(async (req, res) => {
        const limit = Math.min(parseInt(req.query.limit, 10) || 20, 50);
        const skip = Math.max(parseInt(req.query.skip, 10) || 0, 0);
        const tickets = await supportBridge.listTickets(req, { limit, skip });

        logger.info({
            event: "ORG_SUPPORT_VIEW",
            orgId: req.user?.organizationId?.toString(),
            route: "support.tickets.list",
            userId: req.user?._id?.toString(),
            resultCount: tickets.length,
        }, "[settingsSupport] Ticket list read");

        res.json({ success: true, version: SETTINGS_DTO_VERSION, data: tickets });
    })
);

// ── POST /settings/support/tickets ────────────────────────────────────────────
/**
 * @swagger
 * /api/v1/org/settings/support/tickets:
 *   post:
 *     summary: Create a new support ticket
 *     tags: [SettingsHub - Support]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [subject, description, category]
 *             properties:
 *               subject:
 *                 type: string
 *               description:
 *                 type: string
 *               category:
 *                 type: string
 *                 enum: [technical, billing, security, subscription, dispute]
 *               priority:
 *                 type: string
 *                 enum: [CRITICAL, HIGH, MEDIUM, LOW]
 *                 default: MEDIUM
 *     responses:
 *       201:
 *         description: Created ticket DTO
 *       400:
 *         description: Validation error
 *       403:
 *         description: Permission denied
 *       429:
 *         description: Rate limit exceeded
 */
router.post(
    "/tickets",
    supportCreateLimiter,
    ...authorize({ permission: "support.write" }),
    asyncHandler(async (req, res) => {
        const { subject, description, category, priority } = req.body;

        if (!subject || !description || !category) {
            return res.status(400).json({
                success: false,
                error: {
                    code: "VALIDATION_ERROR",
                    message: "subject, description, and category are required",
                },
            });
        }

        const ticket = await supportBridge.createTicket(req, {
            subject,
            description,
            category,
            priority,
        });

        res.status(201).json({ success: true, version: SETTINGS_DTO_VERSION, data: ticket });
    })
);

// ── GET /settings/support/tickets/:id ─────────────────────────────────────────
/**
 * @swagger
 * /api/v1/org/settings/support/tickets/{id}:
 *   get:
 *     summary: Get support ticket detail with conversation thread
 *     tags: [SettingsHub - Support]
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
 *         description: Ticket detail DTO with filtered conversation thread
 *       400:
 *         description: Invalid ticket ID
 *       404:
 *         description: Ticket not found
 *       403:
 *         description: Permission denied
 */
router.get(
    "/tickets/:id",
    ...authorize({ permission: "support.read" }),
    asyncHandler(async (req, res) => {
        validateObjectId(req.params.id, "ticket ID");

        const ticket = await supportBridge.getTicketDetail(req, req.params.id);

        logger.info({
            event: "ORG_SUPPORT_VIEW",
            orgId: req.user?.organizationId?.toString(),
            route: "support.tickets.detail",
            userId: req.user?._id?.toString(),
            ticketId: req.params.id,
        }, "[settingsSupport] Ticket detail read");

        res.json({ success: true, version: SETTINGS_DTO_VERSION, data: ticket });
    })
);

// ── POST /settings/support/tickets/:id/comments ──────────────────────────────
/**
 * @swagger
 * /api/v1/org/settings/support/tickets/{id}/comments:
 *   post:
 *     summary: Add a comment to a support ticket (append-only)
 *     tags: [SettingsHub - Support]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [message]
 *             properties:
 *               message:
 *                 type: string
 *     responses:
 *       200:
 *         description: Comment added successfully
 *       400:
 *         description: Validation error or invalid ticket ID
 *       404:
 *         description: Ticket not found
 *       403:
 *         description: Permission denied
 *       429:
 *         description: Rate limit exceeded
 */
router.post(
    "/tickets/:id/comments",
    supportCommentLimiter,
    ...authorize({ permission: "support.write" }),
    asyncHandler(async (req, res) => {
        validateObjectId(req.params.id, "ticket ID");

        const result = await supportBridge.addComment(req, req.params.id, req.body.message);
        res.json({ success: true, version: SETTINGS_DTO_VERSION, data: result });
    })
);

module.exports = router;

