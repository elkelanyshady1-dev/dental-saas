// TODO(5e-B-manual): 1 .default import(s) not auto-migrated:
//   - OrgAddOn (../models/orgAddOn.model) — tenant + no req access (worker/utility)
/**
 * orgAddOn.service.js
 * Phase v6.0 — Add-On Monetization Engine
 */

"use strict";

const OrgAddOn = require("../models/orgAddOn.model").default;

/**
 * createOrgAddOn
 */
async function createOrgAddOn(data) {
  return await OrgAddOn.create(data);
}

/**
 * cancelOrgAddOn
 * @param {string} id 
 * @param {string} organizationId 
 */
async function cancelOrgAddOn(id, organizationId) {
  const orgAddOn = await OrgAddOn.findOne({
    _id: id,
    organizationId
  });
  if (!orgAddOn) throw new Error("ADDON_SUBSCRIPTION_NOT_FOUND");
  if (orgAddOn.status === "cancelled") throw new Error("ADDON_ALREADY_CANCELLED");
  orgAddOn.status = "cancelled";
  orgAddOn.autoRenew = false;
  orgAddOn.version += 1;
  await orgAddOn.save();
  return orgAddOn;
}
module.exports = {
  createOrgAddOn,
  cancelOrgAddOn
};