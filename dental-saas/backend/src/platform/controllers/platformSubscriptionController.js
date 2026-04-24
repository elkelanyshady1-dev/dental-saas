const getPlatformModel = require("@core/db/getPlatformModel");
const platformSubscriptionService = require("../billing/services/platformSubscriptionService");
const OrganizationDef = require("@shared/models/Organization");
const Organization = getPlatformModel(OrganizationDef);
const OrgContractDef = require("../billing/models/OrgContract.model");
const OrgContract = getPlatformModel(OrgContractDef);
const PlatformConfigDef = require("../models/PlatformConfig");
const PlatformConfig = getPlatformModel(PlatformConfigDef); // ─── Helper: resolve org + 404 guard ─────────────────────────────────────────
async function resolveOrg(id, res) {
  const org = await Organization.findById(id);
  if (!org) {
    res.status(404).json({
      message: "Organization not found"
    });
    return null;
  }
  return org;
}

// ─── ENTERPRISE LIFECYCLE ────────────────────────────────────────────────

// ─── PATCH /platform/organizations/:id/extend ────────────────────────────────
// Extends the current billing period by N months.
exports.extendSubscription = async (req, res) => {
  try {
    const org = await resolveOrg(req.params.id, res);
    if (!org) return;
    const {
      extraMonths = 1
    } = req.body;
    if (!Number.isInteger(extraMonths) || extraMonths < 1 || extraMonths > 24) {
      return res.status(400).json({
        message: "extraMonths must be an integer 1–24."
      });
    }
    const config = await PlatformConfig.findOne();
    if (config && !config.allowTrialExtension && org.status === "trial") {
      return res.status(403).json({
        message: "Trial extensions are disabled by platform policy."
      });
    }

    // Sprint 6: extend OrgContract.effectiveTo — not org.subscription.currentPeriodEnd
    const contract = await OrgContract.findOne({
      organizationId: org._id,
      contractStatus: "active"
    });
    if (!contract) {
      return res.status(404).json({
        message: "No active OrgContract found. Cannot extend."
      });
    }
    const base = contract.effectiveTo ? new Date(contract.effectiveTo) : new Date();
    base.setMonth(base.getMonth() + extraMonths);
    contract.effectiveTo = base;

    // Reactivate org if suspended
    if (org.status === "suspended" || org.status === "expired") {
      org.status = "active";
      await org.save();
    }
    await contract.save();
    res.json({
      message: `Contract extended by ${extraMonths} month(s)`,
      effectiveTo: contract.effectiveTo,
      contractId: contract._id
    });
  } catch (err) {
    res.status(500).json({
      message: err.message
    });
  }
};

// ─── PATCH /platform/organizations/:id/suspend ───────────────────────────────
exports.suspendOrganization = async (req, res) => {
  try {
    const org = await resolveOrg(req.params.id, res);
    if (!org) return;
    if (org.subscription.status === "suspended") {
      return res.status(400).json({
        message: "Organization is already suspended."
      });
    }
    org.subscription.status = "suspended";
    await org.save();

    // 🛡️ ARCHITECTURAL INTEGRITY — Force logout all org users
    // Per-org DB: RefreshTokens live in dental_org_<orgId>
    try {
      const dbManager = require("@core/db/dbManager");
      const getModel = require("@core/db/getModel");
      const RefreshTokenDef = require("@shared/models/RefreshToken");
      const orgConn = dbManager.getConnection(String(org._id));
      try {
        const RefreshTokenModel = getModel(orgConn, RefreshTokenDef);
        await RefreshTokenModel.deleteMany({});
      } finally {
        try {
          dbManager.releaseConnection(String(org._id));
        } catch (_) {}
      }
    } catch (err) {
      // Non-fatal: suspension succeeded but session purge failed
      console.error("[SuspendOrg] Session invalidation failed:", err.message);
    }
    res.json({
      message: "Organization suspended and all sessions invalidated",
      subscription: org.subscription
    });
  } catch (err) {
    res.status(500).json({
      message: err.message
    });
  }
};

// ─── PATCH /platform/organizations/:id/reactivate ────────────────────────────
// Reactivates a suspended org — restores to active or trial as appropriate.
exports.reactivateOrganization = async (req, res) => {
  try {
    const org = await resolveOrg(req.params.id, res);
    if (!org) return;
    const now = new Date();

    // Sprint 6: check OrgContract.effectiveTo, not org.subscription.currentPeriodEnd
    const contract = await OrgContract.findOne({
      organizationId: org._id,
      contractStatus: "active"
    });
    if (contract && contract.effectiveTo && new Date(contract.effectiveTo) > now) {
      org.status = "active";
    } else if (org.trialEndDate && new Date(org.trialEndDate) > now) {
      org.status = "trial";
    } else {
      return res.status(400).json({
        message: "Cannot reactivate — contract and trial have both expired. Use /extend to add time first."
      });
    }
    await org.save();
    res.json({
      message: "Organization reactivated",
      status: org.status
    });
  } catch (err) {
    res.status(500).json({
      message: err.message
    });
  }
};

/**
 * cancelSubscription
 */
exports.cancelSubscription = async (req, res) => {
  try {
    const {
      id
    } = req.params;
    const {
      force = false
    } = req.body;
    const result = await platformSubscriptionService.cancelSubscription({
      orgId: id,
      force,
      actor: req.user
    });
    res.json(result);
  } catch (err) {
    res.status(400).json({
      message: err.message
    });
  }
};

/**
 * adjustCredits
 */
exports.adjustCredits = async (req, res) => {
  try {
    const {
      id
    } = req.params;
    const {
      amountMinor
    } = req.body;
    const result = await platformSubscriptionService.adjustCredits({
      orgId: id,
      amountMinor,
      actor: req.user
    });
    res.json(result);
  } catch (err) {
    res.status(400).json({
      message: err.message
    });
  }
};