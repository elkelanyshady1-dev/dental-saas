/**
 * users.controller.js — User Management Controller (v2.0)
 * Phase 1 — Organization Access Layer
 * Phase F.1 — RLS Activation (secureModel integration)
 * Phase E.1 — Email Uniqueness Enforcement (Org Email System v1.0)
 *
 * Express request handlers for /api/v1/users endpoints.
 * All handlers assume orgProtect + requireOrgPermission have already run.
 * Service layer receives `req` for tenant context — organizationId is injected automatically.
 *
 * PLANE: Org only.
 */

"use strict";

const getPlatformModel = require("@core/db/getPlatformModel");
const asyncHandler = require("@utils/asyncHandler");
const usersService = require("../services/users.service");
const {
  validateCreateUser,
  validateUpdateUser
} = require("../validators/users.validator");

// ── Error code → HTTP status map ──────────────────────────────────────────────
const ERROR_STATUS_MAP = {
  EMAIL_ALREADY_EXISTS_IN_ORG: 409,
  DUPLICATE_USERNAME: 409,
  ROLE_NOT_FOUND: 404,
  USER_NOT_FOUND: 404,
  INVALID_BRANCH_ACCESS: 400,
  ORG_SLUG_MISSING: 500,
  SELF_DEACTIVATION: 400,
  SELF_DELETION: 400
};
function domainErrResponse(err, res) {
  const status = err.statusCode || ERROR_STATUS_MAP[err.errorCode] || 500;
  return res.status(status).json({
    success: false,
    error: err.errorCode || "INTERNAL_ERROR",
    message: err.message
  });
}

/**
 * POST /api/v1/users
 * Create a new staff user — email is auto-generated on the backend.
 */
exports.createUser = asyncHandler(async (req, res) => {
  const {
    error
  } = validateCreateUser(req.body);
  if (error) {
    return res.status(400).json({
      success: false,
      error: "VALIDATION_ERROR",
      message: error
    });
  }
  let user;
  try {
    user = await usersService.createUser(req.body, req, req.user._id.toString());
  } catch (err) {
    return domainErrResponse(err, res);
  }
  return res.status(201).json({
    success: true,
    data: user,
    message: "User created successfully"
  });
});

/**
 * GET /api/v1/users/check-username
 * Live check: is a given firstName+lastName combination already taken?
 *
 * Query params: firstName, lastName
 * Response: { available: boolean, email: string, suggestedEmail?: string }
 *
 * RBAC: requires users.create — only admins provisioning staff should call this.
 */
exports.checkUsername = asyncHandler(async (req, res) => {
  const {
    firstName,
    lastName
  } = req.query;
  if (!firstName?.trim() || !lastName?.trim()) {
    return res.status(400).json({
      success: false,
      error: "VALIDATION_ERROR",
      message: "firstName and lastName query params are required"
    });
  }
  const {
    User
  } = usersService._getModels(req);
  const OrganizationDef = require("../../../shared/models/Organization");
  const Organization = getPlatformModel(OrganizationDef);
  const org = await Organization.findById(req.context.organizationId).select("slug").lean();
  if (!org?.slug) {
    return res.status(500).json({
      success: false,
      error: "ORG_SLUG_MISSING",
      message: "Organization slug not configured"
    });
  }
  const baseUsername = `${firstName.trim()}.${lastName.trim()}`;
  const candidateEmail = usersService.generateOrgEmail(baseUsername, org.slug);
  const taken = await usersService.isOrgEmailTaken(User, candidateEmail);
  if (!taken) {
    return res.json({
      success: true,
      available: true,
      email: candidateEmail
    });
  }

  // Compute the suggested auto-incremented email for UX preview
  let suggestedEmail = null;
  for (let i = 2; i <= 10; i++) {
    const candidate = usersService.generateOrgEmail(`${baseUsername}${i}`, org.slug);
    const exists = await usersService.isOrgEmailTaken(User, candidate);
    if (!exists) {
      suggestedEmail = candidate;
      break;
    }
  }
  return res.json({
    success: true,
    available: false,
    email: candidateEmail,
    suggestedEmail,
    message: "This name is already used in your clinic. A suffix will be added automatically."
  });
});

/**
 * GET /api/v1/users
 * List users in the authenticated organization with pagination.
 */
exports.listUsers = asyncHandler(async (req, res) => {
  const result = await usersService.listUsers(req, {
    page: req.query.page,
    limit: req.query.limit,
    search: req.query.search,
    roleId: req.query.roleId,
    isActive: req.query.isActive
  });
  res.json({
    success: true,
    data: result.data,
    pagination: result.pagination
  });
});

/**
 * GET /api/v1/users/:id
 * Get a single user by ID.
 */
exports.getUserById = asyncHandler(async (req, res) => {
  const user = await usersService.getUserById(req.params.id, req);
  res.json({
    success: true,
    data: user
  });
});

/**
 * PATCH /api/v1/users/:id
 * Update a user.
 */
exports.updateUser = asyncHandler(async (req, res) => {
  // ── RBAC BYPASS GUARD ─────────────────────────────────────────────────
  // Role assignment MUST flow through POST /users/:id/role — that path
  // runs the STAFF_MANAGE lockout + tokenVersion bump + audit in a single
  // transaction. Accepting `roleId` on the generic PATCH would bypass
  // those invariants. Fail closed.
  if (req.body && Object.prototype.hasOwnProperty.call(req.body, "roleId")) {
    return res.status(400).json({
      success: false,
      error: {
        errorCode: "ROLE_ASSIGNMENT_VIA_USERS_ENDPOINT_FORBIDDEN",
        message: "Role changes must be sent to POST /users/:id/role, not PATCH /users/:id",
        statusCode: 400
      }
    });
  }
  const {
    error
  } = validateUpdateUser(req.body);
  if (error) {
    return res.status(400).json({
      success: false,
      error: "VALIDATION_ERROR",
      message: error
    });
  }
  let user;
  try {
    user = await usersService.updateUser(req.params.id, req.body, req, req.user._id.toString());
  } catch (err) {
    return domainErrResponse(err, res);
  }
  res.json({
    success: true,
    data: user,
    message: "User updated successfully"
  });
});

/**
 * DELETE /api/v1/users/:id
 * Soft-delete a user.
 */
exports.deleteUser = asyncHandler(async (req, res) => {
  let result;
  try {
    result = await usersService.deleteUser(req.params.id, req, req.user._id.toString());
  } catch (err) {
    return domainErrResponse(err, res);
  }
  res.json({
    success: true,
    message: result.message
  });
});

/**
 * GET /api/v1/users/practitioners
 * Returns active users who are flagged as practitioners (isPractitioner: true).
 *
 * This replaces the previous two-step role-name lookup.
 * ANY user with isPractitioner=true appears here — including admins acting as doctors.
 *
 * Response shape:
 *   { _id, name, specialty, avatarUrl, branchAccess[], hasFullBranchAccess }
 *
 * RBAC: requires appointments.create (scheduling context) or users.read.
 */
exports.getPractitioners = asyncHandler(async (req, res) => {
  const UserDef = require("../../../shared/models/User");
  const getModel = require("../../../core/db/getModel");
  const User = getModel(req.dbConnection, UserDef);

  // Single-step query — no role join needed
  const doctors = await User.find({
    isPractitioner: true,
    isActive: true,
    deletedAt: null
  }).select("_id firstName lastName name profileImage profile branchAccess hasFullBranchAccess").lean();
  const practitioners = doctors.map(p => ({
    _id: p._id.toString(),
    name: p.name || `${p.firstName || ""} ${p.lastName || ""}`.trim(),
    specialty: p.profile?.specialty || "general",
    avatarUrl: p.profileImage || null,
    branchAccess: (p.branchAccess || []).map(id => id.toString()),
    hasFullBranchAccess: p.hasFullBranchAccess || false
  }));
  return res.json({
    success: true,
    data: {
      practitioners
    }
  });
});