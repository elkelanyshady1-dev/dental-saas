/**
 * orgAddOn.aggregate.service.js
 * Phase v6.0 — Add-On Monetization Engine
 *
 * v13.0 — Relocated from organization/billing/services/ to modules/billingDomain/services/
 * to eliminate cross-plane import from billingDomain controller into org/billing/services.
 *
 * IMPORT RULE: Only import from shared/ or within modules/billingDomain/
 * Do NOT re-import this from organization/billing/services.
 */

"use strict";

// OrgAddOn model lives in organization/billing/models — this is an acceptable
// shared-model import (models are shared data contracts, not plane logic).
const OrgAddOn = require("../../../organization/billing/models/orgAddOn.model").default;

/**
 * createOrgAddOn
 * @param {object} data - Add-on subscription data
 */
async function createOrgAddOn(data) {
    return await OrgAddOn.create(data);
}

/**
 * cancelOrgAddOn
 * @param {string} id - OrgAddOn document ID
 * @param {string} organizationId - Owner org
 */
async function cancelOrgAddOn(id, organizationId) {
    const orgAddOn = await OrgAddOn.findOne({ _id: id, organizationId });
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
