const Organization = require("../models/Organization");
const emailService = require("../services/emailService");

/**
 * subscriptionGuard — runs after organizationMiddleware has set req.organization.
 * Uses explicit subscription.trialEndsAt / currentPeriodEnd — no createdAt math.
 */
const subscriptionGuard = async (req, res, next) => {
    try {
        const organization = req.organization;

        // Skip if no org context (e.g. platform routes, public routes)
        if (!organization) return next();

        // Hard deactivation gate
        if (!organization.isActive) {
            return res.status(403).json({ message: "Organization is deactivated" });
        }

        const sub = organization.subscription || {};
        const now = new Date();

        // ── Suspended ────────────────────────────────────────────────────────────
        if (sub.status === "suspended") {
            return res.status(403).json({ message: "Organization suspended" });
        }

        // ── Expiration / Grace Period Check ────────────────────────────────────
        const endDate = sub.status === "trial" ? sub.trialEndsAt : sub.currentPeriodEnd;

        if (endDate && now > new Date(endDate)) {
            const graceDays = sub.gracePeriodDays ?? 7;

            // 1. Initialize grace period idempotently if it hasn't started
            if (!sub.graceEndsAt) {
                const graceEnd = new Date(endDate);
                graceEnd.setDate(graceEnd.getDate() + graceDays);
                organization.subscription.graceEndsAt = graceEnd;

                // Only mark status as explicitly expired if it wasn't already
                if (organization.subscription.status !== "expired") {
                    organization.subscription.status = "expired";
                }

                await organization.save();

                // Fire-and-forget Grace Notification (Phase 10)
                emailService.sendGraceEmail(organization).catch(err => {
                    console.error(`[SubscriptionGuard] Non-blocking email error for Grace Start org ${organization._id}:`, err);
                });
            }

            // 2. Evaluate against grace deadline
            if (now <= new Date(organization.subscription.graceEndsAt)) {
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
                return res.status(403).json({ message: "Subscription grace period exceeded. Access revoked." });
            }
        }

        // If sub.status is already "expired" but endDate logic didn't catch it (e.g. missing endDate),
        // we should still respect graceEndsAt if it exists.
        if (sub.status === "expired") {
            if (sub.graceEndsAt && now <= new Date(sub.graceEndsAt)) {
                req.subscriptionInGrace = true;
                return next();
            }
            return res.status(403).json({ message: "Subscription expired" });
        }

        return next();
    } catch (error) {
        return res.status(500).json({ message: error.message });
    }
};

module.exports = subscriptionGuard;
