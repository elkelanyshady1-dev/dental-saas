/**
 * storageAlertDispatcher.service.js
 * ═══════════════════════════════════════════════════════════════
 * Dispatches in-app storage-quota alert notifications.
 *
 * Anti-spam contract:
 *   • Only fires when the alert level CHANGES (none→warning, warning→critical).
 *   • Additionally re-fires once per 24h for unresolved warning/critical.
 *   • Always non-blocking — errors are logged and swallowed.
 *
 * Usage:
 *   await storageAlertDispatcher.maybeDispatchStorageAlert({
 *       organizationId,
 *       percentUsed,
 *       isUnlimited,
 *   });
 *
 * PLANE: Platform (reads/writes OrgStorageAlertState on platform DB)
 * ═══════════════════════════════════════════════════════════════
 */

"use strict";

const {
  getPlatformConnection
} = require("@core/db/dbResolver");
const getModel = require("@core/db/getModel");
const OrgStorageAlertStateDef = require("@core/usage/OrgStorageAlertState.model");
const {
  enqueueNotification
} = require("@modules/notificationDomain/notification.service");
const {
  checkStorageThresholds
} = require("./storageQuota.service");
const logger = require("@utils/logger");
const TWENTY_FOUR_HOURS_MS = 24 * 60 * 60 * 1000;

/** @returns {import('mongoose').Model} */
function _getStateModel() {
  const conn = getPlatformConnection();
  return getModel(conn, OrgStorageAlertStateDef);
}

// ─── Alert copy ────────────────────────────────────────────────────────────────

const ALERT_COPY = {
  warning: {
    title: "Storage at 80%",
    message: "Your organization has used 80% or more of its storage quota. Consider purchasing additional storage to avoid disruptions."
  },
  critical: {
    title: "Storage quota exceeded",
    message: "Your organization has reached 100% of its storage quota. Uploads are blocked until space is freed or additional storage is purchased."
  }
};

// ─── maybeDispatchStorageAlert ─────────────────────────────────────────────────

/**
 * Check thresholds and dispatch a notification if needed.
 *
 * @param {Object} params
 * @param {string|import('mongoose').Types.ObjectId} params.organizationId
 * @param {number}  params.percentUsed
 * @param {boolean} params.isUnlimited
 * @returns {Promise<void>}
 */
async function maybeDispatchStorageAlert({
  organizationId,
  percentUsed,
  isUnlimited
}) {
  if (!organizationId) return;
  try {
    const level = checkStorageThresholds(percentUsed, isUnlimited);

    // If no threshold breached, optionally clear the persisted level so future
    // re-entry from below triggers fresh notifications.
    if (level === "none") {
      // Reset state so next threshold breach fires a fresh alert.
      await _getStateModel().updateOne({
        lastAlertLevel: {
          $ne: "none"
        }
      }, {
        $set: {
          lastAlertLevel: "none",
          lastAlertAt: new Date()
        }
      });
      return;
    }

    // Load or create alert state
    const StateModel = _getStateModel();
    const state = await StateModel.findOneAndUpdate({}, {
      $setOnInsert: {
        lastAlertLevel: "none",
        lastAlertAt: null
      }
    }, {
      upsert: true,
      returnDocument: "after",
      setDefaultsOnInsert: true
    });
    const now = Date.now();
    const levelChanged = state.lastAlertLevel !== level;
    const staleCooldown = !state.lastAlertAt || now - new Date(state.lastAlertAt).getTime() >= TWENTY_FOUR_HOURS_MS;

    // Fire notification if level changed or 24h cooldown elapsed
    if (!levelChanged && !staleCooldown) return;
    const copy = ALERT_COPY[level];
    await enqueueNotification({
      type: "STORAGE_QUOTA",
      title: copy.title,
      message: copy.message,
      priority: level === "critical" ? "high" : "normal",
      metadata: {
        percentUsed,
        alertLevel: level
      }
    });

    // Persist new state atomically
    await StateModel.updateOne({}, {
      $set: {
        lastAlertLevel: level,
        lastAlertAt: new Date(now)
      }
    });
    logger.info({
      event: "STORAGE_ALERT_DISPATCHED",
      organizationId: String(organizationId),
      level,
      percentUsed
    }, "[StorageAlert] Notification dispatched");
  } catch (err) {
    // Non-blocking — never fail the caller
    logger.warn({
      err: err.message,
      organizationId: String(organizationId)
    }, "[StorageAlert] maybeDispatchStorageAlert failed (suppressed)");
  }
}
module.exports = {
  maybeDispatchStorageAlert
};