/**
 * featureRegistryDb.service.js — Feature Registry Database Service
 *
 * TASK-ENTITLEMENT-FULLSTACK-001
 *
 * CRUD operations for ModuleDefinition and FeatureDefinition collections.
 * Provides the data layer for the platform Feature Registry admin UI.
 *
 * IMPORTANT:
 * - This service manages RUNTIME configuration (DB-backed)
 * - The STATIC featureRegistry.js remains the code-time source of truth
 *   for key mappings and normalization functions
 * - The seeder (featureRegistrySeeder.js) bootstraps DB from static registry
 *
 * PLANE: Platform only. Must not be imported from org middleware.
 */

"use strict";

const getPlatformModel = require("@core/db/getPlatformModel");
const ModuleDefinitionDef = require("../models/ModuleDefinition.model");
const ModuleDefinition = getPlatformModel(ModuleDefinitionDef);
const FeatureDefinitionDef = require("../models/FeatureDefinition.model");
const FeatureDefinition = getPlatformModel(FeatureDefinitionDef);
const logger = require("@utils/logger");

// ─── MODULE OPERATIONS ──────────────────────────────────────────────────────

/**
 * List all module definitions, sorted by category + sortOrder.
 * @returns {Promise<ModuleDefinition[]>}
 */
async function listModules() {
  return ModuleDefinition.find().sort({
    category: 1,
    sortOrder: 1,
    key: 1
  }).lean();
}

/**
 * Get a single module by its canonical key.
 * @param {string} key
 * @returns {Promise<ModuleDefinition|null>}
 */
async function getModuleByKey(key) {
  return ModuleDefinition.findOne({
    key
  }).lean();
}

/**
 * Update a module definition by ID.
 * @param {string} id — MongoDB ObjectId
 * @param {Object} data — Fields to update
 * @returns {Promise<ModuleDefinition>}
 */
async function updateModule(id, data) {
  // Prevent changing the key or schemaKey (would break normalization)
  const safeData = {
    ...data
  };
  delete safeData.key;
  delete safeData.schemaKey;
  delete safeData.isCore;
  const updated = await ModuleDefinition.findByIdAndUpdate(id, safeData, {
    new: true,
    runValidators: true
  }).lean();
  if (!updated) {
    throw Object.assign(new Error("Module not found"), {
      status: 404
    });
  }

  // Update feature count
  const featureCount = await FeatureDefinition.countDocuments({
    module: updated.key
  });
  if (updated.featureCount !== featureCount) {
    await ModuleDefinition.findByIdAndUpdate(id, {
      featureCount
    });
  }
  logger.info({
    moduleId: id,
    key: updated.key
  }, "[FeatureRegistry] Module updated");
  return {
    ...updated,
    featureCount
  };
}

/**
 * Toggle module enabled state.
 * @param {string} id
 * @param {boolean} enabled
 * @returns {Promise<ModuleDefinition>}
 */
async function toggleModule(id, enabled) {
  return updateModule(id, {
    enabled
  });
}

// ─── FEATURE OPERATIONS ─────────────────────────────────────────────────────

/**
 * List all feature definitions, optionally filtered by module.
 * @param {string} [moduleKey] — Optional module filter
 * @returns {Promise<FeatureDefinition[]>}
 */
async function listFeatures(moduleKey) {
  const filter = moduleKey ? {
    module: moduleKey
  } : {};
  return FeatureDefinition.find(filter).sort({
    module: 1,
    key: 1
  }).lean();
}

/**
 * Get a single feature by its dot-notation key.
 * @param {string} key
 * @returns {Promise<FeatureDefinition|null>}
 */
async function getFeatureByKey(key) {
  return FeatureDefinition.findOne({
    key
  }).lean();
}

/**
 * Update a feature definition by ID.
 * @param {string} id — MongoDB ObjectId
 * @param {Object} data — Fields to update
 * @returns {Promise<FeatureDefinition>}
 */
async function updateFeature(id, data) {
  // Prevent changing the key or module (would break feature hierarchy)
  const safeData = {
    ...data
  };
  delete safeData.key;
  delete safeData.module;
  const updated = await FeatureDefinition.findByIdAndUpdate(id, safeData, {
    new: true,
    runValidators: true
  }).lean();
  if (!updated) {
    throw Object.assign(new Error("Feature not found"), {
      status: 404
    });
  }
  logger.info({
    featureId: id,
    key: updated.key
  }, "[FeatureRegistry] Feature updated");
  return updated;
}

/**
 * Bulk update plan assignments for a feature (matrix toggle).
 * @param {string} featureKey — Dot-notation feature key
 * @param {Object} plans — { basic: bool, pro: bool, enterprise: bool }
 * @returns {Promise<FeatureDefinition>}
 */
async function updateFeaturePlans(featureKey, plans) {
  const feature = await FeatureDefinition.findOneAndUpdate({
    key: featureKey
  }, {
    plans
  }, {
    new: true,
    runValidators: true
  }).lean();
  if (!feature) {
    throw Object.assign(new Error(`Feature "${featureKey}" not found`), {
      status: 404
    });
  }
  logger.info({
    featureKey,
    plans
  }, "[FeatureRegistry] Feature plans updated (matrix)");
  return feature;
}

/**
 * Bulk update plan assignments for a module (matrix toggle).
 * @param {string} moduleKey — Canonical module key
 * @param {Object} plans — { basic: bool, pro: bool, enterprise: bool }
 * @returns {Promise<ModuleDefinition>}
 */
async function updateModulePlans(moduleKey, plans) {
  const module = await ModuleDefinition.findOneAndUpdate({
    key: moduleKey
  }, {
    plans
  }, {
    new: true,
    runValidators: true
  }).lean();
  if (!module) {
    throw Object.assign(new Error(`Module "${moduleKey}" not found`), {
      status: 404
    });
  }
  logger.info({
    moduleKey,
    plans
  }, "[FeatureRegistry] Module plans updated (matrix)");
  return module;
}

// ─── FULL REGISTRY QUERY ────────────────────────────────────────────────────

/**
 * Get the complete registry — modules + features, combined for the admin UI.
 * @returns {Promise<{ modules: ModuleDefinition[], features: FeatureDefinition[], stats: Object }>}
 */
async function getFullRegistry() {
  const [modules, features] = await Promise.all([listModules(), listFeatures()]);

  // Compute stats
  const totalModules = modules.length;
  const enabledModules = modules.filter(m => m.enabled).length;
  const coreModules = modules.filter(m => m.isCore).length;
  const totalFeatures = features.length;
  const enabledFeatures = features.filter(f => f.enabled).length;
  const premiumFeatures = features.filter(f => f.premium).length;
  return {
    modules,
    features,
    stats: {
      totalModules,
      enabledModules,
      coreModules,
      totalFeatures,
      enabledFeatures,
      premiumFeatures
    }
  };
}
module.exports = {
  listModules,
  getModuleByKey,
  updateModule,
  toggleModule,
  listFeatures,
  getFeatureByKey,
  updateFeature,
  updateFeaturePlans,
  updateModulePlans,
  getFullRegistry
};