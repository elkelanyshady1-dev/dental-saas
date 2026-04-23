/**
 * quotation.read.service.js — Read-Only Facade for Patient Quotations
 *
 * Tenant isolation via per-org DB connection.
 * All read operations use getModel + guards.
 *
 * PLANE: Organization (per-org DB)
 */

"use strict";

const PatientQuotationDef = require("../models/PatientQuotation.model");
const getModel = require("@core/db/getModel");
const { assertFinanceRLS } = require("@core/guards/tenantAssertions");

function _getModel(req) {
    return getModel(req.dbConnection, PatientQuotationDef);
}

class QuotationReadService {

    /**
     * getQuotationById(req, id)
     * @per-org-compliant — per-org DB connection provides tenant isolation
     */
    async getQuotationById(req, id) {
        assertFinanceRLS(req, "QuotationReadService.getQuotationById");
        return await _getModel(req).findOne({ _id: id }).lean();
    }

    /**
     * listQuotations(req, filter, options)
     * Paginated list with optional filters: patientId, status, branchId
     * @per-org-compliant — per-org DB connection provides tenant isolation
     */
    async listQuotations(req, filter = {}, options = {}) {
        assertFinanceRLS(req, "QuotationReadService.listQuotations");

        const query = {};

        if (filter.patientId) query.patientId = filter.patientId;
        if (filter.branchId) query.branchId = filter.branchId;
        if (filter.status) {
            if (Array.isArray(filter.status)) {
                query.status = { $in: filter.status };
            } else {
                query.status = filter.status;
            }
        }

        const sort = options.sort || { createdAt: -1 };
        const limit = Math.min(options.limit || 50, 200);
        const skip = options.skip || 0;

        const [docs, total] = await Promise.all([
            _getModel(req).find(query)
                .sort(sort)
                .limit(limit)
                .skip(skip)
                .lean(),
            _getModel(req).countDocuments(query),
        ]);

        return { docs, total, limit, skip };
    }

    /**
     * countByStatus(req, patientId)
     * Returns status counts for a patient's quotations.
     */
    async countByStatus(req, patientId) {
        assertFinanceRLS(req, "QuotationReadService.countByStatus");
        const result = await _getModel(req).aggregate([
            { $match: { patientId } },
            { $group: { _id: "$status", count: { $sum: 1 } } },
        ]);
        const counts = {};
        for (const r of result) counts[r._id] = r.count;
        return counts;
    }
}

module.exports = new QuotationReadService();
