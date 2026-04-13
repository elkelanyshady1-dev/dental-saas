/**
 * sharedCase.routes.js
 * Phase 6 — Public Routes for Shared Case Viewing & Comments
 *
 * Mounted at: /api/v1/shared
 * Auth: NONE — token-gated public access
 *
 * ─── SENTINEL COMPLIANCE ────────────────────────────────────────
 *  ✅ No org auth — public routes with token-based access
 *  ✅ No organizationId sent from client
 *  ✅ Expiration validated on every request
 *  ✅ Rate-limited to prevent abuse
 *
 * @swagger
 * tags:
 *   - name: SharedCase
 *     description: Public endpoints for viewing shared orthodontic cases
 */

"use strict";

const express = require("express");
const router = express.Router();
const { createLimiter } = require("../../../middleware/rateLimiter");

const ctrl = require("../controllers/sharedCase.controller");

// ─── Rate Limiting (IPv6-safe via centralized factory) ──────────────────────
// Public endpoints — stricter rate limits to prevent abuse
const sharedViewLimiter = createLimiter({
  windowMs: 15 * 60 * 1000,
  max: 60,
  keyType: "ip",
  message: "Too many requests, please try again later",
});

const commentLimiter = createLimiter({
  windowMs: 15 * 60 * 1000,
  max: 20,
  keyType: "ip",
  message: "Too many comments, please try again later",
});

// ═══════════════════════════════════════════════════════════════════════════════
// Public Routes — No Authentication Required
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * @swagger
 * /shared/{token}:
 *   get:
 *     summary: View a shared orthodontic case
 *     description: Public endpoint — validates token and expiration, returns case data
 *     tags: [SharedCase]
 *     parameters:
 *       - in: path
 *         name: token
 *         required: true
 *         schema: { type: string, format: uuid }
 *     responses:
 *       200:
 *         description: Case data returned
 *       404:
 *         description: Share link not found
 *       410:
 *         description: Share link expired
 */
router.get("/:token", sharedViewLimiter, ctrl.getSharedCase);

/**
 * @swagger
 * /shared/{token}/comments:
 *   get:
 *     summary: Get comments for a shared case
 *     tags: [SharedCase]
 *     parameters:
 *       - in: path
 *         name: token
 *         required: true
 *         schema: { type: string, format: uuid }
 *     responses:
 *       200:
 *         description: Comments list
 */
router.get("/:token/comments", sharedViewLimiter, ctrl.getComments);

/**
 * @swagger
 * /shared/{token}/comments:
 *   post:
 *     summary: Add a comment to a shared case
 *     description: Public endpoint — requires authorName and either text or audioUrl
 *     tags: [SharedCase]
 *     parameters:
 *       - in: path
 *         name: token
 *         required: true
 *         schema: { type: string, format: uuid }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [authorName]
 *             properties:
 *               authorName: { type: string, maxLength: 100 }
 *               text: { type: string, maxLength: 2000 }
 *               audioUrl: { type: string }
 *     responses:
 *       201:
 *         description: Comment created
 *       403:
 *         description: Comments not allowed on this share
 *       410:
 *         description: Share link expired
 */
router.post("/:token/comments", commentLimiter, ctrl.addComment);

/**
 * @swagger
 * /shared/{token}/join:
 *   post:
 *     summary: Join a shared case as a collaborator
 *     tags: [SharedCase]
 *     parameters:
 *       - in: path
 *         name: token
 *         required: true
 *         schema: { type: string, format: uuid }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [name]
 *             properties:
 *               name: { type: string, maxLength: 100 }
 *               role: { type: string, enum: ['doctor', 'lab', 'patient'] }
 *     responses:
 *       201:
 *         description: Collaborator joined
 *       410:
 *         description: Share link expired
 */
router.post("/:token/join", sharedViewLimiter, ctrl.joinCollaborator);

// ═══════════════════════════════════════════════════════════════════════════════
// 5. Export Shared Case (PDF Data — requires canDownload)
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * @swagger
 * /shared/{token}/export:
 *   get:
 *     summary: Export shared case data for PDF generation
 *     tags: [SharedCase]
 *     parameters:
 *       - in: path
 *         name: token
 *         required: true
 *         schema: { type: string, format: uuid }
 *     responses:
 *       200:
 *         description: Export data
 *       403:
 *         description: Download not permitted
 *       410:
 *         description: Share link expired
 */
const exportCtrl = require("../controllers/exportCase.controller");
router.get("/:token/export", sharedViewLimiter, exportCtrl.exportSharedCasePdf);

module.exports = router;
