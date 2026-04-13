/**
 * caseMargin.projection.js
 * 
 * Aggregates Financial and Inventory data for O(1) margin view.
 */

const { CaseCostSnapshot } = require("../modules/inventoryDomain/models/InventoryModels");
// Phase G — Import Remediation: redirected from broken financeDomain path to billingDomain canonical
const FinancialSnapshot = require("../modules/billingDomain/projections/snapshot/FinancialSnapshot.model");


async function buildCaseMarginProjection(organizationId, caseId) {
    // 1. Get total revenue (B2C only)
    const financialSnapshot = await FinancialSnapshot.findOne({ organizationId, caseId });
    const revenue = financialSnapshot ? financialSnapshot.totalInvoiced : 0;

    // 2. Get total costs
    const costSnapshot = await CaseCostSnapshot.findOne({ organizationId, caseId });
    const inventoryCost = costSnapshot ? costSnapshot.totalInventoryCost : 0;
    const labCost = costSnapshot ? costSnapshot.totalLabCost : 0;

    const totalCost = inventoryCost + labCost;
    const marginAmount = revenue - totalCost;
    const marginPercentage = revenue > 0 ? (marginAmount / revenue) * 100 : 0;

    return {
        revenue,
        costs: {
            inventory: inventoryCost,
            lab: labCost,
            total: totalCost
        },
        margin: {
            amount: marginAmount,
            percentage: marginPercentage.toFixed(2)
        },
        status: marginPercentage > 30 ? "HEALTHY" : "CRITICAL"
    };
}

module.exports = {
    buildCaseMarginProjection
};
