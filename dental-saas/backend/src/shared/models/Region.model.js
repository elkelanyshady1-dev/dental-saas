/**
 * Region.model.js (Shared Proxy)
 * Cross-plane safe re-export of the Region model.
 * Org-plane code must import Region from here, never from platformDomain.
 */
"use strict";

const { makeLazyPlatformModel } = require("@core/db/lazyModelProxy");
const RegionDef = require("../../platform/domain/models/Region.model");
module.exports = makeLazyPlatformModel(RegionDef);
