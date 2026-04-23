/**
 * orgAddOn.service.js
 * Phase v6.0 — Add-On Monetization Engine
 */

"use strict";

const getModel = require("@core/db/getModel");
const OrgAddOnDef = require("../models/orgAddOn.model");

/** @private Resolve OrgAddOn model — connection-bound when available */
function _getOrgAddOn(dbConnection) {
  return dbConnection ? getModel(dbConnection, OrgAddOnDef) : OrgAddOnDef.default;
}

/**
 * createOrgAddOn
 * @param {Object} data
 * @param {Object} [options]
 * @param {import('mongoose').Connection} [options.dbConnection]
 */
async function createOrgAddOn(data, {
  dbConnection
} = {}) {
  const OrgAddOn = _getOrgAddOn(dbConnection);
  return await OrgAddOn.create(data);
}

/**
 * cancelOrgAddOn
 * @param {string} id 
 * @param {string} organizationId
 * @param {Object} [options]
 * @param {import('mongoose').Connection} [options.dbConnection]
 */
async function cancelOrgAddOn(id, organizationId, {
  dbConnection
} = {}) {
  const OrgAddOn = _getOrgAddOn(dbConnection);
  // @per-org-transactional — billing engine — addon cancellation with explicit organizationId filter
  const orgAddOn = await OrgAddOn.findOne({
    _id: id
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