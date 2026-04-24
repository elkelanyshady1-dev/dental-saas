const getPlatformModel = require("@core/db/getPlatformModel");
const FeatureDefinitionDef = require("@shared/models/FeatureDefinition");
const FeatureDefinition = getPlatformModel(FeatureDefinitionDef);
const OrganizationDef = require("@shared/models/Organization");
const Organization = getPlatformModel(OrganizationDef);
const featureService = require("../../services/featureService");

// ─── GET /api/platform/features ─────────────────────────────────────────────
exports.getAllFeatures = async (req, res) => {
  try {
    const features = await FeatureDefinition.find().sort({
      createdAt: -1
    });
    res.json(features);
  } catch (err) {
    res.status(500).json({
      message: err.message
    });
  }
};

// ─── POST /api/platform/features ────────────────────────────────────────────
exports.createFeature = async (req, res) => {
  try {
    const {
      key,
      name,
      description,
      category,
      defaultEnabled,
      isCore,
      allowedPlans,
      allowedRoles
    } = req.body;
    const exists = await FeatureDefinition.findOne({
      key
    });
    if (exists) {
      return res.status(400).json({
        message: `Feature key '${key}' already exists.`
      });
    }
    const feature = new FeatureDefinition({
      key,
      name,
      description,
      category,
      defaultEnabled,
      isCore,
      allowedPlans,
      allowedRoles
    });
    await feature.save();
    await AuditLog.create({
      organizationId: null,
      // Platform level
      actorType: "platform_user",
      actorId: req.platformUser._id,
      action: "PLATFORM_FEATURE_CREATED",
      success: true,
      details: `Feature created: ${key}`,
      ipAddress: req.ip,
      userAgent: req.headers["user-agent"]
    });
    res.status(201).json(feature);
  } catch (err) {
    res.status(500).json({
      message: err.message
    });
  }
};

// ─── PUT /api/platform/features/:id ─────────────────────────────────────────
exports.updateFeature = async (req, res) => {
  try {
    const feature = await FeatureDefinition.findById(req.params.id);
    if (!feature) {
      return res.status(404).json({
        message: "Feature not found"
      });
    }
    const {
      name,
      description,
      category,
      defaultEnabled,
      allowedPlans,
      allowedRoles
    } = req.body;
    feature.name = name ?? feature.name;
    feature.description = description ?? feature.description;
    feature.category = category ?? feature.category;
    feature.defaultEnabled = defaultEnabled ?? feature.defaultEnabled;
    feature.allowedPlans = allowedPlans ?? feature.allowedPlans;
    feature.allowedRoles = allowedRoles ?? feature.allowedRoles;

    // isCore cannot be modified easily here to prevent accidental lockouts, 
    // but if absolutely needed, we would add strict conditions.

    await feature.save();
    await AuditLog.create({
      organizationId: null,
      actorType: "platform_user",
      actorId: req.platformUser._id,
      action: "PLATFORM_FEATURE_UPDATED",
      success: true,
      details: `Feature updated: ${feature.key}`,
      ipAddress: req.ip,
      userAgent: req.headers["user-agent"]
    });
    res.json(feature);
  } catch (err) {
    res.status(500).json({
      message: err.message
    });
  }
};

// ─── PATCH /api/platform/org/:orgId/feature/:key ────────────────────────────
exports.overrideOrganizationFeature = async (req, res) => {
  try {
    const {
      orgId,
      key
    } = req.params;
    const {
      enabled,
      resetOverride
    } = req.body;
    const org = await Organization.findById(orgId);
    if (!org) return res.status(404).json({
      message: "Organization not found"
    });
    const featureDef = await FeatureDefinition.findOne({
      key
    });
    if (!featureDef) return res.status(404).json({
      message: "Feature definition not found"
    });
    if (featureDef.isCore && !enabled && !resetOverride) {
      return res.status(400).json({
        message: "Cannot explicitly disable a core feature."
      });
    }

    // Initialize features object if it doesn't exist
    if (!org.features) org.features = {};
    if (resetOverride) {
      const current = org.features[key] || {
        enabled: featureDef.defaultEnabled,
        overridden: false
      };
      org.features[key] = {
        ...current,
        overridden: false
      };
    } else {
      org.features[key] = {
        enabled,
        overridden: true
      };
    }

    // Mixed type requires explicit markModified for Mongoose to detect changes
    org.markModified("features");
    await org.save();

    // Recompute feature state cleanly using the service after an override manipulation
    await featureService.applyPlanFeatures(org);
    await AuditLog.create({
      organizationId: org._id,
      actorType: "platform_user",
      actorId: req.platformUser._id,
      action: "PLATFORM_ORG_FEATURE_OVERRIDE",
      success: true,
      details: resetOverride ? `Reset override for ${key}` : `Overrode ${key} to ${enabled}`,
      ipAddress: req.ip,
      userAgent: req.headers["user-agent"]
    });
    res.json({
      message: "Feature override applied",
      features: org.features
    });
  } catch (err) {
    res.status(500).json({
      message: err.message
    });
  }
};