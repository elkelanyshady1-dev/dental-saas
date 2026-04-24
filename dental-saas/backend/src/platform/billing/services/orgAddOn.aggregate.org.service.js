/**
 * orgAddOn.service.js
 * Phase v6.0 — Add-On Monetization Engine
 *
 * Connection-binding rule (Step 5f): OrgAddOn is a tenant model. Callers
 * MUST supply the organizationId; this service resolves the tenant
 * connection per call and binds the model — never module-scoped.
 */

"use strict";

const getModel = require("@core/db/getModel");
const { resolveOrgConnection } = require("@core/db/connectionResolver");
const OrgAddOnDef = require("../models/orgAddOn.model");

async function _getOrgAddOn(organizationId) {
  const conn = await resolveOrgConnection(organizationId);
  return getModel(conn, OrgAddOnDef);
}

/**
 * createOrgAddOn
 * @param {object} data — must include organizationId
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
 * @param {string} id
 * @param {string} organizationId
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
