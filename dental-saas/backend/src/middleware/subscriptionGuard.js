const getPlatformModel = require("@core/db/getPlatformModel");
const OrganizationDef = require("../shared/models/Organization");
const Organization = getPlatformModel(OrganizationDef); // ✅ v3.0: Grace emails now enqueued via Redis (non-blocking, retryable)
const {
  emitInvoiceEmail
} = require("../events/email.events");
const {
  resolvePlan
} = require("../core/subscription/planResolver");
const {
  buildPlanCapabilities
} = require("../core/subscription/planCapabilityBuilder");
const logger = require("../utils/logger");

/**
 * subscriptionGuard — Phase 8: Loads org directly from DB using req.context.organizationId.
 * Uses explicit subscription.trialEndsAt / currentPeriodEnd — no createdAt math.
 */
const subscriptionGuard = async (req, res, next) => {
  try {
    // Phase 8: req.organization is deprecated. Load org directly.
    const orgId = req.context?.organizationId;
    if (!orgId) return next(); // Skip if no org context

    const organization = await Organization.findById(orgId);
    if (!organization) return next();

    // v5.2 — SaaS Governance Integration
    // Resolve deterministic plan and capabilities early in the request chain
    try {
      const plan = await resolvePlan(organization._id);
      req.plan = plan;
      req.planCapabilities = buildPlanCapabilities(plan);
    } catch (planErr) {
      // ── PLAN_NOT_FOUND → clean 403 (no contract or PlanVersion seeded) ──
      if (planErr.code === "PLAN_NOT_FOUND") {
        return res.status(403).json({
          success: false,
          error: {
            code: "PLAN_NOT_ASSIGNED",
            message: "Organization has no active subscription plan. Contact your administrator.",
            hint: process.env.NODE_ENV !== "production" ? "Run: node scripts/seedTrialPlan.js" : undefined
          }
        });
      }

      // ── PLAN_INACTIVE → clean 403 (PlanVersion found but not active) ──
      if (planErr.code === "PLAN_INACTIVE") {
        return res.status(403).json({
          success: false,
          error: {
            code: "PLAN_INACTIVE",
            message: planErr.message
          }
        });
      }

      // ── Unexpected error → 500 (DB failure, schema error, etc.) ─────────
      logger.error({
        event: "SUBSCRIPTION_SYSTEM_ERROR",
        organizationId: organization._id?.toString(),
        err: planErr.message,
        stack: planErr.stack
      }, `[SubscriptionGuard] Unexpected error during plan resolution`);
      return res.status(500).json({
        success: false,
        error: {
          code: "SUBSCRIPTION_SYSTEM_ERROR",
          message: "Subscription system error. Please try again."
        }
      });
    }

    // Hard deactivation gate
    if (!organization.isActive) {
      return res.status(403).json({
        message: "Organization is deactivated"
      });
    }
    const sub = organization.subscription || {};
    const now = new Date();

    // ── Suspended ────────────────────────────────────────────────────────────
    if (sub.status === "suspended") {
      return res.status(403).json({
        message: "Organization suspended"
      });
    }

    // ── v20.1 Phase 3: Unified Trial Check (replaces legacy org.trial) ──────
    if (sub.status === "trial") {
      if (sub.trialEndsAt && now > new Date(sub.trialEndsAt)) {
        return res.status(403).json({
          message: "TRIAL_EXPIRED"
        });
      }
      return next(); // Trial is active
    }

    // ── Expiration / Grace Period Check ────────────────────────────────────
    const endDate = sub.currentPeriodEnd; // Post-trial

    if (endDate && now > new Date(endDate)) {
      const graceDays = sub.gracePeriodDays ?? 7;

      // 1. Initialize grace period idempotently if it hasn't started
      if (!sub.gracePeriodEnd) {
        // v11.3: UTC-Deterministic Grace Calculation
        const anchor = new Date(endDate);
        const graceEnd = new Date(Date.UTC(anchor.getUTCFullYear(), anchor.getUTCMonth(), anchor.getUTCDate() + graceDays, 23, 59, 59, 999 // End of day UTC
        ));
        organization.subscription.gracePeriodEnd = graceEnd;

        // Only mark status as explicitly expired if it wasn't already
        if (organization.subscription.status !== "expired") {
          organization.subscription.status = "expired";
        }
        await organization.save();

        // Fire-and-forget Grace Notification (queued via CommunicationService — v4.0)
        // Routes through the full communication abstraction: CommunicationService → emailQueue → emailWorker
        try {
          const {
            sendCommunication
          } = require("../services/communicationService");
          const orgEmail = organization.contactEmail || organization.email;
          if (orgEmail) {
            sendCommunication({
              channel: "email",
              type: "GRACE",
              payload: {
                email: orgEmail,
                orgName: organization.name,
                subject: `Action Required: Subscription Overdue — ${organization.name}`,
                graceEndsAt: graceEnd,
                gracePeriodDays: graceDays,
                renewUrl: process.env.PLATFORM_RENEWAL_URL || null
              }
            }).catch(err => {
              logger.error({
                event: "GRACE_EMAIL_ENQUEUE_FAILED",
                organizationId: organization._id?.toString(),
                err: err.message
              }, "[SubscriptionGuard] Grace email enqueue error");
            });
          }
        } catch (enqueueErr) {
          logger.error({
            event: "GRACE_EMAIL_INFRA_FAILED",
            organizationId: organization._id?.toString(),
            err: enqueueErr.message
          }, "[SubscriptionGuard] Grace email infrastructure error");
        }
      }

      // 2. Evaluate against grace deadline
      if (now <= new Date(organization.subscription.gracePeriodEnd)) {
        // Inside grace window -> attach flag and allow
        req.subscriptionInGrace = true;
        return next();
      } else {
        // Past grace -> hard enforce lockout
        // Ensure status is expired in db if somehow it isn't
        if (organization.subscription.status !== "expired") {
          organization.subscription.status = "expired";
          await organization.save();
        }
        return res.status(403).json({
          message: "Subscription grace period exceeded. Access revoked."
        });
      }
    }

    // If sub.status is already "expired" but endDate logic didn't catch it (e.g. missing endDate),
    // we should still respect gracePeriodEnd if it exists.
    if (sub.status === "expired") {
      if (sub.gracePeriodEnd && now <= new Date(sub.gracePeriodEnd)) {
        req.subscriptionInGrace = true;
        return next();
      }
      return res.status(403).json({
        message: "Subscription expired"
      });
    }
    return next();
  } catch (error) {
    return res.status(500).json({
      message: error.message
    });
  }
};

// ─── Sovereign Boundary Certification ───────────────────────────────────────
// Set global flag to allow SovereignGuard to verify initialization WITHOUT
// inspecting Express internal router stacks (version fragile).
global.__SUBSCRIPTION_GUARD_LOADED__ = true;
module.exports = subscriptionGuard;