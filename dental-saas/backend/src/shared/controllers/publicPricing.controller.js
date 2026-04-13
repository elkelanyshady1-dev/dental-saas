/**
 * publicPricing.controller.js (Shared Proxy)
 * Cross-plane safe re-export of public pricing controller handlers.
 * Public routes must import from here, never from platformDomain.
 */
"use strict";

module.exports = require("../../platform/domain/controllers/platformPublicPricing.controller");
