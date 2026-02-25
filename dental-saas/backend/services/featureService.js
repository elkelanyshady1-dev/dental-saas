const FeatureDefinition = require("../models/FeatureDefinition");

/**
 * Merges FeatureDefinitions with an organizational feature Map.
 * Rules:
 * - isCore = always true
 * - allowedPlans mismatch = false (unless overridden)
 * - overridden = keep organizational manual setting
 */
async function computeOrgFeatures(org) {
    const definitions = await FeatureDefinition.find({});
    const computedFeatures = new Map();

    const currentPlan = org.subscription?.plan || "basic";

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
        const existingState = org.features?.get(def.key);
        if (existingState && existingState.overridden) {
            isEnabled = existingState.enabled;
        }

        computedFeatures.set(def.key, {
            enabled: isEnabled,
            overridden: existingState ? existingState.overridden : false
        });
    }

    // Clean up old keys that might no longer exist in definitions (optional, but good practice)
    if (org.features) {
        for (const [key, value] of org.features.entries()) {
            if (value.overridden && !computedFeatures.has(key)) {
                computedFeatures.set(key, value); // Retain orphaned overrides just in case
            }
        }
    }

    return computedFeatures;
}

exports.initializeOrgFeatures = async (org) => {
    org.features = await computeOrgFeatures(org);
    return org;
};

exports.applyPlanFeatures = async (org) => {
    org.features = await computeOrgFeatures(org);
    await org.save();
    return org;
};

exports.isFeatureEnabled = (org, featureKey) => {
    return org.features?.get(featureKey)?.enabled || false;
};
