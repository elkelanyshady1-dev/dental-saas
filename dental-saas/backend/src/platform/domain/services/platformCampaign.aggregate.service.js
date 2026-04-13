/**
 * campaign.aggregate.service.js
 * Phase v6.2 — Promotional Campaigns
 */

"use strict";

const Campaign = require("../models/campaign.model").default;

async function createCampaign(data) {
    return await Campaign.create(data);
}

async function updateCampaign(id, version, updateData) {
    const campaign = await Campaign.findById(id);
    if (!campaign) throw new Error("CAMPAIGN_NOT_FOUND");

    if (version !== undefined && campaign.version !== version) {
        throw new Error("CAMPAIGN_VERSION_CONFLICT");
    }

    Object.assign(campaign, updateData);
    campaign.version += 1;
    await campaign.save();

    return campaign;
}

module.exports = {
    createCampaign,
    updateCampaign
};
