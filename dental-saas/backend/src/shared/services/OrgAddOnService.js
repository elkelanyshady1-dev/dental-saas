/**
 * src/shared/services/OrgAddOnService.js
 * 
 * Shared proxy for the canonical Organizational Add-On Service.
 * Allows Platform plane (e.g. mutation controllers) to compute and apply
 * tenant-specific add-on states consistently.
 */
"use strict";

const orgAddOnService = require("../../organization/billing/services/orgAddOn.aggregate.service");

module.exports = orgAddOnService;
