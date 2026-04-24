/**
 * billingContract.facade.js — Shared facade for platform billing services.
 *
 * Org-plane code MUST import billing services through this facade instead of
 * using the @billing alias directly. This enforces plane isolation while
 * providing a stable API surface for cross-plane billing operations.
 *
 * PLANE: Shared (bridges org-plane → platform billing services)
 */
"use strict";

// ─── Services ────────────────────────────────────────────────────────────────
const contractEngine = require("@billing/services/contractEngine.service");
const { activateContract } = require("@billing/services/contractActivation.service");
const { computePrice } = require("@billing/pricing/pricingEngine.service");
const { emitBillingTimelineEvent } = require("@billing/services/billingTimeline.service");
const { resolveRegionCode } = require("@billing/pricing/pricingRegionResolver");
const { projectPlanVersionList } = require("@billing/services/planProjection.service");
const { getProvider } = require("@billing/providers/paymentProviderFactory");
const { resolveOrganizationEntitlements } = require("@billing/services/entitlementResolver.service");
const { generatePlatformInvoice } = require("@billing/services/invoiceEngine.service");

// ─── Model Definitions (read-only access for org-plane) ──────────────────────
const PlanVersionDef = require("@billing/models/PlanVersion.model");
const PlanTemplateDef = require("@billing/models/PlanTemplate.model");
const OrgContractDef = require("@billing/models/OrgContract.model");
const PlatformInvoiceDef = require("@billing/models/PlatformInvoice.model");

module.exports = {
    // Services
    createContract: contractEngine.createContract,
    contractEngine,
    activateContract,
    computePrice,
    emitBillingTimelineEvent,
    resolveRegionCode,
    projectPlanVersionList,
    getProvider,
    resolveOrganizationEntitlements,
    generatePlatformInvoice,

    // Model definitions (read-only for cross-plane queries)
    PlanVersionDef,
    PlanTemplateDef,
    OrgContractDef,
    PlatformInvoiceDef,
};
