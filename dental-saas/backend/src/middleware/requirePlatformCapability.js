/**
 * requirePlatformCapability.js
 * Platform RBAC — Canonical Guard Name (v23.0)
 *
 * Ergonomic alias for authorizePlatformPermission.
 * Improves naming symmetry with the org-plane guard:
 *
 *   Platform: requirePlatformCapability(CAP.MANAGE_ORGANIZATIONS)
 *   Org:      requireOrgPermission(P.PATIENTS_UPDATE)
 *
 * The underlying implementation in authorizePlatformPermission.js
 * is unchanged. This file is a re-export for new code to use.
 *
 * Migration path:
 *   New routes SHOULD use requirePlatformCapability().
 *   Existing routes using authorizePlatformPermission() continue to work.
 *   No mass rename required.
 *
 * PLANE: Platform only.
 */

"use strict";

const requirePlatformCapability = require("./authorizePlatformPermission");

module.exports = requirePlatformCapability;
