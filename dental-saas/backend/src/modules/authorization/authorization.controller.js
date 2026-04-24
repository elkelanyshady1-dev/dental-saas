/**
 * authorization.controller.js
 * v4.8 — Permission Introspection API + Drift Detection
 */

"use strict";

const {
  resolvePermissions
} = require("../../core/authorization/permissionMatrix");
const {
  successResponse,
  errorResponse
} = require("../../utils/responseFormatter");
const {
  getValidPermissionKeys
} = require("@rbac/permissionValidator");
const {
  getDriftReport
} = require("@rbac/permissionDrift");
class AuthorizationController {
  /**
   * GET /org/me/permissions
   * Exposes resolved scopes and capabilities to the frontend.
   */
  async getMyPermissions(req, res) {
    try {
      const user = req.user;
      const activeBranchId = req.activeBranchId;
      if (!user) {
        return errorResponse(res, "Authentication required", "AUTH_REQUIRED", 401);
      }

      // v4.7 Logic: Resolve using the shared core
      const permissions = resolvePermissions(user);

      // Structure response for frontend consumption
      const response = {
        role: user.role,
        activeBranchId: activeBranchId || null,
        scopes: permissions,
        capabilities: {
          canViewAllPatients: permissions.patients === "ALL",
          canViewBranchPatients: permissions.patients === "BRANCH",
          canViewOwnPatients: permissions.patients === "OWN",
          canViewFinance: permissions.finance !== undefined,
          canViewAllFinance: permissions.finance === "ALL",
          canManageInventory: permissions.inventory === "ALL" || permissions.inventory === "BRANCH"
        }
      };
      return successResponse(res, response);
    } catch (error) {
      console.error("[AuthorizationController] Error:", error.message);
      return errorResponse(res, error.message, "PERM_RESOLVE_FAILED", 400);
    }
  }

  /**
   * GET /org/me/visibility-debug
   * Detailed resolution trace for debugging.
   *
   * AUTHORIZATION: Gated upstream at the route layer by
   *   requireOrgPermission(P.STAFF_MANAGE) + policyMiddleware.
   * No inline role checks here — RBAC is the single source of truth.
   */
  async getVisibilityDebug(req, res) {
    try {
      const user = req.user;
      const permissions = resolvePermissions(user);
      const debugInfo = {
        userId: user._id,
        role: user.role,
        visibilityOverrides: user.visibilityOverrides || {},
        resolvedPermissions: permissions,
        activeBranchId: req.activeBranchId || "Not Set",
        timestamp: new Date().toISOString()
      };
      return successResponse(res, debugInfo);
    } catch (error) {
      return errorResponse(res, error.message, "DEBUG_FAILED", 400);
    }
  }

  /**
   * GET /org/me/permission-keys
   * Returns the full list of SSOT permission keys (from orgPermissions.js P enum).
   * Used by frontend dev-mode validator to warn about invalid capability strings
   * without shipping static lists client-side.
   *
   * Response shape: { keys: string[], count: number }
   */
  getPermissionKeys(req, res) {
    try {
      const keys = [...getValidPermissionKeys()].sort();
      return successResponse(res, {
        keys,
        count: keys.length
      });
    } catch (error) {
      return errorResponse(res, error.message, "PERMISSION_KEYS_FAILED", 500);
    }
  }

  /**
   * GET /org/me/drift-report
   * Cross-checks featureRegistry.features permission strings against the P enum.
   * Clean system → { clean: true, violations: [] }
   * Drifted system → { clean: false, violations: [...] }
   *
   * Admin-only (staff.manage permission required via route guard).
   */
  getDriftReport(req, res) {
    try {
      const report = getDriftReport();
      return successResponse(res, report);
    } catch (error) {
      return errorResponse(res, error.message, "DRIFT_REPORT_FAILED", 500);
    }
  }
}
module.exports = new AuthorizationController();