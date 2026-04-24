/**
 * financialProjection.facade.js — Shared facade for billing domain projections.
 *
 * Allows patient-portal plane to access billing domain projection functions
 * without importing directly from the billingDomain module.
 *
 * PLANE: Shared (bridges patient-portal → billing domain projections)
 */
"use strict";

const { buildPatientFinancialSummary, buildInvoicePrintView } = require("@modules/billingDomain/projections/printViews/financial.projection");

module.exports = {
    buildPatientFinancialSummary,
    buildInvoicePrintView,
};
