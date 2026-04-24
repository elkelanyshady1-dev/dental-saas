/**
 * communicationMetrics.facade.js — Shared facade for CommunicationMetrics.
 *
 * Allows non-platform planes to record communication metrics without
 * importing platform models directly. Fire-and-forget — failures are
 * silently swallowed (metrics are non-blocking).
 *
 * PLANE: Shared (bridges org-plane → platform-plane metrics)
 */
"use strict";

const getSharedModel = require("@core/db/getSharedModel");
const CommunicationMetricsDef = require("@platform/models/CommunicationMetrics.model");
let _CommunicationMetrics_cache = null;
function CommunicationMetrics() {
    return _CommunicationMetrics_cache || (_CommunicationMetrics_cache = getSharedModel(CommunicationMetricsDef));
}
/**
 * Increment a communication metric counter.
 * @param {"email"|"sms"|"whatsapp"} channel
 * @param {string} type - e.g. "VERIFY_EMAIL_OTP", "ALL"
 * @param {"sent"|"failed"|"dlq"|"retried"} status
 */
async function incrementMetric(channel, type, status) {
  try {
    await CommunicationMetrics().increment(channel, type, status);
  } catch {/* metrics are non-blocking */}
}
module.exports = {
  incrementMetric
};