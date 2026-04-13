/**
 * src/shared/services/OrganizationService.js
 * 
 * Shared proxy for the canonical Organization Service.
 * Allows Platform plane to trigger tenant lifecycle actions (provisioning, status updates)
 * while maintaining structural isolation from internal organization logic.
 */
"use strict";

const organizationService = require("../../organization/services/organization.service");

module.exports = organizationService;
