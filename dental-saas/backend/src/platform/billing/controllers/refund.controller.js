/**
 * refund.controller.js
 * Sprint 7.2 — Enterprise Refund HTTP Controller
 *
 * Routes (registered in billing.routes.js):
 *   GET   /refunds                          → listAllRefunds
 *   POST  /contracts/:id/refund-request     → requestRefund
 *   PATCH /refunds/:id/approve              → approveRefund
 *   PATCH /refunds/:id/reject               → rejectRefund
 *   POST  /refunds/:id/process              → processRefund
 *   GET   /refunds/:id                      → getRefund
 *   GET   /invoices/:id/refunds             → listRefundsByInvoice
 *
 * Guard: MANAGE_SUBSCRIPTIONS on all mutation routes.
 * PLANE: Platform
 */

"use strict";

const getPlatformModel = require("@core/db/getPlatformModel");
const mongoose = require("mongoose");
const RefundExecutionRecordDef = require("@shared/models/RefundExecutionRecord");
let _RefundExecutionRecord_cache = null;
function RefundExecutionRecord() {
    return _RefundExecutionRecord_cache || (_RefundExecutionRecord_cache = getPlatformModel(RefundExecutionRecordDef));
}
const PlatformInvoiceDef = require("../models/PlatformInvoice.model");
let _PlatformInvoice_cache = null;
function PlatformInvoice() {
    return _PlatformInvoice_cache || (_PlatformInvoice_cache = getPlatformModel(PlatformInvoiceDef));
}
const OrganizationDef = require("@shared/models/Organization");
let _Organization_cache = null;
function Organization() {
    return _Organization_cache || (_Organization_cache = getPlatformModel(OrganizationDef));
}
const {
  requestRefund,
  approveRefund,
  rejectRefund,
  processRefund
} = require("../services/refundProcessor.service");
const logger = require("@utils/logger");

// ─── POST /contracts/:id/refund-request ───────────────────────────────────────
exports.requestRefund = async (req, res) => {
  try {
    const contractId = req.params.id;
    const actorId = req.platformUser?._id?.toString()() || SYSTEM_ACTOR;
    const {
      invoiceId,
      amount,
      reasonCode,
      idempotencyKey
    } = req.body;
    if (!invoiceId || !amount || amount <= 0) {
      return res.status(400).json({
        success: false,
        error: "invoiceId and amount (positive number) are required"
      });
    }
    if (!reasonCode) {
      return res.status(400).json({
        success: false,
        error: "reasonCode is required (e.g. customer_request, service_failure)"
      });
    }
    const result = await requestRefund({
      invoiceId,
      contractId,
      amount,
      reasonCode,
      requestedBy: actorId,
      idempotencyKey
    });
    const statusCode = result.idempotent ? 200 : 201;
    return res.status(statusCode).json({
      success: true,
      data: result.record,
      requiresApproval: result.requiresApproval,
      fraudFlag: result.fraudFlag,
      idempotent: result.idempotent || false,
      message: result.idempotent ? "Refund request already exists (idempotent)" : result.requiresApproval ? "Refund request created — manual approval required" : "Refund request created — eligible for processing"
    });
  } catch (err) {
    logger.error({
      err
    }, "[RefundController] requestRefund failed");
    if (err.status) {
      return res.status(err.status).json({
        success: false,
        error: err.message,
        code: err.code
      });
    }
    return res.status(500).json({
      success: false,
      error: "Internal server error"
    });
  }
};

// ─── PATCH /refunds/:id/approve ───────────────────────────────────────────────
exports.approveRefund = async (req, res) => {
  try {
    const refundId = req.params.id;
    const approvedBy = req.platformUser?._id?.toString()();
    const record = await approveRefund(refundId, approvedBy);
    return res.json({
      success: true,
      data: record,
      message: "Refund approved — ready for processing"
    });
  } catch (err) {
    logger.error({
      err
    }, "[RefundController] approveRefund failed");
    if (err.status) {
      return res.status(err.status).json({
        success: false,
        error: err.message,
        code: err.code
      });
    }
    return res.status(500).json({
      success: false,
      error: "Internal server error"
    });
  }
};

// ─── PATCH /refunds/:id/reject ────────────────────────────────────────────────
exports.rejectRefund = async (req, res) => {
  try {
    const refundId = req.params.id;
    const rejectedBy = req.platformUser?._id?.toString()();
    const {
      reason
    } = req.body;
    const record = await rejectRefund(refundId, rejectedBy, reason);
    return res.json({
      success: true,
      data: record,
      message: "Refund rejected"
    });
  } catch (err) {
    logger.error({
      err
    }, "[RefundController] rejectRefund failed");
    if (err.status) {
      return res.status(err.status).json({
        success: false,
        error: err.message,
        code: err.code
      });
    }
    return res.status(500).json({
      success: false,
      error: "Internal server error"
    });
  }
};

// ─── POST /refunds/:id/process ────────────────────────────────────────────────
exports.processRefund = async (req, res) => {
  try {
    const refundId = req.params.id;
    const processedBy = req.platformUser?._id?.toString()();
    const result = await processRefund(refundId, processedBy);
    return res.json({
      success: true,
      data: result.record,
      providerRefundId: result.providerRefundId,
      idempotent: result.idempotent || false,
      message: result.idempotent ? "Refund already completed (idempotent)" : "Refund processed successfully"
    });
  } catch (err) {
    logger.error({
      err
    }, "[RefundController] processRefund failed");
    if (err.status) {
      return res.status(err.status).json({
        success: false,
        error: err.message,
        code: err.code
      });
    }
    return res.status(500).json({
      success: false,
      error: "Internal server error"
    });
  }
};

// ─── GET /refunds/:id ─────────────────────────────────────────────────────────
exports.getRefund = async (req, res) => {
  try {
    const record = await RefundExecutionRecord().findById(req.params.id).populate("invoiceId", "invoiceNumber totalAmount currency status").lean();
    if (!record) {
      return res.status(404).json({
        success: false,
        error: "Refund record not found"
      });
    }
    return res.json({
      success: true,
      data: record
    });
  } catch (err) {
    logger.error({
      err
    }, "[RefundController] getRefund failed");
    return res.status(500).json({
      success: false,
      error: "Internal server error"
    });
  }
};

// ─── GET /invoices/:id/refunds ────────────────────────────────────────────────
exports.listRefundsByInvoice = async (req, res) => {
  try {
    const {
      id
    } = req.params;
    const invoice = await PlatformInvoice().findById(id).lean();
    if (!invoice) {
      return res.status(404).json({
        success: false,
        error: "Invoice not found"
      });
    }
    const records = await RefundExecutionRecord().find({
      invoiceId: id
    }).sort({
      createdAt: -1
    }).lean();
    return res.json({
      success: true,
      data: records,
      count: records.length
    });
  } catch (err) {
    logger.error({
      err
    }, "[RefundController] listRefundsByInvoice failed");
    return res.status(500).json({
      success: false,
      error: "Internal server error"
    });
  }
};
const SYSTEM_ACTOR = "000000000000000000000000";

// ─── GET /refunds ──────────────────────────────────────────────────
/**
 * List all refund records across the platform.
 * Supports filtering by status, organizationId, and date range.
 * Returns org name for each record (batch lookup).
 */
exports.listAllRefunds = async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(100, parseInt(req.query.limit, 10) || 50);
    const skip = (page - 1) * limit;
    const VALID_STATUSES = ["refund_requested", "refund_under_review", "refund_approved", "refund_processing", "refund_completed", "refund_rejected", "refund_failed"];
    const filter = {};
    if (req.query.status && VALID_STATUSES.includes(req.query.status)) {
      filter.status = req.query.status;
    }
    if (req.query.organizationId && mongoose.isValidObjectId(req.query.organizationId)) {
      filter.organizationId = new mongoose.Types.ObjectId(req.query.organizationId);
    }
    if (req.query.from || req.query.to) {
      filter.createdAt = {};
      if (req.query.from) filter.createdAt.$gte = new Date(req.query.from);
      if (req.query.to) filter.createdAt.$lte = new Date(req.query.to);
    }
    // Default: show only non-terminal (pending) refunds unless explicitly filtered
    if (!req.query.status && !req.query.all) {
      filter.status = {
        $in: ["refund_requested", "refund_under_review", "refund_approved", "refund_processing"]
      };
    }
    const [records, total] = await Promise.all([RefundExecutionRecord().find(filter).sort({
      createdAt: -1
    }).skip(skip).limit(limit).lean(), RefundExecutionRecord().countDocuments(filter)]);

    // ── Enrich with org name (batch lookup) ───────────────────────────
    let data = records;
    try {
      const orgIds = [...new Set(records.map(r => r.organizationId).filter(Boolean).map(String))];
      if (orgIds.length > 0) {
        const orgs = await Organization().find({
          _id: {
            $in: orgIds
          }
        }).select("_id name").lean();
        const orgMap = {};
        for (const o of orgs) orgMap[String(o._id)] = o.name;
        data = records.map(r => ({
          ...r,
          orgName: orgMap[String(r.organizationId)] || null
        }));
      }
    } catch (orgErr) {
      logger.warn({
        orgErr
      }, "[RefundController] Org name enrichment failed");
    }

    // ── Pending count for sidebar badge ───────────────────────────────
    const pendingCount = await RefundExecutionRecord().countDocuments({
      status: {
        $in: ["refund_requested", "refund_under_review", "refund_approved"]
      }
    });
    return res.json({
      success: true,
      data,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit)
      },
      pendingCount,
      requestId: req.requestId
    });
  } catch (err) {
    logger.error({
      err
    }, "[RefundController] listAllRefunds failed");
    return res.status(500).json({
      success: false,
      error: "Internal server error"
    });
  }
};