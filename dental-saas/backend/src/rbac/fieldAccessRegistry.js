/**
 * fieldAccessRegistry.js — Field-Level RBAC Definitions (Phase X.3 Modular)
 *
 * Re-exports the merged field access definitions from src/rbac/fls/.
 * All domain FLS definitions are split into individual files for maintainability.
 *
 * Export shape: { fieldAccess, getResourceTypes, getResourceRoles, hasFullAccess }
 *
 * PLANE: Org only.
 */

"use strict";

module.exports = require("./fls");
