/**
 * getContract
 * GET /api/platform/contracts/:id
 * v21.0 — Contract Detail Endpoint
 *
 * Returns a single OrgContract with its parent organization populated.
 * READ-ONLY — no mutation.
 *
 * PLANE: Platform
 * CAPABILITY: VIEW_ORGANIZATIONS
 */
"use strict";

const getPlatformModel = require("@core/db/getPlatformModel");
const mongoose = require("mongoose");
const OrgContractDef = require("@billing/models/OrgContract.model");
let _OrgContract_cache = null;
function OrgContract() {
    return _OrgContract_cache || (_OrgContract_cache = getPlatformModel(OrgContractDef));
}
const PlatformInvoiceDef = require("@billing/models/PlatformInvoice.model");
let _PlatformInvoice_cache = null;
function PlatformInvoice() {
    return _PlatformInvoice_cache || (_PlatformInvoice_cache = getPlatformModel(PlatformInvoiceDef));
}
const logger = require("@utils/logger");
exports.getContractById = async (req, res) => {
  try {
    const {
      id
    } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        error: "Invalid contract ID"
      });
    }
    const contract = await OrgContract().findById(id).populate("organizationId", "name country regionCode").lean();
    if (!contract) {
      return res.status(404).json({
        success: false,
        error: "Contract not found"
      });
    }

    // Fetch related invoices for this contract
    const invoices = await PlatformInvoice().find({
      contractId: id
    }).sort({
      createdAt: -1
    }).limit(20).select("invoiceNumber status paymentStatus totalAmount currency dueDate paidAt createdAt").lean();
    return res.json({
      success: true,
      data: {
        contract,
        invoices
      }
    });
  } catch (err) {
    logger.error({
      err
    }, "[ContractDetailController] getContractById failed");
    return res.status(500).json({
      success: false,
      error: "Internal server error"
    });
  }
};