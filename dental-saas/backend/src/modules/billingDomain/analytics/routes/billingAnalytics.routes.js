/**
 * billingAnalytics.routes.js
 * Billing Domain — Analytics Routes (READ MODEL)
 *
 * Mounted at: /api/v1/org/finance
 * Guards:     orgProtect → organizationContext → requireEntitlement → requireOrgPermission → policyMiddleware
 *
 * CLASSIFICATION: READ MODEL — zero writes, all GET endpoints.
 * LOCATION: billingDomain/analytics/routes/ (Phase G restructure)
 *
 * ⚠️ DOMAIN NAMING ENFORCEMENT (Domain Glossary v1.0 — ABSOLUTE)
 * ─────────────────────────────────────────────────────────────────
 * This route is CLINIC FINANCE ANALYTICS (patient-facing, per-org).
 * DO NOT use billing.read here.
 * ALWAYS use ACCOUNTING_READ (P.ACCOUNTING_READ) for all route guards.
 *
 * billing.read = SaaS Subscription (settingsBilling.routes.js) — DIFFERENT DOMAIN.
 * See: docs/domain-glossary.md for full collision matrix.
 *
 * PLANE ISOLATION:
 *   Org Plane only — patient clinic finance analytics.
 *   Platform billing is at /api/platform/billing/*
 *
 * TENANT ISOLATION:
 *   organizationId ALWAYS from req.organizationId (JWT-injected by orgProtect).
 *   NEVER read from req.query, req.body, or req.params.
 *
 * RLS: Queries delegated to billingSummary.service.js which uses getModel(req.dbConnection, Def).
 */

"use strict";

const express = require("express");
const router = express.Router();

const orgProtect = require("@middleware/orgProtect");
const organizationContext = require("@middleware/organizationMiddleware");
const requireOrgPermission = require("@middleware/requireOrgPermission");
const policyMiddleware = require("@rbac/policyMiddleware");
const { P } = require("@rbac/orgPermissions");

const billingSummaryService = require("../services/billingSummary.service");
const requireEntitlement = require("@middleware/requireEntitlement");

// Phase X.2.2 — subscriptionGuard removed (requireEntitlement in moduleLoader is SSOT).
// ⚠️ PERMISSION INVARIANT: All handlers in this file MUST use P.ACCOUNTING_READ.
// Using P.BILLING_READ here is a Domain Naming Violation (see docs/domain-glossary.md).
router.use(orgProtect, organizationContext, requireEntitlement("finance"));

/**
 * @swagger
 * /finance/summary/daily:
 *   get:
 *     summary: Daily finance summary — revenue, collections, outstanding
 *     tags: [Billing Analytics]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: date
 *         required: true
 *         schema: { type: string, format: date }
 *         description: "Date to query (YYYY-MM-DD)"
 *         example: "2026-03-12"
 *       - in: query
 *         name: branchId
 *         schema: { type: string }
 *         description: Optional branch filter
 *     responses:
 *       200:
 *         description: Daily finance summary
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean }
 *                 data:
 *                   type: object
 *                   properties:
 *                     date: { type: string }
 *                     invoices:
 *                       type: object
 *                       properties:
 *                         totalBilled: { type: number }
 *                         totalPaid: { type: number }
 *                         outstanding: { type: number }
 *                         count: { type: integer }
 *                     collections:
 *                       type: object
 *                       properties:
 *                         totalCollected: { type: number }
 *                         byMethod: { type: object }
 *       400:
 *         description: Missing or invalid date
 */
router.get("/summary/daily", requireOrgPermission(P.ACCOUNTING_READ), policyMiddleware(P.ACCOUNTING_READ), async (req, res) => {
    try {
        const { date, branchId } = req.query;

        if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
            return res.status(400).json({
                success: false,
                error: { code: "INVALID_DATE", message: "date is required in YYYY-MM-DD format" }
            });
        }

        const summary = await billingSummaryService.getDailySummary({
            req,    // ← tenant context (replaces manual organizationId)
            date,
            branchId
        });

        return res.json({ success: true, data: summary });
    } catch (err) {
        return res.status(500).json({ success: false, error: { code: "SUMMARY_ERROR", message: err.message } });
    }
});

/**
 * @swagger
 * /finance/summary/monthly:
 *   get:
 *     summary: Monthly finance summary — revenue, daily breakdown, outstanding
 *     tags: [Billing Analytics]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: year
 *         required: true
 *         schema: { type: integer }
 *         example: 2026
 *       - in: query
 *         name: month
 *         required: true
 *         schema: { type: integer, minimum: 1, maximum: 12 }
 *         example: 3
 *       - in: query
 *         name: branchId
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Monthly finance summary with daily revenue breakdown
 *       400:
 *         description: Missing or invalid year/month
 */
router.get("/summary/monthly", requireOrgPermission(P.ACCOUNTING_READ), policyMiddleware(P.ACCOUNTING_READ), async (req, res) => {
    try {
        const year  = parseInt(req.query.year);
        const month = parseInt(req.query.month);
        const { branchId } = req.query;

        if (!year || !month || month < 1 || month > 12) {
            return res.status(400).json({
                success: false,
                error: { code: "INVALID_PARAMS", message: "year and month (1-12) are required" }
            });
        }

        const summary = await billingSummaryService.getMonthlySummary({
            req,    // ← tenant context
            year,
            month,
            branchId
        });

        return res.json({ success: true, data: summary });
    } catch (err) {
        return res.status(500).json({ success: false, error: { code: "SUMMARY_ERROR", message: err.message } });
    }
});

/**
 * @swagger
 * /finance/outstanding:
 *   get:
 *     summary: Patients with highest outstanding balances
 *     tags: [Billing Analytics]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: branchId
 *         schema: { type: string }
 *       - in: query
 *         name: limit
 *         schema: { type: integer, default: 50 }
 *     responses:
 *       200:
 *         description: Ranked outstanding balance report
 */
router.get("/outstanding", requireOrgPermission(P.ACCOUNTING_READ), policyMiddleware(P.ACCOUNTING_READ), async (req, res) => {
    try {
        const { branchId } = req.query;
        const limit = Math.min(parseInt(req.query.limit) || 50, 200);

        const result = await billingSummaryService.getOutstandingBalances({
            req,    // ← tenant context
            branchId,
            limit
        });

        return res.json({ success: true, data: result });
    } catch (err) {
        return res.status(500).json({ success: false, error: { code: "OUTSTANDING_ERROR", message: err.message } });
    }
});

module.exports = router;
