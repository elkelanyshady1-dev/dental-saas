const mongoose = require("mongoose");
const Organization = require("../models/Organization");
const SubscriptionHistory = require("../models/SubscriptionHistory");
const Invoice = require("../models/Invoice");
const AuditLog = require("../models/AuditLog");
const PlatformConfig = require("../models/PlatformConfig");
const emailService = require("../services/emailService");
const featureService = require("../services/featureService");
const { calculateProration } = require("../services/prorationService");

const PLAN_PRICING = {
    basic: 99,
    pro: 299,
    enterprise: 899,
};

// ─── Helper: record history snapshot ─────────────────────────────────────────
async function recordHistory(org, changedBy, notes = "") {
    const sub = org.subscription;
    await SubscriptionHistory.create({
        organizationId: org._id,
        plan: sub.plan,
        status: sub.status,
        periodStart: sub.currentPeriodStart,
        periodEnd: sub.currentPeriodEnd,
        trialEndsAt: sub.trialEndsAt,
        changedBy,
        notes,
    });
}

// ─── Helper: resolve org + 404 guard ─────────────────────────────────────────
async function resolveOrg(id, res) {
    const org = await Organization.findById(id);
    if (!org) {
        res.status(404).json({ message: "Organization not found" });
        return null;
    }
    return org;
}

// ─── PATCH /platform/organizations/:id/upgrade ───────────────────────────────
// Upgrades plan and activates a billing period.
exports.upgradeOrganizationPlan = async (req, res) => {
    try {
        const org = await resolveOrg(req.params.id, res);
        if (!org) return;

        const { plan, durationMonths = 1 } = req.body;
        if (!["basic", "pro", "enterprise"].includes(plan)) {
            return res.status(400).json({ message: "Invalid plan. Must be basic, pro, or enterprise." });
        }
        if (!Number.isInteger(durationMonths) || durationMonths < 1 || durationMonths > 36) {
            return res.status(400).json({ message: "durationMonths must be an integer 1–36." });
        }

        const now = new Date();
        const periodEnd = new Date(now);
        periodEnd.setMonth(periodEnd.getMonth() + durationMonths);

        org.subscription.plan = plan;
        org.subscription.status = "active";
        org.subscription.currentPeriodStart = now;
        org.subscription.currentPeriodEnd = periodEnd;
        // Clear trial date once upgraded
        org.subscription.trialEndsAt = null;

        await org.save();
        await recordHistory(org, req.platformUser?._id, `Upgraded to ${plan} for ${durationMonths} month(s)`);

        // Phase 33 - Apply Plan Features
        await featureService.applyPlanFeatures(org);

        res.json({
            message: `Plan upgraded to ${plan}`,
            subscription: org.subscription,
        });
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
};

// ─── GET /platform/organizations/:id/proration-preview ──────────────────────
exports.previewProration = async (req, res) => {
    try {
        const org = await resolveOrg(req.params.id, res);
        if (!org) return;

        const { plan } = req.query;
        if (!PLAN_PRICING[plan]) {
            return res.status(400).json({ message: "Invalid target plan" });
        }

        const sub = org.subscription;
        const now = new Date();

        // 1. Resolve current and new prices
        let currentPrice = PLAN_PRICING[sub.plan] || 0;
        if (sub.customPricing?.isCustom) currentPrice = sub.customPricing.price;
        // Assume new plan takes standard pricing unless custom is set explicitly later
        const newPrice = PLAN_PRICING[plan];

        const proration = calculateProration({
            currentPlanPrice: currentPrice,
            newPlanPrice: newPrice,
            currentPeriodStart: sub.currentPeriodStart || now,
            currentPeriodEnd: sub.currentPeriodEnd || now,
            now
        });

        res.json({
            preview: proration,
            currentPlan: sub.plan,
            newPlan: plan,
            creditBalance: sub.creditBalance || 0
        });

    } catch (err) {
        res.status(500).json({ message: err.message });
    }
};

// ─── PATCH /platform/organizations/:id/change-plan ──────────────────────────
exports.changeOrganizationPlan = async (req, res) => {
    const session = await mongoose.startSession();
    try {
        session.startTransaction();

        // Lock organization for atomic read-write
        const org = await Organization.findById(req.params.id).session(session);
        if (!org) {
            await session.abortTransaction();
            session.endSession();
            return res.status(404).json({ message: "Organization not found" });
        }

        const sub = org.subscription;

        // Block if suspended
        if (sub.status === "suspended" || !sub.currentPeriodEnd) {
            await session.abortTransaction();
            session.endSession();
            return res.status(400).json({ message: "Cannot prorate suspended or uninitialized organizations." });
        }

        // Block if expired outside grace
        const now = new Date();
        const isExpired = now > new Date(sub.currentPeriodEnd);
        const graceEndsAt = sub.graceEndsAt ? new Date(sub.graceEndsAt) : null;
        if (isExpired && (!graceEndsAt || now > graceEndsAt)) {
            await session.abortTransaction();
            session.endSession();
            return res.status(400).json({ message: "Cannot prorate expired organization." });
        }

        const { plan } = req.body;
        if (!PLAN_PRICING[plan]) {
            await session.abortTransaction();
            session.endSession();
            return res.status(400).json({ message: "Invalid target plan" });
        }

        // Calculate Proration
        let currentPrice = PLAN_PRICING[sub.plan] || 0;
        if (sub.customPricing?.isCustom) currentPrice = sub.customPricing.price;
        const newPrice = PLAN_PRICING[plan];

        const config = await PlatformConfig.findOne();
        if (config && !config.allowPlanDowngrade && newPrice < currentPrice) {
            await session.abortTransaction();
            session.endSession();
            return res.status(403).json({ message: "Plan downgrades are disabled by platform policy." });
        }

        const proration = calculateProration({
            currentPlanPrice: currentPrice,
            newPlanPrice: newPrice,
            currentPeriodStart: sub.currentPeriodStart || now,
            currentPeriodEnd: sub.currentPeriodEnd,
            now
        });

        const previousPlan = sub.plan;
        sub.plan = plan;
        sub.basePriceAtSubscription = newPrice;

        // Phase 10: Clear any scheduled change if an immediate proration occurs
        sub.scheduledPlanChange = null;

        let unusedCreditApplied = 0;
        let finalAmount = proration.finalAmount;

        if (finalAmount < 0) {
            // Credit the user
            sub.creditBalance = (sub.creditBalance || 0) + Math.abs(finalAmount);
            finalAmount = 0; // Net zero out of pocket
        } else if (finalAmount > 0) {
            // Consume existing credit if any applies to this new charge
            if (sub.creditBalance && sub.creditBalance > 0) {
                if (sub.creditBalance >= finalAmount) {
                    unusedCreditApplied = finalAmount;
                    sub.creditBalance -= finalAmount;
                    finalAmount = 0;
                } else {
                    unusedCreditApplied = sub.creditBalance;
                    finalAmount -= sub.creditBalance;
                    sub.creditBalance = 0;
                }
            }
        }

        // Create Proration Invoice
        const invoice = new Invoice({
            organizationId: org._id,
            subscriptionSnapshot: {
                previousPlan,
                plan: newPlanPrice = newPrice, // keeping plan for schema integrity
                billingCycle: "monthly",
                basePrice: newPrice,
                unusedCreditApplied,
                finalAmount
            },
            status: (sub.autoRenew && finalAmount > 0) || finalAmount === 0 ? "paid" : "pending",
            dueDate: new Date(now.getTime() + (sub.gracePeriodDays || 7) * 24 * 60 * 60 * 1000), // Standard net-term
            currency: "USD",
            type: "PRORATION" // Phase 2 requirement
        });

        if (invoice.status === "paid") {
            invoice.paidAt = now;
        }

        await invoice.save({ session });
        await org.save({ session });

        // Audit Log
        await AuditLog.create([{
            organizationId: org._id,
            actorId: req.platformUser._id,
            actorType: "platform_user",
            action: "PLATFORM_PLAN_CHANGED",
            success: true,
            details: `Plan changed from ${previousPlan} to ${plan}. Final charge: $${finalAmount}. Credit balance: $${sub.creditBalance}`,
            ipAddress: req.ip,
            userAgent: req.headers["user-agent"],
        }], { session });

        await recordHistory(org, req.platformUser._id, `Prorated mid-cycle from ${previousPlan} to ${plan}`);

        await session.commitTransaction();
        session.endSession();

        // Phase 33 - Apply Plan Features outside transaction (or you could technically do it inside, but we do it outside for simplicity)
        await featureService.applyPlanFeatures(org);

        // Phase 4 - Email Async Dispatch
        emailService.sendInvoiceEmail(invoice, org).catch(err => {
            console.error(`[PlatformSubscription] Non-blocking email error for Proration Invoice ${invoice._id}:`, err);
        });

        res.json({
            message: `Plan changed successfully. Final invoice amount: $${finalAmount}`,
            invoice,
            creditBalance: sub.creditBalance
        });

    } catch (err) {
        await session.abortTransaction();
        session.endSession();
        res.status(500).json({ message: err.message });
    }
};

// ─── POST /platform/organizations/:id/schedule-plan-change ──────────────────
exports.schedulePlanChange = async (req, res) => {
    try {
        const org = await resolveOrg(req.params.id, res);
        if (!org) return;

        const { plan } = req.body;
        if (!PLAN_PRICING[plan]) {
            return res.status(400).json({ message: "Invalid target plan" });
        }

        const sub = org.subscription;
        if (sub.status === "suspended" || sub.status === "expired" || !sub.currentPeriodEnd) {
            return res.status(400).json({ message: "Cannot schedule plan change for inactive subscriptions" });
        }

        let currentPrice = PLAN_PRICING[sub.plan] || 0;
        const newPrice = PLAN_PRICING[plan];

        const config = await PlatformConfig.findOne();
        if (config && !config.allowPlanDowngrade && newPrice < currentPrice) {
            return res.status(403).json({ message: "Plan downgrades are disabled by platform policy." });
        }

        const now = new Date();
        const effectiveDate = new Date(sub.currentPeriodEnd);

        sub.scheduledPlanChange = {
            newPlan: plan,
            effectiveDate,
            scheduledAt: now
        };

        await org.save();

        await AuditLog.create({
            organizationId: org._id,
            actorId: req.platformUser._id,
            actorType: "platform_user",
            action: "PLATFORM_PLAN_CHANGE_SCHEDULED",
            success: true,
            details: `Scheduled plan change to ${plan} effective on ${effectiveDate.toISOString()}`,
            ipAddress: req.ip,
            userAgent: req.headers["user-agent"],
        });

        res.json({
            message: `Plan change to ${plan} scheduled successfully`,
            scheduledPlanChange: sub.scheduledPlanChange
        });
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
};

// ─── DELETE /platform/organizations/:id/schedule-plan-change ────────────────
exports.cancelScheduledPlanChange = async (req, res) => {
    try {
        const org = await resolveOrg(req.params.id, res);
        if (!org) return;

        if (!org.subscription.scheduledPlanChange || !org.subscription.scheduledPlanChange.newPlan) {
            return res.status(400).json({ message: "No scheduled plan change found" });
        }

        org.subscription.scheduledPlanChange = null;
        await org.save();

        await AuditLog.create({
            organizationId: org._id,
            actorId: req.platformUser._id,
            actorType: "platform_user",
            action: "PLATFORM_PLAN_CHANGE_SCHEDULE_CANCELLED",
            success: true,
            details: `Cancelled pending plan change schedule`,
            ipAddress: req.ip,
            userAgent: req.headers["user-agent"],
        });

        res.json({ message: "Scheduled plan change cancelled successfully" });
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
};

// ─── PATCH /platform/organizations/:id/extend ────────────────────────────────
// Extends the current billing period by N months.
exports.extendSubscription = async (req, res) => {
    try {
        const org = await resolveOrg(req.params.id, res);
        if (!org) return;

        const { extraMonths = 1 } = req.body;
        if (!Number.isInteger(extraMonths) || extraMonths < 1 || extraMonths > 24) {
            return res.status(400).json({ message: "extraMonths must be an integer 1–24." });
        }

        const config = await PlatformConfig.findOne();
        if (config && !config.allowTrialExtension && org.subscription.status === "trial") {
            return res.status(403).json({ message: "Trial extensions are disabled by platform policy." });
        }

        // If no existing end date, start from now
        const base = org.subscription.currentPeriodEnd
            ? new Date(org.subscription.currentPeriodEnd)
            : new Date();

        base.setMonth(base.getMonth() + extraMonths);
        org.subscription.currentPeriodEnd = base;

        // If expired, reactivate
        if (org.subscription.status === "expired") {
            org.subscription.status = "active";
            if (!org.subscription.currentPeriodStart) {
                org.subscription.currentPeriodStart = new Date();
            }
        }

        await org.save();
        await recordHistory(org, req.platformUser?._id, `Extended by ${extraMonths} month(s)`);

        res.json({
            message: `Subscription extended by ${extraMonths} month(s)`,
            subscription: org.subscription,
        });
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
};

// ─── PATCH /platform/organizations/:id/suspend ───────────────────────────────
exports.suspendOrganization = async (req, res) => {
    try {
        const org = await resolveOrg(req.params.id, res);
        if (!org) return;

        if (org.subscription.status === "suspended") {
            return res.status(400).json({ message: "Organization is already suspended." });
        }

        org.subscription.status = "suspended";
        await org.save();
        await recordHistory(org, req.platformUser?._id, req.body.reason || "Suspended by platform admin");

        res.json({ message: "Organization suspended", subscription: org.subscription });
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
};

// ─── PATCH /platform/organizations/:id/reactivate ────────────────────────────
// Reactivates a suspended org — restores to active or trial as appropriate.
exports.reactivateOrganization = async (req, res) => {
    try {
        const org = await resolveOrg(req.params.id, res);
        if (!org) return;

        const sub = org.subscription;
        const now = new Date();

        // If it has an active billing period → restore to active
        if (sub.currentPeriodEnd && new Date(sub.currentPeriodEnd) > now) {
            sub.status = "active";
            // If it still has trial time remaining → restore to trial
        } else if (sub.trialEndsAt && new Date(sub.trialEndsAt) > now) {
            sub.status = "trial";
        } else {
            return res.status(400).json({
                message: "Cannot reactivate — billing period and trial have both expired. Use /extend to add time first.",
            });
        }

        await org.save();
        await recordHistory(org, req.platformUser?._id, "Reactivated by platform admin");

        res.json({ message: "Organization reactivated", subscription: org.subscription });
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
};

// ─── GET /platform/organizations/:id/subscription/history ───────────────────
exports.getSubscriptionHistory = async (req, res) => {
    try {
        const org = await resolveOrg(req.params.id, res);
        if (!org) return;

        const history = await SubscriptionHistory.find({ organizationId: org._id })
            .populate("changedBy", "name email")
            .sort({ createdAt: -1 })
            .lean();

        res.json({ history });
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
};
