/**
 * campaign.aggregate.service.js
 * Phase v6.2 — Promotional Campaigns
 */

"use strict";

const getPlatformModel = require("@core/db/getPlatformModel");
const CampaignDef = require("../models/campaign.model");
let _Campaign_cache = null;
function Campaign() {
    return _Campaign_cache || (_Campaign_cache = getPlatformModel(CampaignDef));
}
async function createCampaign(data) {
  return await Campaign().create(data);
}
async function updateCampaign(id, version, updateData) {
  const campaign = await Campaign().findById(id);
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