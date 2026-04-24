/**
 * settingsClinicBilling.routes.js — Org Settings Hub: Clinic Billing Configuration (Phase 2 D3)
 *
 * These endpoints configure the ORG-INTERNAL clinic billing system (patient
 * invoices, tax rates, currencies, invoice templates, discount policies).
 *
 * ⚠️  NOT the SaaS subscription billing endpoints — those live at
 *     /api/v1/org/settings/billing/* and are gated on BILLING_READ/BILLING_WRITE.
 *
 * Endpoints:
 *   GET   /settings/clinic-billing/config      — read the singleton
 *   PATCH /settings/clinic-billing/config      — update (version-guarded)
 *
 * GUARDS (7 layers):
 *   - orgProtect        (Context)
 *   - organizationContext + dbContext
 *   - requireEntitlement("finance")  (License)
 *   - requireOrgPermission(BILLING_SETTINGS_*)  (Authority)
 *   - policyMiddleware  (PBAC)
 *   - (Singleton — no row/field scoping required)
 *   - autoAudit         (Audit)
 *
 * Error surface uses the same mapper as invoices/payments — 409 VERSION_CONFLICT
 * carries `currentVersion` so FE can refetch + retry (E16).
 */

"use strict";

const express = require("express");
const router = express.Router();

const orgProtect = require("@middleware/orgProtect");
const organizationContext = require("@middleware/organizationMiddleware");
const requireEntitlement = require("@middleware/requireEntitlement");
const requireOrgPermission = require("@middleware/requireOrgPermission");
const policyMiddleware = require("@rbac/policyMiddleware");
const { P } = require("@rbac/orgPermissions");
const { autoAudit } = require("@middleware/auditInterceptor");

const billingSettingsService = require("@modules/billingDomain/organizationFinance/services/clinicBillingSettings.service");
const {
    patchBillingSettingsSchema,
    parse,
} = require("@modules/billingDomain/validators/clinicBillingSettings.validator");
const {
    buildBillingSettingsDTO,
    envelope,
} = require("@modules/billingDomain/organizationFinance/dto/clinicBillingSettings.dto");
const logger = require("@utils/logger");

// ─── Error → HTTP mapper (matches invoices/payments pattern) ─────────
function sendError(res, err, fallbackCode) {
    if (err.name === "VersionConflictError" || err.code === "VERSION_CONFLICT") {
        return res.status(409).json({
            success: false,
            error: {
                code: "VERSION_CONFLICT",
                message: err.message || "Settings were modified concurrently",
                currentVersion: err.currentVersion ?? null,
            },
        });
    }
    if (err.code === "VALIDATION_ERROR") {
        return res.status(400).json({
            success: false,
            error: {
                code: "VALIDATION_ERROR",
                message: err.message,
                details: err.details ?? [],
            },
        });
    }
    const status = err.status || err.statusCode || 400;
    return res.status(status).json({
        success: false,
        error: { code: err.code || fallbackCode, message: err.message },
    });
}

// ─── Lightweight currency-only endpoint (auth-only, no specific permission) ──
// Currency is non-sensitive org metadata needed by ALL authenticated org
// users (invoice display, patient cards, financial tabs).  The parent
// router (settingsRoutes → orgV1Routes) already applies:
//   orgProtect → organizationContext → dbContext
// so req.dbConnection is available.  No BILLING_SETTINGS_READ needed.
const authOnly = require("@middleware/authOnly");
router.get("/currency", authOnly(), async (req, res) => {
    try {
        const settings = await billingSettingsService.getOrCreate(req);
        return res.json({
            success: true,
            data: { defaultCurrency: settings.defaultCurrency || "AED" },
        });
    } catch (err) {
        logger.error({ err }, "[clinicBilling] currency read failed");
        return res.status(500).json({
            success: false,
            error: { code: "READ_ERROR", message: "Failed to read org currency" },
        });
    }
});

// Guard chain applied to every endpoint BELOW this line
router.use(
    orgProtect,
    organizationContext,
    requireEntitlement("finance"),
    autoAudit("ClinicBillingSettings")
);

/**
 * @swagger
 * /api/v1/org/settings/clinic-billing/config:
 *   get:
 *     summary: Read clinic billing configuration (singleton per org)
 *     tags: [SettingsHub - Clinic Billing]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200: { description: Current billing settings }
 *       403: { description: Missing BILLING_SETTINGS_READ }
 */
router.get(
    "/config",
    requireOrgPermission(P.BILLING_SETTINGS_READ),
    async (req, res) => {
        try {
            const settings = await billingSettingsService.getOrCreate(req);
            return res.json(envelope(buildBillingSettingsDTO(settings)));
        } catch (err) {
            logger.error({ err }, "[clinicBilling] read failed");
            return sendError(res, err, "READ_ERROR");
        }
    }
);

/**
 * @swagger
 * /api/v1/org/settings/clinic-billing/config:
 *   patch:
 *     summary: Update clinic billing configuration (version-guarded)
 *     tags: [SettingsHub - Clinic Billing]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [expectedVersion]
 *             properties:
 *               expectedVersion: { type: integer }
 *               defaultCurrency: { type: string }
 *               supportedCurrencies: { type: array, items: { type: string } }
 *               taxRates: { type: array }
 *               numberingScheme: { type: object }
 *               invoiceTemplate: { type: object }
 *               paymentMethods: { type: array, items: { type: string } }
 *               discountPolicy: { type: object }
 *     responses:
 *       200: { description: Settings updated }
 *       400: { description: Validation error }
 *       403: { description: Missing BILLING_SETTINGS_WRITE }
 *       409: { description: Version conflict — currentVersion included }
 */
router.patch(
    "/config",
    requireOrgPermission(P.BILLING_SETTINGS_WRITE),
    policyMiddleware(P.BILLING_SETTINGS_WRITE),
    async (req, res) => {
        try {
            const payload = parse(patchBillingSettingsSchema, req.body);
            const updated = await billingSettingsService.patch(req, payload);
            logger.info(
                { orgId: req.organizationId, userId: req.user?._id, version: updated.version },
                "[clinicBilling] settings updated"
            );
            return res.json(envelope(buildBillingSettingsDTO(updated)));
        } catch (err) {
            logger.warn({ err: err.message, code: err.code }, "[clinicBilling] patch failed");
            return sendError(res, err, "PATCH_ERROR");
        }
    }
);

module.exports = router;
