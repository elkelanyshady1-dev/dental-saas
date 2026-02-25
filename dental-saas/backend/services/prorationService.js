/**
 * Calculates the prorated difference when changing plans mid-cycle.
 * Does not mutate the database.
 * 
 * @param {Object} params
 * @param {number} params.currentPlanPrice
 * @param {number} params.newPlanPrice
 * @param {Date|string} params.currentPeriodStart
 * @param {Date|string} params.currentPeriodEnd
 * @param {Date|string} [params.now] Defaults to new Date()
 * @returns {Object} { unusedCredit, newPlanCharge, finalAmount, remainingDays, totalDays }
 */
exports.calculateProration = ({
    currentPlanPrice,
    newPlanPrice,
    currentPeriodStart,
    currentPeriodEnd,
    now = new Date()
}) => {
    const start = new Date(currentPeriodStart).getTime();
    const end = new Date(currentPeriodEnd).getTime();
    const currentTime = new Date(now).getTime();

    // Prevent negative total days or invalid cycles
    if (end <= start) {
        return { unusedCredit: 0, newPlanCharge: newPlanPrice, finalAmount: newPlanPrice, remainingDays: 0, totalDays: 0 };
    }

    // Standardize total and remaining days
    const totalMs = end - start;
    const remainingMs = Math.max(0, end - currentTime);

    // Calculate fractions
    const fractionRemaining = remainingMs / totalMs;

    // Proportionally value the rest of the current plan
    const unusedCredit = currentPlanPrice * fractionRemaining;

    // Proportionally cost the rest of the new plan
    const newPlanCharge = newPlanPrice * fractionRemaining;

    // Net difference (positive means user owes money, negative means credit to user)
    const finalAmount = newPlanCharge - unusedCredit;

    return {
        unusedCredit: parseFloat(unusedCredit.toFixed(2)),
        newPlanCharge: parseFloat(newPlanCharge.toFixed(2)),
        finalAmount: parseFloat(finalAmount.toFixed(2)),
        remainingDays: Math.ceil(remainingMs / (1000 * 60 * 60 * 24)),
        totalDays: Math.ceil(totalMs / (1000 * 60 * 60 * 24))
    };
};
