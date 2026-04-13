/**
 * addOn.service.js (Shared Proxy)
 * Cross-plane safe re-export of the AddOn service.
 * Org-plane code must import addOn.service from here, never from platformDomain.
 */
"use strict";

module.exports = require("../../platform/domain/services/platformAddOn.service");
