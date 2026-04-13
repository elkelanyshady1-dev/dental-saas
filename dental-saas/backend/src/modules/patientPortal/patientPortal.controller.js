/**
 * patientPortal.controller.js
 * Phase 5 — Domain Consolidated: Portal-Owned Data Access
 *
 * MIGRATION COMPLETE:
 *   ❌ REMOVED: appointmentProjection (org domain)
 *   ❌ REMOVED: patientProjection (org domain)
 *   ❌ REMOVED: financialProjection (billing domain)
 *
 *   ✅ REPLACED WITH: portal-owned projections using secureModel
 *     - portalDashboard.projection (composite)
 *     - portalAppointments.projection
 *     - portalFinancial.projection
 *     - portalProfile.projection
 *
 * SECURITY STACK:
 *   - All queries via secureModel (Phase 2)
 *   - All responses filtered by portalFieldFilter (Phase 3)
 *   - All routes permission-gated (Phase 4)
 *   - Zero cross-domain imports (Phase 5)
 *
 * @per-org-transactional — portal controller — full security stack enforced
 */

"use strict";

const { buildPortalDashboard } = require("./projections/portalDashboard.projection");
const { buildPortalAppointments } = require("./projections/portalAppointments.projection");
const { buildPortalFinancialSummary } = require("./projections/portalFinancial.projection");
const { buildPortalProfile } = require("./projections/portalProfile.projection");
const { successResponse, errorResponse } = require("@utils/responseFormatter");

class PatientPortalController {
    /**
     * GET /api/v1/patient/portal/dashboard
     *
     * Composite view: profile + next appointment + financial summary.
     * Uses portal-owned dashboard projection (no cross-domain queries).
     */
    async getDashboard(req, res) {
        try {
            const dashboard = await buildPortalDashboard(req);

            return successResponse(res, dashboard);
        } catch (error) {
            return errorResponse(res, error.message, "DASHBOARD_FETCH_FAILED", 400);
        }
    }

    /**
     * GET /api/v1/patient/portal/appointments
     *
     * Lists patient's appointments (upcoming + past).
     * Uses portal-owned appointments projection.
     */
    async getAppointments(req, res) {
        try {
            const { status, limit } = req.query;

            const appointments = await buildPortalAppointments(req, {
                status,
                limit: limit ? parseInt(limit, 10) : 50,
            });

            return successResponse(res, appointments);
        } catch (error) {
            return errorResponse(res, error.message, "APPOINTMENTS_FETCH_FAILED", 400);
        }
    }

    /**
     * GET /api/v1/patient/portal/invoices
     *
     * Returns patient financial summary (balance, invoiced, paid).
     * Uses portal-owned financial projection backed by FinancialSnapshot.
     */
    async getInvoices(req, res) {
        try {
            const financial = await buildPortalFinancialSummary(req);

            return successResponse(res, financial);
        } catch (error) {
            return errorResponse(res, error.message, "INVOICES_FETCH_FAILED", 400);
        }
    }

    /**
     * GET /api/v1/patient/portal/medical-history
     *
     * Returns patient clinical data (risk flags, alerts, history status).
     * Uses portal-owned profile projection's clinical section.
     */
    async getMedicalHistory(req, res) {
        try {
            const profile = await buildPortalProfile(req);

            return successResponse(res, profile?.clinical || {
                riskFlags: [],
                alerts: [],
                hasHistory: false,
            });
        } catch (error) {
            return errorResponse(res, error.message, "MEDICAL_HISTORY_FETCH_FAILED", 400);
        }
    }
}

module.exports = new PatientPortalController();
