/**
 * risk.projection.js
 * Analytics Domain — Risk Intelligence
 *
 * Identifies high-risk financial and operational anomalies.
 *
 * @per-org-compliant — All queries use getModel + guards.
 * req context propagated from analytics.service for tenant scoping.
 */

// Phase G — Import Remediation: redirected from broken financeDomain path to billingDomain canonical
const FinancialSnapshotDef = require("../../billingDomain/projections/snapshot/FinancialSnapshot.model");

const getModel = require("@core/db/getModel");
const patientReadService = require("../../patientDomain/read/patient.read.service");

// ─── Per-Request Model Resolution ────────────────────────────────────────────
function _getModels(req) {
    return {
        FinancialSnapshot: getModel(req.dbConnection, FinancialSnapshotDef),
    };
}

async function getHighOutstandingRisk(organizationId, req) {
    const { FinancialSnapshot } = _getModels(req);
    // 1. Fetch top 5 high-risk records — @per-org-compliant
    const snapshots = await FinancialSnapshot.find(
        { outstandingBalance: { $gt: 1000 } }
    )
        .sort({ outstandingBalance: -1 })
        .limit(5)
        .select("patientId outstandingBalance")
        .lean();

    if (snapshots.length === 0) return [];

    // 2. Performance-Safe Batch Lookup for Patient Names — @per-org-compliant
    const patientIds = snapshots.map(s => s.patientId);
    const patients = await patientReadService.getPatientsByIds(req, patientIds);

    // 3. Efficient In-Memory Map
    const patientMap = patients.reduce((acc, p) => {
        acc[p._id.toString()] = p;
        return acc;
    }, {});

    // 4. Return combined data without violating aggregation logic
    return snapshots.map(s => ({
        ...s,
        patientId: patientMap[s.patientId.toString()] || { nameArabic: "N/A", nameEnglish: "N/A" }
    }));
}

async function getLowMarginAlerts(organizationId, req) {
    const { FinancialSnapshot } = _getModels(req);
    // Cross-projection intelligence using purely snapshot models — @per-org-compliant
    return await FinancialSnapshot.aggregate([
        { $match: { totalInvoiced: { $gt: 0 } } },
        {
            $lookup: {
                from: "casecostsnapshots",
                localField: "_id",
                foreignField: "caseId",
                as: "costs"
            }
        },
        { $unwind: "$costs" },
        {
            $project: {
                patientId: 1,
                revenue: "$totalInvoiced",
                totalCost: { $add: ["$costs.totalInventoryCost", "$costs.totalLabCost"] }
            }
        },
        {
            $project: {
                patientId: 1,
                revenue: 1,
                totalCost: 1,
                marginAmount: { $subtract: ["$revenue", "$totalCost"] }
            }
        },
        {
            $project: {
                patientId: 1,
                revenue: 1,
                totalCost: 1,
                marginAmount: 1,
                marginPercentage: {
                    $cond: [
                        { $eq: ["$revenue", 0] },
                        0,
                        { $multiply: [{ $divide: ["$marginAmount", "$revenue"] }, 100] }
                    ]
                }
            }
        },
        { $match: { marginPercentage: { $lt: 20 } } },
        { $limit: 10 }
    ]);
}

module.exports = {
    getHighOutstandingRisk,
    getLowMarginAlerts
};
