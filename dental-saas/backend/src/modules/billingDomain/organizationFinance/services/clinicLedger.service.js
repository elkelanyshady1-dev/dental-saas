/**
 * clinicLedger.service.js  (was: financial.read.service.js)
 * 
 * Read-Only Facade for Financial Domain (v4.2 → v5.0 RLS).
 * Tenant isolation via per-org DB connection.
 *
 * @per-org-compliant — All read operations use getModel + guards.
 * organizationId auto-injected via per-org DB connection.
 *
 * Phase F.3 — Runtime assertions as defense-in-depth for financial data.
 * Phase 3.2 — Connection-aware model resolution via getModel.
 */

const PatientInvoiceDef = require("../models/PatientInvoice.model");
const PatientPaymentDef = require("../models/PatientPayment.model");
const getModel = require("@core/db/getModel");
const { assertFinanceRLS } = require("@core/guards/tenantAssertions");

// ─── Connection-Aware Model Resolvers (Phase 3.2) ────────────────────────────
function _getSecureInvoice(req) {
    const Model = getModel(req.dbConnection, PatientInvoiceDef);
    return Model;
}

function _getSecurePayment(req) {
    const Model = getModel(req.dbConnection, PatientPaymentDef);
    return Model;
}

class FinancialReadService {
    /**
     * getInvoiceById(req, invoiceId, session)
     * @per-org-compliant — per-org DB connection provides tenant isolation
     */
    async getInvoiceById(req, invoiceId, session = null) {
        assertFinanceRLS(req, "FinancialReadService.getInvoiceById");
        return await _getSecureInvoice(req).findOne({ _id: invoiceId })
            .session(session)
            .lean();
    }

    /**
     * getPaymentById(req, paymentId, session)
     * @per-org-compliant — per-org DB connection provides tenant isolation
     */
    async getPaymentById(req, paymentId, session = null) {
        assertFinanceRLS(req, "FinancialReadService.getPaymentById");
        return await _getSecurePayment(req).findOne({ _id: paymentId })
            .session(session)
            .lean();
    }

    /**
     * listInvoices(req, filter, options)
     * Scoped list for dashboard/patient profile.
     * @per-org-compliant — per-org DB connection provides tenant isolation
     */
    async listInvoices(req, filter = {}, options = {}) {
        assertFinanceRLS(req, "FinancialReadService.listInvoices");
        return await _getSecureInvoice(req).find(filter)
            .sort(options.sort || { createdAt: -1 })
            .limit(options.limit || 50)
            .skip(options.skip || 0)
            .lean();
    }

    /**
     * listPayments(req, filter, options)
     * Scoped list for dashboard/patient profile.
     * @per-org-compliant — per-org DB connection provides tenant isolation
     */
    async listPayments(req, filter = {}, options = {}) {
        assertFinanceRLS(req, "FinancialReadService.listPayments");
        return await _getSecurePayment(req).find(filter)
            .sort(options.sort || { createdAt: -1 })
            .limit(options.limit || 50)
            .skip(options.skip || 0)
            .lean();
    }
}

module.exports = new FinancialReadService();
