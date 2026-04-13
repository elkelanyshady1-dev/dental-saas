/**
 * policyRegistry.js — Policy Registry (Phase X.3 Modular)
 *
 * Re-exports the merged policy definitions from src/rbac/policies/.
 * All domain policies are split into individual files for maintainability.
 *
 * Export shape: { policies, helpers }
 *
 * PLANE: Org only.
 */

"use strict";

module.exports = require("./policies");
