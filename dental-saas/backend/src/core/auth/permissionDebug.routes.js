/**
 * permissionDebug.routes.js — Permission Debug API Routes
 *
 * DEV/STAGING-ONLY routes that expose real-time permission resolution
 * visibility for org admin users.
 *
 * PLANE: Org only.
 * GUARD: orgProtect + requireOrgPermission(P.SECURITY_MANAGE)
 * ENVIRONMENT: Returns 403 in production.
 *
 * @swagger
 * /api/v1/org/debug/permissions:
 *   get:
 *     summary: Permission Debug Matrix (DEV only)
 *     description: |
 *       Returns the current user's RBAC × Entitlement permission resolution
 *       matrix. Shows every SSOT permission key with RBAC granted, entitlement
 *       enabled, and final decision. Disabled in production.
 *     tags: [Debug]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Permission debug matrix
 *       403:
 *         description: Debug disabled in production or insufficient permissions
 *
 * @swagger
 * /api/v1/org/debug/permissions/simulate:
 *   post:
 *     summary: Policy Simulation (DEV only)
 *     description: |
 *       Simulates the complete authorization decision chain (RBAC + Entitlement
 *       + PBAC + Field Access) for a single permission key. Optionally accepts
 *       resource context for PBAC evaluation. Returns detailed trace of every
 *       auth layer's decision including matched policy rules.
 *     tags: [Debug]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - permission
 *             properties:
 *               permission:
 *                 type: string
 *                 example: "patients.update"
 *               resource:
 *                 type: object
 *                 description: Optional resource context for PBAC evaluation
 *     responses:
 *       200:
 *         description: Policy simulation result
 *       403:
 *         description: Debug disabled in production or insufficient permissions
 *
 * @swagger
 * /api/v1/org/debug/permissions/full-matrix:
 *   get:
 *     summary: Full Debug Matrix (DEV only)
 *     description: |
 *       Returns the complete authorization debug matrix combining RBAC,
 *       Entitlement, PBAC, and Field Access for every SSOT permission.
 *       More comprehensive than the basic /permissions endpoint.
 *     tags: [Debug]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Full authorization debug matrix
 *       403:
 *         description: Debug disabled in production or insufficient permissions
 */

"use strict";

const express = require("express");
const router = express.Router();

const { P } = require("../../rbac/orgPermissions");
const requireOrgPermission = require("../../middleware/requireOrgPermission");
const { getPermissionDebugMatrix } = require("./permissionDebug.controller");
const { simulatePermission, generateDebugMatrix, explainPermission } = require("../../rbac/policyDebugger");
const logger = require("../../utils/logger");

// ─── Production Safety Gate ─────────────────────────────────────────────────

function productionGuard(req, res, next) {
    if (process.env.NODE_ENV === "production") {
        return res.status(403).json({
            success: false,
            error: { code: "DEBUG_DISABLED", message: "Debug endpoints are disabled in production." },
        });
    }
    next();
}

// GET /api/v1/org/debug/permissions
// Original RBAC × Entitlement matrix
router.get(
    "/permissions",
    requireOrgPermission(P.SECURITY_MANAGE),
    getPermissionDebugMatrix
);

// POST /api/v1/org/debug/permissions/simulate
// Single permission simulation (RBAC + Entitlement + PBAC + Field Access)
router.post(
    "/permissions/simulate",
    requireOrgPermission(P.SECURITY_MANAGE),
    productionGuard,
    async (req, res) => {
        try {
            const { permission, resource } = req.body;

            if (!permission || typeof permission !== "string") {
                return res.status(400).json({
                    success: false,
                    error: { code: "INVALID_INPUT", message: "permission (string) is required." },
                });
            }

            const capabilities = req.capabilities || {};
            const modules = capabilities.modules || {};

            const result = simulatePermission({
                permission,
                user: req.user,
                rolePermissions: req.user?.roleId?.permissions || {},
                planModules: modules,
                resource: resource || null,
                branchId: req.branchId || req.activeBranchId || null,
                organizationId: req.organizationId || req.user?.organizationId,
            });

            // Log access to simulation endpoint
            logger.info({
                event: "POLICY_SIMULATION_ACCESSED",
                userId: req.user?._id,
                permission,
                result: result.final ? "ALLOWED" : "DENIED",
                correlationId: req.correlationId,
            }, `[PolicyDebug] Simulated "${permission}" → ${result.final ? "ALLOWED" : "DENIED"}`);

            res.json({
                success: true,
                data: {
                    result,
                    explanation: explainPermission(result),
                    simulatedAt: new Date().toISOString(),
                },
            });
        } catch (err) {
            logger.error({
                event: "POLICY_SIMULATION_ERROR",
                err: err.message,
                requestId: req.requestId,
            }, "[PolicyDebug] Simulation failed");

            res.status(500).json({
                success: false,
                error: { code: "SIMULATION_ERROR", message: err.message },
            });
        }
    }
);

// GET /api/v1/org/debug/permissions/full-matrix
// Complete multi-layer authorization debug matrix
router.get(
    "/permissions/full-matrix",
    requireOrgPermission(P.SECURITY_MANAGE),
    productionGuard,
    async (req, res) => {
        try {
            const capabilities = req.capabilities || {};
            const modules = capabilities.modules || {};

            const matrix = generateDebugMatrix({
                user: req.user,
                rolePermissions: req.user?.roleId?.permissions || {},
                planModules: modules,
                branchId: req.branchId || req.activeBranchId || null,
                organizationId: req.organizationId || req.user?.organizationId,
            });

            // Log access
            logger.info({
                event: "FULL_DEBUG_MATRIX_ACCESSED",
                userId: req.user?._id,
                role: matrix.role,
                totalPermissions: matrix.totalPermissions,
                finalGranted: matrix.finalGranted,
                correlationId: req.correlationId,
            }, "[PolicyDebug] Full matrix accessed");

            // Mask email
            const maskEmail = (email) => {
                if (!email) return "unknown";
                const [local, domain] = email.split("@");
                if (!domain) return "***";
                return `${local.charAt(0)}${"*".repeat(Math.max(local.length - 2, 1))}${local.charAt(local.length - 1)}@${domain}`;
            };

            res.json({
                success: true,
                data: {
                    user: {
                        id: req.user?._id,
                        name: req.user?.name,
                        email: maskEmail(req.user?.email),
                        role: matrix.role,
                    },
                    resolverVersion: "v36.0",
                    generatedAt: new Date().toISOString(),
                    ...matrix,
                },
            });
        } catch (err) {
            logger.error({
                event: "FULL_DEBUG_MATRIX_ERROR",
                err: err.message,
                requestId: req.requestId,
            }, "[PolicyDebug] Full matrix generation failed");

            res.status(500).json({
                success: false,
                error: { code: "DEBUG_ERROR", message: err.message },
            });
        }
    }
);

module.exports = router;
