/**
 * policy.controller.js — Patient Policy Controller
 * v2.0 — Phase F.6 Zero-Trust RLS Migration
 *
 * Phase F.6 Changes:
 *   - req passed to updatePolicy for tenant context propagation
 */
const patientAggregateService = require("../core/patient.aggregate.service");
const {
  successResponse,
  errorResponse
} = require("@utils/responseFormatter");
const {
  authorize
} = require("@utils/authorize");
const {
  P
} = require("@rbac/orgPermissions");
class PolicyController {
  async getPortalConfig(req, res) {
    try {
      authorize(req, P.PORTAL_READ);
      const organizationId = req.context.organizationId;
      const policy = await patientAggregateService.updatePolicy({
        actorId: req.context.userId,
        data: {},
        // No-op update to get/create
        ipAddress: req.ip,
        req // Phase F.6: Pass req for tenant context
      });
      return successResponse(res, policy);
    } catch (error) {
      return errorResponse(res, error.message, "POLICY_ERROR", 400);
    }
  }
  async update(req, res) {
    try {
      authorize(req, P.PORTAL_MANAGE);
      const organizationId = req.context.organizationId;
      const policy = await patientAggregateService.updatePolicy({
        actorId: req.context.userId,
        data: req.body,
        ipAddress: req.ip,
        req // Phase F.6: Pass req for tenant context
      });
      return successResponse(res, policy);
    } catch (error) {
      return errorResponse(res, error.message, "UPDATE_ERROR", 400);
    }
  }
}
module.exports = new PolicyController();