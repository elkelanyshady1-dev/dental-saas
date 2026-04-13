/**
 * platformAddOn.service.js — Shared Proxy
 * Re-exports the platform-plane AddOn service for cross-plane consumers.
 * Organization-plane modules MUST import through this proxy,
 * never directly from src/platform/.
 */
"use strict";

module.exports = require("../../platform/domain/services/platformAddOn.service");
