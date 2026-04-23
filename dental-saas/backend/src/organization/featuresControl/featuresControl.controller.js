/**
 * featuresControl.controller.js — Phase 25 Features Control Center API
 *
 * Provides endpoints for the Features & Modules Control Center:
 *   1. GET /modules          — module states with usage stats
 *   2. GET /features         — feature decisions with auth chain
 *   3. GET /permissions      — role × permission matrix (live from DB)
 *   4. GET /conflicts        — smart conflict detection
 *   5. POST /simulate        — auth decision simulation
 *   6. PATCH /modules/:key   — toggle module (org_admin only)
 *
 * GUARD: SECURITY_MANAGE (enforced by route-level middleware)
 * PLANE: Org only.
 * CACHE: Redis-backed with graceful fallback.
 */

"use strict";

const {
  P,
  ORG_ROLE_PERMISSIONS,
  ORG_ROLES
} = require("../../rbac/orgPermissions");
const {
  policies
} = require("../../rbac/policyRegistry");
const {
  evaluatePolicy
} = require("../../rbac/policyEvaluator");
const logger = require("@utils/logger");
const cache = require("../security/securityCache");
const getModel = require("@core/db/getModel");
const AuditLogDef = require("../../shared/models/AuditLog");
const RoleDef = require("../../shared/models/Role");

// ─── Cache Keys ─────────────────────────────────────────────────────────────

const TTL = {
  MODULES: 30,
  // 30s — includes live counts
  FEATURES: 30,
  // 30s — decision chains
  PERMISSIONS: 120,
  // 2min — role matrix rarely changes mid-session
  CONFLICTS: 60 // 1min — conflict analysis
};
function modulesKey(orgId) {
  return `fcc:modules:${orgId}`;
}
function featuresKey(orgId) {
  return `fcc:features:${orgId}`;
}
function permissionsKey(orgId) {
  return `fcc:permissions:${orgId}`;
}
function conflictsKey(orgId) {
  return `fcc:conflicts:${orgId}`;
}

// ─── 1. GET /modules ────────────────────────────────────────────────────────

/**
 * Returns all modules with their computed states:
 *   - enabled / disabled / locked (plan) / flagged (feature flag override)
 *   - usage stats (today's action count per module)
 *   - dependency info
 */
async function getModules(req, res) {
  try {
    const orgId = req.context?.organizationId;

    // Cache check
    const cacheK = modulesKey(orgId);
    const cached = await cache.getCache(cacheK);
    if (cached) return res.json(cached);
    if (!orgId) {
      return res.status(404).json({
        success: false,
        message: "Organization context missing"
      });
    }

    // Phase 8: Use req.capabilities as SSOT instead of req.organization
    const capModules = req.capabilities?.modules || {};
    const capFeatures = req.capabilities?.features || {};

    // Module registry definition (server-side, matches frontend moduleRegistry)
    const MODULE_KEYS = [{
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
    }];

    // Compute usage stats from audit log (today's count per module)
    const AuditLog = getModel(req.dbConnection, AuditLogDef);
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    let usageCounts = {};
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
      for (const r of results) {
        // Map entityType to module key
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
        const moduleKey = entityMap[r._id] || r._id?.toLowerCase();
        if (moduleKey) {
          usageCounts[moduleKey] = (usageCounts[moduleKey] || 0) + r.count;
        }
      }
    } catch {
      // Non-critical — fallback to 0
    }

    // Compute states
    const modules = MODULE_KEYS.map(mod => {
      const inPlan = capModules[mod.key];
      const flagDisabled = capFeatures[`${mod.key}.disabled`] === true;
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
    const response = {
      success: true,
      data: {
        modules
      },
      meta: {
        lastUpdated: new Date().toISOString()
      }
    };
    await cache.setCache(cacheK, response, TTL.MODULES);
    return res.json(response);
  } catch (err) {
    logger.error({
      err
    }, "[FeaturesControl] getModules failed");
    return res.status(500).json({
      success: false,
      message: "Failed to load modules"
    });
  }
}

// ─── 2. GET /features ───────────────────────────────────────────────────────

/**
 * Returns all features with computed auth decision chains.
 * Each feature includes:
 *   - Plan (entitlement) check
 *   - Feature Flag check
 *   - RBAC (role) check
 *   - Policy (resource) check
 */
async function getFeatures(req, res) {
  try {
    const orgId = req.context?.organizationId;
    const capModules = req.capabilities?.modules || {};
    const capFeatures = req.capabilities?.features || {};
    const cacheK = featuresKey(orgId);
    const cached = await cache.getCache(cacheK);
    if (cached) return res.json(cached);
    if (!orgId) {
      return res.status(404).json({
        success: false,
        message: "Organization context missing"
      });
    }

    // Feature definitions (mirroring frontend moduleRegistry features)
    const FEATURE_DEFS = [{
      key: "patients.read",
      name: "View Patients",
      moduleKey: "patients",
      module: "Patients",
      risk: "low",
      source: "admin"
    }, {
      key: "patients.create",
      name: "Create Patients",
      moduleKey: "patients",
      module: "Patients",
      risk: "medium",
      source: "admin"
    }, {
      key: "patients.update",
      name: "Edit Patients",
      moduleKey: "patients",
      module: "Patients",
      risk: "medium",
      source: "admin"
    }, {
      key: "patients.delete",
      name: "Delete Patients",
      moduleKey: "patients",
      module: "Patients",
      risk: "critical",
      source: "admin"
    }, {
      key: "appointments.read",
      name: "View Appointments",
      moduleKey: "appointments",
      module: "Appointments",
      risk: "low",
      source: "admin"
    }, {
      key: "appointments.create",
      name: "Book Appointments",
      moduleKey: "appointments",
      module: "Appointments",
      risk: "low",
      source: "admin"
    }, {
      key: "appointments.update",
      name: "Modify Appointments",
      moduleKey: "appointments",
      module: "Appointments",
      risk: "medium",
      source: "admin"
    }, {
      key: "appointments.delete",
      name: "Cancel Appointments",
      moduleKey: "appointments",
      module: "Appointments",
      risk: "medium",
      source: "admin"
    }, {
      key: "treatments.read",
      name: "View Treatments",
      moduleKey: "treatments",
      module: "Clinical Treatments",
      risk: "low",
      source: "admin"
    }, {
      key: "treatments.create",
      name: "Create Treatments",
      moduleKey: "treatments",
      module: "Clinical Treatments",
      risk: "medium",
      source: "admin"
    }, {
      key: "treatments.update",
      name: "Modify Treatments",
      moduleKey: "treatments",
      module: "Clinical Treatments",
      risk: "medium",
      source: "admin"
    }, {
      key: "orthodontics.read",
      name: "View Cases",
      moduleKey: "orthodontics",
      module: "Orthodontics",
      risk: "low",
      source: "plan"
    }, {
      key: "orthodontics.full",
      name: "Manage Cases (All Clinical Operations)",
      moduleKey: "orthodontics",
      module: "Orthodontics",
      risk: "medium",
      source: "plan"
    }, {
      key: "accounting.read",
      name: "View Finances",
      moduleKey: "finance",
      module: "Finance & Billing",
      risk: "medium",
      source: "admin"
    }, {
      key: "accounting.create",
      name: "Create Invoices",
      moduleKey: "finance",
      module: "Finance & Billing",
      risk: "medium",
      source: "admin"
    }, {
      key: "accounting.update",
      name: "Process Payments",
      moduleKey: "finance",
      module: "Finance & Billing",
      risk: "critical",
      source: "admin"
    }, {
      key: "inventory.read",
      name: "View Inventory",
      moduleKey: "inventory",
      module: "Inventory",
      risk: "low",
      source: "admin"
    }, {
      key: "inventory.create",
      name: "Add Stock",
      moduleKey: "inventory",
      module: "Inventory",
      risk: "low",
      source: "admin"
    }, {
      key: "analytics.read",
      name: "View Analytics",
      moduleKey: "analytics",
      module: "Analytics & Reports",
      risk: "low",
      source: "plan"
    }, {
      key: "analytics.export",
      name: "Export Reports",
      moduleKey: "analytics",
      module: "Analytics & Reports",
      risk: "medium",
      source: "plan"
    }, {
      key: "security.read",
      name: "View Audit Logs",
      moduleKey: "security",
      module: "Security Center",
      risk: "critical",
      source: "admin"
    }, {
      key: "security.manage",
      name: "Manage Security",
      moduleKey: "security",
      module: "Security Center",
      risk: "critical",
      source: "admin"
    }, {
      key: "users.read",
      name: "View Staff",
      moduleKey: "users",
      module: "Staff Management",
      risk: "low",
      source: "admin"
    }, {
      key: "users.create",
      name: "Add Staff",
      moduleKey: "users",
      module: "Staff Management",
      risk: "medium",
      source: "admin"
    }, {
      key: "users.update",
      name: "Edit Staff",
      moduleKey: "users",
      module: "Staff Management",
      risk: "medium",
      source: "admin"
    }, {
      key: "users.delete",
      name: "Remove Staff",
      moduleKey: "users",
      module: "Staff Management",
      risk: "critical",
      source: "admin"
    }, {
      key: "branches.read",
      name: "View Branches",
      moduleKey: "branches",
      module: "Branches",
      risk: "low",
      source: "admin"
    }, {
      key: "branches.create",
      name: "Add Branches",
      moduleKey: "branches",
      module: "Branches",
      risk: "medium",
      source: "plan"
    }];

    // Current user's role permissions for RBAC check
    const userPermissions = req.user?.permissions || [];
    const userCapabilities = req.capabilities || {};
    const features = FEATURE_DEFS.map(feat => {
      const moduleEnabled = capModules[feat.moduleKey] !== false;
      const flagEnabled = capFeatures[`${feat.key}.disabled`] !== true;
      const rbacGranted = Array.isArray(userPermissions) ? userPermissions.includes(feat.key) : !!userCapabilities[feat.key];
      const hasPolicyRules = !!(policies[feat.key] && policies[feat.key].length > 0);

      // Decision chain
      const decisionChain = [{
        label: "Plan (Entitlement)",
        passed: moduleEnabled,
        detail: moduleEnabled ? "allowed" : "module locked"
      }, {
        label: "Feature Flag",
        passed: flagEnabled,
        detail: flagEnabled ? "enabled" : "disabled by platform"
      }, {
        label: "RBAC (Role)",
        passed: rbacGranted,
        detail: rbacGranted ? "granted" : "not in role"
      }, {
        label: "Policy (Resource)",
        passed: true,
        detail: hasPolicyRules ? `${policies[feat.key].length} rules active` : "no restrictions"
      }];
      let status;
      if (!moduleEnabled) status = "locked";else if (!flagEnabled) status = "flag";else if (rbacGranted) status = "on";else status = "off";
      return {
        ...feat,
        status,
        decisionChain
      };
    });
    const response = {
      success: true,
      data: {
        features
      },
      meta: {
        lastUpdated: new Date().toISOString()
      }
    };
    await cache.setCache(cacheK, response, TTL.FEATURES);
    return res.json(response);
  } catch (err) {
    logger.error({
      err
    }, "[FeaturesControl] getFeatures failed");
    return res.status(500).json({
      success: false,
      message: "Failed to load features"
    });
  }
}

// ─── 3. GET /permissions ────────────────────────────────────────────────────

/**
 * Returns live role × permission matrix from the database.
 * Shape: { roles: [...], permissions: [...], matrix: { roleKey: { permKey: state } } }
 */
async function getPermissions(req, res) {
  try {
    const orgId = req.organizationId;
    const cacheK = permissionsKey(orgId);
    const cached = await cache.getCache(cacheK);
    if (cached) return res.json(cached);

    // Load roles from database — RLS-enforced via secureModel
    const Role = getModel(req.dbConnection, RoleDef);
    const dbRoles = await Role.find({}).lean();

    // Build role list and matrix
    const roles = [];
    const matrix = {};
    for (const role of dbRoles) {
      const roleName = role.name;
      const roleKey = role.slug || roleName.toLowerCase().replace(/\s+/g, "_");
      roles.push({
        key: roleKey,
        name: roleName,
        id: role._id.toString()
      });
      const perms = role.permissions || [];
      matrix[roleKey] = {};

      // Map all defined permissions
      for (const perm of Object.values(P)) {
        if (perms.includes(perm)) {
          matrix[roleKey][perm] = "granted";
        } else {
          matrix[roleKey][perm] = false;
        }
      }
    }

    // Build the permissions list
    const permissions = Object.entries(P).map(([constName, permStr]) => ({
      key: permStr,
      label: permStr.replace(".", " — ").replace(/^\w/, c => c.toUpperCase())
    }));

    // Deduplicate permissions (some are aliased like FINANCE_READ → accounting.read)
    const seen = new Set();
    const uniquePermissions = permissions.filter(p => {
      if (seen.has(p.key)) return false;
      seen.add(p.key);
      return true;
    });
    const response = {
      success: true,
      data: {
        roles,
        permissions: uniquePermissions,
        matrix
      },
      meta: {
        lastUpdated: new Date().toISOString()
      }
    };
    await cache.setCache(cacheK, response, TTL.PERMISSIONS);
    return res.json(response);
  } catch (err) {
    logger.error({
      err
    }, "[FeaturesControl] getPermissions failed");
    return res.status(500).json({
      success: false,
      message: "Failed to load permissions"
    });
  }
}

// ─── 4. GET /conflicts ──────────────────────────────────────────────────────

/**
 * Smart conflict detection engine.
 * Detects:
 *   - Flag overrides (module disabled by feature flag)
 *   - Missing dependency (enabled module depends on disabled module)
 *   - Permission gap (RBAC grants permission but module is disabled)
 *   - Shadow mode drift (policies in shadow vs enforcing)
 */
async function getConflicts(req, res) {
  try {
    const orgId = req.context?.organizationId;
    const capModules = req.capabilities?.modules || {};
    const capFeatures = req.capabilities?.features || {};
    const cacheK = conflictsKey(orgId);
    const cached = await cache.getCache(cacheK);
    if (cached) return res.json(cached);
    if (!orgId) {
      return res.status(404).json({
        success: false,
        message: "Organization context missing"
      });
    }
    const conflicts = [];

    // Module definitions for conflict analysis
    const MODULE_DEPS = {
      appointments: "patients",
      calendar: "appointments",
      treatments: "patients",
      orthodontics: "patients",
      communication: "patients",
      portal: "patients"
    };

    // 1. Flag overrides
    for (const modKey of Object.keys(orgModules)) {
      if (orgFeatures[`${modKey}.disabled`] === true || orgFeatures[`DISABLE_${modKey.toUpperCase()}`] === true) {
        conflicts.push({
          id: `flag_override_${modKey}`,
          type: "flag_override",
          severity: "high",
          icon: "🚩",
          message: `${modKey} module is disabled by a platform feature flag`,
          source: "flag",
          moduleKey: modKey,
          recommendation: "Contact platform admin to remove the feature flag override."
        });
      }
    }

    // 2. Missing dependencies
    for (const [modKey, depKey] of Object.entries(MODULE_DEPS)) {
      const modEnabled = orgModules[modKey] !== false;
      const depEnabled = orgModules[depKey] !== false;
      if (modEnabled && !depEnabled) {
        conflicts.push({
          id: `missing_dep_${modKey}_${depKey}`,
          type: "missing_dependency",
          severity: "critical",
          icon: "🔗",
          message: `${modKey} depends on ${depKey} which is disabled`,
          source: "system",
          moduleKey: modKey,
          dependencyKey: depKey,
          recommendation: `Enable the ${depKey} module or disable ${modKey}.`
        });
      }
    }

    // 3. Permission gap analysis
    const Role = getModel(req.dbConnection, RoleDef);
    let dbRoles = [];
    try {
      dbRoles = await Role.find({}).lean();
    } catch {/* non-critical */}
    const modulePermMap = {
      patients: ["patients.read", "patients.create", "patients.update", "patients.delete"],
      appointments: ["appointments.read", "appointments.create", "appointments.update", "appointments.delete"],
      treatments: ["treatments.read", "treatments.create", "treatments.update"],
      orthodontics: ["orthodontics.full", "orthodontics.read"],
      // Phase 30: two-permission model
      finance: ["accounting.read", "accounting.create", "accounting.update", "accounting.delete"],
      inventory: ["inventory.read", "inventory.create", "inventory.update", "inventory.delete"],
      security: ["security.read", "security.manage"]
    };
    for (const role of dbRoles) {
      const perms = role.permissions || [];
      for (const [modKey, modPerms] of Object.entries(modulePermMap)) {
        if (orgModules[modKey] === false) {
          const grantedInDisabled = modPerms.filter(p => perms.includes(p));
          if (grantedInDisabled.length > 0) {
            conflicts.push({
              id: `perm_gap_${role.slug || role.name}_${modKey}`,
              type: "permission_gap",
              severity: "medium",
              icon: "⚠️",
              message: `Role "${role.name}" has ${grantedInDisabled.length} permission(s) for disabled module "${modKey}"`,
              source: "admin",
              roleKey: role.slug || role.name,
              moduleKey: modKey,
              permissions: grantedInDisabled,
              recommendation: `Remove ${modKey} permissions from "${role.name}" or enable the module.`
            });
          }
        }
      }
    }

    // 4. Shadow mode drift
    const {
      getShadowConfig
    } = require("../../rbac/shadowMode");
    const shadowConfig = getShadowConfig();
    if (shadowConfig.enabled) {
      conflicts.push({
        id: "shadow_mode_active",
        type: "shadow_mode",
        severity: "low",
        icon: "👁️",
        message: "Policy shadow mode is active — denials are logged but not enforced",
        source: "system",
        recommendation: "Review shadow mode logs and transition to enforcement when ready."
      });
    }
    const response = {
      success: true,
      data: {
        conflicts,
        summary: {
          total: conflicts.length,
          critical: conflicts.filter(c => c.severity === "critical").length,
          high: conflicts.filter(c => c.severity === "high").length,
          medium: conflicts.filter(c => c.severity === "medium").length,
          low: conflicts.filter(c => c.severity === "low").length
        }
      },
      meta: {
        lastUpdated: new Date().toISOString()
      }
    };
    await cache.setCache(cacheK, response, TTL.CONFLICTS);
    return res.json(response);
  } catch (err) {
    logger.error({
      err
    }, "[FeaturesControl] getConflicts failed");
    return res.status(500).json({
      success: false,
      message: "Failed to detect conflicts"
    });
  }
}

// ─── 5. POST /simulate ──────────────────────────────────────────────────────

/**
 * Simulate an authorization decision for a given permission.
 * Uses the real policy engine with req.user context.
 * Body: { permission: "patients.update", resourceId?: "..." }
 */
async function simulateDecision(req, res) {
  try {
    const {
      permission,
      resourceId
    } = req.body;
    if (!permission) {
      return res.status(400).json({
        success: false,
        message: "permission is required"
      });
    }
    const user = req.user;
    // Phase 8: Use req.capabilities SSOT
    const capModules = req.capabilities?.modules || {};
    const capFeatures = req.capabilities?.features || {};

    // Step 1: Entitlement check
    const permModule = permission.split(".")[0];
    const moduleMap = {
      patients: "patients",
      appointments: "appointments",
      treatments: "treatments",
      orthodontics: "orthodontics",
      accounting: "finance",
      inventory: "inventory",
      security: "security",
      users: "users",
      branches: "branches",
      lab: "lab",
      analytics: "analytics",
      communication: "communication",
      dashboard: "dashboard"
    };
    const moduleKey = moduleMap[permModule] || permModule;
    const entitlementPassed = capModules[moduleKey] !== false;

    // Step 2: Feature flag check
    const flagPassed = capFeatures[`${moduleKey}.disabled`] !== true;

    // Step 3: RBAC check
    const userPerms = user?.permissions || [];
    const rbacPassed = userPerms.includes(permission);

    // Step 4: Policy evaluation
    let policyResult = {
      allowed: true,
      reason: "no policy rules"
    };
    try {
      if (policies[permission] && policies[permission].length > 0) {
        const evalResult = evaluatePolicy(permission, {
          userId: user?._id,
          role: user?.role?.slug || user?.role
        }, resourceId ? {
          _id: resourceId
        } : null);
        policyResult = evalResult;
      }
    } catch {
      policyResult = {
        allowed: true,
        reason: "policy evaluation skipped"
      };
    }
    const steps = [{
      layer: "Entitlement",
      passed: entitlementPassed,
      detail: entitlementPassed ? `Module "${moduleKey}" is enabled` : `Module "${moduleKey}" is locked by plan`
    }, {
      layer: "Feature Flag",
      passed: flagPassed,
      detail: flagPassed ? "No flag override" : "Disabled by platform feature flag"
    }, {
      layer: "RBAC",
      passed: rbacPassed,
      detail: rbacPassed ? `Permission "${permission}" granted to role` : `Permission "${permission}" not in role`
    }, {
      layer: "Policy (PBAC)",
      passed: policyResult.allowed !== false,
      detail: policyResult.reason || (policyResult.allowed ? "allowed" : "denied")
    }];
    const finalAllowed = steps.every(s => s.passed);
    return res.json({
      success: true,
      data: {
        permission,
        allowed: finalAllowed,
        steps,
        user: {
          id: user?._id,
          name: user?.firstName ? `${user.firstName} ${user.lastName || ""}`.trim() : user?.email,
          role: user?.role?.name || user?.role
        },
        evaluatedAt: new Date().toISOString()
      }
    });
  } catch (err) {
    logger.error({
      err
    }, "[FeaturesControl] simulateDecision failed");
    return res.status(500).json({
      success: false,
      message: "Simulation failed"
    });
  }
}

// ─── 6. PATCH /modules/:key ─────────────────────────────────────────────────

/**
 * Toggle a module on/off for the organization.
 * Body: { enabled: true/false }
 * Emits Socket.IO event: module.updated
 */
async function toggleModule(req, res) {
  try {
    const {
      key
    } = req.params;
    const {
      enabled
    } = req.body;
    if (typeof enabled !== "boolean") {
      return res.status(400).json({
        success: false,
        message: "enabled must be a boolean"
      });
    }
    const Organization = require("../../shared/models/Organization").default; // platform model
    const org = await Organization.findById(req.organizationId);
    if (!org) {
      return res.status(404).json({
        success: false,
        message: "Organization not found"
      });
    }

    // Update module state
    if (!org.modules) org.modules = {};
    org.modules[key] = enabled;
    org.markModified("modules");
    await org.save();

    // Invalidate caches
    await cache.invalidate(modulesKey(req.organizationId), featuresKey(req.organizationId), conflictsKey(req.organizationId));

    // Audit log
    const AuditLog = getModel(req.dbConnection, AuditLogDef);
    try {
      await AuditLog.create({
        userId: req.user?._id,
        action: enabled ? "MODULE_ENABLED" : "MODULE_DISABLED",
        entityType: "Organization",
        entityId: req.organizationId,
        detail: {
          moduleKey: key,
          enabled
        }
      });
    } catch {/* non-critical */}

    // Emit Socket.IO event (if available)
    try {
      const io = req.app?.get?.("io");
      if (io) {
        io.to(`org:${req.organizationId}`).emit("module.updated", {
          moduleKey: key,
          enabled,
          updatedBy: req.user?._id,
          timestamp: new Date().toISOString()
        });
      }
    } catch {/* non-critical */}
    logger.info({
      orgId: req.organizationId,
      moduleKey: key,
      enabled
    }, "[FeaturesControl] Module toggled");
    return res.json({
      success: true,
      data: {
        moduleKey: key,
        enabled
      },
      message: `Module "${key}" ${enabled ? "enabled" : "disabled"} successfully`
    });
  } catch (err) {
    logger.error({
      err
    }, "[FeaturesControl] toggleModule failed");
    return res.status(500).json({
      success: false,
      message: "Failed to toggle module"
    });
  }
}

// ─── Exports ────────────────────────────────────────────────────────────────

module.exports = {
  getModules,
  getFeatures,
  getPermissions,
  getConflicts,
  simulateDecision,
  toggleModule
};