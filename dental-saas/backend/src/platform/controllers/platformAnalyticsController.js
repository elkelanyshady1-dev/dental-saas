/**
 * platformAnalyticsController.js
 * v22.0 — Per-Org Architecture Compliant
 *
 * Platform-wide analytics: aggregates data across ALL org databases.
 * Uses dbManager + getModel for per-org model resolution.
 *
 * ARCHITECTURE:
 *   Organization      → Platform DB (global connection) ✅
 *   PlatformUser      → Platform DB (global connection) ✅
 *   Branch/User/Patient/Appointment/AuditLog → Per-org DB (dental_org_<id>) ✅
 */

"use strict";

const getPlatformModel = require("@core/db/getPlatformModel");
const OrganizationDef = require("@shared/models/Organization");
let _Organization_cache = null;
function Organization() {
    return _Organization_cache || (_Organization_cache = getPlatformModel(OrganizationDef));
}
const PlatformUserDef = require("../models/PlatformUser");
let _PlatformUser_cache = null;
function PlatformUser() {
    return _PlatformUser_cache || (_PlatformUser_cache = getPlatformModel(PlatformUserDef));
}
const logger = require("@utils/logger");

// Per-org DB model resolution
const dbManager = require("@core/db/dbManager");
const getModel = require("@core/db/getModel");
const BranchDef = require("@shared/models/Branch");
const UserDef = require("@shared/models/User");
const PatientDef = require("@shared/models/Patient");
const AppointmentDef = require("@shared/models/Appointment");
const AuditLogDef = require("@shared/models/AuditLog");

// Concurrency limiter: prevent connection pool exhaustion during cross-org fan-out
const pLimit = require("p-limit");
const ORG_AGGREGATION_CONCURRENCY = 15;

/**
 * Aggregate counts from a single org DB.
 * Returns { branches, users, patients, appointments } or zeros on failure.
 */
async function _aggregateOrg(orgId) {
  try {
    const conn = dbManager.getConnection(String(orgId));
    try {
      const BranchModel = getModel(conn, BranchDef);
      const UserModel = getModel(conn, UserDef);
      const PatientModel = getModel(conn, PatientDef);
      const AppointmentModel = getModel(conn, AppointmentDef);
      const [branches, users, patients, appointments] = await Promise.all([BranchModel.countDocuments(), UserModel.countDocuments({
        isActive: true
      }), PatientModel.countDocuments(), AppointmentModel.countDocuments()]);
      return {
        branches,
        users,
        patients,
        appointments
      };
    } finally {
      try {
        dbManager.releaseConnection(String(orgId));
      } catch (_) {}
    }
  } catch (err) {
    logger.warn({
      orgId,
      err: err.message
    }, "[platformAnalytics] Failed to aggregate org — returning zeros");
    return {
      branches: 0,
      users: 0,
      patients: 0,
      appointments: 0
    };
  }
}

/**
 * GET /api/platform/analytics
 * Platform-wide dashboard metrics.
 * Aggregates across ALL org DBs with bounded concurrency (p-limit).
 */
exports.getPlatformAnalytics = async (req, res) => {
  try {
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);

    // Platform-level counts (global connection — correct)
    const [totalOrganizations, activeOrganizations, newOrganizationsToday, allOrgIds] = await Promise.all([Organization().countDocuments(), Organization().countDocuments({
      isActive: true,
      "subscription.status": "active"
    }), Organization().countDocuments({
      createdAt: {
        $gte: startOfToday
      }
    }), Organization().find().distinct("_id")]);

    // Cross-org aggregation — bounded concurrency to prevent pool exhaustion
    const limit = pLimit(ORG_AGGREGATION_CONCURRENCY);
    const orgCounts = await Promise.all(allOrgIds.map(orgId => limit(() => _aggregateOrg(orgId))));

    // Reduce to totals
    const totals = orgCounts.reduce((acc, c) => ({
      branches: acc.branches + c.branches,
      users: acc.users + c.users,
      patients: acc.patients + c.patients,
      appointments: acc.appointments + c.appointments
    }), {
      branches: 0,
      users: 0,
      patients: 0,
      appointments: 0
    });
    res.json({
      totals: {
        organizations: totalOrganizations,
        activeOrganizations,
        branches: totals.branches,
        users: totals.users,
        patients: totals.patients,
        appointments: totals.appointments
      },
      growth: {
        newOrganizationsToday
      },
      systemHealth: {
        status: "operational",
        dbConnected: true,
        uptime: process.uptime()
      }
    });
  } catch (error) {
    logger.error({
      err: error.message
    }, "[platformAnalytics] getPlatformAnalytics failed");
    res.status(500).json({
      message: error.message
    });
  }
};

// ─── GET /api/platform/analytics/events ──────────────────────────────────────
/**
 * Returns the last 15 enriched AuditLog events for the platform dashboard.
 *
 * NOTE: In per-org mode, platform-level audit events (regionCode: "GLOBAL")
 * are written to the PLATFORM DB. Org-level events live in per-org DBs.
 * This endpoint returns PLATFORM-scoped events only.
 *
 * Actor resolution: PlatformUser actors are on platform DB.
 * Org user (tenant_user) actors must be resolved from their per-org DB.
 */
exports.getLatestEvents = async (req, res) => {
  try {
    const LIMIT = Math.min(parseInt(req.query.limit) || 15, 15);

    // Platform AuditLog is on the global connection (platform DB)
    const AuditLog_PlatformDef = require("@shared/models/AuditLog");
    const AuditLog_Platform = getPlatformModel(AuditLog_PlatformDef); // Step 1: fetch platform-scoped logs  
    const logs = await AuditLog_Platform.find({
      regionCode: "GLOBAL"
    }).sort({
      createdAt: -1
    }).limit(LIMIT).populate("organizationId", "name slug").lean();

    // Step 2: resolve actorId across PlatformUser (platform DB only)
    // Tenant user names are embedded in audit records at write time (actorFirstName/actorLastName).
    // We only need to resolve PlatformUser actors here.
    const actorIds = [...new Set(logs.map(l => l.actorId?.toString()()).filter(Boolean))];
    let actorMap = {};
    if (actorIds.length > 0) {
      const platformActors = await PlatformUser().find({
        _id: {
          $in: actorIds
        }
      }, {
        name: 1,
        email: 1,
        role: 1
      }).lean();
      for (const a of platformActors) {
        actorMap[a._id.toString()] = {
          name: a.name,
          email: a.email,
          role: a.role
        };
      }
    }

    // Step 3: enrich + sanitize
    const {
      enrichEvent
    } = require("../utils/activityFormatter");
    const data = logs.map(log => enrichEvent(log, actorMap));
    return res.json({
      success: true,
      data,
      total: data.length
    });
  } catch (error) {
    logger.error({
      err: error.message
    }, "[platformAnalytics] getLatestEvents failed");
    return res.status(500).json({
      message: error.message
    });
  }
};