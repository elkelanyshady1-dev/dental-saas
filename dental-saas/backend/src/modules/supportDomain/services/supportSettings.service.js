/**
 * supportSettings.service.js — Per-org SupportSettings singleton service (Plan E14)
 *
 * Same pattern as billingSettings.service.js:
 *   - getOrCreate(req) materializes a default document on first access.
 *   - patch(req, payload) applies a version-guarded dot-path merge.
 *   - resolveSlaHours(settings, priority) is a pure helper used by
 *     orgSupportBridge.createTicket to compute slaDeadline.
 *
 * Concurrency model:
 *   findOneAndUpdate({ singletonKey, version: expectedVersion },
 *                    { $set, $inc: { version: 1 } })
 */

"use strict";

const {
  default: SupportSettings,
  SINGLETON_KEY,
  DEFAULT_SLA_HOURS
} = require("../models/SupportSettings.model");
class VersionConflictError extends Error {
  constructor(currentVersion, message = "Support settings modified concurrently") {
    super(message);
    this.name = "VersionConflictError";
    this.code = "VERSION_CONFLICT";
    this.status = 409;
    this.currentVersion = currentVersion;
  }
}
function _resolveModel(req) {
  return req.dbConnection ? req.dbConnection.model("SupportSettings", SupportSettings.schema) : SupportSettings;
}
function _defaultDoc(organizationId) {
  return {
    singletonKey: SINGLETON_KEY,
    slaHoursByPriority: {
      ...DEFAULT_SLA_HOURS
    },
    escalationTargets: [],
    allowedCategories: ["technical", "billing", "security", "subscription", "dispute", "refund_request", "feature_request", "other"],
    autoCloseAfterDays: 14,
    ticketsPerDayCap: 100,
    reopenWindowDays: 7,
    version: 0
  };
}

/**
 * Read (or materialize on first access) the support settings singleton.
 * Returns a lean document.
 */
async function getOrCreate(req) {
  const Model = _resolveModel(req);
  let doc = await Model.findOne({
    singletonKey: SINGLETON_KEY
  }).lean();
  if (doc) return doc;
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
 * Apply a partial update to the singleton.
 */
async function patch(req, payload) {
  const {
    expectedVersion,
    ...updates
  } = payload;
  await getOrCreate(req);
  const Model = _resolveModel(req);
  const $set = {};
  for (const [key, value] of Object.entries(updates)) {
    if (value === undefined) continue;
    if (value !== null && typeof value === "object" && !Array.isArray(value)) {
      // Dot-path merge for nested objects (e.g. slaHoursByPriority.CRITICAL)
      for (const [subKey, subVal] of Object.entries(value)) {
        if (subVal !== undefined) {
          $set[`${key}.${subKey}`] = subVal;
        }
      }
    } else {
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

/**
 * Pure helper used at ticket-create time.
 * Falls back to DEFAULT_SLA_HOURS when settings/priority is missing.
 */
function resolveSlaHours(settings, priority) {
  const hours = settings?.slaHoursByPriority?.[priority];
  if (Number.isFinite(hours) && hours > 0) return hours;
  return DEFAULT_SLA_HOURS[priority] ?? DEFAULT_SLA_HOURS.MEDIUM;
}
module.exports = {
  getOrCreate,
  patch,
  resolveSlaHours,
  VersionConflictError,
  SINGLETON_KEY
};