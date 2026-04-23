/**
 * clinicBillingSettings.service.js — Clinic billing settings singleton service (Phase 2 D3)
 *
 * Pattern:
 *   - Exactly one BillingSettings document per org DB, keyed by singletonKey.
 *   - getOrCreate(): upsert-on-read so first access materializes the default doc.
 *   - patch(): version-guarded findOneAndUpdate → 409 VERSION_CONFLICT on drift.
 *
 * Concurrency model identical to other billingDomain writes:
 *   { _id, version: expectedVersion } filter + { $inc: { version: 1 } } update.
 *   A null result means either a version conflict or a missing singleton
 *   (which we auto-create and retry once).
 */

"use strict";

const {
  default: BillingSettings
} = require("../models/ClinicBillingSettings.model");
class VersionConflictError extends Error {
  constructor(currentVersion, message = "Billing settings modified concurrently") {
    super(message);
    this.name = "VersionConflictError";
    this.code = "VERSION_CONFLICT";
    this.status = 409;
    this.currentVersion = currentVersion;
  }
}
const SINGLETON_KEY = "org-billing-settings";

// ─── Defaults (used when a DB has no settings doc yet) ───────────────

function _defaultDoc(organizationId) {
  return {
    singletonKey: SINGLETON_KEY,
    defaultCurrency: "AED",
    supportedCurrencies: ["AED"],
    taxRates: [],
    numberingScheme: {
      prefix: "INV",
      padding: 6,
      nextSequence: 1,
      resetCadence: "yearly",
      lastResetAt: null
    },
    invoiceTemplate: {
      showTaxBreakdown: true
    },
    paymentMethods: ["cash", "card"],
    discountPolicy: {
      maxDiscountPercent: 25,
      requireReasonAbovePercent: 10,
      allowLineItemDiscounts: true
    },
    quotationNumberingScheme: {
      prefix: "QUO",
      padding: 6,
      nextSequence: 1,
      resetCadence: "yearly",
      lastResetAt: null
    },
    quotationDefaults: {
      defaultExpiryDays: 30
    },
    emailInvoiceOnCreate: false,
    includeInvoicePdfAttachment: true,
    version: 0
  };
}

/**
 * Get (or create on first access) the per-org BillingSettings singleton.
 * Returns a lean document.
 */
async function getOrCreate(req) {
  const Model = req.dbConnection ? req.dbConnection.model("ClinicBillingSettings", BillingSettings.schema) : BillingSettings;
  let doc = await Model.findOne({
    singletonKey: SINGLETON_KEY
  }).lean();
  if (doc) return doc;

  // Upsert the default doc. Handle E11000 race (two concurrent first-accesses).
  try {
    const created = await Model.create(_defaultDoc(req.organizationId));
    return created.toObject();
  } catch (err) {
    if (err && err.code === 11000) {
      doc = await Model.findOne({
        singletonKey: SINGLETON_KEY
      }).lean();
      if (doc) return doc;
    }
    throw err;
  }
}

/**
 * Apply a partial update to the singleton with version-guarded concurrency.
 *
 * @param {Object} req — request context (req.dbConnection, req.user, etc.)
 * @param {Object} payload — validated Zod output (already parsed)
 * @returns {Object} updated settings (lean)
 */
async function patch(req, payload) {
  const {
    expectedVersion,
    ...updates
  } = payload;

  // Ensure the singleton exists first (auto-create) so that a fresh org can
  // PATCH immediately with expectedVersion=0.
  await getOrCreate(req);
  const Model = req.dbConnection ? req.dbConnection.model("ClinicBillingSettings", BillingSettings.schema) : BillingSettings;

  // Build $set — dot-path nested sub-objects so we don't blow away sibling fields.
  const $set = {};
  for (const [key, value] of Object.entries(updates)) {
    if (value === undefined) continue;
    if (value !== null && typeof value === "object" && !Array.isArray(value)) {
      // Merge object keys as dot paths (e.g. invoiceTemplate.clinicName)
      for (const [subKey, subVal] of Object.entries(value)) {
        if (subVal !== undefined) {
          $set[`${key}.${subKey}`] = subVal;
        }
      }
    } else {
      // Arrays and scalars replace wholesale.
      $set[key] = value;
    }
  }
  $set.updatedAt = new Date();
  if (req.user && req.user._id) {
    $set.updatedByUserId = req.user._id;
  }
  const updated = await Model.findOneAndUpdate({
    singletonKey: SINGLETON_KEY,
    version: expectedVersion
  }, {
    $set,
    $inc: {
      version: 1
    }
  }, {
    new: true
  }).lean();
  if (!updated) {
    const current = await Model.findOne({
      singletonKey: SINGLETON_KEY
    }).select("version").lean();
    throw new VersionConflictError(current?.version ?? null);
  }
  return updated;
}
module.exports = {
  getOrCreate,
  patch,
  VersionConflictError,
  SINGLETON_KEY
};