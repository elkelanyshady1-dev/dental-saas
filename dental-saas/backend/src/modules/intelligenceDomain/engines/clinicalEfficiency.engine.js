/**
 * clinicalEfficiency.engine.js
 * 
 * Absolute Clinical Efficiency Engine.
 * Projection-only pure function with no mutations.
 */

function calculateEfficiency({
    actualStageDurations = [],
    expectedStageDurations = [],
    treatmentDuration = 0,
    expectedTreatmentDuration = 0
}) {
    let totalDeviation = 0;
    let delayedStages = 0;
    const bottleneckStages = [];
    const deviationFlags = [];
    const stageCount = actualStageDurations.length;

    for (let i = 0; i < stageCount; i++) {
        const actual = actualStageDurations[i] || 0;
        const expected = expectedStageDurations[i] || 0;

        totalDeviation += (actual - expected);

        if (actual > expected) {
            delayedStages++;
        }

        if (expected > 0 && actual > (expected * 1.5)) {
            bottleneckStages.push(i);
            deviationFlags.push(`Stage ${i} critically delayed`);
        }
    }

    const averageStageDeviation = stageCount > 0 ? (totalDeviation / stageCount) : 0;
    const delayRatio = stageCount > 0 ? (delayedStages / stageCount) : 0;

    let efficiencyScore = 100 - (delayRatio * 100);

    // Additional hit for overall treatment duration
    if (expectedTreatmentDuration > 0 && treatmentDuration > expectedTreatmentDuration) {
        efficiencyScore -= ((treatmentDuration - expectedTreatmentDuration) / expectedTreatmentDuration) * 10;
    }

    efficiencyScore = Number(Math.min(Math.max(efficiencyScore, 0), 100).toFixed(2));

    return {
        efficiencyScore,
        delayIndex: delayRatio,
        bottleneckStages,
        deviationFlags,
        averageStageDeviation
    };
}

module.exports = { calculateEfficiency };
