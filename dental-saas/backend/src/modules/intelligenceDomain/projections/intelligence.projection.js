/**
 * intelligence.projection.js
 * 
 * Projection-only intelligence aggregator for v3.7.
 * Adheres to absolute scoring algorithms and strict domain isolation rules.
 */

const FinancialSnapshotDef = require("../../billingDomain/projections/snapshot/FinancialSnapshot.model");
const CaseCostSnapshotDef = require("../../inventoryDomain/models/caseCostSnapshot.model");
const IntelligenceWeightsDef = require("../config/intelligenceWeights.model");
const getModel = require("@core/db/getModel");
const clinicalReadService = require("../../clinicalProtocolDomain/read/clinical.read.service");

// Import Engine Pure Functions
const { calculateDPI } = require("../engines/doctorPerformance.engine");
const { calculateEfficiency } = require("../engines/clinicalEfficiency.engine");
const { calculateRisk } = require("../engines/riskScoring.engine");

/**
 * generateIntelligence
 * 
 * Assembles snapshot and read-only data to run the Intelligence Engines.
 * 
 * @param {ObjectId} organizationId - The tenant scope
 * @param {Object}   req             - Express req for tenant context
 * @returns {Object} Extracted intelligence scorecards
 */
async function generateIntelligence(organizationId, req) {
    if (!organizationId) throw new Error("organizationId is strictly required for Intelligence Projection.");

    const conn = req.dbConnection;
    const FinancialSnapshot = getModel(conn, FinancialSnapshotDef);
    const CaseCostSnapshot = getModel(conn, CaseCostSnapshotDef);
    const IntelligenceWeights = getModel(conn, IntelligenceWeightsDef);

    // 1. Fetch Configuration
    let weights = await IntelligenceWeights.findOne({ organizationId }).lean().exec();
    if (!weights) {
        // Fallback to absolute defaults
        weights = {
            revenueWeight: 0.30,
            marginWeight: 0.25,
            efficiencyWeight: 0.20,
            completionWeight: 0.15,
            reliabilityWeight: 0.10
        };
    }

    // 2. Fetch Financial Data (from isolated Materialized Views)
    const financials = await FinancialSnapshot.find({ organizationId }).lean().exec();
    let totalRevenue = 0;
    let totalOutstanding = 0;
    financials.forEach(f => {
        totalRevenue += (f.totalBilled || 0);
        totalOutstanding += (f.outstandingBalance || 0);
    });

    // 3. Fetch Case Cost Snapshots (from isolated Materialized Views)
    const caseCosts = await CaseCostSnapshot.find({ organizationId }).lean().exec();
    let totalInventoryCost = 0;
    caseCosts.forEach(c => {
        totalInventoryCost += (c.totalInventoryCost || 0);
    });
    const margin = totalRevenue - totalInventoryCost;
    const inventoryCostRatio = totalRevenue > 0 ? (totalInventoryCost / totalRevenue) : 0;

    // 4. Fetch Clinical Data via read-only Facade — @per-org-compliant
    const aggregationReq = req || { organizationId }; // Fallback for internal/batch callers
    const cases = await clinicalReadService.aggregateCases(aggregationReq, [
        { $match: {} } // organizationId auto-injected by secureModel
    ]);

    let completedCases = 0;
    const actualDurations = [];
    const expectedDurations = [];

    cases.forEach(c => {
        if (c.status === 'completed') completedCases++;
        if (c.stages && Array.isArray(c.stages)) {
            c.stages.forEach(s => {
                if (s.completedAt && s.startedAt) {
                    const days = (new Date(s.completedAt) - new Date(s.startedAt)) / (1000 * 60 * 60 * 24);
                    actualDurations.push(days);
                    expectedDurations.push(s.expectedDurationDays || 1); // fallback to 1 day
                }
            });
        }
    });

    const completionRate = cases.length > 0 ? (completedCases / cases.length) : 0;

    // 5. Mock Appointment Stats (to avoid raw aggregate imports missing in facade)
    // Assuming 95% show up, 5% cancel
    const reliabilityRate = 0.95;
    const cancellationRate = 0.05;

    // 6. Execute Pure Engine Functions
    const efficiency = calculateEfficiency({
        actualStageDurations: actualDurations,
        expectedStageDurations: expectedDurations,
        treatmentDuration: actualDurations.reduce((a, b) => a + b, 0),
        expectedTreatmentDuration: expectedDurations.reduce((a, b) => a + b, 0)
    });

    const dpi = calculateDPI({
        revenue: totalRevenue,
        margin,
        efficiencyScore: efficiency.efficiencyScore,
        completionRate,
        reliabilityRate,
        weights,
        targetRevenue: 100000, // $100k org baseline
        targetMargin: 50000    // $50k org baseline
    });

    const risk = calculateRisk({
        outstandingBalance: totalOutstanding,
        margin,
        delayRatio: efficiency.delayIndex,
        inventoryCostRatio,
        cancellationRate
    });

    return {
        organizationId,
        dpi,
        efficiency,
        risk
    };
}

module.exports = { generateIntelligence };
