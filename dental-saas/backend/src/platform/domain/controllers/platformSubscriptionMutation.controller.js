/**
 * Subscription Mutation Controller
 * Phase 11: Subscription Mutation APIs for Platform Super Admin.
 */

"use strict";

const getPlatformModel = require("@core/db/getPlatformModel");
const planAggregateService = require("../services/platformPlan.aggregate.service");
const orgAddOnAggregateService = require("../../../shared/services/OrgAddOnService");
const AddOnDef = require("../models/addOn.model");
const AddOn = getPlatformModel(AddOnDef);
const OrganizationDef = require("@shared/models/Organization");
const Organization = getPlatformModel(OrganizationDef);
const {
  createAuditRecord
} = require("../../../services/auditService");
const EventBus = require("@core/eventBus");
const Events = require("@core/domainEvents");
const {
  getCurrentBillingCycle
} = require("@core/subscription/communicationQuota.service");

/**
 * changePlan
 * POST /api/v1/platform/org/:orgId/change-plan
 */
exports.changePlan = async (req, res) => {
  try {
    const {
      orgId
    } = req.params;
    const {
      newPlanId,
      expectedVersion
    } = req.body;
    if (!newPlanId) {
      return res.status(400).json({
        success: false,
        error: "newPlanId is required"
      });
    }
    if (expectedVersion === undefined) {
      return res.status(400).json({
        success: false,
        error: "expectedVersion is required for OAV"
      });
    }

    // 1. Delegate to aggregate service
    const org = await planAggregateService.assignPlan({
      organizationId: orgId,
      newPlanId,
      expectedVersion,
      actorId: req.user._id
    });

    // 2. Emit Domain Event
    EventBus.emit(Events.PLAN_CHANGED, {
      organizationId: orgId,
      newPlanId,
      actorId: req.user._id
    }, "subscription.mutation.controller");
    return res.json({
      success: true,
      data: {
        organizationId: org._id,
        planId: org.planId,
        version: org.version
      }
    });
  } catch (error) {
    const status = error.message === "VERSION_CONFLICT" ? 409 : 400;
    return res.status(status).json({
      success: false,
      error: {
        code: "MUTATION_ERROR",
        message: error.message
      }
    });
  }
};

/**
 * addAddon
 * POST /api/v1/platform/org/:orgId/add-addon
 */
exports.addAddon = async (req, res) => {
  try {
    const {
      orgId
    } = req.params;
    const {
      addOnId
    } = req.body;
    if (!addOnId) {
      return res.status(400).json({
        success: false,
        error: "addOnId is required"
      });
    }

    // 1. Resolve Org and AddOn
    const [org, addon] = await Promise.all([Organization.findById(orgId), AddOn.findById(addOnId)]);
    if (!org) return res.status(404).json({
      success: false,
      error: "Organization not found"
    });
    if (!addon) return res.status(404).json({
      success: false,
      error: "Add-On not found"
    });

    // 2. Resolve Pricing for the org's region
    const region = addon.pricing.regions.find(r => r.countries.includes(org.billingCountry)) || addon.pricing.regions.find(r => r.regionCode === "GLOBAL") || addon.pricing.regions[0];
    if (!region) throw new Error("PRICING_NOT_FOUND_FOR_REGION");

    // 3. Resolve Current Billing Cycle
    const {
      start,
      end
    } = getCurrentBillingCycle();

    // 4. Delegate to aggregate service
    const orgAddOn = await orgAddOnAggregateService.createOrgAddOn({
      organizationId: orgId,
      addOnId,
      status: "active",
      billingCycleStart: start,
      billingCycleEnd: end,
      currency: region.currency,
      price: region.monthly,
      // Assuming monthly for platform manual addition
      interval: "monthly",
      autoRenew: true
    });

    // 5. Audit Logging
    await createAuditRecord({
      organizationId: orgId,
      branchId: "000000000000000000000000",
      actorId: req.user._id,
      actorType: "platform_user",
      action: "ADDON_ADDED",
      entity: "orgAddOn",
      entityId: orgAddOn._id,
      details: {
        addOnId,
        code: addon.code
      },
      success: true
    });

    // 6. Emit Event
    EventBus.emit(Events.ADDON_ADDED, {
      organizationId: orgId,
      addOnId,
      actorId: req.user._id
    }, "subscription.mutation.controller");
    return res.json({
      success: true,
      data: orgAddOn
    });
  } catch (error) {
    return res.status(400).json({
      success: false,
      error: {
        code: "MUTATION_ERROR",
        message: error.message
      }
    });
  }
};

/**
 * removeAddon
 * DELETE /api/v1/platform/org/:orgId/remove-addon
 * Body: { orgAddOnId }
 */
exports.removeAddon = async (req, res) => {
  try {
    const {
      orgId
    } = req.params;
    const {
      orgAddOnId
    } = req.body;
    if (!orgAddOnId) {
      return res.status(400).json({
        success: false,
        error: "orgAddOnId is required"
      });
    }

    // 1. Delegate to aggregate service
    const orgAddOn = await orgAddOnAggregateService.cancelOrgAddOn(orgAddOnId, orgId);

    // 2. Audit Logging
    await createAuditRecord({
      organizationId: orgId,
      branchId: "000000000000000000000000",
      actorId: req.user._id,
      actorType: "platform_user",
      action: "ADDON_REMOVED",
      entity: "orgAddOn",
      entityId: orgAddOnId,
      details: {
        status: "cancelled"
      },
      success: true
    });

    // 3. Emit Event
    EventBus.emit(Events.ADDON_REMOVED, {
      organizationId: orgId,
      orgAddOnId,
      actorId: req.user._id
    }, "subscription.mutation.controller");
    return res.json({
      success: true,
      message: "Add-on removed successfully"
    });
  } catch (error) {
    return res.status(400).json({
      success: false,
      error: {
        code: "MUTATION_ERROR",
        message: error.message
      }
    });
  }
};