/**
 * riskScoring.engine.js
 * 
 * Absolute Risk Scoring Engine.
 * Projection-only pure function with no mutations.
 */

function calculateRisk({
    outstandingBalance = 0,
    margin = 0,
    delayRatio = 0,
    inventoryCostRatio = 0,
    cancellationRate = 0
}) {
    const BALANCE_THRESHOLD = 5000; // Arbitrary for now, should be org-configurable ideally
    const DELAY_THRESHOLD = 0.3;
    const COST_RATIO_THRESHOLD = 0.4;
    const CANCELLATION_THRESHOLD = 0.2;

    const signals = {
        balanceRisk: outstandingBalance > BALANCE_THRESHOLD,
        marginRisk: margin < 0,
        delayRisk: delayRatio > DELAY_THRESHOLD,
        costRisk: inventoryCostRatio > COST_RATIO_THRESHOLD,
        cancellationRisk: cancellationRate > CANCELLATION_THRESHOLD
    };

    let riskScore = 0;
    const riskCategories = [];
    const recommendedActions = [];

    if (signals.balanceRisk) {
        riskScore += 30;
        riskCategories.push("Financial");
        recommendedActions.push("Review outstanding statements and trigger collections workflow.");
    }

    if (signals.marginRisk) {
        riskScore += 40;
        riskCategories.push("Profitability");
        recommendedActions.push("Audit treatment inventory usage and apply stricter pricing blocks.");
    }

    if (signals.delayRisk) {
        riskScore += 15;
        riskCategories.push("Operational");
        recommendedActions.push("Evaluate clinical stage bottlenecks to improve throughput.");
    }

    if (signals.costRisk) {
        riskScore += 15;
        riskCategories.push("Inventory");
        recommendedActions.push("Check excessive material consumption per treatment plan.");
    }

    if (signals.cancellationRisk) {
        riskScore += 15;
        riskCategories.push("Patient Engagement");
        recommendedActions.push("Implement stricter cancellation policies or automated reminders.");
    }

    riskScore = Math.min(riskScore, 100);

    let severity = "Low";
    if (riskScore >= 70) severity = "High";
    else if (riskScore >= 40) severity = "Medium";

    return {
        riskScore,
        severity,
        riskCategories,
        recommendedActions
    };
}

module.exports = { calculateRisk };
