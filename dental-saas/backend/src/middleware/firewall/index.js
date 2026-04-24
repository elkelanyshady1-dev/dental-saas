/**
 * firewall/index.js — Architecture Firewall (Zero-Trust Enforcement Layer)
 *
 * Unified export of all runtime firewall guards.
 * These guards enforce architectural invariants that CANNOT be bypassed
 * at runtime, complementing the ESLint + CI static enforcement layers.
 *
 * Mount order in app.js org chain (AFTER capability resolution, BEFORE routes):
 *   ... → assertCapabilities → assertTenant → assertAuthorization → orgV1Routes
 *
 * Guards:
 *   assertTenant         — req.context.organizationId MUST exist (500 if missing)
 *   assertAuthorization  — detects controllers that skip authorize() (log, non-blocking)
 *
 * Already covered by existing middleware (NOT duplicated here):
 *   assertCapabilities   — req.capabilities MUST exist (middleware/assertCapabilities.js)
 *   dtoEnforcer          — DTO contract validation (middleware/dtoEnforcer.js)
 *
 * PLANE: Org only.
 */

"use strict";

const assertTenant = require("./assertTenant");
const assertAuthorization = require("./assertAuthorization");

module.exports = {
    assertTenant,
    assertAuthorization,
};
