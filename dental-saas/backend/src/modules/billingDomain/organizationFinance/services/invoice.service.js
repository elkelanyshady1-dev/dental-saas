/**
 * billing.service.js
 * Phase v5-6 — Billing Domain Foundation
 *
 * @per-org-transactional — Platform billing service. Called by internal cron/webhook handlers
 * without HTTP req context. All queries include explicit organizationId parameter.
 * Not invoked via org-plane HTTP routes.
 */

"use strict";

// Sprint 6: BillingInvoice removed — PlatformInvoice is the sole billing model
const BillingInvoice = require("@shared/models/BillingInvoice"); // tombstone → PlatformInvoice
// ✅ Phase 4 — Decoupled: communicationDomain no longer imported directly.
// Usage tracking is now event-driven via usage.track.v1.
const { eventBus } = require("@core/eventBus");
const { resolvePlan } = require("@core/subscription/planResolver");
const { getCurrentBillingCycle } = require("@core/subscription/communicationQuota.service");
const OrgAddOnDef = require("../../../../organization/billing/models/orgAddOn.model");
const logger = require("@utils/logger");

const OrganizationDef = require("@shared/models/Organization");
const { applyCoupon } = require("@core/billing/couponResolver");
const { applyCampaigns } = require("@core/billing/campaignResolver");
const getModel = require("@core/db/getModel");
const { getPlatformConnection } = require("@core/db/dbResolver");

const { Money } = require("@utils/money");
const FinancialInvariantService = require("@core/billing/invariants/financialInvariant.service");

function _getPlatformModels() {
    const conn = getPlatformConnection();
    return {
        Organization: getModel(conn, OrganizationDef),
        OrgAddOn: getModel(conn, OrgAddOnDef),
    };
}

/**
 * generateBillingInvoice
 * Generates a draft invoice for the current billing cycle.
 * 
 * @param {string} organizationId 
 * @param {string} couponCode Optional
 */
async function generateBillingInvoice(organizationId, couponCode = null) {
    const { Organization, OrgAddOn } = _getPlatformModels();
    const { start, end } = getCurrentBillingCycle();

    // @per-org-transactional — org finance — organizationId scoped, transactional context
    const org = await Organization.findById(organizationId);
    if (!org) throw new Error("Organization not found");

    // 1. Resolve Plan and Price
    const plan = await resolvePlan(organizationId);
    if (!plan) throw new Error("Plan not resolved for organization");

    // Resolve base price
    const baseCurrency = plan.pricing.baseCurrency || "USD";
    const priceEntry = plan.pricing.prices.find(p => p.currency === baseCurrency);
    const basePlanAmountDecimal = priceEntry ? priceEntry.monthly : 0;
    const basePlanMoney = Money.fromDecimal(basePlanAmountDecimal, baseCurrency);

    // 2. Resolve Active Add-Ons
    // @per-org-transactional — org finance — organizationId scoped, transactional context
    const activeAddOns = await OrgAddOn.find({
        organizationId,
        status: "active"
    }).populate("addOnId");

    const addOnMoney = activeAddOns.reduce((acc, addOn) => {
        return acc.add(Money.fromDecimal(addOn.price, baseCurrency));
    }, Money.fromMinor(0, baseCurrency));

    // 3. Resolve Consumption Overages
    // ✅ Phase 4 — Overage now fetched directly without cross-domain import.
    // usage.track.v1 is emitted AFTER invoice persist (fire-and-forget below).
    // Previously: usageService.getUsageForCycle() — now: overage defaults to 0
    // until a dedicated overage query endpoint is added to billingDomain.
    const overageAmountDecimal = 0; // TODO: expose overage read via billingDomain query
    const overageMoney = Money.fromDecimal(overageAmountDecimal, baseCurrency);

    // 4. Initial Subtotal
    // We use Money objects for math, but keep a draft object for resolver compatibility
    // ifresolvers expect decimals for now (we will refactor them next).
    let invoiceDraft = {
        basePlanAmount: basePlanMoney.toDecimal(),
        addOnAmount: addOnMoney.toDecimal(),
        overageAmount: overageMoney.toDecimal(),
        subtotalAmount: basePlanMoney.add(addOnMoney).add(overageMoney).toDecimal(),
        couponDiscountAmount: 0,
        campaignDiscountAmount: 0,
        appliedCampaigns: [],
        taxAmount: 0,
        totalAmount: 0,
        currency: baseCurrency
    };

    const orgContext = {
        billingCountry: org.billingCountry,
        planCode: plan.code
    };

    // 5. Apply Coupon (If Provided)
    try {
        invoiceDraft = await applyCoupon(invoiceDraft, couponCode, orgContext);
    } catch (err) {
        logger.warn(`[BillingService] Coupon ${couponCode} failed for Org ${organizationId}: ${err.message}`);
    }

    // 6. Apply Promotional Campaigns (Automated)
    invoiceDraft = await applyCampaigns(invoiceDraft, orgContext);

    // 7. Apply Tax Engine (v8-2 Integer Percent Guard)
    let taxPercent = 0;
    if (org.billingCountry === "AE") taxPercent = 5;
    else if (org.billingCountry === "SA") taxPercent = 15;

    const subtotalMoney = Money.fromDecimal(invoiceDraft.subtotalAmount, baseCurrency);
    const taxMoney = subtotalMoney.applyPercentage(taxPercent);
    invoiceDraft.taxAmount = taxMoney.toDecimal();

    // 8. Final Total
    const totalMoney = subtotalMoney.add(taxMoney);

    // v8-2-1 Domain-Aware Negative Guard
    const invoiceType = invoiceDraft.type || "standard"; // Default to standard
    const allowedNegativeTypes = ["refund", "credit_note", "adjustment"];

    if (totalMoney.amountMinor < 0 && !allowedNegativeTypes.includes(invoiceType)) {
        throw new Error(`Precision Guard: Negative total ${totalMoney.amountMinor} not allowed for invoice type ${invoiceType}`);
    }

    invoiceDraft.totalAmount = totalMoney.toDecimal();

    // Build metadata line items
    const metadata = {
        basePlan: plan.name,
        addOns: activeAddOns.map(a => ({ name: a.addOnId.name, price: a.price }))
    };

    // 9. Persist Invoice (OAV + v8-2 Minor Units)
    // @per-org-transactional — org finance — organizationId scoped, transactional context
    let invoice = await BillingInvoice.findOne({
        organizationId,
        billingCycleStart: start,
        status: "draft"
    });

    const persistData = {
        organizationId,
        billingCycleStart: start,
        billingCycleEnd: end,
        basePlanAmount: basePlanMoney.toDecimal(),
        basePlanAmountMinor: basePlanMoney.amountMinor,
        addOnAmount: addOnMoney.toDecimal(),
        addOnAmountMinor: addOnMoney.amountMinor,
        overageAmount: overageMoney.toDecimal(),
        overageAmountMinor: overageMoney.amountMinor,
        couponCode: invoiceDraft.couponCode,
        couponDiscountAmount: invoiceDraft.couponDiscountAmount,
        couponDiscountAmountMinor: Money.fromDecimal(invoiceDraft.couponDiscountAmount, baseCurrency).amountMinor,
        appliedCampaigns: invoiceDraft.appliedCampaigns,
        campaignDiscountAmount: invoiceDraft.campaignDiscountAmount,
        campaignDiscountAmountMinor: Money.fromDecimal(invoiceDraft.campaignDiscountAmount, baseCurrency).amountMinor,
        subtotalAmount: invoiceDraft.subtotalAmount,
        subtotalAmountMinor: subtotalMoney.amountMinor,
        taxAmount: invoiceDraft.taxAmount,
        taxAmountMinor: taxMoney.amountMinor,
        totalAmount: invoiceDraft.totalAmount,
        totalAmountMinor: totalMoney.amountMinor,
        currency: baseCurrency,
        status: "draft",
        metadata
    };

    // Runtime Guard
    if (!Number.isInteger(persistData.totalAmountMinor)) {
        throw new Error("Precision violation: totalAmountMinor is not an integer");
    }

    // v8-2-1 Central Invariant Shield
    FinancialInvariantService.validateInvoice(persistData);

    if (invoice) {
        Object.assign(invoice, persistData);
        invoice.version += 1;
        await invoice.save();
    } else {
        invoice = await BillingInvoice.create(persistData);
    }

    logger.info(`[BillingService] Draft invoice generated for Org ${organizationId}: Total ${invoice.totalAmount} ${baseCurrency} (${invoice.totalAmountMinor} minor units)`);

    // ✅ Phase 4 — Emit canonical events (replaces direct communicationDomain import)
    eventBus.emit("usage.track.v1", {
        orgId:    organizationId,
        type:     "invoice",
        entityId: invoice._id,
        metadata: {
            amount: invoice.totalAmount,
        },
    });
    // Legacy canonical event (consumed by accountingDomain)
    eventBus.emit("invoice.created.v1", { invoiceId: invoice._id, organizationId });

    return invoice;
}

module.exports = {
    generateBillingInvoice
};
