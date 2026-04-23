/**
 * getShareLinkModel.js
 * Platform — ShareLink accessor bound to the platform sibling connection.
 *
 * Usage (public resolver path):
 *   const getShareLinkModel = require("@platform/shareLink/getShareLinkModel");
 *   const ShareLink = getShareLinkModel();
 *   const link = await ShareLink.findOne({ token }).lean();
 *
 * The resolver then uses link.orgId to look up the tenant cluster and
 * open the per-org DB to load the target asset.
 */

"use strict";

const getPlatformModel = require("@core/db/getPlatformModel");
const ShareLinkDef = require("./ShareLink.model");

function getShareLinkModel() {
    return getPlatformModel(ShareLinkDef);
}

module.exports = getShareLinkModel;
