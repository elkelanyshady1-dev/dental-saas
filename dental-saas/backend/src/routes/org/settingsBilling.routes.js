/**
 * settingsBilling.routes.js — Org Settings Hub: Billing Routes
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
 * Org-facing billing endpoints that proxy to the billing bridge service.
 * All routes are protected by orgProtect (upstream) + authorize() chain.
 *
 * ⚠️ DOMAIN NAMING ENFORCEMENT (Domain Glossary v1.0 — ABSOLUTE)
 * ─────────────────────────────────────────────────────────────────
 * This route is SaaS BILLING (org’s subscription to the DentalSaaS platform).
 * billing.read is VALID and CORRECT here.
 *
 * DO NOT confuse with clinic finance analytics:
 *   - Clinic analytics routes use ACCOUNTING_READ (billingDomain/analytics/)
 *   - This file uses billing.read ONLY for SaaS subscription/plan/usage reads
 *
 * See: docs/domain-glossary.md for full collision matrix.
 *
 * GUARDS: authorize({ permission: "billing.read" })
 * RATE LIMIT: billingReadLimiter (30 req/min per user)
 * PLANE: Org (mounted under /api/v1/org/settings)
 *
 * @module routes/org/settingsBilling.routes
 */

"use strict";

const express = require("express");
const router = express.Router();
const authorize = require("@middleware/authorize");
const asyncHandler = require("@utils/asyncHandler");
const billingBridge = require("@services/bridges/orgBillingBridge.service");
const { SETTINGS_DTO_VERSION } = require("../../specs/contracts/bridges/SETTINGS_DTO_VERSION");
const { billingReadLimiter } = require("@middleware/rateLimiter");
const logger = require("@utils/logger");

// ── GET /settings/billing/subscription ────────────────────────────────────────
/**
 * @swagger
 * /api/v1/org/settings/billing/subscription:
 *   get:
 *     summary: Get active subscription for current organization
 *     tags: [SettingsHub - Billing]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Active subscription DTO (or null if no active contract)
 *       403:
 *         description: Permission denied
 *       429:
 *         description: Rate limit exceeded
 */
router.get(
    "/subscription",
    billingReadLimiter,
    ...authorize({ permission: "billing.read" }),
    asyncHandler(async (req, res) => {
        const subscription = await billingBridge.getActiveSubscription(req);

        logger.info({
            event: "ORG_BILLING_ACCESS",
            orgId: req.user?.organizationId?.toString(),
            route: "billing.subscription",
            userId: req.user?._id?.toString(),
        }, "[settingsBilling] Subscription read");

        res.json({ success: true, version: SETTINGS_DTO_VERSION, data: subscription });
    })
);

// ── GET /settings/billing/invoices ────────────────────────────────────────────
/**
 * @swagger
 * /api/v1/org/settings/billing/invoices:
 *   get:
 *     summary: Get invoice history for current organization
 *     tags: [SettingsHub - Billing]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 20
 *           maximum: 50
 *         description: Number of invoices to return
 *       - in: query
 *         name: skip
 *         schema:
 *           type: integer
 *           default: 0
 *         description: Number of invoices to skip (pagination)
 *     responses:
 *       200:
 *         description: Array of invoice DTOs
 *       403:
 *         description: Permission denied
 *       429:
 *         description: Rate limit exceeded
 */
router.get(
    "/invoices",
    billingReadLimiter,
    ...authorize({ permission: "billing.read" }),
    asyncHandler(async (req, res) => {
        const limit = Math.min(parseInt(req.query.limit, 10) || 20, 50);
        const skip = Math.max(parseInt(req.query.skip, 10) || 0, 0);
        const invoices = await billingBridge.getInvoiceHistory(req, { limit, skip });

        logger.info({
            event: "ORG_BILLING_ACCESS",
            orgId: req.user?.organizationId?.toString(),
            route: "billing.invoices",
            userId: req.user?._id?.toString(),
            limit,
            skip,
        }, "[settingsBilling] Invoice history read");

        res.json({ success: true, version: SETTINGS_DTO_VERSION, data: invoices });
    })
);

// ── GET /settings/billing/usage ──────────────────────────────────────────────
/**
 * @swagger
 * /api/v1/org/settings/billing/usage:
 *   get:
 *     summary: Get usage quota summary for current organization
 *     tags: [SettingsHub - Billing]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Array of usage quota DTOs
 *       403:
 *         description: Permission denied
 *       429:
 *         description: Rate limit exceeded
 */
router.get(
    "/usage",
    billingReadLimiter,
    ...authorize({ permission: "billing.read" }),
    asyncHandler(async (req, res) => {
        const quotas = await billingBridge.getUsageQuotas(req);

        logger.info({
            event: "ORG_BILLING_ACCESS",
            orgId: req.user?.organizationId?.toString(),
            route: "billing.usage",
            userId: req.user?._id?.toString(),
        }, "[settingsBilling] Usage quotas read");

        res.json({ success: true, version: SETTINGS_DTO_VERSION, data: quotas });
    })
);

module.exports = router;

