const Organization = require("../models/Organization");
const Invoice = require("../models/Invoice");
const AuditLog = require("../models/AuditLog");

const PLAN_PRICING = {
    basic: 99,
    pro: 299,
    enterprise: 899,
};

exports.computeRevenueIntelligence = async () => {
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    // 1. MRR & ARR from PAID invoices
    const mrrAgg = await Invoice.aggregate([
        { $match: { status: "paid", type: { $in: ["RENEWAL", "INITIAL", "PRORATION"] } } },
        { $sort: { createdAt: -1 } },
        {
            $group: {
                _id: "$organizationId",
                finalAmount: { $first: "$subscriptionSnapshot.finalAmount" }
            }
        },
        {
            $group: {
                _id: null,
                mrr: { $sum: "$finalAmount" }
            }
        }
    ]);
    const mrr = mrrAgg[0]?.mrr || 0;
    const arr = mrr * 12;

    // 2. Revenue At Risk (Latest unpaid invoice sum)
    const riskAgg = await Invoice.aggregate([
        { $match: { status: { $in: ["pending", "failed"] } } },
        { $sort: { createdAt: -1 } },
        {
            $group: {
                _id: "$organizationId",
                finalAmount: { $first: "$subscriptionSnapshot.finalAmount" }
            }
        },
        {
            $group: {
                _id: null,
                revenueAtRisk: { $sum: "$finalAmount" }
            }
        }
    ]);
    const revenueAtRisk = riskAgg[0]?.revenueAtRisk || 0;

    // 3. Churn Rate
    const churnsThisMonth = await AuditLog.countDocuments({
        action: "SUBSCRIPTION_AUTO_SUSPENDED",
        createdAt: { $gte: startOfMonth }
    });
    const currentActive = await Organization.countDocuments({ "subscription.status": "active" });
    const activeAtStart = currentActive + churnsThisMonth;
    const churnRate = activeAtStart > 0 ? (churnsThisMonth / activeAtStart) : 0;

    // 4. MRR Movement & NRR Simulated Logic
    // In a full production OLAP warehouse this would use complex windowing.
    // For this engine, we calculate movement dynamically based on Invoice snapshots in the last 30 days.
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    let newMRR = 0;
    let expansionMRR = 0;
    let contractionMRR = 0;
    let churnedMRR = 0;

    // Find organizations that had invoice activity in the last 30 days
    const activeOrgsInvoices = await Invoice.aggregate([
        { $match: { status: "paid" } },
        { $sort: { createdAt: -1 } },
        {
            $group: {
                _id: "$organizationId",
                invoices: { $push: { finalAmount: "$subscriptionSnapshot.finalAmount", createdAt: "$createdAt", type: "$type" } }
            }
        }
    ]);

    for (const org of activeOrgsInvoices) {
        const sortedInvoices = org.invoices; // already sorted descending by createdAt
        if (sortedInvoices.length === 0) continue;

        const latest = sortedInvoices[0];

        // If the org's latest invoice was created in the last 30 days
        if (new Date(latest.createdAt) >= thirtyDaysAgo) {
            // If it's their only invoice, they are Net New
            if (sortedInvoices.length === 1 && latest.type === "INITIAL") {
                newMRR += latest.finalAmount;
            } else if (sortedInvoices.length > 1) {
                // Compare to previous paid
                const previous = sortedInvoices[1];
                const diff = latest.finalAmount - previous.finalAmount;
                if (diff > 0) expansionMRR += diff;
                if (diff < 0) contractionMRR += Math.abs(diff);
            }
        }
    }

    // Churned MRR: get the last paid invoice amount for orgs that churned this month
    const churnLogs = await AuditLog.find({
        action: "SUBSCRIPTION_AUTO_SUSPENDED",
        createdAt: { $gte: startOfMonth }
    });

    for (const log of churnLogs) {
        const lastPaid = await Invoice.findOne({ organizationId: log.organizationId, status: "paid" }).sort({ createdAt: -1 });
        if (lastPaid) churnedMRR += lastPaid.subscriptionSnapshot.finalAmount;
    }

    const netChange = newMRR + expansionMRR - contractionMRR - churnedMRR;
    const startingMRR = Math.max(1, mrr - netChange); // rough approximation for NRR denom to avoid zero
    const nrr = (startingMRR - churnedMRR + expansionMRR - contractionMRR) / startingMRR;

    // 5. Forecast 30/60/90
    let next30Days = 0, next60Days = 0, next90Days = 0;
    const activeOrgs = await Organization.find({ "subscription.status": "active" });

    for (const org of activeOrgs) {
        const sub = org.subscription;
        if (!sub.currentPeriodEnd) continue;

        let planToUse = sub.scheduledPlanChange?.newPlan || sub.plan;
        let basePrice = PLAN_PRICING[planToUse] || 0;

        let predictedPrice = sub.basePriceAtSubscription || basePrice;
        if (sub.scheduledPlanChange) {
            predictedPrice = basePrice; // resets to standard mapping on scheduled swap
        } else if (sub.customPricing?.isCustom) {
            predictedPrice = sub.customPricing.price;
        }

        if (sub.renewalPolicy && sub.renewalPolicy.inflationPercent) {
            predictedPrice += predictedPrice * (sub.renewalPolicy.inflationPercent / 100);
        }

        let couponDiscount = 0;
        if (sub.coupon && sub.coupon.code) {
            const c = sub.coupon;
            const isNotExpired = !c.validUntil || now <= new Date(c.validUntil);
            const hasUsesLeft = !c.maxUses || c.usedCount < c.maxUses; // Note: simulating next cycle means +1 use
            const isTargetPlan = !c.planRestriction || c.planRestriction === planToUse;

            if (isNotExpired && hasUsesLeft && isTargetPlan) {
                if (c.discountType === "percentage") couponDiscount = predictedPrice * (c.discountValue / 100);
                else couponDiscount = c.discountValue;
            }
        }

        const predictedFinal = Math.max(0, predictedPrice - couponDiscount);
        const daysUntilRenewal = (new Date(sub.currentPeriodEnd).getTime() - now.getTime()) / (1000 * 60 * 60 * 24);

        if (daysUntilRenewal <= 30) next30Days += predictedFinal;
        if (daysUntilRenewal <= 60) next60Days += predictedFinal;
        if (daysUntilRenewal <= 90) next90Days += predictedFinal;
    }

    return {
        mrr,
        arr,
        revenueAtRisk,
        churnRate,
        nrr,
        forecast: {
            next30Days,
            next60Days,
            next90Days
        },
        mrrMovement: {
            newMRR,
            expansionMRR,
            contractionMRR,
            churnedMRR,
            netChange
        }
    };
};
