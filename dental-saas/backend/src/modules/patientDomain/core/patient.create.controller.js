const patientAggregateService = require("./patient.aggregate.service");
const branchCounterRepo = require("../repositories/branchCounter.repository");
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

/**
 * Controller for Creating Patients (Staff Side)
 */
class PatientCreateController {
  /**
   * POST /internal/patients
   */
  async create(req, res) {
    try {
      // 1. Security Enforcement — Single Source of Truth: req.context
      authorize(req, P.PATIENTS_CREATE);
      const organizationId = req.context.organizationId;
      const actorId = req.context.userId;

      // 2. Execution via Aggregate Service
      const patient = await patientAggregateService.createPatient({
        actorId,
        data: {
          ...req.body,
          ipAddress: req.ip
        },
        ipAddress: req.ip,
        req // ← pass request for region/branch context
      });
      return successResponse(res, patient, 201);
    } catch (error) {
      console.error("Patient Create Error:", error);
      return errorResponse(res, error.message, "CREATE_ERROR", 400);
    }
  }

  /**
   * GET /internal/patients/next-code?branchId=...
   * Preview the next auto-generated patient code for a branch.
   * Read-only — does NOT increment the counter.
   */
  async nextCode(req, res) {
    try {
      authorize(req, P.PATIENTS_READ);
      const {
        branchId
      } = req.query;
      if (!branchId) {
        return errorResponse(res, "branchId query parameter is required.", "VALIDATION_ERROR", 400);
      }

      // Pass full req — repository needs req.dbConnection + req.rls
      const result = await branchCounterRepo.peekNextCode(branchId, req);
      return successResponse(res, result);
    } catch (error) {
      console.error("Next Code Preview Error:", error);
      return errorResponse(res, error.message, "NEXT_CODE_ERROR", 500);
    }
  }
}
module.exports = new PatientCreateController();