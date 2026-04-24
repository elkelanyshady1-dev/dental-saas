/**
 * billingLedger.controller.js
 * Platform Finance — Immutable Ledger Read API
 *
 * GET /billing/ledger          → paginated ledger read (read-only)
 * GET /billing/ledger/export   → CSV stream
 *
 * The ledger itself is immutable — this controller is strictly READ.
 * No mutations are permitted here or in any dependent service.
 *
 * PLANE: Platform
 */

"use strict";

const getPlatformModel = require("@core/db/getPlatformModel");
const mongoose = require("mongoose");
const BillingLedgerDef = require("../models/BillingLedger.model");
const BillingLedger = getPlatformModel(BillingLedgerDef);
const {
  LEDGER_EVENT_TYPES
} = require("../models/BillingLedger.model");
const LedgerTransactionDef = require("../models/LedgerTransaction.model");
const LedgerTransaction = getPlatformModel(LedgerTransactionDef);
const OrganizationDef = require("@shared/models/Organization");
const Organization = getPlatformModel(OrganizationDef);
const {
  streamLedgerCsv
} = require("../services/financeExport.service");
const logger = require("@utils/logger");

// ─── GET /billing/ledger ───────────────────────────────────────────────────────
exports.list = async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(200, parseInt(req.query.limit, 10) || 50);
    const skip = (page - 1) * limit;
    const filter = {};
    if (req.query.eventType) {
      if (LEDGER_EVENT_TYPES.includes(req.query.eventType)) {
        filter.eventType = req.query.eventType;
      }
    }
    if (req.query.organizationId && mongoose.isValidObjectId(req.query.organizationId)) {
      filter.organizationId = new mongoose.Types.ObjectId(req.query.organizationId);
    }
    if (req.query.from || req.query.to) {
      filter.createdAt = {};
      if (req.query.from) filter.createdAt.$gte = new Date(req.query.from);
      if (req.query.to) filter.createdAt.$lte = new Date(req.query.to);
    }
    const [entries, total] = await Promise.all([BillingLedger.find(filter).select("createdAt eventType amount amountMinor currency organizationId contractId invoiceId provider providerEventId source actorType metadata").sort({
      createdAt: -1
    }).skip(skip).limit(limit).lean(), BillingLedger.countDocuments(filter)]);

    // ── Enrich entries with LedgerTransaction link (non-fatal if unavailable) ────
    let enriched = entries;
    try {
      const entryIds = entries.map(e => e._id);
      const txns = await LedgerTransaction.find({
        billingLedgerRef: {
          $in: entryIds
        }
      }).select("billingLedgerRef referenceType referenceId referenceLabel").lean();

      // Build a map: BillingLedger._id → transaction
      const txnByLedgerRef = {};
      for (const t of txns) {
        txnByLedgerRef[String(t.billingLedgerRef)] = t;
      }
      enriched = entries.map(entry => {
        const txn = txnByLedgerRef[String(entry._id)];
        return txn ? {
          ...entry,
          ledgerTransactionId: txn._id,
          referenceType: txn.referenceType,
          referenceId: txn.referenceId,
          referenceLabel: txn.referenceLabel
        } : entry;
      });
    } catch (enrichErr) {
      // Enrichment failure must never break the ledger list — fallback to raw entries
      logger.warn({
        enrichErr
      }, "[billingLedger] Transaction enrichment failed — returning raw entries");
    }

    // ── Enrich entries with org name (batch lookup, non-fatal) ────────────────
    try {
      const orgIds = [...new Set(enriched.map(e => e.organizationId).filter(Boolean).map(String))];
      if (orgIds.length > 0) {
        const orgs = await Organization.find({
          _id: {
            $in: orgIds
          }
        }).select("_id name").lean();
        const orgMap = {};
        for (const o of orgs) orgMap[String(o._id)] = o.name;
        enriched = enriched.map(e => ({
          ...e,
          orgName: orgMap[String(e.organizationId)] || null
        }));
      }
    } catch (orgErr) {
      logger.warn({
        orgErr
      }, "[billingLedger] Org name enrichment failed — continuing without");
    }
    return res.json({
      success: true,
      data: enriched,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit)
      },
      meta: {
        eventTypes: LEDGER_EVENT_TYPES
      },
      requestId: req.requestId
    });
  } catch (err) {
    logger.error({
      err,
      requestId: req.requestId
    }, "[billingLedger] list failed");
    return res.status(500).json({
      success: false,
      error: "Internal server error",
      requestId: req.requestId
    });
  }
};

// ─── GET /billing/ledger/transaction/:id ──────────────────────────────────────────────
exports.getTransaction = async (req, res) => {
  try {
    const {
      id
    } = req.params;
    if (!mongoose.isValidObjectId(id)) {
      return res.status(400).json({
        success: false,
        error: "Invalid transaction id",
        requestId: req.requestId
      });
    }
    const txn = await LedgerTransaction.findById(id).lean();
    if (!txn) {
      return res.status(404).json({
        success: false,
        error: "Transaction not found",
        requestId: req.requestId
      });
    }

    // Optionally back-populate the originating BillingLedger event
    let originEvent = null;
    if (txn.billingLedgerRef) {
      try {
        originEvent = await BillingLedger.findById(txn.billingLedgerRef).select("eventType amount currency provider actorType source createdAt organizationId").lean();
      } catch (_) {/* non-fatal */}
    }
    return res.json({
      success: true,
      data: {
        ...txn,
        originEvent: originEvent || null
      },
      requestId: req.requestId
    });
  } catch (err) {
    logger.error({
      err,
      requestId: req.requestId
    }, "[billingLedger] getTransaction failed");
    return res.status(500).json({
      success: false,
      error: "Internal server error",
      requestId: req.requestId
    });
  }
};

// ─── GET /billing/ledger/export ────────────────────────────────────────────────
exports.exportCsv = async (req, res) => {
  try {
    const filter = _buildFilter(req.query);
    await streamLedgerCsv(filter, res);
  } catch (err) {
    logger.error({
      err,
      requestId: req.requestId
    }, "[billingLedger] exportCsv failed");
    if (!res.headersSent) {
      res.status(500).json({
        success: false,
        error: "Export failed",
        requestId: req.requestId
      });
    }
  }
};

// ─── Private ───────────────────────────────────────────────────────────────────
function _buildFilter(query) {
  const filter = {};
  if (query.eventType && LEDGER_EVENT_TYPES.includes(query.eventType)) {
    filter.eventType = query.eventType;
  }
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