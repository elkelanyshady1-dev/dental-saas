/**
 * overlapDetection.js — Scheduling Conflict Detection
 * v2.0 — Phase 3.1 Connection-Aware Model Migration
 *
 * MIGRATION (Phase 3.1):
 *   BEFORE: const Appointment = require("...").default; (frozen global model)
 *   AFTER:  const AppointmentDef = require("..."); Model bound per-request via getModel(req.dbConnection)
 *
 * Connection Binding:
 *   In shared mode → getModel returns the same global model (no behavior change)
 *   In per-org mode → getModel compiles the model on the org's connection
 *
 * IMPORTANT: All exported functions now require `req` in their parameters.
 */

const AppointmentDef = require("../../../organization/appointment/models/appointment.model");
const getModel = require("../../../core/db/getModel");

const { ACTIVE_STATUSES } = require("./statusTransitions");

// ── Connection-Bound + RLS Helper ───────────────────────────────────────────
function _getSecureAppointment(req) {
    // Phase 12 C4: Guard — missing dbConnection causes cryptic Mongoose errors deep in stack.
    // Fail fast here with a descriptive message pointing at the root cause.
    if (!req?.dbConnection) {
        throw new Error(
            "[OVERLAP_DETECTION] req.dbConnection is missing. " +
            "Ensure the org dbContext middleware has run before calling overlap detection. " +
            "Route: " + (req?.path || "unknown")
        );
    }
    const Appointment = getModel(req.dbConnection, AppointmentDef);
    return Appointment;
}

/**
 * Detect dentist overlap across ALL branches in the org.
 * Overlap: existing.startTime < newEnd AND existing.endTime > newStart
 */
const findDentistOverlap = async (organizationId, dentistId, startTime, endTime, excludeId = null, req) => {
    const Appointment = _getSecureAppointment(req);

    const query = {
        dentistId,
        status: { $in: ACTIVE_STATUSES },
        startTime: { $lt: new Date(endTime) },
        endTime: { $gt: new Date(startTime) },
    };

    if (excludeId) {
        query._id = { $ne: excludeId };
    }

    // Per-org DB: connection-scoped isolation
    return Appointment.findOne(query)
        .populate("patientId", "firstName lastName")
        .populate("branchId", "name");
};

/**
 * Detect chair overlap WITHIN a specific branch.
 * Overlap: existing.startTime < newEnd AND existing.endTime > newStart
 */
const findChairOverlap = async (organizationId, branchId, chairId, startTime, endTime, excludeId = null, req) => {
    const Appointment = _getSecureAppointment(req);

    const query = {
        branchId,
        chairId,
        status: { $in: ACTIVE_STATUSES },
        startTime: { $lt: new Date(endTime) },
        endTime: { $gt: new Date(startTime) },
    };

    if (excludeId) {
        query._id = { $ne: excludeId };
    }

    // Per-org DB: connection-scoped isolation
    return Appointment.findOne(query)
        .populate("patientId", "firstName lastName")
        .populate("dentistId", "name");
};

/**
 * Run both overlap checks and return combined result.
 *
 * @param {object} params
 * @param {string} params.organizationId
 * @param {string} params.branchId
 * @param {string} params.dentistId
 * @param {string} params.chairId
 * @param {Date}   params.startTime
 * @param {Date}   params.endTime
 * @param {string} [params.excludeId]
 * @param {object} params.req - Express request (must have req.dbConnection)
 */
const detectOverlaps = async ({ organizationId, branchId, dentistId, chairId, startTime, endTime, excludeId, req }) => {
    const [dentistConflict, chairConflict] = await Promise.all([
        findDentistOverlap(organizationId, dentistId, startTime, endTime, excludeId, req),
        findChairOverlap(organizationId, branchId, chairId, startTime, endTime, excludeId, req),
    ]);

    return {
        hasConflict: !!(dentistConflict || chairConflict),
        dentist: dentistConflict || null,
        chair: chairConflict || null,
    };
};

module.exports = {
    ACTIVE_STATUSES,
    findDentistOverlap,
    findChairOverlap,
    detectOverlaps,
};
