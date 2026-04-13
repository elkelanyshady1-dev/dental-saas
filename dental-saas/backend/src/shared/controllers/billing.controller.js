/**
 * billing.controller.js (Shared Proxy)
 * Cross-plane safe re-export of billing controller handlers
 * that are consumed by org-plane routes.
 *
 * Only re-exports org-facing functions (e.g. getPortalUrl).
 * Platform-only functions (toggleAutoRenew, recordManualPayment, etc.)
 * remain exclusive to platformDomain.
 */
"use strict";

const revenueController = require("../../platform/domain/controllers/platformRevenue.controller");

module.exports = {
    getPortalUrl: revenueController.getPortalUrl,
};
