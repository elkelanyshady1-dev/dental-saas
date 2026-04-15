/**
 * roles.controller.js — Thin controllers for org-plane Role management
 *
 * All business logic lives in roles.service.js. Each handler here does
 * three things and nothing more:
 *   1. parse req.params + req.body through the Zod validators
 *   2. call the service
 *   3. shape the response via responseFormatter
 *
 * RBAC enforcement is route-level (double-gate: requireOrgPermission +
 * policyMiddleware). Do NOT add role checks here.
 *
 * Error handling: validators throw ZodError → mapped to 400 with the flat
 * issue list. Service throws httpError-shaped errors with statusCode +
 * errorCode → surfaced directly. Unknown errors → 500.
 *
 * PLANE: Org only.
 */

"use strict";

const { ZodError } = require("zod");
const rolesService = require("./roles.service");
const {
    createRoleSchema,
    updateRoleSchema,
    assignRoleSchema,
} = require("./roles.validators");
const { successResponse, errorResponse } = require("@utils/responseFormatter");
const logger = require("@utils/logger");

// ─── Error mapper ───────────────────────────────────────────────────────────

/**
 * Map any error thrown from validators or the service into the standard
 * response envelope. Contract (never broken):
 *   - ZodError → 400 VALIDATION_FAILED
 *   - service httpError → status + code passed through verbatim
 *   - unknown → 500 with `fallbackCode`, full stack logged
 *
 * errorCode is ALWAYS present on the wire — the frontend depends on it
 * for switch-based UX (e.g. showing "Reassign users first" vs "Role name
 * already in use"). If an error has a statusCode but no errorCode, we
 * still substitute the fallback rather than dropping the field.
 */
function sendServiceError(res, err, fallbackCode = "ROLES_INTERNAL_ERROR") {
    if (err instanceof ZodError) {
        return errorResponse(
            res,
            "Validation failed",
            "VALIDATION_FAILED",
            400,
        );
    }
    if (err && err.statusCode) {
        return errorResponse(
            res,
            err.message,
            err.errorCode || fallbackCode,
            err.statusCode,
        );
    }
    logger.error(
        { event: "ROLES_CONTROLLER_ERROR", err: err?.message, stack: err?.stack },
        "[RolesController] Unhandled error",
    );
    return errorResponse(res, "An unexpected error occurred", fallbackCode, 500);
}

// ─── Handlers ───────────────────────────────────────────────────────────────

/**
 * GET /org/roles
 * List all roles with user counts. DTO-shaped.
 */
async function listRoles(req, res) {
    try {
        const data = await rolesService.listRoles(req);
        return successResponse(res, data);
    } catch (err) {
        return sendServiceError(res, err);
    }
}

/**
 * GET /org/roles/:roleId
 * Fetch a single role with its user count. DTO-shaped.
 */
async function getRole(req, res) {
    try {
        const data = await rolesService.getRoleById(req, { roleId: req.params.roleId });
        return successResponse(res, data);
    } catch (err) {
        return sendServiceError(res, err);
    }
}

/**
 * POST /org/roles
 * Create a custom role. System roles cannot be created here (flag is
 * hard-wired to false in the service).
 */
async function createRole(req, res) {
    try {
        const payload = createRoleSchema.parse(req.body);
        const data = await rolesService.createRole(req, payload);
        return successResponse(res, data, 201);
    } catch (err) {
        return sendServiceError(res, err);
    }
}

/**
 * PATCH /org/roles/:roleId
 * Update a custom role. System roles are rejected with SYSTEM_ROLE_IMMUTABLE.
 */
async function updateRole(req, res) {
    try {
        const patch = updateRoleSchema.parse(req.body);
        const { role, invalidatedSessions } = await rolesService.updateRole(req, {
            roleId: req.params.roleId,
            patch,
        });
        return successResponse(res, { role, invalidatedSessions });
    } catch (err) {
        return sendServiceError(res, err);
    }
}

/**
 * DELETE /org/roles/:roleId
 * Delete a custom role. Rejects if: system role, users still assigned,
 * or removal would drop the org below one STAFF_MANAGE role.
 */
async function deleteRole(req, res) {
    try {
        const data = await rolesService.deleteRole(req, { roleId: req.params.roleId });
        return successResponse(res, data);
    } catch (err) {
        return sendServiceError(res, err);
    }
}

/**
 * Shared assign-role implementation. Takes the resolved payload and runs
 * it through the service + standard envelope. NEVER call from outside this
 * file — use one of the two thin handlers below that each resolves the
 * payload from a single, explicit source (params vs body).
 */
async function _performAssign(req, res, payload) {
    try {
        const parsed = assignRoleSchema.parse(payload);
        const result = await rolesService.assignRoleToUser(req, parsed);

        // Out-of-band `meta.forceRefresh` tells the frontend to trigger an
        // immediate JWT re-issue (happens on self-assignment). All other
        // callers ignore it.
        return successResponse(
            res,
            {
                userId: result.userId,
                roleId: result.roleId,
                noop: result.noop === true,
            },
            200,
            { forceRefresh: result.forceRefresh === true },
        );
    } catch (err) {
        return sendServiceError(res, err);
    }
}

/**
 * POST /org/users/:userId/role — REST-canonical route.
 * `userId` MUST come from req.params — body fallback is forbidden to keep
 * the source of truth unambiguous.
 */
async function assignRoleByUserParam(req, res) {
    return _performAssign(req, res, {
        userId: req.params.userId,
        roleId: req.body?.roleId,
    });
}

/**
 * POST /org/roles/assign — UI-convenience route.
 * Both IDs come from body. Params are IGNORED.
 */
async function assignRoleByBody(req, res) {
    return _performAssign(req, res, {
        userId: req.body?.userId,
        roleId: req.body?.roleId,
    });
}

module.exports = {
    listRoles,
    getRole,
    createRole,
    updateRole,
    deleteRole,
    // Two explicit entry points — each sourced from exactly one place.
    assignRoleByUserParam,
    assignRoleByBody,
};
