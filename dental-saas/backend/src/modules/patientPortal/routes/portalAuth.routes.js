/**
 * portalAuth.routes.js
 * Phase 1 — Portal RLS Foundation: Auth Routes
 *
 * Mounted at: /api/v1/portal/auth
 *
 * Public routes: portalOrganizationContext → portalRLSContextPublic → handler
 * Authenticated routes: patientProtect → portalRLSContext → handler
 *
 * Public routes resolve organizationId from X-Organization-Id header.
 * Authenticated routes derive organizationId from the patient JWT.
 *
 * @per-org-public-access — portal auth routes — organizationId from header or JWT
 */

"use strict";

const express = require("express");
const router = express.Router();
const patientProtect = require("../../patientDomain/access/patientProtect");
const {
  portalRLSContext,
  portalRLSContextPublic
} = require("../../../middleware/portalContext");
const ctrl = require("../controllers/portalAuth.controller");
const logger = require("@utils/logger");

// ─── Portal Organization Context (Public Auth Routes) ────────────────────────
// Resolves organizationId from X-Organization-Id header (or query param).
// This replaces the standard organizationContext middleware which requires
// req.user to be set (impossible on pre-auth routes).
function portalOrganizationContext(req, res, next) {
  const orgId = req.headers["x-organization-id"] || req.query.organizationId;
  if (!orgId) {
    return res.status(400).json({
      success: false,
      error: {
        code: "MISSING_ORGANIZATION",
        message: "X-Organization-Id header is required for portal auth."
      }
    });
  }
  logger.debug({
    event: "PORTAL_ORG_CONTEXT_RESOLVED",
    path: req.originalUrl,
    source: req.headers["x-organization-id"] ? "header" : "query"
  });
  next();
}

// ─── Public Auth Routes ─────────────────────────────────────────────────────
// Chain: portalOrganizationContext → portalRLSContextPublic → handler
router.use(portalOrganizationContext);
router.use(portalRLSContextPublic);

/**
 * @swagger
 * /portal/auth/login:
 *   post:
 *     summary: Patient portal — email + password login
 *     tags: [PortalAuth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [email, password]
 *             properties:
 *               email: { type: string, format: email }
 *               password: { type: string }
 *     responses:
 *       200:
 *         description: JWT token returned
 *       401:
 *         description: Invalid credentials
 */
router.post("/login", ctrl.loginWithPassword);

/**
 * @swagger
 * /portal/auth/magic-link/request:
 *   post:
 *     summary: Request magic link for passwordless login
 *     tags: [PortalAuth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [email]
 *             properties:
 *               email: { type: string, format: email }
 *     responses:
 *       200:
 *         description: Magic link sent (if email exists)
 */
router.post("/magic-link/request", ctrl.requestMagicLink);

/**
 * @swagger
 * /portal/auth/magic-link/verify:
 *   post:
 *     summary: Verify magic link token
 *     tags: [PortalAuth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [token]
 *             properties:
 *               token: { type: string }
 *     responses:
 *       200:
 *         description: JWT token returned
 *       401:
 *         description: Invalid or expired token
 */
router.post("/magic-link/verify", ctrl.verifyMagicLink);

/**
 * @swagger
 * /portal/auth/otp/request:
 *   post:
 *     summary: Request OTP for portal login
 *     tags: [PortalAuth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [email]
 *             properties:
 *               email: { type: string, format: email }
 *     responses:
 *       200:
 *         description: OTP sent (if email exists)
 */
router.post("/otp/request", ctrl.requestOtp);

/**
 * @swagger
 * /portal/auth/otp/verify:
 *   post:
 *     summary: Verify OTP and get JWT token
 *     tags: [PortalAuth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [email, otp]
 *             properties:
 *               email: { type: string, format: email }
 *               otp: { type: string, minLength: 6, maxLength: 6 }
 *     responses:
 *       200:
 *         description: JWT token returned
 *       401:
 *         description: Invalid or expired OTP
 */
router.post("/otp/verify", ctrl.verifyOtp);

/**
 * @swagger
 * /portal/auth/logout:
 *   post:
 *     summary: Logout patient (invalidates all JWT tokens)
 *     tags: [PortalAuth]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Logged out successfully
 */
router.post("/logout", patientProtect, portalRLSContext, ctrl.logout);
module.exports = router;