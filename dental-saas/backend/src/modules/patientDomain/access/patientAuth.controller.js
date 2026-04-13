const patientAuthService = require("./patientAuth.service");
const { successResponse, errorResponse } = require("@utils/responseFormatter");
const OrganizationDef = require("../../../shared/models/Organization");
const getModel = require("../../../core/db/getModel");
const { getPlatformConnection } = require("../../../core/db/dbResolver");

class PatientAuthController {
    async login(req, res) {
        try {
            const { clinicCode, email, password } = req.body;
            // Organization lookup by clinicCode is a platform-level query
            // (resolving which org to authenticate against before org context exists)
            const Organization = getModel(getPlatformConnection(), OrganizationDef);
            const result = await patientAuthService.login({
                clinicCode,
                email,
                password,
                OrganizationModel: Organization
            });

            // Set cookie for security
            res.cookie("patientToken", result.token, {
                httpOnly: true,
                secure: process.env.NODE_ENV === "production",
                maxAge: 7 * 24 * 60 * 60 * 1000,
            });

            return successResponse(res, {
                token: result.token,
                patientUser: result.patientUser
            });
        } catch (error) {
            return errorResponse(res, error.message, "LOGIN_FAILED", 401);
        }
    }

    async activate(req, res) {
        try {
            // TENANT ISOLATION ENFORCEMENT
            // organizationId MUST NOT come from request payload (body/query/params).
            // It is resolved exclusively from the signed PortalInvite record inside
            // patientAuthService.activatePortal() → invite.organizationId.
            // Stripping organizationId here prevents any payload injection attack.
            const { organizationId: _stripped, ...safeBody } = req.body; // eslint-disable-line no-unused-vars

            const result = await patientAuthService.activatePortal(safeBody);
            return successResponse(res, result, 201);
        } catch (error) {
            return errorResponse(res, error.message, "ACTIVATION_FAILED", 400);
        }
    }
}

module.exports = new PatientAuthController();
