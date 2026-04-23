/**
 * orgAddOnPurchase.controller.js
 * Phase v6-0 — Add-On Monetization Engine (renamed from addOnPurchase.controller)
 */

"use strict";

const addOnService = require("../../../shared/services/platformAddOn.service");
const orgAddOnService = require("../services/orgAddOn.aggregate.service");
const OrgAddOnDef = require("../../../organization/billing/models/orgAddOn.model");
const {
  getCurrentBillingCycle
} = require("../../../core/subscription/communicationQuota.service");
const {
  resolveRegionalPrice
} = require("../../../core/subscription/planResolver");
const {
  createAuditRecord
} = require("../../../services/auditService");
const OrganizationDef = require("../../../shared/models/Organization");
const getModel = require("../../../core/db/getModel");
const {
  getPlatformConnection
} = require("../../../core/db/dbResolver");

/**
 * buildOrgAddOnDTO — strips Mongoose internals from add-on purchase response.
 * Phase 10 DTO enforcement: no raw Mongoose documents in API responses.
 *
 * @param {object} addOn — Mongoose document or lean object
 * @returns {object}
 */
function buildOrgAddOnDTO(addOn) {
  if (!addOn) return null;
  const plain = typeof addOn.toObject === "function" ? addOn.toObject() : {
    ...addOn
  };
  return Object.freeze({
    _id: plain._id?.toString() || null,
    addOnId: plain.addOnId?.toString() || null,
    status: plain.status || null,
    interval: plain.interval || null,
    price: plain.price ?? null,
    currency: plain.currency || null,
    billingCycleStart: plain.billingCycleStart || null,
    billingCycleEnd: plain.billingCycleEnd || null,
    createdAt: plain.createdAt || null
  });
}
function _getPlatformModels() {
  const conn = getPlatformConnection();
  return {
    OrgAddOn: getModel(conn, OrgAddOnDef),
    Organization: getModel(conn, OrganizationDef)
  };
}

/**
 * purchaseAddOn
 * POST /api/org/addons/purchase
 */
exports.purchaseAddOn = async (req, res) => {
  try {
    const {
      Organization,
      OrgAddOn
    } = _getPlatformModels();
    const {
      organizationId
    } = req.user;
    const {
      addOnCode,
      interval = "monthly"
    } = req.body;
    const [org, addOn] = await Promise.all([
    // @rls-pbac-prefetch — billing controller — organizationId from authenticated req
    Organization.findById(organizationId), addOnService.getAddOnByCode(addOnCode)]);
    if (!org || !addOn) {
      return res.status(404).json({
        message: "Organization or Add-On not found"
      });
    }

    // Resolve regional price
    const regionalPricing = resolveRegionalPrice(addOn, org.billingCountry);
    if (!regionalPricing) {
      return res.status(400).json({
        message: "Add-On not available in your region"
      });
    }
    const price = interval === "yearly" ? regionalPricing.yearly : regionalPricing.monthly;
    const {
      start,
      end
    } = getCurrentBillingCycle();

    // v6-0 Rule: Ensure OAV for OrgAddOn
    // @rls-pbac-prefetch — billing controller — organizationId from authenticated req
    const existing = await OrgAddOn.findOne({
      addOnId: addOn._id,
      status: "active"
    });
    if (existing) {
      return res.status(400).json({
        message: "Add-On already active for this organization"
      });
    }
    const orgAddOn = await orgAddOnService.createOrgAddOn({
      addOnId: addOn._id,
      billingCycleStart: start,
      billingCycleEnd: end,
      currency: regionalPricing.currency,
      price,
      interval,
      status: "active"
    });
    await createAuditRecord({
      branchId: req.headers["x-branch-id"] || "000000000000000000000000",
      actorId: req.user.userId,
      actorType: "user",
      action: "ADDON_PURCHASED",
      entity: "orgAddOn",
      entityId: orgAddOn._id,
      details: {
        addOnCode,
        price,
        currency: regionalPricing.currency
      },
      success: true
    });
    res.status(201).json({
      message: "Add-On purchased successfully",
      data: buildOrgAddOnDTO(orgAddOn)
    });
  } catch (err) {
    res.status(500).json({
      message: "Failed to purchase add-on",
      error: err.message
    });
  }
};

/**
 * cancelAddOn
 * DELETE /api/org/addons/:id
 */
exports.cancelAddOn = async (req, res) => {
  try {
    const {
      organizationId
    } = req.user;
    const {
      id
    } = req.params;
    await orgAddOnService.cancelOrgAddOn(id, organizationId);
    await createAuditRecord({
      actorId: req.user.userId,
      action: "ADDON_CANCELLED",
      entity: "orgAddOn",
      entityId: id,
      success: true
    });
    res.json({
      message: "Add-on subscription cancelled"
    });
  } catch (err) {
    const statusCode = err.message === "ADDON_SUBSCRIPTION_NOT_FOUND" ? 404 : 400;
    res.status(statusCode).json({
      message: err.message
    });
  }
};