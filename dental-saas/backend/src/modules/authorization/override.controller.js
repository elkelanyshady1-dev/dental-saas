/**
 * override.controller.js
 * v4.8 — Visibility Override Governance
 */

"use strict";

const UserDef = require("../../shared/models/User");
const getModel = require("../../core/db/getModel");
const { resolvePermissions } = require("../../core/authorization/permissionMatrix");
const { createAuditRecord } = require("../../services/auditService");
const { successResponse, errorResponse } = require("@utils/responseFormatter");

// Per-request secure model
function _getSecureUser(req) {
    return getModel(req.dbConnection, UserDef);
}

class OverrideController {
    /**
     * GET /api/v1/org/users/:userId/visibility
     * Fetch current overrides and resolved permission state.
     */
    async getVisibility(req, res) {
        try {
            const { userId } = req.params;
            const organizationId = req.organizationId;

            const User = _getSecureUser(req);
            // Per-org DB: connection scopes to org database
            const targetUser = await User.findOne({ _id: userId });
            if (!targetUser) {
                return errorResponse(res, "User not found", "NOT_FOUND", 404);
            }

            // v4.8 Logic: Resolve permissions using current state
            const resolvedPermissions = resolvePermissions(targetUser);

            return successResponse(res, {
                userId: targetUser._id,
                role: targetUser.role,
                visibilityOverrides: targetUser.visibilityOverrides || {},
                resolvedPermissions,
                version: targetUser.version
            });
        } catch (error) {
            return errorResponse(res, error.message, "FETCH_FAILED", 400);
        }
    }

    /**
     * PUT /api/v1/org/users/:userId/visibility
     * Update visibility overrides with OAV and Audit.
     */
    async updateVisibility(req, res) {
        try {
            const { userId } = req.params;
            const { visibilityOverrides, expectedVersion } = req.body;
            const organizationId = req.organizationId;
            const actorId = req.user._id;
            const activeBranchId = req.activeBranchId;

            if (expectedVersion === undefined) {
                return errorResponse(res, "expectedVersion is required for OAV enforcement", "OAV_REQUIRED", 400);
            }

            const User = _getSecureUser(req);
            // Per-org DB: connection scopes to org database
            const targetUser = await User.findOne({ _id: userId });
            if (!targetUser) {
                return errorResponse(res, "User not found", "NOT_FOUND", 404);
            }

            // 1. OAV Check
            if (targetUser.version !== expectedVersion) {
                return errorResponse(res, `Version conflict. Expected ${targetUser.version} but got ${expectedVersion}`, "VERSION_CONFLICT", 409);
            }

            // 2. Validate Overrides (Enum check)
            const validScopes = ["ALL", "BRANCH", "OWN"];
            if (visibilityOverrides) {
                for (const [domain, scope] of Object.entries(visibilityOverrides)) {
                    if (!validScopes.includes(scope)) {
                        return errorResponse(res, `Invalid scope '${scope}' for domain '${domain}'`, "INVALID_SCOPE", 400);
                    }
                    if (domain === "inventory" && scope === "OWN") {
                        return errorResponse(res, "Inventory does not support 'OWN' scope", "INVALID_SCOPE", 400);
                    }
                }
            }

            const previousOverrides = targetUser.visibilityOverrides ? { ...targetUser.visibilityOverrides } : {};

            // 3. Update & Version Increment
            targetUser.visibilityOverrides = visibilityOverrides;
            targetUser.version += 1;
            await targetUser.save();

            // 4. Audit Log
            await createAuditRecord({
                organizationId,
                branchId: activeBranchId,
                actorId,
                action: "VISIBILITY_OVERRIDE_UPDATED",
                entity: "User",
                entityId: targetUser._id,
                details: {
                    previous: previousOverrides,
                    new: visibilityOverrides,
                    userId: targetUser._id
                }
            });

            return successResponse(res, {
                message: "Visibility overrides updated successfully",
                version: targetUser.version,
                visibilityOverrides: targetUser.visibilityOverrides
            });
        } catch (error) {
            return errorResponse(res, error.message, "UPDATE_FAILED", 400);
        }
    }

    /**
     * DELETE /api/v1/org/users/:userId/visibility
     * Remove overrides and revert to role defaults.
     */
    async deleteVisibility(req, res) {
        try {
            const { userId } = req.params;
            const organizationId = req.organizationId;
            const actorId = req.user._id;
            const activeBranchId = req.activeBranchId;

            const User = _getSecureUser(req);
            // Per-org DB: connection scopes to org database
            const targetUser = await User.findOne({ _id: userId });
            if (!targetUser) {
                return errorResponse(res, "User not found", "NOT_FOUND", 404);
            }

            const previousOverrides = targetUser.visibilityOverrides ? { ...targetUser.visibilityOverrides } : {};

            targetUser.visibilityOverrides = undefined;
            targetUser.version += 1;
            await targetUser.save();

            // Audit
            await createAuditRecord({
                organizationId,
                branchId: activeBranchId,
                actorId,
                action: "VISIBILITY_OVERRIDE_REMOVED",
                entity: "User",
                entityId: targetUser._id,
                details: {
                    removed: previousOverrides,
                    userId: targetUser._id
                }
            });

            return successResponse(res, { message: "Visibility overrides cleared" });
        } catch (error) {
            return errorResponse(res, error.message, "DELETE_FAILED", 400);
        }
    }
}

module.exports = new OverrideController();
