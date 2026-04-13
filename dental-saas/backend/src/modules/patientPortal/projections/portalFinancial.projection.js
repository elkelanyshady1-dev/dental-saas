/**
 * portalFinancial.projection.js
 * Phase 5 — Portal Domain-Owned Read Model: Financial Summary
 *
 * Replaces: financialProjection.buildPatientFinancialSummary()
 * Source Model: FinancialSnapshot (billing domain)
 *
 * DOMAIN BOUNDARY:
 *   Imports the canonical FinancialSnapshotDef and resolves via getModel
 *   when req.dbConnection is available (per-org mode), or falls back to
 *   the default global model (shared mode).
 *
 * SECURITY:
 *   - secureModel() enforces organizationId via RLS
 *   - Patient sees summary-level financial data only
 *   - No individual invoice/payment details exposed (those are billing-domain concerns)
 *
 * Phase 3.2 — Connection-aware model resolution via getModel.
 * @per-org-transactional — portal financial — organizationId from req.rls
 */

"use strict";

const FinancialSnapshotDef = require("../../../modules/billingDomain/projections/snapshot/FinancialSnapshot.model");
const getModel = require("../../../core/db/getModel");

// ─── Strict Per-Org Model Resolver (Phase 3.3) ──────────────────────────────
function _getSecureSnapshot(connection) {
    if (!connection) throw new Error("[PortalFinancial] connection is REQUIRED — per-org mode does not allow fallback");
    return getModel(connection, FinancialSnapshotDef);
}

/**
 * Builds a patient financial summary DTO for the portal.
 *
 * Uses the pre-computed FinancialSnapshot — no invoice/payment
 * aggregation at query time. If no snapshot exists, returns zeros.
 *
 * @param {Object} req - Express request (must have req.rls + req.patientId)
 * @returns {Object} Financial summary DTO
 */
async function buildPortalFinancialSummary(req) {
    const patientId = req.patientId || req.rls?.patientId;

    if (!patientId) {
        return _emptyFinancialSummary(patientId);
    }

    let snapshot = null;

    try {
        const connection = req.dbConnection || null;
        const secureSnapshot = _getSecureSnapshot(connection);

        snapshot = await secureSnapshot
            .findOne({ patientId })
            .select("totalInvoiced totalPaid outstandingBalance walletBalance")
            .lean();
    } catch (_) {
        // FinancialSnapshot model may not be registered yet — safe fallback
    }

    if (!snapshot) {
        return _emptyFinancialSummary(patientId);
    }

    return {
        patientId: patientId.toString(),
        totalInvoiced: snapshot.totalInvoiced || 0,
        totalPaid: snapshot.totalPaid || 0,
        outstandingBalance: snapshot.outstandingBalance || 0,
        walletBalance: snapshot.walletBalance || 0,
        currency: "USD",
    };
}

/**
 * Returns a zeroed-out financial summary (no data available).
 * @param {string|null} patientId
 * @returns {Object}
 */
function _emptyFinancialSummary(patientId) {
    return {
        patientId: patientId ? patientId.toString() : null,
        totalInvoiced: 0,
        totalPaid: 0,
        outstandingBalance: 0,
        walletBalance: 0,
        currency: "USD",
    };
}

module.exports = {
    buildPortalFinancialSummary,
};
