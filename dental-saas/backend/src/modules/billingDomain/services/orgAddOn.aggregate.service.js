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

// OrgAddOn model lives in organization/billing/models — platform-level data.
const OrgAddOnDef = require("../../../organization/billing/models/orgAddOn.model");
const getModel = require("../../../core/db/getModel");
const { getPlatformConnection } = require("../../../core/db/dbResolver");

function _getOrgAddOn() {
    return getModel(getPlatformConnection(), OrgAddOnDef);
}

/**
 * createOrgAddOn
 * @param {object} data - Add-on subscription data
 */
async function createOrgAddOn(data) {
    return await _getOrgAddOn().create(data);
}

/**
 * cancelOrgAddOn
 * @param {string} id - OrgAddOn document ID
 * @param {string} organizationId - Owner org
 */
async function cancelOrgAddOn(id, organizationId) {
    // @per-org-transactional — add-on aggregate — organizationId from authenticated req
    const orgAddOn = await _getOrgAddOn().findOne({ _id: id, organizationId });
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
