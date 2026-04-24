/**
 * dev.routes.js — RBAC Observability & Debugging Routes (Dev Only)
 *
 * Mounts ONLY when NODE_ENV !== "production". See platform/index.js for the
 * conditional require + mount. Every handler is platformProtect + superAdminOnly.
 *
 * ROUTES
 * ──────
 *   GET /dev/permissions/diff/:userId?organizationId=<id>
 *       Nested-role-doc vs resolved-effective-permissions diff.
 *
 *   GET /dev/audit/permissions?organizationId=<id>&userId=<id>&from=&to=
 *       Permission-affecting event timeline reconstructed from AuditLog.
 *
 * SAFETY
 * ──────
 *   - Read-only
 *   - Dev-only (module is not required in production)
 *   - Superadmin-gated at route layer
 *
 * PLANE: Platform
 */

"use strict";

const express = require("express");
const router = express.Router();

const platformProtect = require("../../middleware/platformProtect");
const superAdminOnly = require("../../middleware/superAdminOnly");

const {
    getPermissionDiff,
    getPermissionAuditTimeline,
} = require("../../platform/controllers/devObservabilityController");

// ─── Guard chain ────────────────────────────────────────────────────────────
// Defense in depth: even though this router is only mounted in non-production,
// every route is still gated by platformProtect + superAdminOnly so a
// misconfigured NODE_ENV in staging can't leak permission internals.
const guard = [platformProtect, superAdminOnly];

router.get("/permissions/diff/:userId", guard, getPermissionDiff);
router.get("/audit/permissions", guard, getPermissionAuditTimeline);

module.exports = router;
