/**
 * contextController.js — Branch Context Management
 *
 * PER-ORG MODE: Models resolved via getModel(req.dbConnection, ModelDef).
 * RLS-ENFORCED via secureModel applied to connection-bound models.
 *
 * INVARIANTS:
 * INV-2: organizationId is ALWAYS injected by secureModel
 * INV-DB: All models are bound to req.dbConnection (per-org isolation)
 */
"use strict";

const getModel = require("../../core/db/getModel");

// ── Model Definitions (schema + modelName only — NO .default) ──────────────
const BranchDef = require("../../shared/models/Branch");

/**
 * Get branches allowed for the current user
 */
exports.getBranches = async (req, res) => {
  try {
    const user = req.user;

    // Resolve model on org connection
    const Branch = getModel(req.dbConnection, BranchDef);
    let branches;
    if (user.hasFullBranchAccess || user.platformRole === "superadmin") {
      // RLS-enforced: organizationId auto-injected
      branches = await Branch.find({
        isActive: true
      });
    } else {
      // RLS-enforced: organizationId auto-injected
      branches = await Branch.find({
        _id: {
          $in: user.branchAccess
        },
        isActive: true
      });
    }
    res.json(branches);
  } catch (error) {
    res.status(500).json({
      message: error.message
    });
  }
};

/**
 * Validate and log branch context switch
 */
exports.switchBranch = async (req, res) => {
  try {
    const branchId = req.activeBranchId;
    const user = req.user;

    // Resolve model on org connection
    const Branch = getModel(req.dbConnection, BranchDef);

    // RLS-enforced: organizationId auto-injected
    const branch = await Branch.findOne({
      _id: branchId,
      isActive: true
    });
    if (!branch) {
      return res.status(404).json({
        message: "Branch not found or inactive"
      });
    }

    // Emit Audit Log
    const auditService = require("../../services/auditService");
    await auditService.createAuditRecord({
      branchId,
      userId: user._id,
      actorId: user._id,
      actorType: "tenant_user",
      action: "BRANCH_CONTEXT_SWITCHED",
      entity: "branch",
      entityType: "branch",
      entityId: branchId,
      details: {
        branchName: branch.name
      },
      ipAddress: req.ip,
      userAgent: req.headers["user-agent"],
      statusCode: 200,
      success: true
    });
    res.json({
      success: true,
      message: `Switched to branch: ${branch.name}`,
      branchId
    });
  } catch (error) {
    res.status(500).json({
      message: error.message
    });
  }
};