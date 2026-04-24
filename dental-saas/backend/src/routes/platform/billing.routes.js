const getPlatformModel = require("@core/db/getPlatformModel");
/**
* Platform Billing Routes
* Auto-split from platformRoutes.js
*/
const express = require("express");
const router = express.Router();
const platformProtect = require("../../middleware/platformProtect");
const superAdminOnly = require("../../middleware/superAdminOnly");
const authorizePlatformPermission = require("../../middleware/authorizePlatformPermission");
const {
  PLATFORM_CAPABILITIES
} = require('@contracts/platformContract.cjs.js');
const CAP = PLATFORM_CAPABILITIES;
const {
  extendSubscription,
  suspendOrganization,
  reactivateOrganization,
  cancelSubscription,
  adjustCredits,
  getSubscriptionHistory
} = require("../../platform/controllers/platformSubscriptionController");
const {
  getOrganizationInvoices,
  getInvoiceDetails,
  updateInvoiceStatus,
  getEmailLogs
} = require("../../platform/controllers/platformBillingController");
const platformBillingController = require("../../modules/billingDomain/controllers/platformBilling.controller");
const couponController = require("../../platform/domain/controllers/platformCoupon.controller");
const campaignController = require("../../platform/domain/controllers/platformCampaign.controller");
const trialController = require("../../platform/billing/controllers/platformTrial.controller");
const subscriptionOverviewController = require("../../platform/domain/controllers/platformSubscriptionOverview.controller");
const usageController = require("../../platform/domain/controllers/platformUsage.controller");
const planVersionController = require("../../platform/billing/controllers/platformPlanVersion.controller");
const planTemplateController = require("../../platform/billing/controllers/platformPlanTemplate.controller");
const planImpactController = require("../../platform/billing/controllers/platformPlanImpact.controller");
const addonCatalogController = require("../../platform/domain/controllers/platformAddonCatalog.controller");
const subscriptionMutationController = require("../../platform/domain/controllers/platformSubscriptionMutation.controller");
const revenueController = require("../../platform/domain/controllers/platformRevenue.controller");
const billingDashboardController = require("../../platform/billing/controllers/billingDashboard.controller");
const exchangeRateController = require("../../platform/finance/controllers/exchangeRate.controller");
// Sprint 5: Billing Integrity Admin Endpoint
const billingIntegrityController = require("../../platform/billing/controllers/billingIntegrity.controller");
// ── Feature: Plan Version Diff + Billing Event Replay ─────────────────────
const {
  comparePlanVersions
} = require("../../platform/billing/services/planVersionDiff.service");
const {
  replayBillingEvent,
  listReplayableEvents
} = require("../../platform/billing/services/billingReplay.service");
const mongoose = require("mongoose");
const loggerBillingRoutes = require("../../utils/logger");
// asyncHandler: wraps async controllers so any unhandled rejection calls next(err)
// This is the definitive fix for "next is not a function" in async route handlers.
const asyncHandler = require("../../utils/asyncHandler");
const pSub = [platformProtect, authorizePlatformPermission(CAP.MANAGE_SUBSCRIPTIONS)];
// Phase 5 fix: billing read routes must use VIEW_* capability per Sentinel Rule #3
const pBillingRead = [platformProtect, authorizePlatformPermission(CAP.VIEW_ORGANIZATIONS)];
const pBillingUpdate = [platformProtect, authorizePlatformPermission(CAP.MANAGE_SUBSCRIPTIONS)];
const pOrgRead = [platformProtect, authorizePlatformPermission(CAP.VIEW_ORGANIZATIONS)];
const pAnalytics = [platformProtect, authorizePlatformPermission(CAP.VIEW_PLATFORM_ANALYTICS)];
const pAuditRead = [platformProtect, authorizePlatformPermission(CAP.VIEW_AUDIT_LOGS)];
const pSettings = [platformProtect, authorizePlatformPermission(CAP.MANAGE_PLATFORM_SETTINGS)];
const pRefundManage = [platformProtect, authorizePlatformPermission(CAP.MANAGE_SUBSCRIPTIONS)];
const refundController = require("../../platform/billing/controllers/refund.controller");
// Sprint 8: BillingTimeline debugging API
const billingTimelineController = require("../../platform/billing/controllers/billingTimeline.controller");

// ── Timeline: read-only, VIEW_ORGANIZATIONS capability (View-level per Sentinel §3) ──
const pTimelineRead = [platformProtect, authorizePlatformPermission(CAP.VIEW_ORGANIZATIONS)];

// ── Billing Kill Switch Controller ────────────────────────────────────────────
const billingControlController = require("../../platform/billing/controllers/billingControl.controller");

// ─── Billing Kill Switch Admin Routes ─────────────────────────────────────────
// POST → MANAGE_* (Sentinel Rule #3: mutation → MANAGE_*)
// GET status  → AUTH_ONLY (dashboard banner — no capability check per Sentinel exception list)

/**
 * @swagger
 * /api/platform/billing/kill-switch/activate:
 *   post:
 *     summary: Manually activate the billing kill switch
 *     tags: [Platform Billing Kill Switch]
 *     security: [{ platformToken: [] }]
 */
router.post("/billing/kill-switch/activate", platformProtect, superAdminOnly, authorizePlatformPermission(CAP.MANAGE_SUBSCRIPTIONS), billingControlController.activateKillSwitch);

/**
 * @swagger
 * /api/platform/billing/kill-switch/deactivate:
 *   post:
 *     summary: Manually deactivate the billing kill switch
 *     tags: [Platform Billing Kill Switch]
 *     security: [{ platformToken: [] }]
 */
router.post("/billing/kill-switch/deactivate", platformProtect, superAdminOnly, authorizePlatformPermission(CAP.MANAGE_SUBSCRIPTIONS), billingControlController.deactivateKillSwitch);

/**
 * @swagger
 * /api/platform/billing/kill-switch/status:
 *   get:
 *     summary: Get full kill switch status with audit history
 *     tags: [Platform Billing Kill Switch]
 *     security: [{ platformToken: [] }]
 */
router.get("/billing/kill-switch/status", platformProtect, superAdminOnly, authorizePlatformPermission(CAP.VIEW_PLATFORM_ANALYTICS), billingControlController.getKillSwitchStatus);

/**
 * @swagger
 * /api/platform/billing/status:
 *   get:
 *     summary: Public billing operational status (for dashboard banner)
 *     description: AUTH_ONLY — no capability required. Used to display red warning banner.
 *     tags: [Platform Billing Kill Switch]
 *     security: [{ platformToken: [] }]
 */
router.get("/billing/status", platformProtect, billingControlController.getBillingStatus);

// ─── Billing Timeline — Debugging Endpoints ──────────────────────────────────
// Returns the BillingTimeline projection (last 100 events) for a contract or org.
// Source of truth remains BillingLedger + BillingAuditLog.
// These endpoints are for debugging, analytics, and support tooling only.

/**
 * GET /api/platform/contracts/:contractId/timeline
 */
router.get("/contracts/:contractId/timeline", ...pTimelineRead, asyncHandler(billingTimelineController.getContractTimeline));

/**
 * GET /api/platform/billing/timeline/:orgId
 */
router.get("/billing/timeline/:orgId", ...pTimelineRead, asyncHandler(billingTimelineController.getOrgTimeline));

/**
 * @swagger
 * /api/platform/finance/exchange-rate:
 *   post:
 *     summary: Create or update an exchange rate
 *     description: |
 *       Upserts an exchange rate for a currency pair on a specific effective date.
 *       If a rate already exists for the same (fromCurrency, toCurrency, effectiveDate),
 *       it is updated. All rates are append-only from a historical perspective.
 *       Required capability: MANAGE_PLATFORM_SETTINGS.
 *     tags: [Finance]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [fromCurrency, toCurrency, rate, effectiveDate]
 *             properties:
 *               fromCurrency:
 *                 type: string
 *                 description: ISO 4217 source currency
 *                 example: EGP
 *               toCurrency:
 *                 type: string
 *                 description: ISO 4217 target currency (should match baseReportingCurrency)
 *                 example: USD
 *               rate:
 *                 type: number
 *                 description: Conversion rate (1 fromCurrency = rate toCurrency)
 *                 example: 0.032
 *               effectiveDate:
 *                 type: string
 *                 format: date-time
 *                 description: The date from which this rate is applicable
 *                 example: "2026-03-01T00:00:00Z"
 *               source:
 *                 type: string
 *                 description: Rate source identifier
 *                 example: manual
 *     responses:
 *       201:
 *         description: Rate created or updated
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   $ref: '#/components/schemas/ExchangeRate'
 *       400:
 *         description: Missing required fields or invalid rate
 */
router.post("/finance/exchange-rate", ...pSettings, exchangeRateController.createOrUpdateRate);

/**
 * @swagger
 * /api/platform/finance/exchange-rates:
 *   get:
 *     summary: List exchange rates
 *     description: |
 *       Returns exchange rates, optionally filtered by currency pair.
 *       Results sorted by effectiveDate descending (most recent first).
 *       Required capability: MANAGE_PLATFORM_SETTINGS.
 *     tags: [Finance]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: fromCurrency
 *         schema:
 *           type: string
 *           example: EGP
 *         description: Filter by source currency (ISO 4217)
 *       - in: query
 *         name: toCurrency
 *         schema:
 *           type: string
 *           example: USD
 *         description: Filter by target currency (ISO 4217)
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 50
 *           maximum: 100
 *     responses:
 *       200:
 *         description: Exchange rate list
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/ExchangeRate'
 *                 count:
 *                   type: integer
 */
router.get("/finance/exchange-rates", ...pSettings, exchangeRateController.listExchangeRates);

// ─── Dashboard & Audit Log (before all /:id routes) ──────────────────────────────

/**
 * @swagger
 * /api/platform/billing/dashboard:
 *   get:
 *     summary: Renewal dashboard metrics
 *     description: |
 *       Returns a real-time snapshot of billing engine health:
 *       totalActiveContracts, expiringNext30Days, contractsInGrace,
 *       suspendedForNonPayment, failedPaymentsLast7Days,
 *       autoRenewEnabledCount, salesManagedCount, projectedRevenueNext30Days.
 *       Required capability: VIEW_PLATFORM_ANALYTICS.
 *     tags: [Billing]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Dashboard metrics
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   $ref: '#/components/schemas/RenewalDashboardMetrics'
 */
router.get("/billing/dashboard", ...pAnalytics, billingDashboardController.getDashboard);

// NOTE: @swagger annotation for this route is in billingIntegrity.controller.js
//
// GET /api/platform/billing/integrity-check
// Runs all billing invariant checks on demand.
// Sentinel: GET -> VIEW_* - uses VIEW_PLATFORM_ANALYTICS (VIEW_BILLING not in contract).
// Optional query: ?organizationId=&currency=&from=&to=
router.get("/billing/integrity-check", platformProtect, authorizePlatformPermission(CAP.VIEW_PLATFORM_ANALYTICS), asyncHandler(billingIntegrityController.getBillingIntegrityStatus));

/**
 * @swagger
 * /api/platform/billing/audit-logs/{orgId}:
 *   get:
 *     summary: Billing lifecycle audit trail for an organization
 *     description: |
 *       Returns paginated BillingAuditLog entries for the specified organization.
 *       Filter by eventType or contractId via query params.
 *       Required capability: VIEW_AUDIT_LOGS.
 *     tags: [Billing]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: orgId
 *         required: true
 *         schema:
 *           type: string
 *       - in: query
 *         name: eventType
 *         schema:
 *           type: string
 *           enum:
 *             - CONTRACT_CREATED
 *             - CONTRACT_ACTIVATED
 *             - CONTRACT_RENEWED
 *             - CONTRACT_SUPERSEDED
 *             - CONTRACT_TERMINATED
 *             - CONTRACT_CANCELED
 *             - CONTRACT_EXPIRED
 *             - AUTO_RENEW_UPDATED
 *             - PAYMENT_SUCCEEDED
 *             - PAYMENT_FAILED
 *             - PAYMENT_REFUNDED
 *             - DUNNING_STARTED
 *             - RETRY_ATTEMPT
 *             - DUNNING_EXHAUSTED
 *             - DUNNING_RECOVERED
 *             - GRACE_STARTED
 *             - GRACE_EXPIRED
 *             - ORG_SUSPENDED
 *             - ORG_REACTIVATED
 *             - REVENUE_RECOGNIZED
 *             - DEFERRED_REVENUE_UPDATED
 *       - in: query
 *         name: contractId
 *         schema:
 *           type: string
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
 *           maximum: 100
 *     responses:
 *       200:
 *         description: Paginated audit log
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/BillingAuditLog'
 *                 pagination:
 *                   type: object
 */
router.get("/billing/audit-logs/:orgId", ...pAuditRead, billingDashboardController.getOrgAuditLogs);

// ─── Subscription Lifecycle ───────────────────────────────────────────────
/**
 * @swagger
 * /api/platform/organizations/{id}/extend:
 *   patch:
 *     summary: Extend organization subscription
 *     description: "Extends the subscription period. Required capability: MANAGE_SUBSCRIPTIONS. SuperAdmin only."
 *     tags: [Platform Subscriptions]
 *     security:
 *       - platformToken: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Extended subscription
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                 subscription:
 *                   type: object
 */
router.patch("/organizations/:id/extend", platformProtect, superAdminOnly, authorizePlatformPermission(CAP.MANAGE_SUBSCRIPTIONS), extendSubscription);

/**
 * @swagger
 * /api/platform/organizations/{id}/suspend:
 *   patch:
 *     summary: Suspend organization
 *     description: "Suspends an organization's subscription. Required capability: MANAGE_SUBSCRIPTIONS. SuperAdmin only."
 *     tags: [Platform Subscriptions]
 *     security:
 *       - platformToken: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Suspended subscription
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 subscription:
 *                   type: object
 */
router.patch("/organizations/:id/suspend", platformProtect, superAdminOnly, authorizePlatformPermission(CAP.MANAGE_SUBSCRIPTIONS), suspendOrganization);

/**
 * @swagger
 * /api/platform/organizations/{id}/reactivate:
 *   patch:
 *     summary: Reactivate organization
 *     description: "Reactivates a suspended organization. Required capability: MANAGE_SUBSCRIPTIONS. SuperAdmin only."
 *     tags: [Platform Subscriptions]
 *     security:
 *       - platformToken: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Reactivated subscription
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 subscription:
 *                   type: object
 */
router.patch("/organizations/:id/reactivate", platformProtect, superAdminOnly, authorizePlatformPermission(CAP.MANAGE_SUBSCRIPTIONS), reactivateOrganization);

/**
 * @swagger
 * /api/platform/organizations/{id}/cancel:
 *   post:
 *     summary: Cancel organization subscription
 *     description: "Cancels an organization's subscription. Required capability: MANAGE_SUBSCRIPTIONS. SuperAdmin only."
 *     tags: [Platform Subscriptions]
 *     security:
 *       - platformToken: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Cancelled subscription
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 */
router.post("/organizations/:id/cancel", platformProtect, superAdminOnly, authorizePlatformPermission(CAP.MANAGE_SUBSCRIPTIONS), cancelSubscription);

/**
 * @swagger
 * /api/platform/organizations/{id}/adjust-credits:
 *   post:
 *     summary: Adjust organization credits
 *     description: "Adjusts credit balance for an organization. Required capability: MANAGE_SUBSCRIPTIONS. SuperAdmin only."
 *     tags: [Platform Subscriptions]
 *     security:
 *       - platformToken: []
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
 *             properties:
 *               amount:
 *                 type: number
 *               reason:
 *                 type: string
 *     responses:
 *       200:
 *         description: Credits adjusted
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 */
router.post("/organizations/:id/adjust-credits", platformProtect, superAdminOnly, authorizePlatformPermission(CAP.MANAGE_SUBSCRIPTIONS), adjustCredits);

// ─── Subscription Overview (v8.0) ───────────────────────────────────────────
/**
 * @swagger
 * /api/platform/org/{orgId}/subscription:
 *   get:
 *     summary: Get subscription overview
 *     description: "Returns detailed subscription overview for an organization. Required capability: VIEW_ORGANIZATIONS."
 *     tags: [Platform Subscriptions]
 *     security:
 *       - platformToken: []
 *     parameters:
 *       - in: path
 *         name: orgId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Subscription overview
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: object
 */
router.get("/org/:orgId/subscription", ...pOrgRead, subscriptionOverviewController.getSubscriptionOverview);

// ─── Sprint 8: Org Contracts List ────────────────────────────────────────────
/**
 * @swagger
 * /api/platform/org/{orgId}/contracts:
 *   get:
 *     summary: List all contracts for an organization
 *     description: |
 *       Returns all OrgContracts for the given organization, sorted by effectiveFrom descending.
 *       Includes active, pending_activation, superseded, and expired contracts.
 *       Used by the BillingTab to detect scheduled post-trial plans.
 *       Required capability: VIEW_ORGANIZATIONS.
 *     tags: [Platform Subscriptions]
 *     security:
 *       - platformToken: []
 *     parameters:
 *       - in: path
 *         name: orgId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: List of OrgContracts
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 contracts:
 *                   type: array
 *                   items:
 *                     type: object
 */
router.get("/org/:orgId/contracts", ...pOrgRead, asyncHandler(async (req, res) => {
  const OrgContractDef = require("../../platform/billing/models/OrgContract.model");
  const OrgContract = getPlatformModel(OrgContractDef);
  const mongoose = require("mongoose");
  const {
    orgId
  } = req.params;
  if (!mongoose.Types.ObjectId.isValid(orgId)) {
    return res.status(400).json({
      success: false,
      message: "Invalid orgId"
    });
  }
  const contracts = await OrgContract.find({
    organizationId: orgId
  }).sort({
    effectiveFrom: -1
  }).lean();
  return res.json({
    success: true,
    contracts
  });
}));

/**
 * @swagger
 * /api/platform/org/{orgId}/usage:
 *   get:
 *     summary: Get organization usage
 *     description: "Returns resource usage for an organization. Required capability: VIEW_ORGANIZATIONS."
 *     tags: [Platform Subscriptions]
 *     security:
 *       - platformToken: []
 *     parameters:
 *       - in: path
 *         name: orgId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Usage data
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: object
 */
router.get("/org/:orgId/usage", ...pOrgRead, usageController.getOrganizationUsage);

// ─── Platform Catalog APIs [REMOVED — legacy Plan model eliminated] ──────────
// planCatalog.projection.js referenced Plan.model (legacy). Removed with migration.
// Public pricing data is now served from GET /api/platform/plan-versions?status=active&visibility=public

/**
 * @swagger
 * /api/platform/addons:
 *   get:
 *     summary: Get add-on catalog
 *     description: Returns all available add-ons. SuperAdmin only.
 *     tags: [Platform Plans]
 *     security:
 *       - platformToken: []
 *     responses:
 *       200:
 *         description: Add-on catalog
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: array
 *                   items:
 *                     type: object
 */
// Wave3 — Guarded: VIEW_PLATFORM_ANALYTICS
router.get("/addons", platformProtect, authorizePlatformPermission(CAP.VIEW_PLATFORM_ANALYTICS), superAdminOnly, addonCatalogController.getAddOnCatalog);

// ─── Subscription Mutation APIs (v11.0) ─────────────────────────────────────
/**
 * @swagger
 * /api/platform/org/{orgId}/change-plan:
 *   post:
 *     summary: Change organization plan
 *     description: Changes the plan assigned to an organization. SuperAdmin only.
 *     tags: [Platform Subscriptions]
 *     security:
 *       - platformToken: []
 *     parameters:
 *       - in: path
 *         name: orgId
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [planId]
 *             properties:
 *               planId:
 *                 type: string
 *     responses:
 *       200:
 *         description: Plan changed
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: object
 *                 organizationId:
 *                   type: string
 *                 planId:
 *                   type: string
 *                 version:
 *                   type: integer
 */
// Wave3 — DEPRECATED: POST /org/:orgId/change-plan
// This endpoint used the legacy Plan model (planId field — removed in Sprint 4).
// REPLACED BY: POST /api/platform/contracts/upgrade  (atomic, uses planVersionId)
// Returns 410 GONE to prevent accidental use.
router.post("/org/:orgId/change-plan", platformProtect, authorizePlatformPermission(CAP.MANAGE_SUBSCRIPTIONS), superAdminOnly, (req, res) => res.status(410).json({
  success: false,
  error: {
    code: "ENDPOINT_DEPRECATED",
    message: "POST /org/:orgId/change-plan is deprecated. Use POST /api/platform/contracts/upgrade instead.",
    replacement: "/api/platform/contracts/upgrade"
  }
}));

/**
 * @swagger
 * /api/platform/org/{orgId}/add-addon:
 *   post:
 *     summary: Add add-on to organization
 *     description: Adds an add-on to an organization subscription. SuperAdmin only.
 *     tags: [Platform Subscriptions]
 *     security:
 *       - platformToken: []
 *     parameters:
 *       - in: path
 *         name: orgId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Add-on added
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: object
 */
// Wave3 — Guarded: MANAGE_SUBSCRIPTIONS
router.post("/org/:orgId/add-addon", platformProtect, authorizePlatformPermission(CAP.MANAGE_SUBSCRIPTIONS), superAdminOnly, subscriptionMutationController.addAddon);

/**
 * @swagger
 * /api/platform/org/{orgId}/remove-addon:
 *   delete:
 *     summary: Remove add-on from organization
 *     description: Removes an add-on from an organization subscription. SuperAdmin only.
 *     tags: [Platform Subscriptions]
 *     security:
 *       - platformToken: []
 *     parameters:
 *       - in: path
 *         name: orgId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Add-on removed
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 message:
 *                   type: string
 */
// Wave3 — Guarded: MANAGE_SUBSCRIPTIONS
router.delete("/org/:orgId/remove-addon", platformProtect, authorizePlatformPermission(CAP.MANAGE_SUBSCRIPTIONS), superAdminOnly, subscriptionMutationController.removeAddon);

/**
 * @swagger
 * /api/platform/invoices/{invoiceId}:
 *   get:
 *     summary: Get invoice details
 *     description: "Returns details of a specific invoice. Required capability: MANAGE_SUBSCRIPTIONS."
 *     tags: [Platform Billing]
 *     security:
 *       - platformToken: []
 *     parameters:
 *       - in: path
 *         name: invoiceId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Invoice details
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 */
// DEPRECATED v21.0 — Canonical route: GET /billing/invoices/:invoiceId (platformFinance.routes.js)
router.get("/invoices/:invoiceId", ...pBillingRead, (req, res) => {
  res.set("X-Deprecated-Endpoint", "/billing/invoices/:invoiceId");
  return res.redirect(301, req.originalUrl.replace("/invoices/", "/billing/invoices/"));
});

/**
 * @swagger
 * /api/platform/invoices/{invoiceId}/status:
 *   patch:
 *     summary: Update invoice status
 *     description: "Updates the status of an invoice. Required capability: MANAGE_SUBSCRIPTIONS."
 *     tags: [Platform Billing]
 *     security:
 *       - platformToken: []
 *     parameters:
 *       - in: path
 *         name: invoiceId
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               status:
 *                 type: string
 *     responses:
 *       200:
 *         description: Updated invoice
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 invoice:
 *                   type: object
 */
router.patch("/invoices/:invoiceId/status", ...pBillingUpdate, updateInvoiceStatus);

// ─── Plan Version API (Contract-First Product Engine) ─────────────────────────
// Migration complete: legacy /plans routes removed.
// New authoritative API: /plan-versions + /plan-templates

/**
 * @swagger
 * /api/platform/plan-versions:
 *   get:
 *     summary: List plan versions
 *     description: Returns plan versions. Supports ?status=active|draft|deprecated, ?visibility=public|sales|internal, ?templateCode=xxx
 *     tags: [Platform Plan Versions]
 *     security:
 *       - platformToken: []
 *     parameters:
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [active, draft, deprecated]
 *       - in: query
 *         name: visibility
 *         schema:
 *           type: string
 *           enum: [public, sales, internal]
 *         description: Filter by visibility gate (replaces deprecated isSalesOnly)
 *       - in: query
 *         name: templateCode
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: List of plan versions
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 planVersions:
 *                   type: array
 *                 total:
 *                   type: integer
 */
// Sentinel: GET → VIEW_*
router.get("/plan-versions", platformProtect, authorizePlatformPermission(CAP.VIEW_PLATFORM_ANALYTICS), planVersionController.listPlanVersions);

// ─── Plan Version Impact Preview (must be before /:id to avoid route collision) ──

/**
 * @swagger
 * /api/platform/plan-versions/{versionId}/impact:
 *   get:
 *     summary: Preview revenue impact of a plan version
 *     description: |
 *       Returns a safety preview showing how many organizations are on this PlanVersion
 *       and the estimated monthly revenue before publishing a new version.
 *       Read-only analytics endpoint. Required capability: VIEW_PLATFORM_ANALYTICS.
 *     tags: [Platform Plan Versions]
 *     security:
 *       - platformToken: []
 *     parameters:
 *       - in: path
 *         name: versionId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Revenue impact summary
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: object
 *                   properties:
 *                     organizationsAffected:
 *                       type: integer
 *                       example: 84
 *                     estimatedMonthlyRevenue:
 *                       type: number
 *                       example: 4116
 *                     currency:
 *                       type: string
 *                       example: USD
 *                     versionStatus:
 *                       type: string
 *                       example: active
 *       404:
 *         description: PlanVersion not found
 */
// Sentinel: GET → VIEW_* | Registered BEFORE /:id to prevent route collision
router.get("/plan-versions/:versionId/impact", platformProtect, authorizePlatformPermission(CAP.VIEW_PLATFORM_ANALYTICS), planImpactController.previewPlanVersionImpact);

// ─── Plan Version Revenue Impact (Stripe-style pre-publish safety preview) ────
// Must be registered BEFORE /:id — Express would otherwise match "revenue-impact"
// as the :id segment. Swagger annotation is in platformPlanVersion.controller.js.
// Sentinel: GET → VIEW_* (VIEW_PLATFORM_ANALYTICS — the capability used by all plan-version GETs)
// Note: VIEW_BILLING was requested but does NOT exist in PLATFORM_CAPABILITIES contract.
//       Using VIEW_PLATFORM_ANALYTICS per Sentinel Rule #1 (no raw capability strings).
router.get("/plan-versions/:id/revenue-impact", platformProtect, authorizePlatformPermission(CAP.VIEW_PLATFORM_ANALYTICS), planVersionController.getPlanRevenueImpactController);

// ─── Feature 1: Plan Version Diff ────────────────────────────────────────────
// GET /api/platform/plan-versions/diff?versionAId=...&versionBId=...
// Must be registered BEFORE /:id — 'diff' is a literal, not a param.
// Sentinel: GET → VIEW_* (VIEW_PLATFORM_ANALYTICS)
/**
 * @swagger
 * /api/platform/plan-versions/diff:
 *   get:
 *     summary: Compare two PlanVersions (diff viewer)
 *     description: |
 *       Returns a structured diff between two PlanVersions covering pricing,
 *       limits, modules, trialDays, and inflationPolicy.
 *       Read-only — no data is modified.
 *       Required capability: VIEW_PLATFORM_ANALYTICS.
 *     tags: [Platform Plan Versions]
 *     security:
 *       - platformToken: []
 *     parameters:
 *       - in: query
 *         name: versionAId
 *         required: true
 *         schema:
 *           type: string
 *       - in: query
 *         name: versionBId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Structured diff result
 *       400:
 *         description: Missing or invalid version IDs
 *       404:
 *         description: One or both PlanVersions not found
 */
router.get("/plan-versions/diff", platformProtect, authorizePlatformPermission(CAP.VIEW_PLATFORM_ANALYTICS), async (req, res) => {
  try {
    const {
      versionAId,
      versionBId
    } = req.query;
    if (!versionAId || !versionBId) {
      return res.status(400).json({
        success: false,
        message: "Both versionAId and versionBId query parameters are required."
      });
    }
    if (!mongoose.Types.ObjectId.isValid(versionAId) || !mongoose.Types.ObjectId.isValid(versionBId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid ObjectId in versionAId or versionBId."
      });
    }
    if (versionAId === versionBId) {
      return res.status(400).json({
        success: false,
        message: "versionAId and versionBId must be different versions."
      });
    }
    const diff = await comparePlanVersions(versionAId, versionBId);
    return res.json({
      success: true,
      data: diff
    });
  } catch (err) {
    loggerBillingRoutes.error({
      err
    }, "[BillingRoutes] plan-versions diff failed");
    if (err.message.includes("not found")) return res.status(404).json({
      success: false,
      message: err.message
    });
    return res.status(500).json({
      success: false,
      message: err.message
    });
  }
});

// ─── Feature 3: Billing Event Ledger + Replay ─────────────────────────────────
// GET  /api/platform/billing/events    — list replayable ledger entries
// POST /api/platform/billing/events/:id/replay  — replay a ledger entry
// Registered in /billing/* namespace (consistent with /billing/dashboard, /billing/audit-logs)
// Sentinel: GET → VIEW_*, POST mutation → MANAGE_*

/**
 * @swagger
 * /api/platform/billing/events:
 *   get:
 *     summary: List replayable billing ledger events
 *     description: |
 *       Returns a paginated list of BillingLedger entries eligible for replay
 *       (payment.succeeded, payment.failed, invoice.refunded, subscription.*).
 *       Read-only.
 *       Required capability: VIEW_PLATFORM_ANALYTICS.
 *     tags: [Billing]
 *     security:
 *       - bearerAuth: []
 *     parameters:
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
 *           maximum: 200
 *       - in: query
 *         name: provider
 *         schema:
 *           type: string
 *           enum: [stripe, paymob, paypal, internal]
 *       - in: query
 *         name: eventType
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Paginated list of replayable events
 */
router.get("/billing/events", platformProtect, authorizePlatformPermission(CAP.VIEW_PLATFORM_ANALYTICS), async (req, res) => {
  try {
    const {
      page = 1,
      limit = 50,
      provider,
      eventType
    } = req.query;
    const result = await listReplayableEvents({
      page: Number(page),
      limit: Number(limit),
      provider: provider || undefined,
      eventType: eventType || undefined
    });
    return res.json({
      success: true,
      data: result
    });
  } catch (err) {
    loggerBillingRoutes.error({
      err
    }, "[BillingRoutes] billing/events list failed");
    return res.status(500).json({
      success: false,
      message: err.message
    });
  }
});

/**
 * @swagger
 * /api/platform/billing/events/{id}/replay:
 *   post:
 *     summary: Replay a billing ledger event
 *     description: |
 *       Re-runs the state logic for a BillingLedger entry through canonicalEventProcessor.
 *       Does NOT re-charge the payment provider.
 *       Idempotent — duplicate providerEventId is detected and skipped.
 *       Required capability: MANAGE_SUBSCRIPTIONS.
 *     tags: [Billing]
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
 *         description: Replay result
 *       400:
 *         description: Non-replayable event type
 *       404:
 *         description: Ledger entry not found
 */
router.post("/billing/events/:id/replay", platformProtect, authorizePlatformPermission(CAP.MANAGE_SUBSCRIPTIONS), superAdminOnly, async (req, res) => {
  try {
    const {
      id
    } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid ledger entry ID."
      });
    }
    const result = await replayBillingEvent(id, {
      replayedBy: req.platformUser?._id
    });
    return res.json({
      success: true,
      data: result
    });
  } catch (err) {
    loggerBillingRoutes.error({
      err,
      ledgerEntryId: req.params.id
    }, "[BillingRoutes] billing event replay failed");
    if (err.message.includes("not found")) return res.status(404).json({
      success: false,
      message: err.message
    });
    if (err.message.includes("not replayable")) return res.status(400).json({
      success: false,
      message: err.message
    });
    return res.status(500).json({
      success: false,
      message: err.message
    });
  }
});

/**
 * @swagger
 * /api/platform/plan-versions/{id}:
 *   get:
 *     summary: Get plan version by ID
 *     tags: [Platform Plan Versions]
 *     security:
 *       - platformToken: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: PlanVersion document
 */
// Sentinel: GET → VIEW_*
router.get("/plan-versions/:id", platformProtect, authorizePlatformPermission(CAP.VIEW_PLATFORM_ANALYTICS), planVersionController.getPlanVersionById);

/**
 * @swagger
 * /api/platform/plan-versions:
 *   post:
 *     summary: Create a draft plan version
 *     description: Creates a new draft PlanVersion from a PlanTemplate. Requires templateId, versionTag, label.
 *     tags: [Platform Plan Versions]
 *     security:
 *       - platformToken: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [templateId, versionTag, label]
 *             properties:
 *               templateId:
 *                 type: string
 *               versionTag:
 *                 type: string
 *               label:
 *                 type: string
 *               trialDays:
 *                 type: number
 *               visibility:
 *                 type: string
 *                 enum: [public, sales, internal]
 *                 description: "Visibility gate: public=marketing site, sales=sales-only, internal=platform-only"
 *     responses:
 *       201:
 *         description: Draft PlanVersion created
 */
// Sentinel: POST → MANAGE_*
router.post("/plan-versions", platformProtect, authorizePlatformPermission(CAP.MANAGE_SUBSCRIPTIONS), superAdminOnly, planVersionController.createPlanVersion);

/**
 * @swagger
 * /api/platform/plan-versions/{id}:
 *   patch:
 *     summary: Update a draft plan version
 *     description: Updates a draft PlanVersion. Active versions are immutable — create a new version instead.
 *     tags: [Platform Plan Versions]
 *     security:
 *       - platformToken: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Updated draft
 *       400:
 *         description: Cannot modify non-draft version
 */
// Sentinel: PATCH → MANAGE_*
router.patch("/plan-versions/:id", platformProtect, authorizePlatformPermission(CAP.MANAGE_SUBSCRIPTIONS), superAdminOnly, planVersionController.updatePlanVersion);

/**
 * @swagger
 * /api/platform/plan-versions/{id}/publish:
 *   post:
 *     summary: Publish a draft version (set active, deprecate prev)
 *     description: Transitions a draft PlanVersion to active. Auto-deprecates any previously active version for the same template. Enforces 1 active version per template.
 *     tags: [Platform Plan Versions]
 *     security:
 *       - platformToken: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Version published
 *       400:
 *         description: Not a draft version
 */
// Sentinel: POST → MANAGE_*
router.post("/plan-versions/:id/publish", platformProtect, authorizePlatformPermission(CAP.MANAGE_SUBSCRIPTIONS), superAdminOnly, planVersionController.publishPlanVersion);

/**
 * @swagger
 * /api/platform/plan-versions/{id}/deprecate:
 *   patch:
 *     summary: Manually deprecate an active plan version
 *     description: Marks a PlanVersion as deprecated. No new contracts can reference this version.
 *     tags: [Platform Plan Versions]
 *     security:
 *       - platformToken: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Version deprecated
 */
// Sentinel: PATCH → MANAGE_*
router.patch("/plan-versions/:id/deprecate", platformProtect, authorizePlatformPermission(CAP.MANAGE_SUBSCRIPTIONS), superAdminOnly, planVersionController.deprecatePlanVersion);

/**
 * @swagger
 * /api/platform/plan-versions/{id}/duplicate:
 *   post:
 *     summary: Duplicate a PlanVersion as a new draft
 *     description: |
 *       Creates a new draft PlanVersion copying limits, modules, pricing, trialDays,
 *       and visibility from the source version. Caller must supply a unique versionTag
 *       and label. The new version always starts as "draft".
 *       Required capability: MANAGE_SUBSCRIPTIONS.
 *     tags: [Platform Plan Versions]
 *     security:
 *       - platformToken: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Source PlanVersion _id to duplicate from
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [versionTag, label]
 *             properties:
 *               versionTag:
 *                 type: string
 *                 example: "v2.1-copy"
 *               label:
 *                 type: string
 *                 example: "Professional Q2 2026 (copy)"
 *               changeNotes:
 *                 type: string
 *     responses:
 *       201:
 *         description: Duplicate draft created
 *       400:
 *         description: Missing versionTag or label
 *       404:
 *         description: Source version not found
 *       409:
 *         description: Version tag conflict
 */
// Sentinel: POST → MANAGE_*
router.post("/plan-versions/:id/duplicate", platformProtect, authorizePlatformPermission(CAP.MANAGE_SUBSCRIPTIONS), superAdminOnly, asyncHandler(planVersionController.duplicatePlanVersion));

/**
 * @swagger
 * /api/platform/plan-templates:
 *   get:
 *     summary: List all plan templates
 *     description: Returns all PlanTemplates. Supports ?status=draft|published|archived.
 *     tags: [Platform Plan Templates]
 *     security:
 *       - platformToken: []
 *     parameters:
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [draft, published, archived]
 *     responses:
 *       200:
 *         description: List of templates with active version snapshot
 */
// Sentinel: GET → VIEW_*
router.get("/plan-templates", platformProtect, authorizePlatformPermission(CAP.VIEW_PLATFORM_ANALYTICS), asyncHandler(planTemplateController.listPlanTemplates));

/**
 * @swagger
 * /api/platform/plan-templates/{id}:
 *   get:
 *     summary: Get plan template by ID (with all versions)
 *     tags: [Platform Plan Templates]
 *     security:
 *       - platformToken: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: PlanTemplate with versions array
 */
// Sentinel: GET → VIEW_*
router.get("/plan-templates/:id", platformProtect, authorizePlatformPermission(CAP.VIEW_PLATFORM_ANALYTICS), asyncHandler(planTemplateController.getPlanTemplateById));

/**
 * @swagger
 * /api/platform/plan-templates:
 *   post:
 *     summary: Create a plan template
 *     description: Creates a new PlanTemplate in draft status. Requires name and code.
 *     tags: [Platform Plan Templates]
 *     security:
 *       - platformToken: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [name, code]
 *             properties:
 *               name:
 *                 type: string
 *               code:
 *                 type: string
 *               description:
 *                 type: string
 *     responses:
 *       201:
 *         description: PlanTemplate created
 */
// Sentinel: POST → MANAGE_*
router.post("/plan-templates", platformProtect, authorizePlatformPermission(CAP.MANAGE_SUBSCRIPTIONS), superAdminOnly, asyncHandler(planTemplateController.createPlanTemplate));

/**
 * @swagger
 * /api/platform/plan-templates/{id}:
 *   patch:
 *     summary: Update a plan template (OAV)
 *     description: Updates a non-archived PlanTemplate. Code is immutable. Requires expectedVersion.
 *     tags: [Platform Plan Templates]
 *     security:
 *       - platformToken: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Updated template
 *       409:
 *         description: Version conflict
 */
// Sentinel: PATCH → MANAGE_*
router.patch("/plan-templates/:id", platformProtect, authorizePlatformPermission(CAP.MANAGE_SUBSCRIPTIONS), superAdminOnly, asyncHandler(planTemplateController.updatePlanTemplate));

// ─── Phase v5.6 — Billing Governance ──────────────────────────────────────
/**
 * @swagger
 * /api/platform/orgs/{orgId}/billing:
 *   get:
 *     summary: Get organization billing overview
 *     description: Returns billing overview including current cycle, usage, and overage charges. SuperAdmin only.
 *     tags: [Platform Billing]
 *     security:
 *       - platformToken: []
 *     parameters:
 *       - in: path
 *         name: orgId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Billing overview
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 organizationId:
 *                   type: string
 *                 currentCycle:
 *                   type: object
 *                 start:
 *                   type: string
 *                 usage:
 *                   type: object
 *                 whatsappUsed:
 *                   type: integer
 *                 emailUsed:
 *                   type: integer
 *                 activeDraft:
 *                   type: object
 *                 overageChargesAccumulated:
 *                   type: number
 */
// Wave3 — Guarded: VIEW_PLATFORM_ANALYTICS
router.get("/orgs/:orgId/billing", platformProtect, authorizePlatformPermission(CAP.VIEW_PLATFORM_ANALYTICS), superAdminOnly, platformBillingController.getOrgBillingOverview);

/**
 * @swagger
 * /api/platform/orgs/{orgId}/invoices/generate:
 *   post:
 *     summary: Manually generate invoice
 *     description: Triggers manual invoice generation for an organization. SuperAdmin only.
 *     tags: [Platform Billing]
 *     security:
 *       - platformToken: []
 *     parameters:
 *       - in: path
 *         name: orgId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Generated invoice
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 invoice:
 *                   type: object
 */
// Wave3 — Guarded: MANAGE_SUBSCRIPTIONS
router.post("/orgs/:orgId/invoices/generate", platformProtect, authorizePlatformPermission(CAP.MANAGE_SUBSCRIPTIONS), superAdminOnly, platformBillingController.manualGenerateInvoice);

// ─── Phase v6.1 & v6.2 — Coupon & Campaign Governance ──────────────────────
/**
 * @swagger
 * /api/platform/coupons:
 *   post:
 *     summary: Create coupon
 *     description: Creates a new coupon. SuperAdmin only.
 *     tags: [Platform Monetization]
 *     security:
 *       - platformToken: []
 *     responses:
 *       201:
 *         description: Created coupon
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 data:
 *                   type: object
 */
// Wave3 — Guarded: MANAGE_SUBSCRIPTIONS
router.post("/coupons", platformProtect, authorizePlatformPermission(CAP.MANAGE_SUBSCRIPTIONS), superAdminOnly, couponController.createCoupon);

/**
 * @swagger
 * /api/platform/coupons/{id}:
 *   put:
 *     summary: Update coupon
 *     description: Updates an existing coupon. SuperAdmin only.
 *     tags: [Platform Monetization]
 *     security:
 *       - platformToken: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Updated coupon
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 data:
 *                   type: object
 */
router.put("/coupons/:id", platformProtect, superAdminOnly, couponController.updateCoupon);

/**
 * @swagger
 * /api/platform/campaigns:
 *   post:
 *     summary: Create campaign
 *     description: Creates a new marketing campaign. SuperAdmin only.
 *     tags: [Platform Monetization]
 *     security:
 *       - platformToken: []
 *     responses:
 *       201:
 *         description: Created campaign
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 data:
 *                   type: object
 */
router.post("/campaigns", platformProtect, superAdminOnly, campaignController.createCampaign);

/**
 * @swagger
 * /api/platform/campaigns/{id}:
 *   put:
 *     summary: Update campaign
 *     description: Updates an existing marketing campaign. SuperAdmin only.
 *     tags: [Platform Monetization]
 *     security:
 *       - platformToken: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Updated campaign
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 data:
 *                   type: object
 */
router.put("/campaigns/:id", platformProtect, superAdminOnly, campaignController.updateCampaign);

// ─── Phase v6.3 & v6.4 — Trial Management ──────────────────────────────────
/**
 * @swagger
 * /api/platform/trials:
 *   get:
 *     summary: List trials
 *     description: Returns all trial subscriptions. SuperAdmin only.
 *     tags: [Platform Monetization]
 *     security:
 *       - platformToken: []
 *     responses:
 *       200:
 *         description: Trial list
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                 count:
 *                   type: integer
 *                 data:
 *                   type: array
 *                   items:
 *                     type: object
 */
router.get("/trials", platformProtect, superAdminOnly, trialController.getTrials);

/**
 * @swagger
 * /api/platform/organizations/{id}/auto-renew:
 *   patch:
 *     summary: Toggle auto-renew
 *     description: "Toggles auto-renew setting for an organization. Required capability: MANAGE_SUBSCRIPTIONS."
 *     tags: [Platform Revenue]
 *     security:
 *       - platformToken: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Auto-renew toggled
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 autoRenew:
 *                   type: boolean
 */
router.patch("/organizations/:id/auto-renew", platformProtect, authorizePlatformPermission(CAP.MANAGE_SUBSCRIPTIONS), revenueController.toggleAutoRenew);

/**
 * @swagger
 * /api/platform/organizations/{id}/manual-payment:
 *   post:
 *     summary: Record manual payment
 *     description: "Records a manual payment for an organization. Required capability: MANAGE_SUBSCRIPTIONS."
 *     tags: [Platform Revenue]
 *     security:
 *       - platformToken: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Payment recorded
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 invoice:
 *                   type: object
 */
router.post("/organizations/:id/manual-payment", platformProtect, authorizePlatformPermission(CAP.MANAGE_SUBSCRIPTIONS), revenueController.recordManualPayment);

/**
 * @swagger
 * /api/platform/organizations/{id}/generate-payment-link:
 *   post:
 *     summary: Generate payment link
 *     description: "Generates a payment link for an organization. Required capability: MANAGE_SUBSCRIPTIONS."
 *     tags: [Platform Revenue]
 *     security:
 *       - platformToken: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Payment link generated
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 paymentLink:
 *                   type: string
 */
router.post("/organizations/:id/generate-payment-link", platformProtect, authorizePlatformPermission(CAP.MANAGE_SUBSCRIPTIONS), revenueController.generatePaymentLink);

// ===========================================================================
// REFUND ENGINE — Sprint 7.2 Enterprise Refund Compliance
// All routes: platformProtect + MANAGE_SUBSCRIPTIONS
// Approve/Reject: additionally requires superAdminOnly
// ===========================================================================

/**
 * @swagger
 * /api/platform/contracts/{id}/refund-request:
 *   post:
 *     summary: Request a refund for a contract invoice
 *     description: |
 *       Creates a RefundExecutionRecord in refund_requested state.
 *       Policy validation runs automatically:
 *         - Invoice must be paid
 *         - Must be within refundWindowDays
 *         - Recognition check (configurable)
 *         - Fraud velocity guard (configurable per BillingSettings)
 *       Returns requiresApproval=true if manual approval is required.
 *       Required capability: MANAGE_SUBSCRIPTIONS.
 *     tags: [Platform Refunds]
 *     security:
 *       - platformToken: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: OrgContract ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [invoiceId, amount, reasonCode]
 *             properties:
 *               invoiceId:
 *                 type: string
 *               amount:
 *                 type: number
 *                 description: Decimal amount to refund (e.g. 250.00)
 *               reasonCode:
 *                 type: string
 *                 enum: [customer_request, service_failure, duplicate_charge, fraud, other]
 *               idempotencyKey:
 *                 type: string
 *                 description: Optional client-supplied idempotency key
 *     responses:
 *       201:
 *         description: Refund request created
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 requiresApproval:
 *                   type: boolean
 *                 fraudFlag:
 *                   type: boolean
 *                 data:
 *                   $ref: '#/components/schemas/RefundExecutionRecord'
 *       422:
 *         description: Policy denied (window expired, not paid, etc.)
 */
router.post("/contracts/:id/refund-request", ...pRefundManage, refundController.requestRefund);

/**
 * @swagger
 * /api/platform/refunds/{id}/approve:
 *   patch:
 *     summary: Approve a pending refund request
 *     description: |
 *       Transitions refund to refund_approved state. SuperAdmin only.
 *       Required capability: MANAGE_SUBSCRIPTIONS.
 *     tags: [Platform Refunds]
 *     security:
 *       - platformToken: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: RefundExecutionRecord ID
 *     responses:
 *       200:
 *         description: Refund approved
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/RefundExecutionRecord'
 *       409:
 *         description: Invalid state transition
 */
router.patch("/refunds/:id/approve", ...pRefundManage, superAdminOnly, refundController.approveRefund);

/**
 * @swagger
 * /api/platform/refunds/{id}/reject:
 *   patch:
 *     summary: Reject a pending refund request
 *     description: |
 *       Transitions refund to refund_rejected (terminal state). SuperAdmin only.
 *       Required capability: MANAGE_SUBSCRIPTIONS.
 *     tags: [Platform Refunds]
 *     security:
 *       - platformToken: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: RefundExecutionRecord ID
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               reason:
 *                 type: string
 *     responses:
 *       200:
 *         description: Refund rejected
 *       409:
 *         description: Invalid state transition (already terminal)
 */
router.patch("/refunds/:id/reject", ...pRefundManage, superAdminOnly, refundController.rejectRefund);

/**
 * @swagger
 * /api/platform/refunds/{id}/process:
 *   post:
 *     summary: Execute approved refund via payment provider
 *     description: |
 *       Processes the approved refund:
 *         - Calls payment provider refund API
 *         - Updates PlatformInvoice.refundedAmountMinor
 *         - Reverses RevenueSchedule proportionally using locked FX rate
 *         - Enforces revenue integrity invariant
 *         - Idempotent: safe to call multiple times
 *       Required capability: MANAGE_SUBSCRIPTIONS.
 *     tags: [Platform Refunds]
 *     security:
 *       - platformToken: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: RefundExecutionRecord ID
 *     responses:
 *       200:
 *         description: Refund processed
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 providerRefundId:
 *                   type: string
 *                 idempotent:
 *                   type: boolean
 *                 data:
 *                   $ref: '#/components/schemas/RefundExecutionRecord'
 *       502:
 *         description: Provider rejected the refund
 */
router.post("/refunds/:id/process", ...pRefundManage, superAdminOnly, refundController.processRefund);

/**
 * @swagger
 * /api/platform/refunds:
 *   get:
 *     summary: List all refund records (platform-wide)
 *     description: >
 *       Returns paginated refund records with org name enrichment.
 *       By default returns only non-terminal (pending) refunds.
 *       Pass ?all=1 to include completed/rejected/failed.
 *       Required capability: MANAGE_SUBSCRIPTIONS.
 *     tags: [Platform Refunds]
 *     security:
 *       - platformToken: []
 *     parameters:
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *       - in: query
 *         name: organizationId
 *         schema:
 *           type: string
 *       - in: query
 *         name: all
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
 *         description: Paginated refund list with pendingCount
 */
router.get("/refunds", ...pRefundManage, refundController.listAllRefunds);

/**
 * @swagger
 * /api/platform/refunds/{id}:
 *   get:
 *     summary: Get a refund record by ID
 *     description: "Required capability: MANAGE_SUBSCRIPTIONS."
 *     tags: [Platform Refunds]
 *     security:
 *       - platformToken: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Refund record
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/RefundExecutionRecord'
 */
router.get("/refunds/:id", ...pRefundManage, refundController.getRefund);

/**
 * @swagger
 * /api/platform/invoices/{id}/refunds:
 *   get:
 *     summary: List all refund records for an invoice
 *     description: "Required capability: MANAGE_SUBSCRIPTIONS."
 *     tags: [Platform Refunds]
 *     security:
 *       - platformToken: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: List of refund records
 */
router.get("/invoices/:id/refunds", ...pRefundManage, refundController.listRefundsByInvoice);

// ─── Organization Entitlements (Sprint 2 — Entitlement Engine) ───────────────
const orgEntitlementController = require("../../platform/billing/controllers/orgEntitlement.controller");

/**
 * @swagger
 * /api/platform/org-entitlements/{orgId}:
 *   get:
 *     summary: Get resolved entitlements for an organization
 *     description: |
 *       Returns the merged entitlement object for the given organization:
 *       plan defaults + any platform admin overrides.
 *       Required capability: VIEW_ORGANIZATIONS.
 *     tags: [Platform Entitlements]
 *     security:
 *       - platformToken: []
 *     parameters:
 *       - in: path
 *         name: orgId
 *         required: true
 *         schema:
 *           type: string
 *         description: Organization MongoDB ObjectId
 *     responses:
 *       200:
 *         description: Resolved entitlement object
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: object
 *                   properties:
 *                     modules:
 *                       type: object
 *                     limits:
 *                       type: object
 *                     addons:
 *                       type: array
 *                       items:
 *                         type: string
 *                     capabilities:
 *                       type: object
 *       404:
 *         description: Organization not found
 */
router.get("/org-entitlements/:orgId", ...pOrgRead, orgEntitlementController.getOrgEntitlement);

/**
 * @swagger
 * /api/platform/org-entitlements/{orgId}/override:
 *   post:
 *     summary: Apply admin entitlement override for an organization
 *     description: |
 *       Merges the submitted modules/limits/addons into the current
 *       OrganizationEntitlement record without touching OrgContract or PlanVersion.
 *       Logs a ENTITLEMENT_OVERRIDE_APPLIED BillingAuditLog event.
 *       Invalidates the resolver cache immediately.
 *       Required capability: MANAGE_SUBSCRIPTIONS.
 *     tags: [Platform Entitlements]
 *     security:
 *       - platformToken: []
 *     parameters:
 *       - in: path
 *         name: orgId
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               modules:
 *                 type: object
 *                 description: Partial module overrides (only changed fields)
 *                 example:
 *                   analytics: true
 *                   inventory: true
 *               limits:
 *                 type: object
 *                 description: Partial limit overrides
 *                 example:
 *                   maxUsers: 20
 *               addons:
 *                 type: array
 *                 items:
 *                   type: string
 *                 description: Full replacement addons list
 *     responses:
 *       200:
 *         description: Updated entitlement record
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: object
 *       400:
 *         description: Validation error
 *       404:
 *         description: No active entitlement found for this organization
 */
router.post("/org-entitlements/:orgId/override", ...pBillingUpdate, orgEntitlementController.applyEntitlementOverride);

// ── Platform Finance Read API (Sprint 9) ──────────────────────────────────────
// Mounts: /billing/invoices, /billing/ledger, /billing/payments, /billing/revenue
const platformFinanceRoutes = require("../../platform/billing/routes/platformFinance.routes");
router.use(platformFinanceRoutes);
module.exports = router;