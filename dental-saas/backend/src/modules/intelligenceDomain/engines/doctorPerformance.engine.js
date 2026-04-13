/**
 * doctorPerformance.engine.js
 * 
 * Absolute Doctrine Performance Index (DPI).
 * Projection-only pure function with no mutations or side effects.
 */

function calculateDPI({
    revenue = 0,
    margin = 0,
    efficiencyScore = 0,
    completionRate = 0,
    reliabilityRate = 0,
    weights = {},
    targetRevenue = 1, // Avoid division by zero
    targetMargin = 1
}) {
    const wRev = weights.revenueWeight ?? 0.30;
    const wMar = weights.marginWeight ?? 0.25;
    const wEff = weights.efficiencyWeight ?? 0.20;
    const wCom = weights.completionWeight ?? 0.15;
    const wRel = weights.reliabilityWeight ?? 0.10;

    // Absolute Normalizations (0-100)
    const RevenueScore = Math.min((revenue / targetRevenue) * 100, 100);
    const MarginScore = Math.min((margin / targetMargin) * 100, 100);
    const EfficiencyScore = Math.min(Math.max(efficiencyScore, 0), 100);
    const CompletionScore = Math.min(completionRate * 100, 100);
    const ReliabilityScore = Math.min(reliabilityRate * 100, 100);

    // DPI Calculation
    const performanceScore = Number((
        (wRev * RevenueScore) +
        (wMar * MarginScore) +
        (wEff * EfficiencyScore) +
        (wCom * CompletionScore) +
        (wRel * ReliabilityScore)
    ).toFixed(2));

    let grade = "D";
    if (performanceScore >= 85) grade = "A";
    else if (performanceScore >= 70) grade = "B";
    else if (performanceScore >= 50) grade = "C";

    let contributionCategory = "Low";
    if (performanceScore > 80) contributionCategory = "High";
    else if (performanceScore > 50) contributionCategory = "Medium";

    const riskFlags = [];
    if (RevenueScore < 50) riskFlags.push("Low Revenue");
    if (MarginScore < 50) riskFlags.push("Low Margin");
    if (EfficiencyScore < 50) riskFlags.push("Low Efficiency");

    return {
        performanceScore,
        grade,
        contributionCategory,
        riskFlags
    };
}

module.exports = { calculateDPI };
