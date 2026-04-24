/**
 * billingInvoiceList.controller.js
 * Platform Finance — Invoice List + Export + PDF Endpoints
 *
 * GET /billing/invoices          → paginated invoice list
 * GET /billing/invoices/export   → CSV stream
 * GET /billing/invoices/:id/pdf  → PDF buffer
 *
 * PLANE: Platform
 */

"use strict";

const getPlatformModel = require("@core/db/getPlatformModel");
const mongoose = require("mongoose");
const PlatformInvoiceDef = require("../models/PlatformInvoice.model");
const PlatformInvoice = getPlatformModel(PlatformInvoiceDef);
const OrganizationDef = require("@shared/models/Organization");
const Organization = getPlatformModel(OrganizationDef);
const {
  streamInvoicesCsv
} = require("../services/financeExport.service");
const {
  generateInvoicePdf
} = require("../services/invoicePdf.service");
const logger = require("@utils/logger");

// ─── GET /billing/invoices ─────────────────────────────────────────────────────
exports.list = async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(200, parseInt(req.query.limit, 10) || 50);
    const skip = (page - 1) * limit;
    const filter = {};
    if (req.query.status) {
      // All valid PlatformInvoice.status enum values — kept in sync with model
      const allowed = ["draft", "open", "issued", "partial", "paid", "overdue", "void", "uncollectible"];
      if (allowed.includes(req.query.status)) filter.status = req.query.status;
    }
    if (req.query.organizationId && mongoose.isValidObjectId(req.query.organizationId)) {
      filter.organizationId = new mongoose.Types.ObjectId(req.query.organizationId);
    }
    if (req.query.from || req.query.to) {
      filter.createdAt = {};
      if (req.query.from) filter.createdAt.$gte = new Date(req.query.from);
      if (req.query.to) filter.createdAt.$lte = new Date(req.query.to);
    }
    const [invoices, total] = await Promise.all([PlatformInvoice.find(filter).select("invoiceNumber organizationId totalAmount currency status paymentStatus createdAt paidAt dueDate contractId invoiceType").sort({
      createdAt: -1
    }).skip(skip).limit(limit).lean(), PlatformInvoice.countDocuments(filter)]);

    // ── Enrich with org name (batch, non-fatal) ───────────────────────────
    let data = invoices;
    try {
      const orgIds = [...new Set(invoices.map(i => i.organizationId).filter(Boolean).map(String))];
      if (orgIds.length > 0) {
        const orgs = await Organization.find({
          _id: {
            $in: orgIds
          }
        }).select("_id name").lean();
        const orgMap = {};
        for (const o of orgs) orgMap[String(o._id)] = o.name;
        data = invoices.map(i => ({
          ...i,
          orgName: orgMap[String(i.organizationId)] || null
        }));
      }
    } catch (orgErr) {
      logger.error({
        orgErr
      }, "[billingInvoiceList] Org enrichment failed");
    }
    return res.json({
      success: true,
      data,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit)
      },
      requestId: req.requestId
    });
  } catch (err) {
    logger.error({
      err,
      requestId: req.requestId
    }, "[billingInvoiceList] list failed");
    return res.status(500).json({
      success: false,
      error: "Internal server error",
      requestId: req.requestId
    });
  }
};

// ─── GET /billing/invoices/export ──────────────────────────────────────────────
exports.exportCsv = async (req, res) => {
  try {
    const filter = _buildFilter(req.query);
    await streamInvoicesCsv(filter, res);
  } catch (err) {
    logger.error({
      err,
      requestId: req.requestId
    }, "[billingInvoiceList] exportCsv failed");
    if (!res.headersSent) {
      res.status(500).json({
        success: false,
        error: "Export failed",
        requestId: req.requestId
      });
    }
  }
};

// ─── GET /billing/invoices/:invoiceId/pdf ──────────────────────────────────────
exports.pdf = async (req, res) => {
  try {
    const {
      invoiceId
    } = req.params;
    if (!mongoose.isValidObjectId(invoiceId)) {
      return res.status(400).json({
        success: false,
        error: "Invalid invoiceId",
        requestId: req.requestId
      });
    }
    const invoice = await PlatformInvoice.findById(invoiceId).lean();
    if (!invoice) {
      return res.status(404).json({
        success: false,
        error: "Invoice not found",
        requestId: req.requestId
      });
    }
    const organization = await Organization.findById(invoice.organizationId).select("name billingCountry regionCode").lean();
    const pdfBuffer = await generateInvoicePdf(invoice, organization);
    const filename = `invoice-${invoice.invoiceNumber || invoiceId}.pdf`;

    // ── mode: "download" → attachment (save dialog)
    //          "inline"   → inline (browser viewer)  [default]
    const ALLOWED_MODES = ["inline", "download"];
    const mode = ALLOWED_MODES.includes(req.query.mode) ? req.query.mode : "inline";
    const disposition = mode === "download" ? `attachment; filename="${filename}"` : `inline; filename="${filename}"`;
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", disposition);
    res.setHeader("Content-Length", pdfBuffer.length);
    res.setHeader("X-Request-ID", req.requestId || "");
    return res.send(pdfBuffer);
  } catch (err) {
    logger.error({
      err,
      requestId: req.requestId
    }, "[billingInvoiceList] pdf failed");
    return res.status(500).json({
      success: false,
      error: "PDF generation failed",
      requestId: req.requestId
    });
  }
};

// ─── Private ───────────────────────────────────────────────────────────────────
function _buildFilter(query) {
  const filter = {};
  if (query.status) filter.status = query.status;
  if (query.organizationId && mongoose.isValidObjectId(query.organizationId)) {
    filter.organizationId = new mongoose.Types.ObjectId(query.organizationId);
  }
  if (query.from || query.to) {
    filter.createdAt = {};
    if (query.from) filter.createdAt.$gte = new Date(query.from);
    if (query.to) filter.createdAt.$lte = new Date(query.to);
  }
  return filter;
}