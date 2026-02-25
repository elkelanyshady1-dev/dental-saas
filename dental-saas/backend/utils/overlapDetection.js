const Appointment = require("../models/Appointment");

const { ACTIVE_STATUSES } = require("./statusTransitions");

/**
 * Detect dentist overlap across ALL branches in the org.
 * Overlap: existing.startTime < newEnd AND existing.endTime > newStart
 */
const findDentistOverlap = async (organizationId, dentistId, startTime, endTime, excludeId = null) => {
    const query = {
        organizationId,
        dentistId,
        status: { $in: ACTIVE_STATUSES },
        startTime: { $lt: new Date(endTime) },
        endTime: { $gt: new Date(startTime) },
    };

    if (excludeId) {
        query._id = { $ne: excludeId };
    }

    return Appointment.findOne(query)
        .populate("patientId", "firstName lastName")
        .populate("branchId", "name");
};

/**
 * Detect chair overlap WITHIN a specific branch.
 * Overlap: existing.startTime < newEnd AND existing.endTime > newStart
 */
const findChairOverlap = async (organizationId, branchId, chairId, startTime, endTime, excludeId = null) => {
    const query = {
        organizationId,
        branchId,
        chairId,
        status: { $in: ACTIVE_STATUSES },
        startTime: { $lt: new Date(endTime) },
        endTime: { $gt: new Date(startTime) },
    };

    if (excludeId) {
        query._id = { $ne: excludeId };
    }

    return Appointment.findOne(query)
        .populate("patientId", "firstName lastName")
        .populate("dentistId", "name");
};

/**
 * Run both overlap checks and return combined result.
 */
const detectOverlaps = async ({ organizationId, branchId, dentistId, chairId, startTime, endTime, excludeId }) => {
    const [dentistConflict, chairConflict] = await Promise.all([
        findDentistOverlap(organizationId, dentistId, startTime, endTime, excludeId),
        findChairOverlap(organizationId, branchId, chairId, startTime, endTime, excludeId),
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
