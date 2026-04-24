/**
 * orgAddOn.aggregate.service.js
 * Phase v6.0 — Add-On Monetization Engine
 *
 * v13.0 — Relocated from organization/billing/services/ to modules/billingDomain/services/
 * to eliminate cross-plane import from billingDomain controller into org/billing/services.
 *
 * IMPORT RULE: Only import from shared/ or within modules/billingDomain/
 * Do NOT re-import this from organization/billing/services.
 *
 * Connection-binding rule (Step 5f): OrgAddOn is a tenant model. Callers
 * MUST supply the organizationId; this service resolves the tenant
 * connection per call and binds the model — never module-scoped.
 */

"use strict";

const getModel = require("@core/db/getModel");
const { resolveOrgConnection } = require("@core/db/connectionResolver");
const OrgAddOnDef = require("../../../organization/billing/models/orgAddOn.model");

async function _getOrgAddOn(organizationId) {
  const conn = await resolveOrgConnection(organizationId);
  return getModel(conn, OrgAddOnDef);
}

/**
 * createOrgAddOn
 * @param {object} data - Add-on subscription data
 * @param {string} data.organizationId REQUIRED
 */
async function createOrgAddOn(data) {
  if (!data?.organizationId) {
    throw new Error("createOrgAddOn: organizationId is required");
  }
  const OrgAddOn = await _getOrgAddOn(data.organizationId);
  return await OrgAddOn.create(data);
}

/**
 * cancelOrgAddOn
 * @param {string} id - OrgAddOn document ID
 * @param {string} organizationId - Owner org
 */
async function cancelOrgAddOn(id, organizationId) {
  if (!organizationId) {
    throw new Error("cancelOrgAddOn: organizationId is required");
  }
  const OrgAddOn = await _getOrgAddOn(organizationId);
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
