/**
 * invoiceStatus.service.js — Invoice Status Derivation Service
 *
 * SECURITY: All queries use secureModel + signed system context (Wave 7 RLS).
 * Phase F.7: Bootstrap queries use secureModel (INV-21).
 * Phase 3.2: Connection-aware model resolution via getModel.
 *
 * Transactional session service. Always called within MongoDB
 * transactions from ledger.orchestrator.service.js. Uses explicit session
 * parameter for ACID consistency.
 *
 * EXPORTS TWO FUNCTIONS:
 * 1. deriveInvoiceStatus(invoiceId, organizationId, session, connection) — DB-querying derivation
 * 2. deriveStatusFromAmounts(totalMinor, paidMinor, isVoided) — Pure function derivation
 */
"use strict";

const mongoose = require("mongoose");
const PatientInvoiceDef = require("../models/PatientInvoice.model");
const PaymentAllocationDef = require("../models/PaymentAllocation.model");
const getModel = require("@core/db/getModel");

const logger = require("@utils/logger");

// ─── Strict Per-Org Model Resolvers (Phase 3.3) ─────────────────────────────
function _getSecureInvoice(connection) {
    if (!connection) throw new Error("[InvoiceStatusService] connection is REQUIRED — per-org mode does not allow fallback");
    return getModel(connection, PatientInvoiceDef);
}

function _getSecureAllocation(connection) {
    if (!connection) throw new Error("[InvoiceStatusService] connection is REQUIRED — per-org mode does not allow fallback");
    return getModel(connection, PaymentAllocationDef);
}

// ─── Pure Status Derivation ─────────────────────────────────────────────────

/**
 * Derives invoice status from amounts (pure function, no DB access).
 * Used by refund.service.js for inline status recalculation.
 *
 * @param {number} totalAmountMinor - Total invoice amount in minor units
 * @param {number} paidAmountMinor - Total paid amount in minor units
 * @param {boolean} isVoided - Whether the invoice is voided
 * @returns {string} "paid" | "partially_paid" | "issued" | "voided"
 */
function deriveStatusFromAmounts(totalAmountMinor, paidAmountMinor, isVoided) {
    if (isVoided) return "voided";
    if (paidAmountMinor >= totalAmountMinor) return "paid";
    if (paidAmountMinor > 0) return "partially_paid";
    return "issued";
}

// ─── DB-Querying Status Derivation ──────────────────────────────────────────

/**
 * deriveInvoiceStatus(invoiceId, organizationId, session, connection)
 *
 * Recalculates the status of an invoice based on total allocated payments.
 * Phase F.7 Hardening: Bootstrap query uses getModel(req.dbConnection, Def) (INV-21).
 * Phase 3.2: Connection-aware model resolution.
 *
 * @param {string|ObjectId} invoiceId - Invoice ID to derive status for
 * @param {string} organizationId - Organization ID (passed by caller for Zero-Trust)
 * @param {ClientSession} session - MongoDB session for transactional consistency
 * @param {mongoose.Connection} [connection] - Optional org DB connection (Phase 3.2)
 * @returns {Promise<string>} The derived status
 */
async function deriveInvoiceStatus(invoiceId, organizationId, session, connection = null) {
    if (!organizationId) {
        throw new Error("INV-21: deriveInvoiceStatus requires organizationId (bootstrap tenant isolation enforcement)");
    }

    // INV-21: Bootstrap query uses getModel(req.dbConnection, Def) (not raw Model.findOne)
    const invoice = await _getSecureInvoice(connection).findOne(
        { _id: invoiceId },
        null,
        { session }
    ).lean();

    if (!invoice) {
        throw new Error("RLS: Invoice not found or access denied");
    }

    if (invoice.status === "voided") return "voided";

    // secureModel.aggregate prepends $match { organizationId } automatically
    const allocations = await _getSecureAllocation(connection).aggregate([
        { $match: { invoiceId: new mongoose.Types.ObjectId(invoiceId.toString()) } },
        { $group: { _id: null, total: { $sum: "$allocatedAmountMinor" } } }
    ]).session(session);

    const allocatedMinor = allocations.length > 0 ? allocations[0].total : 0;
    const totalMinor = invoice.totalAmountMinor || Math.round(invoice.totalAmount * 100);

    return deriveStatusFromAmounts(totalMinor, allocatedMinor, false);
}

module.exports = {
    deriveInvoiceStatus,
    deriveStatusFromAmounts,
};
