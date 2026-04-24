/**
 * Region.model.js (Shared Proxy)
 * Cross-plane safe re-export of the Region model.
 * Org-plane code must import Region from here, never from platformDomain.
 */
"use strict";

const getPlatformModel = require("@core/db/getPlatformModel");
const RegionDef = require("../../platform/domain/models/Region.model");
module.exports = getPlatformModel(RegionDef);
