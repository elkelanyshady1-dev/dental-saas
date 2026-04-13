/**
 * campaignResolver.js
 * Phase v6-2 — Promotional Campaigns
 */

"use strict";

const Campaign = require("../../platform/domain/models/campaign.model").default;

const { Money } = require("../../utils/money");

/**
 * applyCampaigns
 * Finds and applies automated promotional campaigns to the invoice draft.
 * 
 * @param {Object} invoiceDraft - The current invoice state (post-coupon)
 * @param {Object} orgContext - Contains billingCountry and plan details
 * @returns {Promise<Object>} Updated invoice draft
 */
async function applyCampaigns(invoiceDraft, orgContext) {
    const now = new Date();
    const currency = invoiceDraft.currency || "USD";

    // Find active campaigns matching date range
    const activeCampaigns = await Campaign.find({
        isActive: true,
        startDate: { $lte: now },
        endDate: { $gte: now }
    });

    if (activeCampaigns.length === 0) return invoiceDraft;

    let totalCampaignDiscountMoney = Money.fromMinor(0, currency);
    const appliedCampaigns = [];

    for (const campaign of activeCampaigns) {
        // 1. Validate Geo-Restrictions
        if (campaign.countryScope && campaign.countryScope.length > 0) {
            if (!campaign.countryScope.includes(orgContext.billingCountry)) {
                continue; // Skip this campaign
            }
        }

        // 2. Validate Scope applicability
        let eligibleMoney = Money.fromMinor(0, currency);

        if (campaign.appliesTo === "all") {
            eligibleMoney = Money.fromDecimal(invoiceDraft.subtotalAmount, currency);
        } else if (campaign.appliesTo === "plan") {
            if (campaign.planCodes && campaign.planCodes.length > 0 && !campaign.planCodes.includes(orgContext.planCode)) {
                continue;
            }
            eligibleMoney = Money.fromDecimal(invoiceDraft.basePlanAmount, currency);
        } else if (campaign.appliesTo === "addon") {
            eligibleMoney = Money.fromDecimal(invoiceDraft.addOnAmount || 0, currency);
        }

        if (eligibleMoney.amountMinor <= 0) continue;

        // 3. Calculate Discount (v8.2 Precision)
        let campaignDiscountMoney = Money.fromMinor(0, currency);
        if (campaign.discountType === "percentage") {
            if (!Number.isInteger(campaign.discountValue)) {
                throw new Error("Enterprise Invariant Violation: Campaign discountValue must be integer percent");
            }
            campaignDiscountMoney = eligibleMoney.applyPercentage(campaign.discountValue);
        } else if (campaign.discountType === "fixed") {
            campaignDiscountMoney = Money.fromDecimal(campaign.discountValue, currency);
            if (campaignDiscountMoney.amountMinor > eligibleMoney.amountMinor) {
                campaignDiscountMoney = eligibleMoney;
            }
        }

        // Prevent discounting below zero (Floor-at-Zero)
        const currentSubtotalMoney = Money.fromDecimal(invoiceDraft.subtotalAmount, currency);
        const remainingAfterPriorCampaigns = currentSubtotalMoney.subtract(totalCampaignDiscountMoney);

        if (campaignDiscountMoney.amountMinor > remainingAfterPriorCampaigns.amountMinor) {
            campaignDiscountMoney = remainingAfterPriorCampaigns;
        }

        if (campaignDiscountMoney.amountMinor > 0) {
            totalCampaignDiscountMoney = totalCampaignDiscountMoney.add(campaignDiscountMoney);
            appliedCampaigns.push(campaign.name);
        }
    }

    if (totalCampaignDiscountMoney.amountMinor > 0) {
        invoiceDraft.campaignDiscountAmount = totalCampaignDiscountMoney.toDecimal();
        invoiceDraft.appliedCampaigns = appliedCampaigns;
        const subtotalMoney = Money.fromDecimal(invoiceDraft.subtotalAmount, currency);
        invoiceDraft.subtotalAmount = subtotalMoney.subtract(totalCampaignDiscountMoney).toDecimal();
    }

    return invoiceDraft;
}

module.exports = {
    applyCampaigns
};
