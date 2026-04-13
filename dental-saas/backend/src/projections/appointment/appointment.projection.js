/**
 * appointment.projection.js — CQRS-lite Read Model
 * v3.0 — Phase 3.3 Strict Per-Org Model Resolution
 *
 * STRICT PER-ORG MODE:
 *   req.dbConnection is ALWAYS required. No fallback to AppointmentDef.default.
 *   All callers must provide a request context with a valid connection.
 */
"use strict";

const AppointmentDef = require("../../organization/appointment/models/appointment.model");
const getModel = require("../../core/db/getModel");

// ── Strict Per-Org Model Resolution + RLS (Phase 3.3) ──────────────────────
function _getSecureAppointment(req) {
    if (!req?.dbConnection) {
        throw new Error("[AppointmentProjection] req.dbConnection is REQUIRED — per-org mode does not allow fallback");
    }
    const Appointment = getModel(req.dbConnection, AppointmentDef);
    return Appointment;
}

/**
 * Single Appointment DTO
 */
async function buildAppointmentView({ appointmentId, organizationId, req }) {
    const Appointment = _getSecureAppointment(req);

    // Per-org DB: connection-scoped isolation
    const appointment = await Appointment.findOne({ _id: appointmentId })
        .populate("patientId", "nameArabic nameEnglish patientCode")
        .populate("dentistId", "name")
        .populate("chairId", "name")
        .populate("branchId", "name")
        .lean();

    if (!appointment) return null;

    return transformAppointment(appointment);
}

/**
 * Calendar Grid Projection (Optimized/Minimal)
 * Phase 13.1: Populates doctor, chair, branch for AppointmentCard display.
 */
async function buildCalendarView({ organizationId, startDate, endDate, dentistId, branchId, status, patientId, req }) {
    const Appointment = _getSecureAppointment(req);

    const query = { isActive: true };

    // Time range — Phase 12 slot-safe: startTime < endDate AND endTime > startDate
    if (startDate && endDate) {
        query.startTime = { $lt: new Date(endDate) };
        query.endTime   = { $gt: new Date(startDate) };
    }

    // Branch filter — accepts either a string ID or a { $in: [...] } operator
    if (branchId) query.branchId = branchId;

    // PBAC dentist scope (self-only for doctors)
    if (dentistId) query.dentistId = dentistId;

    // Status filter
    if (status) {
        query.status = status;
    } else {
        // Default: exclude terminal statuses from calendar grid
        query.status = { $nin: ["cancelled", "no-show", "canceled", "no_show"] };
    }

    if (patientId) query.patientId = patientId;

    // Per-org DB: connection-scoped isolation
    const appointments = await Appointment.find(query)
        .populate("patientId",  "nameArabic nameEnglish firstName lastName patientCode")
        .populate("dentistId",  "name")
        .populate("chairId",    "name branchId")
        .populate("branchId",   "name")
        .sort({ startTime: 1 })
        .lean();

    return appointments.map(doc => ({
        // Dual-key: id for RBC, _id for AppointmentCard/DnDCalendarView
        _id:        doc._id.toString(),
        id:         doc._id.toString(),
        startTime:  doc.startTime,
        endTime:    doc.endTime,
        duration:   doc.duration,
        status:     doc.status,
        type:       doc.type || "consultation",   // v13.3: include appointment type
        notes:      doc.notes,
        branchId:   doc.branchId?._id?.toString() || doc.branchId?.toString(),
        chairId:    doc.chairId?._id?.toString()  || doc.chairId?.toString(),

        // Nested DTO shapes expected by AppointmentCard + AppointmentTooltip
        patient: doc.patientId ? {
            _id:         doc.patientId._id.toString(),
            nameEnglish: doc.patientId.nameEnglish,
            nameArabic:  doc.patientId.nameArabic,
            firstName:   doc.patientId.firstName,
            lastName:    doc.patientId.lastName,
            patientCode: doc.patientId.patientCode,
        } : null,
        dentist: doc.dentistId ? {
            _id:  doc.dentistId._id.toString(),
            name: doc.dentistId.name,
        } : null,
        chair: doc.chairId ? {
            _id:      doc.chairId._id?.toString(),
            name:     doc.chairId.name,
            branchId: doc.chairId.branchId?.toString(),
        } : null,
        branch: doc.branchId ? {
            _id:  doc.branchId._id?.toString(),
            name: doc.branchId.name,
        } : null,

        // Legacy flat fields (for backward compat with older components reading these)
        patientName: doc.patientId
            ? (doc.patientId.nameEnglish ||
               `${doc.patientId.firstName || ""} ${doc.patientId.lastName || ""}`.trim() ||
               doc.patientId.nameArabic || "")
            : "",
        doctorName: doc.dentistId?.name || "",
        chairName:  doc.chairId?.name  || "",
    }));
}

/**
 * Internal transformer to enforce DTO shape
 */
function transformAppointment(doc) {
    return {
        id: doc._id.toString(),
        startTime: doc.startTime,
        endTime: doc.endTime,
        duration: doc.duration,
        status: doc.status,
        patient: doc.patientId ? {
            id: doc.patientId._id.toString(),
            name: doc.patientId.nameArabic || doc.patientId.nameEnglish,
            code: doc.patientId.patientCode
        } : null,
        dentist: doc.dentistId ? {
            id: doc.dentistId._id.toString(),
            name: doc.dentistId.name
        } : null,
        chair: doc.chairId ? {
            id: doc.chairId._id.toString(),
            name: doc.chairId.name
        } : null,
        branch: doc.branchId ? {
            id: doc.branchId._id.toString(),
            name: doc.branchId.name
        } : null,
        notes: doc.notes,
        statusHistory: doc.statusHistory?.map(h => ({
            status: h.status,
            at: h.changedAt
        }))
    };
}

module.exports = {
    buildAppointmentView,
    buildCalendarView
};
