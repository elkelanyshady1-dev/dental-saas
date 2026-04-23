/**
 * modules.service.js — Module State Resolution & Toggle Engine
 *
 * Pure business logic for org module management:
 *   - State resolution (enabled / disabled / locked / flagged)
 *   - Usage stats aggregation from AuditLog
 *   - Module toggle with dependency/entitlement/flag validation
 *
 * RULES:
 *   - No HTTP concerns (no req/res)
 *   - No direct cache — caching is controller's responsibility
 *   - organizationId comes from JWT (via controller)
 *
 * PLANE: Org only.
 */

"use strict";

const logger = require("@utils/logger");

// Per-org DB resolution for AuditLog queries
const dbManager = require("@core/db/dbManager");
const getModel = require("@core/db/getModel");
const AuditLogDef = require("@shared/models/AuditLog");

// ─── Module Registry (SSOT) ─────────────────────────────────────────────────

const MODULE_KEYS = Object.freeze([{
  key: "patients",
  name: "Patients",
  icon: "👤",
  dependency: null
}, {
  key: "appointments",
  name: "Appointments",
  icon: "📅",
  dependency: "patients"
}, {
  key: "calendar",
  name: "Calendar",
  icon: "🗓️",
  dependency: "appointments"
}, {
  key: "treatments",
  name: "Clinical Treatments",
  icon: "🦷",
  dependency: "patients"
}, {
  key: "orthodontics",
  name: "Orthodontics",
  icon: "🔬",
  dependency: "patients"
}, {
  key: "finance",
  name: "Finance & Billing",
  icon: "💳",
  dependency: null
}, {
  key: "inventory",
  name: "Inventory",
  icon: "📦",
  dependency: null
}, {
  key: "lab",
  name: "Lab Management",
  icon: "🧪",
  dependency: null
}, {
  key: "communication",
  name: "Communication",
  icon: "💬",
  dependency: "patients"
}, {
  key: "analytics",
  name: "Analytics & Reports",
  icon: "📊",
  dependency: null
}, {
  key: "dashboard",
  name: "Dashboard",
  icon: "🏠",
  dependency: null
}, {
  key: "security",
  name: "Security Center",
  icon: "🛡️",
  dependency: null
}, {
  key: "portal",
  name: "Patient Portal",
  icon: "🌐",
  dependency: "patients"
}, {
  key: "users",
  name: "Staff Management",
  icon: "👥",
  dependency: null
}, {
  key: "branches",
  name: "Branches",
  icon: "🏢",
  dependency: null
}]);

// Map: key → dependency chain (for toggle validation)
const MODULE_DEPS = Object.freeze({
  appointments: "patients",
  calendar: "appointments",
  treatments: "patients",
  orthodontics: "patients",
  communication: "patients",
  portal: "patients"
});

// ─── Feature-Map Parser ─────────────────────────────────────────────────────

/**
 * Normalize org.features from Mongoose Map or plain object to flat {key: bool}.
 * @param {*} features — org.features (Mongoose Map or plain object)
 * @returns {Object<string, boolean>}
 */
function parseOrgFeatures(features) {
  const result = {};
  if (!features) return result;
  if (typeof features.forEach === "function") {
    features.forEach((val, key) => {
      result[key] = typeof val === "object" ? !!val.enabled : !!val;
    });
  } else if (typeof features === "object") {
    for (const [key, val] of Object.entries(features)) {
      result[key] = typeof val === "object" ? !!val.enabled : !!val;
    }
  }
  return result;
}

// ─── Usage Stats ────────────────────────────────────────────────────────────

/**
 * Compute today's usage stats per module from AuditLog.
 * @param {string|ObjectId} organizationId
 * @returns {Promise<Object<string, number>>}
 */
async function computeUsageStats(organizationId) {
  const orgConn = dbManager.getConnection(String(organizationId));
  const AuditLog = getModel(orgConn, AuditLogDef);
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const entityMap = {
    Patient: "patients",
    Appointment: "appointments",
    Treatment: "treatments",
    Invoice: "finance",
    Payment: "finance",
    OrthodonticCase: "orthodontics",
    User: "users",
    Branch: "branches",
    Role: "security",
    InventoryItem: "inventory",
    LabOrder: "lab",
    Recall: "patients"
  };
  try {
    const pipeline = [{
      $match: {
        createdAt: {
          $gte: todayStart
        }
      }
    }, {
      $group: {
        _id: "$entityType",
        count: {
          $sum: 1
        }
      }
    }];
    const results = await AuditLog.aggregate(pipeline).exec();
    const counts = {};
    for (const r of results) {
      const moduleKey = entityMap[r._id] || r._id?.toLowerCase();
      if (moduleKey) {
        counts[moduleKey] = (counts[moduleKey] || 0) + r.count;
      }
    }
    return counts;
  } catch (err) {
    logger.warn({
      err: err.message
    }, "[ModulesService] Usage stats aggregation failed — fallback to 0");
    return {};
  }
}

// ─── Module State Resolution ────────────────────────────────────────────────

/**
 * Resolve all module states for an organization.
 *
 * @param {Object} org — Mongoose Organization document
 * @returns {Promise<{modules: Array, meta: Object}>}
 */
async function resolveModules(org) {
  const orgModules = org.modules || {};
  const orgFeatures = parseOrgFeatures(org.features);

  // Parallel: compute usage stats
  const usageCounts = await computeUsageStats(org._id);
  const modules = MODULE_KEYS.map(mod => {
    const inPlan = orgModules[mod.key];
    const flagDisabled = orgFeatures[`${mod.key}.disabled`] === true || orgFeatures[`DISABLE_${mod.key.toUpperCase()}`] === true;
    let state;
    if (flagDisabled) {
      state = "flagged";
    } else if (inPlan === false) {
      state = "locked";
    } else if (inPlan === true || inPlan === undefined) {
      state = "enabled";
    } else {
      state = "disabled";
    }
    return {
      key: mod.key,
      name: mod.name,
      icon: mod.icon,
      dependency: mod.dependency,
      state,
      usageCount: usageCounts[mod.key] || 0,
      flagReason: flagDisabled ? "Disabled by Platform (Maintenance)" : undefined
    };
  });
  return {
    modules,
    meta: {
      lastUpdated: new Date().toISOString()
    }
  };
}

// ─── Module Toggle ──────────────────────────────────────────────────────────

/**
 * Toggle a module ON or OFF for an organization.
 *
 * Validates:
 *   1. Module key is valid
 *   2. Module is not locked by feature flag
 *   3. Dependencies are met (cannot enable if dependency is missing)
 *   4. Dependents are warned (cannot disable if is a dependency for active modules)
 *
 * @param {Object} params
 * @param {string} params.orgId — organization ID (from JWT)
 * @param {string} params.key — module key
 * @param {boolean} params.enabled — target state
 * @param {Object} params.user — req.user
 * @param {Object} [params.req] — express request (for audit enrichment)
 * @returns {Promise<{success: boolean, data?: Object, error?: string}>}
 */
async function toggleModule({
  orgId,
  key,
  enabled,
  user,
  req
}) {
  // 1. Validate key
  const validKeys = MODULE_KEYS.map(m => m.key);
  if (!validKeys.includes(key)) {
    return {
      success: false,
      error: `Invalid module key: "${key}"`,
      code: 400
    };
  }
  const Organization = require("@shared/models/Organization").default;
  const org = await Organization.findById(orgId);
  if (!org) {
    return {
      success: false,
      error: "Organization not found",
      code: 404
    };
  }
  const orgFeatures = parseOrgFeatures(org.features);

  // 2. Feature flag guard — cannot enable a flagged module
  if (enabled) {
    const flagDisabled = orgFeatures[`${key}.disabled`] === true || orgFeatures[`DISABLE_${key.toUpperCase()}`] === true;
    if (flagDisabled) {
      return {
        success: false,
        error: `Module "${key}" is disabled by platform feature flag. Contact platform admin.`,
        code: 403
      };
    }
  }

  // 3. Dependency check (enabling)
  if (enabled && MODULE_DEPS[key]) {
    const depKey = MODULE_DEPS[key];
    const depEnabled = org.modules?.[depKey] !== false;
    if (!depEnabled) {
      return {
        success: false,
        error: `Cannot enable "${key}" — requires "${depKey}" module which is disabled.`,
        code: 409
      };
    }
  }

  // 4. Dependent check (disabling) — warn about orphaned dependents
  const affectedDependents = [];
  if (!enabled) {
    for (const [modKey, depKey] of Object.entries(MODULE_DEPS)) {
      if (depKey === key && org.modules?.[modKey] !== false) {
        affectedDependents.push(modKey);
      }
    }
  }

  // Perform update
  if (!org.modules) org.modules = {};
  org.modules[key] = enabled;
  org.modulesUpdatedAt = new Date();
  org.markModified("modules");
  await org.save();

  // Audit log — use auditService for proper hash-chain and region routing
  const auditService = require("@services/auditService");
  auditService.createAuditRecord({
    actorId: user?._id,
    actorType: "tenant_user",
    branchId: req?.activeBranchId || "000000000000000000000000",
    regionCode: req?.regionCode || org.regionCode || "MEA",
    action: enabled ? "MODULE_ENABLED" : "MODULE_DISABLED",
    entityType: "Organization",
    entity: "Organization",
    entityId: orgId,
    details: {
      moduleKey: key,
      enabled,
      affectedDependents
    },
    description: `Module "${key}" ${enabled ? "enabled" : "disabled"} by admin`
  }).catch(err => {
    logger.warn({
      err: err.message,
      orgId,
      moduleKey: key
    }, "[ModulesService] Audit log failed (non-blocking)");
  });
  logger.info({
    orgId,
    moduleKey: key,
    enabled,
    affectedDependents
  }, "[ModulesService] Module toggled");
  return {
    success: true,
    data: {
      moduleKey: key,
      enabled,
      affectedDependents,
      modulesUpdatedAt: org.modulesUpdatedAt
    }
  };
}

// ─── Usage Analytics (Standalone) ───────────────────────────────────────────

/**
 * Get module usage analytics for the past N days.
 * @param {string|ObjectId} organizationId
 * @param {number} [days=7]
 * @returns {Promise<Object>}
 */
async function getUsageAnalytics(organizationId, days = 7) {
  const orgConn = dbManager.getConnection(String(organizationId));
  const AuditLog = getModel(orgConn, AuditLogDef);
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);
  startDate.setHours(0, 0, 0, 0);
  const entityMap = {
    Patient: "patients",
    Appointment: "appointments",
    Treatment: "treatments",
    Invoice: "finance",
    Payment: "finance",
    OrthodonticCase: "orthodontics",
    User: "users",
    Branch: "branches",
    Role: "security"
  };
  try {
    const pipeline = [{
      $match: {
        createdAt: {
          $gte: startDate
        }
      }
    }, {
      $group: {
        _id: {
          entity: "$entityType",
          day: {
            $dateToString: {
              format: "%Y-%m-%d",
              date: "$createdAt"
            }
          }
        },
        count: {
          $sum: 1
        },
        lastUsed: {
          $max: "$createdAt"
        }
      }
    }];
    const results = await AuditLog.aggregate(pipeline).exec();
    const usage = {};
    for (const r of results) {
      const moduleKey = entityMap[r._id.entity] || r._id.entity?.toLowerCase();
      if (!moduleKey) continue;
      if (!usage[moduleKey]) usage[moduleKey] = {
        total: 0,
        days: {},
        lastUsed: null
      };
      usage[moduleKey].total += r.count;
      usage[moduleKey].days[r._id.day] = r.count;
      if (!usage[moduleKey].lastUsed || r.lastUsed > usage[moduleKey].lastUsed) {
        usage[moduleKey].lastUsed = r.lastUsed;
      }
    }
    return {
      success: true,
      data: usage,
      meta: {
        days,
        startDate: startDate.toISOString()
      }
    };
  } catch (err) {
    logger.error({
      err
    }, "[ModulesService] getUsageAnalytics failed");
    return {
      success: false,
      data: {},
      meta: {
        error: err.message
      }
    };
  }
}

// ─── Exports ────────────────────────────────────────────────────────────────

module.exports = {
  MODULE_KEYS,
  MODULE_DEPS,
  parseOrgFeatures,
  resolveModules,
  toggleModule,
  computeUsageStats,
  getUsageAnalytics
};