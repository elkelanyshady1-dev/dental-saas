/**
 * imagePoolCleanup.job.js — TDS-BULK-UPLOAD-v2.0
 *
 * PURPOSE:
 * Soft-deletes orphaned bulk-upload pool images that have been sitting
 * unassigned for more than POOL_ORPHAN_DAYS (default 30) days.
 *
 * ARCHITECTURE:
 *   Uses separate ImagePoolPhoto collection (not embedded in case).
 *   Single updateMany per org — efficient bulk operation.
 *
 * SAFETY:
 *   - NEVER soft-deletes assigned images.
 *   - NEVER touches the main case data.
 *   - Per-org isolation via dbManager connections.
 *
 * SCHEDULE:
 *   Default: Daily at 03:00 UTC (configurable via CRON_IMAGE_POOL_CLEANUP).
 *   Disable: JOB_IMAGE_POOL_CLEANUP=false
 */

"use strict";

const getPlatformModel = require("@core/db/getPlatformModel");
const cron = require("node-cron");
const logger = require("../utils/logger");
const dbManager = require("../core/db/dbManager");
const getModel = require("../core/db/getModel");
const OrganizationDef = require("../shared/models/Organization");
let _Organization_cache = null;
function Organization() {
    return _Organization_cache || (_Organization_cache = getPlatformModel(OrganizationDef));
}
const ImagePoolPhotoDef = require("../modules/orthodontics/models/imagePoolPhoto.model");
const POOL_ORPHAN_DAYS = parseInt(process.env.POOL_ORPHAN_DAYS, 10) || 30;
const ORG_STATUS_RUNNABLE = ["trial", "active", "past_due"];
let _job = null;
async function runCleanup() {
  const cutoff = new Date(Date.now() - POOL_ORPHAN_DAYS * 24 * 60 * 60 * 1000);
  const stats = {
    orgsProcessed: 0,
    imagesArchived: 0,
    errors: 0
  };
  const orgs = await Organization().find({
    isActive: true,
    "subscription.status": {
      $in: ORG_STATUS_RUNNABLE
    }
  }, {
    _id: 1
  }).lean().limit(500);
  for (const org of orgs) {
    const orgId = org._id.toString();
    let conn = null;
    try {
      conn = await dbManager.getConnectionAsync(orgId);
      const PoolPhoto = getModel(conn, ImagePoolPhotoDef);
      const result = await PoolPhoto.updateMany({
        "assignment.view": null,
        deletedAt: null,
        uploadedAt: {
          $lt: cutoff
        }
      }, {
        $set: {
          deletedAt: new Date()
        }
      });
      stats.imagesArchived += result.modifiedCount;
      stats.orgsProcessed++;
    } catch (err) {
      stats.errors++;
      logger.error({
        orgId,
        err: err.message
      }, "[ImagePoolCleanupJob] Per-org error");
    } finally {
      if (conn) dbManager.releaseConnection(orgId);
    }
  }
  return stats;
}
async function _run() {
  logger.info("[ImagePoolCleanupJob] Starting orphan archive pass");
  try {
    const stats = await runCleanup();
    logger.info({
      ...stats,
      orphanDays: POOL_ORPHAN_DAYS
    }, "IMAGE_POOL_CLEANUP_OK");
  } catch (err) {
    logger.error({
      err: err.message
    }, "IMAGE_POOL_CLEANUP_FAILED");
  }
}
function start(schedule) {
  if (_job) return;
  _job = cron.schedule(schedule, _run, {
    timezone: "UTC"
  });
  logger.info({
    schedule,
    orphanDays: POOL_ORPHAN_DAYS
  }, "[ImagePoolCleanupJob] Scheduled");
}
function stop() {
  if (_job) {
    _job.stop();
    _job = null;
  }
}
async function runNow() {
  return _run();
}
module.exports = {
  start,
  stop,
  runNow
};