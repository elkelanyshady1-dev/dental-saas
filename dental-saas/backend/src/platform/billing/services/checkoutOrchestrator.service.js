/**
 * checkoutOrchestrator.service.js (platform path)
 *
 * Phase 5 — DEDUPLICATED. The real implementation lives at
 *   src/organization/billing/checkout/checkoutOrchestrator.service.js
 *
 * This file used to hold a parallel copy of the orchestrator that drifted
 * behind the organization copy (Phase 2/3 hardening landed here first, but
 * the live route never called into this file). It is now a passthrough
 * re-export so every import path — `@billing/services/checkoutOrchestrator.service`,
 * the facade, and direct test imports — resolves to a single source of truth.
 *
 * Do not add new behaviour here. Edit the organization copy.
 */

"use strict";

module.exports = require("../../../organization/billing/checkout/checkoutOrchestrator.service");
