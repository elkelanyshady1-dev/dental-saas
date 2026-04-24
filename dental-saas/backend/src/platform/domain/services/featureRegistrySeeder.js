/**
 * featureRegistrySeeder.js — Bootstrap DB from Static Feature Registry
 *
 * TASK-ENTITLEMENT-FULLSTACK-001
 *
 * Idempotent seeder that creates ModuleDefinition and FeatureDefinition
 * documents from the static FEATURE_REGISTRY on first boot.
 *
 * Behavior:
 *   - If a module/feature already exists in DB → skip (no overwrite)
 *   - Only inserts missing entries
 *   - Runs at app startup (after MongoDB connection)
 *   - Safe to run multiple times
 *
 * PLANE: Platform utility.
 */

"use strict";

const getPlatformModel = require("@core/db/getPlatformModel");
const {
  FEATURE_REGISTRY
} = require("../../featureRegistry");
const ModuleDefinitionDef = require("../models/ModuleDefinition.model");
const ModuleDefinition = getPlatformModel(ModuleDefinitionDef);
const FeatureDefinitionDef = require("../models/FeatureDefinition.model");
const FeatureDefinition = getPlatformModel(FeatureDefinitionDef);
const logger = require("@utils/logger");

// Category mapping for better UI grouping
const CATEGORY_MAP = {
  patients: "core",
  appointments: "core",
  users: "core",
  branches: "core",
  notifications: "core",
  clinical: "clinical",
  settings: "core",
  finance: "business",
  orthodontics: "clinical",
  analytics: "business",
  inventory: "business",
  booking: "business",
  lab: "clinical",
  communication: "communication"
};

// Icon mapping for UI
const ICON_MAP = {
  patients: "Users",
  appointments: "Calendar",
  users: "UserCog",
  branches: "Building",
  notifications: "Bell",
  clinical: "Stethoscope",
  settings: "Settings",
  finance: "DollarSign",
  orthodontics: "Smile",
  analytics: "BarChart3",
  inventory: "Boxes",
  booking: "Globe",
  lab: "FlaskConical",
  communication: "MessageCircle"
};

/**
 * Seed the feature registry DB from the static FEATURE_REGISTRY.
 * Idempotent — only inserts entries that don't already exist.
 *
 * @returns {Promise<{ modulesCreated: number, featuresCreated: number }>}
 */
async function seedFeatureRegistry() {
  let modulesCreated = 0;
  let featuresCreated = 0;
  const entries = Object.entries(FEATURE_REGISTRY);
  let sortOrder = 0;
  for (const [moduleKey, def] of entries) {
    // ── Skip runtime-only sub-mount entries ──────────────────────────
    // Entries where the registry key differs from def.module are routing
    // sub-mounts (e.g. procedures→clinical, invoices→finance). They share
    // the parent module's domain key and should NOT be seeded separately.
    if (moduleKey !== def.module) continue;
    sortOrder += 10;

    // ── Seed Module ─────────────────────────────────────────────────
    const existingModule = await ModuleDefinition.findOne({
      key: moduleKey
    });
    if (!existingModule) {
      // Compute plan access from static registry
      const plans = {
        basic: def.plans.includes("basic"),
        pro: def.plans.includes("pro"),
        enterprise: def.plans.includes("enterprise")
      };
      const featureCount = def.features ? Object.keys(def.features).length : 0;
      await ModuleDefinition.create({
        key: moduleKey,
        schemaKey: def.schemaKey || moduleKey,
        displayName: def.label,
        description: `${def.label} module`,
        isCore: def.isCore,
        enabled: true,
        plans,
        sortOrder,
        icon: ICON_MAP[moduleKey] || "Package",
        category: CATEGORY_MAP[moduleKey] || "addons",
        featureCount
      });
      modulesCreated++;
      logger.info({
        key: moduleKey
      }, "[FeatureRegistrySeeder] Module created");
    }

    // ── Seed Features ───────────────────────────────────────────────
    if (def.features) {
      for (const [featureKey, featureDef] of Object.entries(def.features)) {
        const fullKey = `${moduleKey}.${featureKey}`;
        const existingFeature = await FeatureDefinition.findOne({
          key: fullKey
        });
        if (!existingFeature) {
          // Inherit plan access from parent module
          const plans = {
            basic: def.plans.includes("basic"),
            pro: def.plans.includes("pro"),
            enterprise: def.plans.includes("enterprise")
          };

          // Generate human-readable display name from key
          const displayName = featureKey.replace(/([A-Z])/g, " $1").replace(/^./, s => s.toUpperCase()).trim();
          await FeatureDefinition.create({
            key: fullKey,
            module: moduleKey,
            displayName,
            description: `${displayName} feature`,
            permission: featureDef.permission || "",
            premium: featureDef.premium || false,
            enabled: true,
            plans,
            metadata: {}
          });
          featuresCreated++;
        }
      }
    }
  }
  if (modulesCreated > 0 || featuresCreated > 0) {
    logger.info({
      modulesCreated,
      featuresCreated
    }, "[FeatureRegistrySeeder] Seed complete");
  } else {
    logger.debug("[FeatureRegistrySeeder] Registry already seeded — no changes");
  }
  return {
    modulesCreated,
    featuresCreated
  };
}
module.exports = {
  seedFeatureRegistry
};