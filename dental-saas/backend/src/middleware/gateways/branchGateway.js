/**
 * branchGateway.js — Branch Context Gateway (Phase 2)
 *
 * PURPOSE:
 * Thin wrapper over branchContext.middleware.js — the existing, hardened
 * branch resolution middleware that validates primaryBranchId, applies
 * hasFullBranchAccess platform admin bypass, and enforces mutation guards.
 *
 * COMPOSE, DO NOT REIMPLEMENT:
 * branchContext.middleware.js already handles:
 *   - x-branch-id header extraction and ObjectId validation
 *   - primaryBranchId fallback with BUG-6 fix (400 if undefined)
 *   - hasFullBranchAccess bypass for platform admins
 *   - Mutation enforcement (POST/PUT/PATCH/DELETE require explicit branch)
 *   - sets req.activeBranchId and req.branchId
 *
 * PREREQUISITES (must run AFTER orgGateway):
 *   req.user              — set by orgGateway
 *   req.organizationId    — set by orgGateway
 *
 * PLANE: Organization only.
 * PHASE: 2 — Safe consolidation.
 */

"use strict";

const branchContext = require("../branchContext.middleware");
const logger = require("@utils/logger");

/**
 * branchGateway middleware
 *
 * Delegates to branchContext.middleware.js.
 * Exposes as a named gateway for clarity in route definitions.
 *
 * @type {import("express").RequestHandler}
 */
function branchGateway(req, res, next) {
    return branchContext(req, res, next);
}

module.exports = branchGateway;
