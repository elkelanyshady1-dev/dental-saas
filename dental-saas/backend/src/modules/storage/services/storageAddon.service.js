/**
 * storageAddon.service.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Activates a QUOTA-type AddOn for an organization.
 *
 * Uses the existing AddOn + OrgAddOn pipeline — no new quota logic.
 * buildEffectivePlan() automatically picks up the new OrgAddOn, making
 * the quota available to getQuotaStatus(), quotaGuard, and quotaBatchGuard.
 *
 * PLANE: Organization (called from org API route)
 * TRANSACTION: session.withTransaction() on req.dbConnection (§8)
 */

"use strict";

const mongoose = require("mongoose");
const {
  getPlatformConnection
} = require("@core/db/dbResolver");
const getModel = require("@core/db/getModel");
const AddOnDef = require("../../../platform/domain/models/addOn.model");
const OrgAddOnDef = require("@shared/models/OrgAddOn");
const storageQuota = require("./storageQuota.service");
const logger = require("@utils/logger");

/**
 * Activate a storage add-on for the authenticated org.
 *
 * @param {import('express').Request} req
 * @param {{ addOnId: string, interval: "monthly"|"yearly" }} payload
 * @returns {Promise<{ orgAddOn: Object, quota: Object }>}
 */
async function activateStorageAddOn(req, {
  addOnId,
  interval
}) {
  const organizationId = req.context.organizationId;
  const platformConn = getPlatformConnection();
  const AddOn = getModel(platformConn, AddOnDef);
  const OrgAddOn = getModel(platformConn, OrgAddOnDef);

  // 1. Validate add-on exists, is active, and is type QUOTA
  const addOn = await AddOn.findById(addOnId).lean();
  if (!addOn) {
    const err = new Error("Add-on not found");
    err.statusCode = 404;
    err.code = "ADDON_NOT_FOUND";
    throw err;
  }
  if (!addOn.isActive) {
    const err = new Error("This add-on is no longer available");
    err.statusCode = 410;
    err.code = "ADDON_INACTIVE";
    throw err;
  }
  if (addOn.type !== "QUOTA") {
    const err = new Error("Only QUOTA add-ons can be purchased through this endpoint");
    err.statusCode = 400;
    err.code = "ADDON_WRONG_TYPE";
    throw err;
  }
  const storageMB = addOn.benefits?.storageMB;
  if (!storageMB || storageMB <= 0) {
    const err = new Error("Add-on has no valid storage benefit");
    err.statusCode = 400;
    err.code = "ADDON_NO_STORAGE_BENEFIT";
    throw err;
  }

  // 2. Resolve price from first available region
  const regions = addOn.pricing?.regions || [];
  const region = regions[0] || null;
  const price = region ? interval === "yearly" ? region.yearly : region.monthly : 0;
  const currency = region?.currency || addOn.pricing?.baseCurrency || "USD";

  // 3. Compute billing cycle dates
  const now = new Date();
  const cycleEnd = new Date(now);
  if (interval === "yearly") {
    cycleEnd.setFullYear(cycleEnd.getFullYear() + 1);
  } else {
    cycleEnd.setMonth(cycleEnd.getMonth() + 1);
  }

  // 4. Transactional activation on platform connection (§8)
  const session = await platformConn.startSession();
  let orgAddOnDoc;
  try {
    await session.withTransaction(async () => {
      // Upsert — allow the same add-on to be re-activated (idempotent-ish)
      orgAddOnDoc = await OrgAddOn.findOneAndUpdate({
        addOnId: new mongoose.Types.ObjectId(addOnId),
        status: "active"
      }, {
        $setOnInsert: {
          addOnId: new mongoose.Types.ObjectId(addOnId),
          status: "active",
          billingCycleStart: now,
          billingCycleEnd: cycleEnd,
          currency,
          price,
          interval,
          autoRenew: true
        }
      }, {
        upsert: true,
        returnDocument: "after",
        session,
        setDefaultsOnInsert: true
      });
    });
  } finally {
    await session.endSession();
  }
  logger.info({
    event: "STORAGE_ADDON_ACTIVATED",
    organizationId: String(organizationId),
    addOnId,
    storageMB,
    interval
  }, "[StorageAddon] Add-on activated");

  // 5. Return refreshed quota so the client can update immediately
  const quota = await storageQuota.getQuotaStatus(String(organizationId), null);
  return {
    orgAddOn: {
      id: String(orgAddOnDoc._id),
      addOnId: String(orgAddOnDoc.addOnId),
      status: orgAddOnDoc.status,
      billingCycleStart: orgAddOnDoc.billingCycleStart,
      billingCycleEnd: orgAddOnDoc.billingCycleEnd,
      currency: orgAddOnDoc.currency,
      price: orgAddOnDoc.price,
      interval: orgAddOnDoc.interval
    },
    quota
  };
}

/**
 * List all active QUOTA add-ons available for purchase.
 *
 * @returns {Promise<Array>} Available storage add-ons (lean)
 */
async function listAvailableStorageAddOns() {
  const platformConn = getPlatformConnection();
  const AddOn = getModel(platformConn, AddOnDef);
  const addOns = await AddOn.find({
    type: "QUOTA",
    isActive: true
  }).select("name code description benefits pricing version").lean();
  return addOns.map(a => ({
    id: String(a._id),
    name: a.name,
    code: a.code,
    description: a.description || null,
    storageMB: a.benefits?.storageMB || 0,
    storageGB: Math.round((a.benefits?.storageMB || 0) / 1024 * 10) / 10,
    pricing: a.pricing || null
  }));
}
module.exports = {
  activateStorageAddOn,
  listAvailableStorageAddOns
};