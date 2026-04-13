/**
 * portalAccess.controller.js
 * Phase 6 — Portal Access System: Controller
 *
 * Endpoints:
 *   POST /portal/access/send      — Staff: generate magic/setup link
 *   POST /portal/access/verify    — Public: verify link token
 *   POST /portal/setup/complete   — Public: complete onboarding
 *
 * All methods pass req for tenant isolation enforcement.
 *
 * @per-org-transactional — portal access controller — passes req for secureModel
 */

"use strict";

const portalAccessService = require("../services/portalAccess.service");
const { successResponse, errorResponse } = require("@utils/responseFormatter");

/**
 * POST /portal/access/send
 * Staff-triggered: generates a magic link or setup link for a patient.
 *
 * Body: { patientId, type, deliveryChannel? }
 */
async function sendAccessLink(req, res) {
    try {
        const { patientId, type, deliveryChannel } = req.body;

        if (!patientId) {
            return errorResponse(res, "patientId is required.", "VALIDATION_ERROR", 400);
        }

        if (!type || !["magic_link", "setup_link"].includes(type)) {
            return errorResponse(
                res,
                "type is required and must be 'magic_link' or 'setup_link'.",
                "VALIDATION_ERROR",
                400
            );
        }

        const result = await portalAccessService.sendAccessLink({
            patientId,
            type,
            deliveryChannel,
        });

        return successResponse(res, result, 201);
    } catch (err) {
        return errorResponse(res, err.message, "ACCESS_LINK_ERROR", err.statusCode || 500);
    }
}

/**
 * POST /portal/access/verify
 * Public: validates a magic link or setup link token.
 *
 * Body: { token }
 */
async function verifyAccessToken(req, res) {
    try {
        const { token } = req.body;

        if (!token) {
            return errorResponse(res, "token is required.", "VALIDATION_ERROR", 400);
        }

        const result = await portalAccessService.verifyAccessToken({ req, token });

        return successResponse(res, result);
    } catch (err) {
        return errorResponse(res, err.message, "TOKEN_VERIFY_ERROR", err.statusCode || 401);
    }
}

/**
 * POST /portal/setup/complete
 * Public: completes patient onboarding after setup link verification.
 *
 * Body: { setupToken, password?, medicalHistory? }
 */
async function completeSetup(req, res) {
    try {
        const { setupToken, password, medicalHistory } = req.body;

        if (!setupToken) {
            return errorResponse(res, "setupToken is required.", "VALIDATION_ERROR", 400);
        }

        // Password validation (if provided)
        if (password && password.length < 8) {
            return errorResponse(res, "Password must be at least 8 characters.", "VALIDATION_ERROR", 400);
        }

        const result = await portalAccessService.completeSetup({
            setupToken,
            password,
            medicalHistory,
        });

        return successResponse(res, result, 201);
    } catch (err) {
        return errorResponse(res, err.message, "SETUP_ERROR", err.statusCode || 500);
    }
}

module.exports = {
    sendAccessLink,
    verifyAccessToken,
    completeSetup,
};
