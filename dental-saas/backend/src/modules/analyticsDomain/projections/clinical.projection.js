/**
 * clinical.projection.js
 * Analytics Domain — Clinical Workflow Intelligence
 *
 * @per-org-compliant — Delegates to clinicalReadService which uses getModel(req.dbConnection, Def).
 * req context propagated from analytics.service for tenant isolation enforcement.
 */

const clinicalReadService = require("../../clinicalProtocolDomain/read/clinical.read.service");

/**
 * ClinicalProjection
 * 
 * Provides workflow intelligence (Active cases by specialty, bottlenecks).
 */
async function getActiveCasesBySpecialty(organizationId, req) {
    // organizationId removed from $match — per-org connection provides it
    return await clinicalReadService.aggregateCases(req, [
        {
            $match: {
                status: "ACTIVE"
            }
        },
        {
            $group: {
                _id: "$specialty",
                count: { $sum: 1 }
            }
        },
        {
            $project: {
                specialty: "$_id",
                count: 1,
                _id: 0
            }
        }
    ]);
}

async function getStageBottlenecks(organizationId, req) {
    // organizationId removed from $match — per-org connection provides it
    return await clinicalReadService.aggregateCases(req, [
        {
            $match: {
                status: "ACTIVE"
            }
        },
        {
            $group: {
                _id: "$currentStage",
                caseCount: { $sum: 1 }
            }
        },
        {
            $project: {
                stage: "$_id",
                caseCount: 1,
                _id: 0
            }
        },
        { $sort: { caseCount: -1 } }
    ]);
}

module.exports = {
    getActiveCasesBySpecialty,
    getStageBottlenecks
};
