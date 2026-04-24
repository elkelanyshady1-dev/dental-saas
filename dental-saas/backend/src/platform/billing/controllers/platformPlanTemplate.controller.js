/**
 * platformPlanTemplate.controller.js
 * Commercial Product Engine — PlanTemplate API
 *
 * PLANE: Platform
 * COLLECTION: plantemplates
 *
 * Endpoints:
 *   GET  /api/platform/plan-templates         → list templates
 *   GET  /api/platform/plan-templates/:id     → get by ID (with versions)
 *   POST /api/platform/plan-templates         → create draft template
 *   PATCH /api/platform/plan-templates/:id    → update template (OAV)
 *
 * Guards:
 *   GET   → platformProtect + VIEW_PLATFORM_ANALYTICS
 *   POST  → platformProtect + MANAGE_SUBSCRIPTIONS + superAdminOnly
 *   PATCH → platformProtect + MANAGE_SUBSCRIPTIONS + superAdminOnly
 */

"use strict";

const getPlatformModel = require("@core/db/getPlatformModel");
const PlanTemplateDef = require("../models/PlanTemplate.model");
let _PlanTemplate_cache = null;
function PlanTemplate() {
    return _PlanTemplate_cache || (_PlanTemplate_cache = getPlatformModel(PlanTemplateDef));
}
const PlanVersionDef = require("../models/PlanVersion.model");
let _PlanVersion_cache = null;
function PlanVersion() {
    return _PlanVersion_cache || (_PlanVersion_cache = getPlatformModel(PlanVersionDef));
}
const logger = require("@utils/logger");

// ─── GET /plan-templates ──────────────────────────────────────────────────────
exports.listPlanTemplates = async (req, res) => {
  try {
    const {
      status
    } = req.query;
    const filter = {};
    if (status && ["draft", "published", "archived"].includes(status)) {
      filter.status = status;
    }
    const templates = await PlanTemplate().find(filter).sort({
      createdAt: -1
    }).lean();
    const templateIds = templates.map(t => t._id);

    // Fetch active AND draft versions in one query
    const relevantVersions = await PlanVersion().find({
      templateId: {
        $in: templateIds
      },
      status: {
        $in: ["active", "draft"]
      }
    }).select("templateId versionTag status activatedAt visibility").lean();

    // Build per-template maps
    const activeMap = {};
    const draftCountMap = {};
    for (const v of relevantVersions) {
      const key = v.templateId.toString();
      if (v.status === "active") activeMap[key] = v;
      if (v.status === "draft") draftCountMap[key] = (draftCountMap[key] || 0) + 1;
    }
    const enriched = templates.map(t => {
      const key = t._id.toString();
      const activeVersion = activeMap[key] || null;
      const draftVersionCount = draftCountMap[key] || 0;

      // Precedence: ACTIVE > DRAFT > DEPRECATED
      // Matches acceptance criteria: active version exists → ACTIVE, even if drafts also exist.
      let derivedStatus;
      if (activeVersion) {
        derivedStatus = "active";
      } else if (draftVersionCount > 0) {
        derivedStatus = "draft";
      } else {
        derivedStatus = "deprecated";
      }
      return {
        ...t,
        activeVersion,
        draftVersionCount,
        derivedStatus // use this on the frontend badge — never use template.status
      };
    });
    return res.json({
      success: true,
      templates: enriched,
      total: enriched.length
    });
  } catch (err) {
    logger.error({
      err
    }, "[PlanTemplateController] listPlanTemplates failed");
    throw err;
  }
};

// ─── GET /plan-templates/:id ──────────────────────────────────────────────────
exports.getPlanTemplateById = async (req, res) => {
  try {
    const template = await PlanTemplate().findById(req.params.id).lean();
    if (!template) {
      return res.status(404).json({
        success: false,
        message: "PlanTemplate not found"
      });
    }

    // Include all versions for this template
    const versions = await PlanVersion().find({
      templateId: template._id
    }).sort({
      createdAt: -1
    }).lean();
    return res.json({
      success: true,
      data: {
        ...template,
        versions
      }
    });
  } catch (err) {
    logger.error({
      err
    }, "[PlanTemplateController] getPlanTemplateById failed");
    throw err;
  }
};

// ─── POST /plan-templates ─────────────────────────────────────────────────────
exports.createPlanTemplate = async (req, res) => {
  try {
    const {
      name,
      code,
      description,
      limits,
      modules,
      pricing,
      inflationPolicy,
      trialDays,
      visibility
    } = req.body;
    if (!name || !code) {
      return res.status(400).json({
        success: false,
        message: "name and code are required"
      });
    }
    const existing = await PlanTemplate().findOne({
      code: code.toLowerCase().trim()
    }).lean();
    if (existing) {
      return res.status(409).json({
        success: false,
        message: `A template with code '${code}' already exists.`
      });
    }
    const template = await PlanTemplate().create({
      name: name.trim(),
      code: code.toLowerCase().trim(),
      description: description || "",
      limits: limits || {
        maxUsers: 5,
        maxBranches: 1
      },
      modules: modules || {},
      pricing: pricing || {
        baseCurrency: "USD",
        regions: []
      },
      inflationPolicy: inflationPolicy || {
        defaultPercent: 0,
        applyAfterYears: 1
      },
      trialDays: trialDays !== undefined ? trialDays : 14,
      visibility: visibility || {
        isPublic: true,
        hiddenCountries: []
      },
      status: "draft",
      createdBy: req.platformUser._id
    });
    logger.info({
      templateId: template._id,
      code: template.code,
      actorId: req.platformUser._id
    }, "[PlanTemplateController] Template created");
    return res.status(201).json({
      success: true,
      data: template,
      message: "PlanTemplate created"
    });
  } catch (err) {
    logger.error({
      err
    }, "[PlanTemplateController] createPlanTemplate failed");
    if (err.code === 11000) {
      return res.status(409).json({
        success: false,
        message: "Template code must be unique."
      });
    }
    throw err; // Express 5 auto-forwards to centralised errorHandler
  }
};

// ─── PATCH /plan-templates/:id ────────────────────────────────────────────────
exports.updatePlanTemplate = async (req, res) => {
  try {
    const {
      id
    } = req.params;
    const {
      expectedVersion,
      ...updates
    } = req.body;
    if (expectedVersion === undefined) {
      return res.status(400).json({
        success: false,
        message: "expectedVersion is required for OAV"
      });
    }
    const template = await PlanTemplate().findById(id);
    if (!template) {
      return res.status(404).json({
        success: false,
        message: "PlanTemplate not found"
      });
    }
    if (template.status === "archived") {
      return res.status(400).json({
        success: false,
        message: "Archived templates cannot be modified."
      });
    }

    // code is immutable
    delete updates.code;
    // status transitions happen via dedicated publish/archive endpoints
    delete updates.status;
    delete updates.createdBy;
    const result = await PlanTemplate().findOneAndUpdate({
      _id: id,
      version: expectedVersion
    }, {
      $set: {
        ...updates,
        lastModifiedBy: req.platformUser._id
      }
    }, {
      new: true
    });
    if (!result) {
      return res.status(409).json({
        success: false,
        message: "Version conflict — template was modified by another action.",
        currentVersion: template.version
      });
    }
    logger.info({
      templateId: id,
      actorId: req.platformUser._id
    }, "[PlanTemplateController] Template updated");
    return res.json({
      success: true,
      data: result,
      message: "PlanTemplate updated"
    });
  } catch (err) {
    logger.error({
      err
    }, "[PlanTemplateController] updatePlanTemplate failed");
    throw err;
  }
};