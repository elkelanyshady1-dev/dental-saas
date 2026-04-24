/**
 * validatePlans.js — Startup Plan Integrity Check
 *
 * Called once after DB connection in server.js.
 * Ensures the minimum required PlanVersion data exists before serving requests.
 *
 * Failure behavior:
 *   - In production: crashes the process (hard fail — missing plan = broken billing)
 *   - In development: logs a warning and continues (seeding hint printed)
 *
 * To fix: node scripts/seedTrialPlan.js
 */

"use strict";

const getPlatformModel = require("@core/db/getPlatformModel");
const PlanVersionDef = require("../platform/billing/models/PlanVersion.model");
const PlanVersion = getPlatformModel(PlanVersionDef);
const logger = require("@utils/logger");

/**
 * validatePlans
 *
 * @returns {Promise<void>} Resolves if OK. Throws (in production) or warns (in dev)
 *                         if the trial-tier PlanVersion is missing.
 */
async function validatePlans() {
  const trial = await PlanVersion.findOne({
    templateCode: "trial-tier",
    status: "active"
  }).lean();
  if (!trial) {
    const msg = "CRITICAL: No active trial-tier PlanVersion found in DB. Run: node scripts/seedTrialPlan.js";
    if (process.env.NODE_ENV === "production") {
      logger.error({
        event: "PLAN_VALIDATION_FAILED"
      }, `[StartupValidator] ${msg}`);
      throw new Error(msg);
    }

    // Non-production: warn but continue (let devs seed lazily)
    logger.warn({
      event: "PLAN_VALIDATION_MISSING",
      hint: "node scripts/seedTrialPlan.js"
    }, `[StartupValidator] ⚠️  ${msg}`);
    return;
  }

  // Confirm the trial plan has at least core modules defined
  const hasModules = trial.modules && typeof trial.modules === "object";
  if (!hasModules) {
    logger.warn({
      event: "PLAN_VALIDATION_NO_MODULES",
      planId: trial._id?.toString()
    }, "[StartupValidator] ⚠️  Trial-tier PlanVersion found but has no modules defined — entitlements may be empty");
  }
  logger.info({
    event: "PLAN_VALIDATION_PASSED",
    planId: trial._id?.toString(),
    versionTag: trial.versionTag
  }, `[StartupValidator] ✅ Plan validation passed — trial-tier PlanVersion: ${trial.versionTag}`);
}
module.exports = {
  validatePlans
};