/**
 * clinical.read.service.js
 * 
 * Read-Only Facade for Clinical Protocol Domain.
 *
 * @per-org-compliant — All read operations use getModel + guards.
 * organizationId auto-injected via per-org DB connection.
 *
 * Phase F.3 — Runtime assertions as defense-in-depth.
 */

const { ClinicalCaseDef, ProtocolDefinitionDef } = require("../models/SCPEModels");
const { assertClinicalRLS } = require("../../../core/guards/tenantAssertions");
const getModel = require("../../../core/db/getModel");

function _getModels(req) {
    const conn = req.dbConnection;
    if (!conn) {
        throw new Error("[ClinicalReadService] req.dbConnection is REQUIRED (per-org mode)");
    }
    return {
        ClinicalCase: getModel(conn, ClinicalCaseDef),
        Protocol: getModel(conn, ProtocolDefinitionDef),
    };
}

class ClinicalReadService {
    /**
     * getClinicalCase(req, caseId, session)
     * @per-org-compliant — per-org DB connection provides tenant isolation
     */
    async getClinicalCase(req, caseId, session = null) {
        assertClinicalRLS(req, "ClinicalReadService.getClinicalCase");
        const { ClinicalCase } = _getModels(req);
        return await ClinicalCase.findOne({ _id: caseId })
            .session(session)
            .lean();
    }

    /**
     * getProtocolDefinition(req, protocolId, session)
     * @per-org-compliant — per-org DB connection provides tenant isolation
     */
    async getProtocolDefinition(req, protocolId, session = null) {
        assertClinicalRLS(req, "ClinicalReadService.getProtocolDefinition");
        const { Protocol } = _getModels(req);
        return await Protocol.findOne({ _id: protocolId })
            .session(session)
            .lean();
    }

    /**
     * aggregateCases(req, pipeline, session)
     * Safe wrapper for aggregation pipelines on ClinicalCase.
     * @per-org-compliant — per-org connection scopes $match { organizationId }
     */
    async aggregateCases(req, pipeline, session = null) {
        assertClinicalRLS(req, "ClinicalReadService.aggregateCases");
        const { ClinicalCase } = _getModels(req);
        const result = ClinicalCase.aggregate(pipeline);
        if (session) return await result.session(session);
        return await result;
    }
}

module.exports = new ClinicalReadService();
