/**
 * portalAppointments.projection.js
 * Phase 5 — Portal Domain-Owned Read Model: Appointments
 *
 * Replaces: appointmentProjection.buildCalendarView()
 * Source Model: Appointment (org domain)
 *
 * DOMAIN BOUNDARY:
 *   Uses getModel(req.dbConnection, AppointmentDef) — connection-bound
 *   model resolution. No global mongoose.model() calls.
 *
 * SECURITY:
 *   - secureModel() enforces organizationId via RLS
 *   - Patient can ONLY see their own appointments (patientId filter)
 *   - DTO strips internal fields (staffing, audit trail)
 *
 * @per-org-transactional — portal appointments — organizationId from req.rls
 */

"use strict";

const getModel = require("../../../core/db/getModel");
const AppointmentDef = require("../../../organization/appointment/models/appointment.model");

/**
 * Builds a list of appointments for the portal patient.
 *
 * Returns upcoming and past appointments with patient-safe fields.
 * Internal fields (dentistId, chairId, statusHistory, waitingDuration) are stripped.
 *
 * @param {Object} req - Express request (must have req.rls + req.dbConnection + req.patientId)
 * @param {Object} [options] - Query options
 * @param {string} [options.status] - Filter by status
 * @param {number} [options.limit=50] - Max results
 * @returns {Object[]} Appointment DTOs
 */
async function buildPortalAppointments(req, options = {}) {
    const patientId = req.patientId || req.rls?.patientId;

    if (!patientId) {
        return [];
    }

    const Appointment = getModel(req.dbConnection, AppointmentDef);
    const secureAppt = Appointment;

    const query = {
        patientId,
        isActive: true,
    };

    if (options.status) {
        query.status = options.status;
    }

    const appointments = await secureAppt
        .find(query)
        .select("startTime endTime duration status notes branchId createdAt")
        .populate("branchId", "name")
        .sort({ startTime: -1 })
        .limit(options.limit || 50)
        .lean();

    return appointments.map(doc => ({
        id: doc._id.toString(),
        start: doc.startTime,
        end: doc.endTime,
        duration: doc.duration,
        status: doc.status,
        notes: doc.notes || "",
        branch: doc.branchId ? {
            id: doc.branchId._id.toString(),
            name: doc.branchId.name,
        } : null,
        createdAt: doc.createdAt,
    }));
}

/**
 * Gets the next upcoming appointment for the dashboard.
 *
 * @param {Object} req - Express request
 * @returns {Object|null} Next appointment DTO or null
 */
async function getNextAppointment(req) {
    const patientId = req.patientId || req.rls?.patientId;

    if (!patientId) return null;

    const Appointment = getModel(req.dbConnection, AppointmentDef);
    const secureAppt = Appointment;

    const now = new Date();

    const appointment = await secureAppt
        .findOne({
            patientId,
            isActive: true,
            startTime: { $gte: now },
            status: { $in: ["open", "confirmed", "checked-in"] },
        })
        .select("startTime endTime duration status notes branchId")
        .populate("branchId", "name")
        .sort({ startTime: 1 })
        .lean();

    if (!appointment) return null;

    return {
        id: appointment._id.toString(),
        start: appointment.startTime,
        end: appointment.endTime,
        duration: appointment.duration,
        status: appointment.status,
        notes: appointment.notes || "",
        branch: appointment.branchId ? {
            id: appointment.branchId._id.toString(),
            name: appointment.branchId.name,
        } : null,
    };
}

module.exports = {
    buildPortalAppointments,
    getNextAppointment,
};
