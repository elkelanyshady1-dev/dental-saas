/**
 * patient.controller.js — Patient Domain Controller
 * v6.1 — ObjectId validation guard (Phase 8.4)
 *
 * v5.0: secureModel tenant isolation enforcement
 * v6.0: Connection-bound model via getModel(req.dbConnection)
 * v6.1: Fail-fast ObjectId validation — prevents CastError on undefined/malformed IDs
 */
const mongoose = require("mongoose");
const patientService = require("./patient.aggregate.service");
const patientListService = require("./patient.list.service");
const PatientDef = require("../../../organization/patient/models/patient.model");
const getModel = require("../../../core/db/getModel");
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
const {
  createPatientSchema,
  updatePatientSchema
} = require("../../../validation/patient.schema");

// Per-request model resolution helper
function _getPatient(req) {
  return getModel(req.dbConnection, PatientDef);
}

/**
 * ObjectId validation guard — MUST be called before any DB operation that
 * uses req.params.id. Returns true if invalid (controller should return early).
 *
 * Prevents Mongoose CastError when frontend navigates with undefined/null IDs.
 */
function _rejectInvalidId(res, id) {
  if (!id || id === "undefined" || id === "null" || !mongoose.Types.ObjectId.isValid(id)) {
    errorResponse(res, `Invalid patient ID: "${id}"`, "INVALID_ID", 400);
    return true;
  }
  return false;
}
class PatientController {
  async getProfile(req, res) {
    try {
      // RBAC: PATIENTS_READ for staff, direct check for patients
      if (req.context?.type === "org" || req.user?.type !== "patient") {
        authorize(req, P.PATIENTS_READ);
      }
      const organizationId = req.context?.organizationId || req.organizationId;
      const patientId = req.context?.patientId || (req.user?.type === "patient" ? req.user.patientId : req.params.id);

      // ── Phase 8.4: ObjectId guard — prevents CastError on undefined/null IDs ──
      if (_rejectInvalidId(res, patientId)) return;
      const Patient = _getPatient(req);
      const accessCheck = await Patient.countDocuments({
        _id: patientId
      });
      if (accessCheck === 0) {
        return errorResponse(res, "Patient not found or access denied", "NOT_FOUND", 404);
      }

      // Use aggregate projection — matches frontend PatientLayout expectations
      const aggregate = await patientService.getPatientAggregate({
        patientId,
        req
      });
      return successResponse(res, aggregate);
    } catch (error) {
      return errorResponse(res, error.message, "FETCH_ERROR", 400);
    }
  }
  async create(req, res) {
    try {
      authorize(req, P.PATIENTS_CREATE);

      // Phase 9: Zod validation — mandatory gatekeeper
      const parseResult = createPatientSchema.safeParse(req.body);
      if (!parseResult.success) {
        const msg = parseResult.error.issues.map(i => `${i.path.join(".")}: ${i.message}`).join("; ");
        return errorResponse(res, msg, "VALIDATION_ERROR", 400);
      }
      const organizationId = req.context.organizationId;
      // Facade returns the aggregate shape (core, clinical, financial, profileCompletion, governance)
      const aggregate = await patientService.createPatient({
        actorId: req.context.userId,
        data: parseResult.data,
        ipAddress: req.ip,
        req // Phase 3: required for per-org DB resolution (req.dbConnection)
      });
      return successResponse(res, aggregate, 201);
    } catch (error) {
      return errorResponse(res, error.message, "CREATE_ERROR", 400);
    }
  }
  async update(req, res) {
    try {
      authorize(req, P.PATIENTS_UPDATE);

      // Phase 9: Zod validation — mandatory gatekeeper
      const parseResult = updatePatientSchema.safeParse(req.body);
      if (!parseResult.success) {
        const msg = parseResult.error.issues.map(i => `${i.path.join(".")}: ${i.message}`).join("; ");
        return errorResponse(res, msg, "VALIDATION_ERROR", 400);
      }
      const organizationId = req.context.organizationId;
      const patientId = req.params.id;

      // Phase 8.4: ObjectId guard
      if (_rejectInvalidId(res, patientId)) return;
      await patientService.updatePatient({
        actorId: req.context.userId,
        patientId,
        data: parseResult.data,
        ipAddress: req.ip,
        expectedVersion: parseResult.data.expectedVersion,
        req // Phase 3: required for per-org DB resolution
      });
      // Return aggregate shape to match frontend expectations
      const aggregate = await patientService.getPatientAggregate({
        patientId,
        req
      });
      return successResponse(res, aggregate);
    } catch (error) {
      return errorResponse(res, error.message, "UPDATE_ERROR", 400);
    }
  }
  async delete(req, res) {
    try {
      authorize(req, P.PATIENTS_DELETE);
      const organizationId = req.context.organizationId;
      const patientId = req.params.id;
      const {
        reason,
        expectedVersion
      } = req.body;

      // ── Phase 8.4: ObjectId guard ──
      if (_rejectInvalidId(res, patientId)) return;
      const Patient = _getPatient(req);
      const accessCheck = await Patient.countDocuments({
        _id: patientId
      });
      if (accessCheck === 0) {
        return errorResponse(res, "Patient not found or access denied", "NOT_FOUND", 404);
      }
      await patientService.softDeletePatient({
        actorId: req.context.userId,
        patientId,
        reason,
        ipAddress: req.ip,
        expectedVersion,
        req // Phase 3: required for per-org DB resolution
      });
      return successResponse(res, {
        message: "Patient deleted successfully"
      });
    } catch (error) {
      return errorResponse(res, error.message, "DELETE_ERROR", 400);
    }
  }

  /**
   * GET /?search=&sort=&page=&limit=
   * Token-based indexed patient search.
   * organizationId always from JWT — never client-supplied.
   */
  async list(req, res) {
    try {
      authorize(req, P.PATIENTS_READ);
      const organizationId = req.context.organizationId;

      // Sanitize query params — empty strings become undefined
      const search = req.query.search?.trim() || undefined;
      const sort = req.query.sort || "smart";
      const page = req.query.page;
      const limit = req.query.limit;

      // Validate sort value
      const VALID_SORTS = ["smart", "name", "recent", "lastvisit"];
      if (!VALID_SORTS.includes(sort)) {
        return res.status(400).json({
          message: `Invalid sort value. Must be one of: ${VALID_SORTS.join(", ")}`
        });
      }

      // Phase F.6: req is REQUIRED — service uses req.dbConnection for per-org isolation
      const result = await patientListService.listPatients({
        req,
        // ← FIXED: was missing, caused ReferenceError
        scopedQuery: {},
        search,
        sort,
        page,
        limit
      });
      return successResponse(res, result.data, result.pagination);
    } catch (error) {
      return errorResponse(res, error.message, "LIST_ERROR", 400);
    }
  }
}
module.exports = new PatientController();