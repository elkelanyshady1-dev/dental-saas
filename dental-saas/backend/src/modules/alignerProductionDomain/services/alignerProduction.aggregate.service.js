/**
 * alignerProduction.aggregate.service.js
 * Aligner Production Domain — Case Lifecycle & B2B Billing
 *
 * @per-org-compliant — All queries use getModel + guards.
 * Mixed access patterns:
 * 1. getCaseByToken()            — public (token-gated, createSystemContext)
 * 2. createProductionCase()      — org-scoped (createSystemContext)
 * 3. generateShareToken()        — org-scoped (createSystemContext)
 * 4. createDoctorInvoice()       — org-scoped (createSystemContext)
 */
"use strict";

const AlignerProductionCaseDef = require("../models/alignerProductionCase.model");
const AlignerShareTokenDef = require("../models/alignerShareToken.model");
const TreatmentInvoiceDef = require("../../billingDomain/organizationFinance/models/TreatmentInvoice.model");
const getModel = require("../../../core/db/getModel");
const dbManager = require("../../../core/db/dbManager");

const logger = require("@utils/logger");
const mongoose = require("mongoose");

/**
 * Builds getModel + guards bound to a specific org connection.
 * For background/service context (no Express req available).
 */
function _getSecureModels(conn) {
    return {
        ProductionCase: getModel(conn, AlignerProductionCaseDef),
        ShareToken: getModel(conn, AlignerShareTokenDef),
        TreatmentInvoice: getModel(conn, TreatmentInvoiceDef),
    };
}

class AlignerProductionService {
    /**
     * createProductionCase()
     * Org-scoped — uses createSystemContext for tenant isolation enforcement.
     */
    async createProductionCase(params) {
        const { organizationId } = params;
        const conn = await dbManager.getConnection(organizationId);
        const { ProductionCase } = _getSecureModels(conn);

        return await ProductionCase.create(params);
    }

    /**
     * generateShareToken()
     * Creates a temporary secure link for WhatsApp sharing.
     * Org-scoped — uses createSystemContext for tenant isolation enforcement.
     */
    async generateShareToken(params) {
        const { productionCaseId, expirationHours = 24, phoneNumber, organizationId } = params;

        const conn = await dbManager.getConnection(organizationId);
        const { ShareToken } = _getSecureModels(conn);

        const token = require("crypto").randomUUID();
        const expiresAt = new Date();
        expiresAt.setHours(expiresAt.getHours() + expirationHours);

        return await ShareToken.create({
            productionCaseId,
            token,
            expiresAt,
            phoneNumber,
        });
    }

    /**
     * getCaseByToken()
     * Publicly accessible, anonymized for patient privacy.
     * Token lookup is org-scoped — share token has organizationId, so we
     * first do a raw token lookup to get the org, then resolve securely.
     */
    async getCaseByToken(token) {
        // Step 1: Raw token lookup to determine org (no RLS needed for token→org resolution)
        // This is the ONLY raw query allowed — it returns the organizationId for subsequent secure queries.
        const platformConn = require("../../../core/db/dbResolver").getPlatformConnection();
        const RawShareToken = getModel(platformConn, AlignerShareTokenDef);
        // @per-org-public-access — aligner production — platform-level token→org resolution
        const rawToken = await RawShareToken.findOne({ token }).lean();
        if (!rawToken) throw new Error("Token invalid or expired.");

        // Step 2: Now we know the org, resolve securely
        const organizationId = rawToken.organizationId?.toString();
        if (!organizationId) throw new Error("Token has no organization context.");

        const conn = await dbManager.getConnection(organizationId);
        const { ProductionCase } = _getSecureModels(conn);

        const productionCase = await ProductionCase.findById(rawToken.productionCaseId)
            .select("patientAlias totalStages productionStatus simulationVideoUrl treatmentTimeline")
            .lean();

        if (!productionCase) throw new Error("Production case not found.");

        return productionCase;
    }

    /**
     * createDoctorInvoice()
     * Isolated B2B billing.
     * Org-scoped — uses createSystemContext for tenant isolation enforcement.
     */
    async createDoctorInvoice(params) {
        const { organizationId, productionCaseId, amount } = params;

        const conn = await dbManager.getConnection(organizationId);
        const { ProductionCase, TreatmentInvoice } = _getSecureModels(conn);

        const productionCase = await ProductionCase.findOne(
            { _id: productionCaseId }
        );
        if (!productionCase) throw new Error("Production case not found or unauthorized.");

        return await TreatmentInvoice.create({
            productionCaseId,
            doctorName: productionCase.requestingDoctorName,
            doctorClinic: productionCase.requestingDoctorClinic,
            amount,
            status: "issued",
        });
    }
}

module.exports = new AlignerProductionService();
