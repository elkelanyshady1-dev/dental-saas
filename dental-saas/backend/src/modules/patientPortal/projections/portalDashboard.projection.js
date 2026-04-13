/**
 * portalDashboard.projection.js
 * Phase 5 — Portal Domain-Owned Read Model: Dashboard Composite
 *
 * Composes a complete dashboard view from portal-owned projections.
 * This is the ONLY entry point for the dashboard route — it aggregates
 * profile, appointment, and financial data WITHOUT cross-domain imports.
 *
 * COMPOSITION:
 *   portalProfile     → patient demographics + clinical alerts
 *   portalAppointments → next upcoming appointment
 *   portalFinancial    → financial summary (balance, invoiced, paid)
 *
 * @per-org-transactional — portal dashboard composite — all sub-projections use secureModel
 */

"use strict";

const { buildPortalProfile } = require("./portalProfile.projection");
const { getNextAppointment } = require("./portalAppointments.projection");
const { buildPortalFinancialSummary } = require("./portalFinancial.projection");

/**
 * Builds the complete portal dashboard view.
 *
 * Executes all sub-projections concurrently for performance.
 * Any sub-projection failure returns null/empty — dashboard never crashes.
 *
 * @param {Object} req - Express request (must have req.rls)
 * @returns {Object} Dashboard DTO
 */
async function buildPortalDashboard(req) {
    // Execute all sub-projections concurrently
    const [profile, nextAppointment, financial] = await Promise.all([
        buildPortalProfile(req).catch(() => null),
        getNextAppointment(req).catch(() => null),
        buildPortalFinancialSummary(req).catch(() => ({
            totalInvoiced: 0,
            totalPaid: 0,
            outstandingBalance: 0,
            walletBalance: 0,
            currency: "USD",
        })),
    ]);

    return {
        profile: profile || null,
        nextAppointment: nextAppointment || null,
        financial: {
            outstandingBalance: financial.outstandingBalance,
            totalInvoiced: financial.totalInvoiced,
            totalPaid: financial.totalPaid,
            currency: financial.currency,
        },
    };
}

module.exports = {
    buildPortalDashboard,
};
