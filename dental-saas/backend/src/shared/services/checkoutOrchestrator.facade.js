/**
 * checkoutOrchestrator.facade.js — Shared facade for checkout orchestrator.
 *
 * Phase 5: retargeted at the organization copy, which is now the sole
 * implementation. The platform path still resolves via its own re-export,
 * so existing imports (both `@billing/services/checkoutOrchestrator.service`
 * and this facade) all reach the same module.
 *
 * PLANE: Shared (bridges any consumer to the canonical checkout orchestrator)
 */
"use strict";

module.exports = require("@root/organization/billing/checkout/checkoutOrchestrator.service");
