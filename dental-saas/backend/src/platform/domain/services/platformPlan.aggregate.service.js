"use strict";

const getPlatformModel = require("@core/db/getPlatformModel");
const OrganizationDef = require("@shared/models/Organization");
const Organization = getPlatformModel(OrganizationDef);
const PlanDef = require("../models/plan.model");
const Plan = getPlatformModel(PlanDef);
const {
  createAuditRecord
} = require("../../../services/auditService");
const {
  validatePlanCompatibility
} = require("@core/subscription/validatePlanCompatibility");
const featureService = require("../../../services/featureService");
class PlanAggregateService {
  /**
   * Safely assigns a new plan to an organization, enforcing OAV.
   *
   * ═══════════════════════════════════════════════════════════════
   * NO-PRORATION MODEL (Phase Y):
   * Plan changes do NOT trigger mid-cycle billing adjustment.
   * - No PRORATION invoice is created
   * - No creditBalance is mutated
   * - No currentPeriodStart/End is modified
   * - basePriceAtSubscription is reset to null (re-resolves at renewal)
   * - Billing reconciliation occurs at next renewal cycle ONLY
   * ═══════════════════════════════════════════════════════════════
   */
  async assignPlan({
    organizationId,
    newPlanId,
    expectedVersion,
    actorId
  }) {
    const session = await Organization.startSession();
    session.startTransaction();
    try {
      const [org, newPlan] = await Promise.all([Organization.findById(organizationId).session(session), Plan.findById(newPlanId).session(session)]);
      if (!org) throw new Error("ORGANIZATION_NOT_FOUND");
      if (!newPlan) throw new Error("PLAN_NOT_FOUND");
      if (!newPlan.isActive) throw new Error("PLAN_INACTIVE");

      // OAV check (if expectedVersion is provided during an explicit patch)
      if (expectedVersion !== undefined && org.version !== undefined && org.version !== expectedVersion) {
        throw new Error("VERSION_CONFLICT");
      }

      // ── Phase Y: 24h Rate Limit ──
      if (org.subscription?.lastPlanChangeAt) {
        const hoursSinceLastChange = (Date.now() - new Date(org.subscription.lastPlanChangeAt).getTime()) / (1000 * 60 * 60);
        if (hoursSinceLastChange < 24) {
          throw new Error("PLAN_CHANGE_RATE_LIMITED: Plan changes are limited to once per 24 hours.");
        }
      }

      // Must run backward-compatibility safety checks
      await validatePlanCompatibility(organizationId, newPlan, actorId);
      const previousPlanId = org.planId;

      // Sprint 4: subscription.plan (String) removed from schema.
      // Plan is now referenced only via org.planId (ObjectId) and OrgContract.planCode.
      // subscription.basePriceAtSubscription removed — price anchor is OrgContract.lockedPrice.
      org.planId = newPlanId; // sole canonical plan reference
      if (org.subscription) {
        // v20.1 Phase 5 — Snapshot new plan version + record plan change timestamp
        org.subscription.planVersion = newPlan.version || 0;
        org.subscription.lastPlanChangeAt = new Date();
      }

      // Increment version for OAV
      if (org.version !== undefined) {
        org.version += 1;
      } else {
        org.version = 1;
      }
      await org.save({
        session
      });

      // 3. Emit Audit Event
      await createAuditRecord({
        organizationId,
        branchId: "000000000000000000000000",
        actorId,
        actorType: "platform_user",
        action: "PLAN_CHANGED",
        entity: "organization",
        entityId: organizationId,
        details: {
          previousPlanId,
          newPlanId
        },
        success: true
      }, {
        session
      });

      // Ensure newly enabled features are seeded based on the new plan
      await featureService.applyPlanFeatures(org, {
        session
      });
      await session.commitTransaction();
      session.endSession();
      return org;
    } catch (error) {
      await session.abortTransaction();
      session.endSession();
      throw error;
    }
  }
}
module.exports = new PlanAggregateService();