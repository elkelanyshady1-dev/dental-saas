const getPlatformModel = require("@core/db/getPlatformModel");
const FeatureDefinitionDef = require("../shared/models/FeatureDefinition");
let _FeatureDefinition_cache = null;
function FeatureDefinition() {
    return _FeatureDefinition_cache || (_FeatureDefinition_cache = getPlatformModel(FeatureDefinitionDef));
}
/**
 * Merges FeatureDefinitions with an organizational feature object.
 *
 * Rules:
 * - isCore = always true
 * - allowedPlans mismatch = false (unless overridden)
 * - overridden = keep organizational manual setting
 *
 * v2.0: features field is now Schema.Types.Mixed (plain object), not Map.
 * Mongoose Map rejects dotted keys (e.g., "patients.view").
 * All access uses bracket notation: org.features["patients.view"]
 */
async function computeOrgFeatures(org) {
  // @rls-platform-service — global feature definitions, no org-scoped req
  const definitions = await FeatureDefinition().find({});
  const computedFeatures = {};
  const currentPlan = org.subscription?.plan || "basic";

  // Helper: read from org.features regardless of whether it's a Map or Object
  const getFeature = key => {
    if (!org.features) return undefined;
    if (typeof org.features.get === "function") return org.features.get(key);
    return org.features[key];
  };
  for (const def of definitions) {
    let isEnabled = def.defaultEnabled;

    // Plan restriction
    if (def.allowedPlans && def.allowedPlans.length > 0) {
      if (!def.allowedPlans.includes(currentPlan)) {
        isEnabled = false;
      } else {
        isEnabled = true; // explicitly allowed by plan
      }
    }

    // Core overrides everything to true
    if (def.isCore) {
      isEnabled = true;
    }

    // Check if org has an existing state for this key
    const existingState = getFeature(def.key);
    if (existingState && existingState.overridden) {
      isEnabled = existingState.enabled;
    }
    computedFeatures[def.key] = {
      enabled: isEnabled,
      overridden: existingState ? existingState.overridden : false
    };
  }

  // Clean up old keys that might no longer exist in definitions (optional, but good practice)
  if (org.features) {
    const entries = typeof org.features.entries === "function" ? [...org.features.entries()] : Object.entries(org.features);
    for (const [key, value] of entries) {
      if (value?.overridden && !(key in computedFeatures)) {
        computedFeatures[key] = value; // Retain orphaned overrides just in case
      }
    }
  }
  return computedFeatures;
}
exports.initializeOrgFeatures = async org => {
  org.features = await computeOrgFeatures(org);
  // Mark features as modified so Mongoose knows to persist the Mixed field
  if (typeof org.markModified === "function") org.markModified("features");
  return org;
};
exports.applyPlanFeatures = async (org, options = {}) => {
  org.features = await computeOrgFeatures(org);
  // Mark features as modified so Mongoose knows to persist the Mixed field
  if (typeof org.markModified === "function") org.markModified("features");
  await org.save(options);
  return org;
};
exports.isFeatureEnabled = (org, featureKey) => {
  if (!org.features) return false;
  // Support both Map (legacy docs) and plain Object (new docs)
  const entry = typeof org.features.get === "function" ? org.features.get(featureKey) : org.features[featureKey];
  return entry?.enabled || false;
};