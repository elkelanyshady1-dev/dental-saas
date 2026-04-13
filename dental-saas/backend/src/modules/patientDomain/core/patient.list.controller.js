/**
 * patient.list.controller.js — Patient List Controller
 * v2.1 — Fix: pass req to service for per-org DB connection resolution
 *
 * AUDIT-FIX: listPatients() requires req to call getModel(req.dbConnection).
 * Previously req was not forwarded → ReferenceError → caught as 400.
 */
const patientListService = require("./patient.list.service");
const { successResponse, errorResponse } = require("@utils/responseFormatter");
const { authorize } = require("@utils/authorize");
const { P } = require("@rbac/orgPermissions");

/**
 * Controller for Listing and Searching Patients (Staff Side)
 */
class PatientListController {
    /**
     * GET /internal/patients
     * Query params: search, sort, mode, page, limit
     */
    async list(req, res) {
        try {
            // 1. Security Enforcement
            authorize(req, P.PATIENTS_READ);

            const organizationId = req.context.organizationId;

            // 2. Sanitize and validate query params
            const search = req.query.search?.trim() || undefined;
            const page   = req.query.page;
            const limit  = req.query.limit;
            const mode   = req.query.mode  || "all";
            const sort   = req.query.sort  || "smart";
            const careType = req.query.careType || undefined; // v32.0: "PRIVATE" | "ACADEMIC"

            // Validate sort value (fail-fast before DB query)
            const VALID_SORTS = ["smart", "name", "recent", "lastvisit"];
            if (!VALID_SORTS.includes(sort)) {
                return res.status(400).json({ message: `Invalid sort value. Must be one of: ${VALID_SORTS.join(", ")}` });
            }

            // Validate careType (fail-fast)
            if (careType && !["PRIVATE", "ACADEMIC"].includes(careType)) {
                return res.status(400).json({ message: "Invalid careType. Must be PRIVATE or ACADEMIC." });
            }

            // 3. Delegate to service — req is REQUIRED for getModel(req.dbConnection)
            const result = await patientListService.listPatients({
                req,            // ← FIXED: was missing, caused ReferenceError on _getPatient(req)
                scopedQuery: {},
                search,
                sort,
                mode,
                page,
                limit,
                careType,       // v32.0: filter by care type
            });

            return successResponse(res, result.data, result.pagination);
        } catch (error) {
            return errorResponse(res, error.message, "LIST_ERROR", 400);
        }
    }
}

module.exports = new PatientListController();

