/**
 * billingPayments.controller.js
 * Platform Finance — Payment Attempt History API
 *
 * GET /billing/payments          → paginated PaymentAttempt records
 * GET /billing/payments/export   → CSV stream
 *
 * PaymentAttempt is newly persisted by canonicalEventProcessor.js.
 * Each charge attempt (success, failure, refund, dispute) creates a new record.
 *
 * PLANE: Platform
 */

"use strict";

const mongoose = require("mongoose");
const PaymentAttempt = require("../models/PaymentAttempt.model").default;
const Organization = require("@shared/models/Organization").default;
const { streamPaymentsCsv } = require("../services/financeExport.service");
const logger = require("@utils/logger");

const VALID_STATUSES = ["initiated", "authorized", "captured", "failed", "refunded", "disputed"];
const VALID_PROVIDERS = ["stripe", "paymob", "paypal", "manual"];

// ─── GET /billing/payments ────────────────────────────────────────────────────
exports.list = async (req, res) => {
    try {
        const page = Math.max(1, parseInt(req.query.page, 10) || 1);
        const limit = Math.min(200, parseInt(req.query.limit, 10) || 50);
        const skip = (page - 1) * limit;

        const filter = _buildFilter(req.query);

        const [attempts, total] = await Promise.all([
            PaymentAttempt
                .find(filter)
                .select("createdAt organizationId invoiceId contractId provider providerPaymentId amount currency status attemptNumber errorCode errorMessage requestId")
                .sort({ createdAt: -1 })
                .skip(skip)
                .limit(limit)
                .lean(),
            PaymentAttempt.countDocuments(filter)
        ]);

        let data = attempts;
        try {
            const orgIds = [...new Set(attempts.map(a => a.organizationId).filter(Boolean).map(String))];
            if (orgIds.length > 0) {
                const orgs = await Organization.find({ _id: { $in: orgIds } }).select("_id name").lean();
                const orgMap = {};
                for (const o of orgs) orgMap[String(o._id)] = o.name;
                data = attempts.map(a => ({ ...a, orgName: orgMap[String(a.organizationId)] || null }));
            }
        } catch (orgErr) {
            logger.warn({ orgErr }, "[billingPayments] Org name enrichment failed");
        }

        return res.json({
            success: true,
            data,
            pagination: { page, limit, total, pages: Math.ceil(total / limit) },
            requestId: req.requestId
        });
    } catch (err) {
        logger.error({ err, requestId: req.requestId }, "[billingPayments] list failed");
        return res.status(500).json({ success: false, error: "Internal server error", requestId: req.requestId });
    }
};

// ─── GET /billing/payments/export ─────────────────────────────────────────────
exports.exportCsv = async (req, res) => {
    try {
        const filter = _buildFilter(req.query);
        await streamPaymentsCsv(filter, res);
    } catch (err) {
        logger.error({ err, requestId: req.requestId }, "[billingPayments] exportCsv failed");
        if (!res.headersSent) {
            res.status(500).json({ success: false, error: "Export failed", requestId: req.requestId });
        }
    }
};

// ─── Private ───────────────────────────────────────────────────────────────────
function _buildFilter(query) {
    const filter = {};

    if (query.organizationId && mongoose.isValidObjectId(query.organizationId)) {
        filter.organizationId = new mongoose.Types.ObjectId(query.organizationId);
    }
    if (query.invoiceId && mongoose.isValidObjectId(query.invoiceId)) {
        filter.invoiceId = new mongoose.Types.ObjectId(query.invoiceId);
    }
    if (query.provider && VALID_PROVIDERS.includes(query.provider)) {
        filter.provider = query.provider;
    }
    if (query.status && VALID_STATUSES.includes(query.status)) {
        filter.status = query.status;
    }
    if (query.from || query.to) {
        filter.createdAt = {};
        if (query.from) filter.createdAt.$gte = new Date(query.from);
        if (query.to) filter.createdAt.$lte = new Date(query.to);
    }

    return filter;
}
