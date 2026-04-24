/**
 * billingControlService.js
 * Platform Billing Kill Switch — Control Service
 *
 * Provides a cached, singleton-pattern interface to the BillingControl document.
 *
 * Public API:
 *   getBillingControl()              → current control document (DB fallback)
 *   isBillingKillSwitchActive()      → boolean (fast cached read)
 *   activateBillingKillSwitch(reason, source, actor)  → activate + persist
 *   deactivateBillingKillSwitch(actor)                → deactivate + persist
 *   invalidateCache()                → force next read to hit DB
 *
 * Cache design:
 *   - In-process module-level cache with 30-second TTL
 *   - Cache is invalidated immediately on any write
 *   - Production safe: a cache miss simply hits MongoDB once (lightweight read)
 *
 * PLANE: Platform
 * SENTINEL: No capability bypassed — service is called by guardian + middleware
 */

"use strict";

const getPlatformModel = require("@core/db/getPlatformModel");
const BillingControlDef = require("../models/BillingControl.model");
const BillingControl = getPlatformModel(BillingControlDef);
const logger = require("@utils/logger");

// ─── In-process cache ─────────────────────────────────────────────────────────

const CACHE_TTL_MS = 30 * 1000; // 30 seconds

let _cache = null; // { killSwitch: bool, ...doc fields }
let _cacheSetAt = 0; // timestamp of last cache fill

function _isCacheValid() {
  return _cache !== null && Date.now() - _cacheSetAt < CACHE_TTL_MS;
}
function _setCache(doc) {
  _cache = {
    killSwitch: doc.killSwitch,
    source: doc.source,
    reason: doc.reason
  };
  _cacheSetAt = Date.now();
}
function invalidateCache() {
  _cache = null;
  _cacheSetAt = 0;
}

// ─── Internal: get or create singleton document ───────────────────────────────

/**
 * Returns the singleton BillingControl document, creating it if absent.
 * Production-safe: upsert guarantees only one document exists.
 *
 * @returns {Promise<import('../models/BillingControl.model').default>}
 */
async function _getOrCreateControl() {
  let doc = await BillingControl.findOne({
    singleton: "global"
  });
  if (!doc) {
    // First boot — create safe default (kill switch OFF)
    doc = await BillingControl.findOneAndUpdate({
      singleton: "global"
    }, {
      $setOnInsert: {
        singleton: "global",
        killSwitch: false,
        reason: "",
        activatedBy: "system",
        activatedAt: null,
        source: "system",
        history: []
      }
    }, {
      upsert: true,
      new: true,
      runValidators: true
    });
    logger.info({
      billing: true,
      event: "BILLING_CONTROL_INITIALIZED"
    }, "[BillingControl] Singleton document created — kill switch OFF by default");
  }
  return doc;
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * getBillingControl
 *
 * Returns the full BillingControl document (live DB read).
 * Always bypasses cache — use isBillingKillSwitchActive() for hot-path checks.
 *
 * @returns {Promise<object>}
 */
async function getBillingControl() {
  const doc = await _getOrCreateControl();
  _setCache(doc);
  return doc;
}

/**
 * isBillingKillSwitchActive
 *
 * Fast in-process check — returns false if cache is warm and kill switch is off.
 * Falls back to a DB read if cache is stale or cold.
 *
 * @returns {Promise<boolean>}
 */
async function isBillingKillSwitchActive() {
  if (_isCacheValid()) {
    return _cache.killSwitch;
  }
  try {
    const doc = await _getOrCreateControl();
    _setCache(doc);
    return doc.killSwitch;
  } catch (err) {
    // If DB is unreachable during a hot-path billing check, FAIL SAFE: block billing.
    // This prevents billing operations from proceeding when the control system is down.
    logger.error({
      billing: true,
      event: "BILLING_CONTROL_READ_FAILED",
      err: err.message
    }, "[BillingControl] CRITICAL: Cannot read kill switch state — defaulting to BLOCKED (fail-safe)");
    return true; // fail-safe: treat as active
  }
}

/**
 * activateBillingKillSwitch
 *
 * Sets killSwitch = true, persists to DB, invalidates cache.
 * Emits a structured critical log entry.
 *
 * @param {string} reason  - Human-readable reason (invariant name, anomaly type, etc.)
 * @param {string} source  - "manual" | "guardian" | "anomaly-detection"
 * @param {string} [actor] - Who triggered the activation (email or system actor name)
 * @returns {Promise<object>} Updated control document
 */
async function activateBillingKillSwitch(reason, source = "manual", actor = "system") {
  const now = new Date();
  const historyEntry = {
    killSwitch: true,
    reason,
    activatedBy: actor,
    source,
    changedAt: now
  };
  const doc = await BillingControl.findOneAndUpdate({
    singleton: "global"
  }, {
    $set: {
      killSwitch: true,
      reason,
      activatedBy: actor,
      activatedAt: now,
      source
    },
    $push: {
      history: {
        $each: [historyEntry],
        $slice: -50 // keep last 50 entries only
      }
    }
  }, {
    upsert: true,
    new: true,
    runValidators: true
  });
  invalidateCache();
  logger.error({
    billing: true,
    event: "BILLING_KILL_SWITCH_ACTIVATED",
    reason,
    source,
    actor,
    activatedAt: now.toISOString()
  }, `[BILLING] BILLING_KILL_SWITCH_ACTIVATED — reason: ${reason} | source: ${source} | actor: ${actor}`);
  return doc;
}

/**
 * deactivateBillingKillSwitch
 *
 * Sets killSwitch = false, persists to DB, invalidates cache.
 *
 * @param {string} actor - Who deactivated (email or system actor name)
 * @returns {Promise<object>} Updated control document
 */
async function deactivateBillingKillSwitch(actor = "system") {
  const now = new Date();
  const historyEntry = {
    killSwitch: false,
    reason: "Manual deactivation",
    activatedBy: actor,
    source: "manual",
    changedAt: now
  };
  const doc = await BillingControl.findOneAndUpdate({
    singleton: "global"
  }, {
    $set: {
      killSwitch: false,
      reason: "Manually cleared",
      activatedBy: actor,
      activatedAt: now,
      source: "manual"
    },
    $push: {
      history: {
        $each: [historyEntry],
        $slice: -50
      }
    }
  }, {
    upsert: true,
    new: true,
    runValidators: true
  });
  invalidateCache();
  logger.warn({
    billing: true,
    event: "BILLING_KILL_SWITCH_DEACTIVATED",
    actor,
    deactivatedAt: now.toISOString()
  }, `[BILLING] BILLING_KILL_SWITCH_DEACTIVATED — actor: ${actor}`);
  return doc;
}

// ─── Exports ──────────────────────────────────────────────────────────────────

module.exports = {
  getBillingControl,
  isBillingKillSwitchActive,
  activateBillingKillSwitch,
  deactivateBillingKillSwitch,
  invalidateCache
};