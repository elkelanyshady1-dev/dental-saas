/**
 * Region.model.js (Shared Proxy)
 * Cross-plane safe re-export of the Region model.
 * Org-plane code must import Region from here, never from platformDomain.
 */
"use strict";

module.exports = require("../../platform/domain/models/Region.model").default;
