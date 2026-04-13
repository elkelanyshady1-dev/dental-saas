/**
 * Computes subscription health metrics based on current status and end dates.
 * Centralized to ensure revenue analytics, controllers, and cron jobs share the exact same logic.
 */
module.exports = function computeSubscriptionHealth(subscription) {
    if (!subscription) return null;
    const { status, trialEndsAt, currentPeriodEnd } = subscription;
    const now = new Date();

    const endDate =
        status === "trial" ? trialEndsAt
            : status === "active" ? currentPeriodEnd
                : null;

    let daysRemaining = null;
    let isExpired = status === "expired";
    let isExpiringSoon = false;

    if (endDate) {
        const diff = new Date(endDate) - now;
        daysRemaining = Math.ceil(diff / (1000 * 60 * 60 * 24));
        if (daysRemaining <= 0) isExpired = true;

        // 5 days or fewer is considered expiring soon
        if (daysRemaining > 0 && daysRemaining <= 5) isExpiringSoon = true;
    }

    return { phase: status, daysRemaining, isExpired, isExpiringSoon };
};
