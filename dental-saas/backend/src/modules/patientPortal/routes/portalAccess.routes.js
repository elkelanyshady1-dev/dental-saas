/**
 * portalAccess.routes.js
 * Phase 6 — Portal Access System: Routes
 *
 * Mounted at: /api/v1/portal/access
 *
 * Route Groups:
 *   1. STAFF — generate access links (orgProtect + RBAC)
 *   2. PUBLIC — verify tokens + complete setup (portalRLSContextPublic)
 *
 * Middleware Chains:
 *   Staff:  orgProtect → organizationContext → requireOrgPermission → policyMiddleware → handler
 *   Public: portalOrganizationContext → portalRLSContextPublic → handler
 *
 * @per-org-transactional — portal access routes — staff uses org RLS, public uses portal RLS
 */

"use strict";

const express = require("express");
const router = express.Router();

// ── Staff middleware ─────────────────────────────────────────────────────────
const orgProtect = require("@middleware/orgProtect");
const organizationContext = require("@middleware/organizationMiddleware");
const requireOrgPermission = require("@middleware/requireOrgPermission");
const policyMiddleware = require("@rbac/policyMiddleware");
const { P } = require("@rbac/orgPermissions");

// ── Public portal middleware ─────────────────────────────────────────────────
const { portalRLSContextPublic } = require("../../../middleware/portalContext");
const logger = require("@utils/logger");

// ── Rate limiting (IPv6-safe via centralized factory) ────────────────────────
const { createLimiter } = require("../../../middleware/rateLimiter");

const portalAccessLimiter = createLimiter({
    windowMs: 15 * 60 * 1000,
    max: 10,
    keyType: "ip",
    message: (req, res) => res.status(429).json({
        success: false,
        error: {
            code: "RATE_LIMIT_EXCEEDED",
            message: "Too many access link requests. Please try again later.",
        },
    }),
});

const portalSetupLimiter = createLimiter({
    windowMs: 60 * 60 * 1000,
    max: 5,
    keyType: "ip",
    message: (req, res) => res.status(429).json({
        success: false,
        error: {
            code: "RATE_LIMIT_EXCEEDED",
            message: "Too many setup attempts. Please try again later.",
        },
    }),
});

// ── Controller ───────────────────────────────────────────────────────────────
const ctrl = require("../controllers/portalAccess.controller");

// ── Portal Organization Context (for public routes) ──────────────────────────
function portalOrganizationContext(req, res, next) {
    const orgId = req.headers["x-organization-id"] || req.query.organizationId;

    if (!orgId) {
        return res.status(400).json({
            success: false,
            error: {
                code: "MISSING_ORGANIZATION",
                message: "X-Organization-Id header is required for portal access.",
            },
        });
    }

    req.organizationId = orgId;

    logger.debug({
        event: "PORTAL_ACCESS_ORG_CONTEXT",
        organizationId: orgId,
        path: req.originalUrl,
    });

    next();
}

// ═══════════════════════════════════════════════════════════════════════════════
// 1. STAFF ROUTES — Generate access/setup links
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * @swagger
 * /portal/access/send:
 *   post:
 *     summary: Generate a magic link or setup link for a patient
 *     tags: [PortalAccess]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [patientId, type]
 *             properties:
 *               patientId: { type: string, description: Patient ObjectId }
 *               type: { type: string, enum: [magic_link, setup_link] }
 *               deliveryChannel: { type: string, enum: [whatsapp, sms, email] }
 *     responses:
 *       201:
 *         description: Access link generated
 *       404:
 *         description: Patient not found or no portal account (for magic_link)
 */
router.post("/send",
    orgProtect,
    organizationContext,
    requireOrgPermission(P.PORTAL_MANAGE),
    policyMiddleware(P.PORTAL_MANAGE),
    ctrl.sendAccessLink
);

// ═══════════════════════════════════════════════════════════════════════════════
// 2. PUBLIC ROUTES — Verify tokens + complete setup
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * @swagger
 * /portal/access/verify:
 *   post:
 *     summary: Verify a magic link or setup link token
 *     tags: [PortalAccess]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [token]
 *             properties:
 *               token: { type: string, description: Raw token from URL }
 *     responses:
 *       200:
 *         description: Token verified (returns JWT for magic_link or patient data for setup)
 *       401:
 *         description: Invalid or expired token
 */
router.post("/verify",
    portalOrganizationContext,
    portalRLSContextPublic,
    portalAccessLimiter,
    ctrl.verifyAccessToken
);

/**
 * @swagger
 * /portal/setup/complete:
 *   post:
 *     summary: Complete patient onboarding after setup link verification
 *     tags: [PortalAccess]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [setupToken]
 *             properties:
 *               setupToken: { type: string, description: Invite ID from verify response }
 *               password: { type: string, minLength: 8, description: Optional password }
 *               medicalHistory:
 *                 type: object
 *                 properties:
 *                   chronicConditions: { type: array, items: { type: string } }
 *                   allergies: { type: array, items: { type: string } }
 *                   medications: { type: array, items: { type: string } }
 *                   smoking: { type: boolean }
 *                   pregnancy: { type: boolean }
 *     responses:
 *       201:
 *         description: Setup completed, JWT returned
 *       401:
 *         description: Invalid setup token
 */
router.post("/setup/complete",
    portalOrganizationContext,
    portalRLSContextPublic,
    portalSetupLimiter,
    ctrl.completeSetup
);

module.exports = router;
