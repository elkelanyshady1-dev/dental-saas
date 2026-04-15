/**
 * roles.routes.js — Org Role Management Routes (Phase B)
 *
 * Mount path: /api/v1/org/roles (via featureRegistry basePath "roles")
 *
 * Security — every route enforces the standard Phase D double-gate:
 *   1. orgProtect                         → JWT + org context + dbConnection
 *   2. requireOrgPermission(P.STAFF_MANAGE) → RBAC SSOT check
 *   3. policyMiddleware(P.STAFF_MANAGE)    → PBAC policy evaluation
 *   4. handler                              → thin controller → service
 *
 * The assign endpoint additionally requires P.USERS_UPDATE because it
 * mutates a User document (roleId + tokenVersion), not just a Role
 * document. Both permissions must pass.
 *
 * Route table:
 *   GET    /roles                       list all roles          (STAFF_MANAGE)
 *   GET    /roles/:roleId               get one role            (STAFF_MANAGE)
 *   POST   /roles                       create custom role      (STAFF_MANAGE)
 *   PATCH  /roles/:roleId               update custom role      (STAFF_MANAGE)
 *   DELETE /roles/:roleId               delete custom role      (STAFF_MANAGE)
 *   POST   /roles/assign                assign role to user     (STAFF_MANAGE + USERS_UPDATE)
 *        body: { userId, roleId }
 *
 * PLANE: Org only.
 */

"use strict";

const express = require("express");
const router = express.Router();

const orgProtect = require("@middleware/orgProtect");
const requireOrgPermission = require("@middleware/requireOrgPermission");
const policyMiddleware = require("@rbac/policyMiddleware");
const { P } = require("@rbac/orgPermissions");

const rolesController = require("./roles.controller");

// ─── Reusable middleware bundles ───────────────────────────────────────────
// RBAC-then-PBAC ordering: cheaper check first (Set lookup) → fail fast
// before we run the policy engine. When multiple permissions are required,
// all RBAC checks run first, then all PBAC checks. The existing
// policyMiddleware takes a single permission per call; we keep them
// grouped here so a reader sees "all the gates" in one block.
const staffManageGate = [
    requireOrgPermission(P.STAFF_MANAGE),
    policyMiddleware(P.STAFF_MANAGE),
];

const staffManagePlusUserWriteGate = [
    requireOrgPermission(P.STAFF_MANAGE),
    requireOrgPermission(P.USERS_UPDATE),
    policyMiddleware(P.STAFF_MANAGE),
    policyMiddleware(P.USERS_UPDATE),
];

// ─── Router-level auth guard ───────────────────────────────────────────────
// Idempotent with any parent-level orgProtect — required so this module is
// safe to mount standalone (pattern matches users.routes.js).
router.use(orgProtect);

// ─── READ ──────────────────────────────────────────────────────────────────

// GET /roles
router.get("/", ...staffManageGate, rolesController.listRoles);

// GET /roles/:roleId
router.get("/:roleId", ...staffManageGate, rolesController.getRole);

// ─── WRITE ─────────────────────────────────────────────────────────────────

// POST /roles
router.post("/", ...staffManageGate, rolesController.createRole);

// POST /roles/assign  — UI-convenience alias. Same handler family as
// `POST /users/:userId/role` (mounted on the users router), but sources
// both IDs from the body. Registered BEFORE /:roleId so the literal path
// wins against any future `:roleId` param route.
router.post(
    "/assign",
    ...staffManagePlusUserWriteGate,
    rolesController.assignRoleByBody,
);

// PATCH /roles/:roleId
router.patch("/:roleId", ...staffManageGate, rolesController.updateRole);

// DELETE /roles/:roleId
// Returns 200 (not 204) to keep response shape consistent with the rest
// of the API — every other endpoint returns { success, data }, and the
// frontend's response wrapper assumes that shape.
router.delete("/:roleId", ...staffManageGate, rolesController.deleteRole);

module.exports = router;
