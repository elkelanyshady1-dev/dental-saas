/**
 * appointment.dto.js — Appointment Data Transfer Object Builder
 * Phase 10 — Contract-Driven Architecture
 *
 * SINGLE SOURCE OF TRUTH for all appointment shape transformations.
 *
 * Rules:
 *   1. Every API response that includes appointment data MUST go through this DTO.
 *   2. displayName for nested patient is resolved here — never inline.
 *   3. Frontend renders the DTO shape directly — no client-side fallback chains.
 *   4. Null coalescing is the DTO's job, not the consumer's.
 *
 * Consumers:
 *   - appointment.projection.js  → buildAppointmentCalendarDTO (calendar grid)
 *   - appointment.projection.js  → buildAppointmentDetailDTO  (single view)
 *   - patient.aggregate.service  → buildAppointmentSummaryDTO (cross-domain embed)
 *   - patientPortal.controller   → buildAppointmentPortalDTO  (patient-facing)
 *
 * Phase 10 Hardening:
 *   - All DTO builders return Object.freeze() (immutable)
 *   - All builders enforce Zod response schemas via contractEnforcer
 *   - ObjectId refs MUST be serialized to string via .toString()
 */

"use strict";

const { enforce } = require("../schemas/contractEnforcer");
const {
    appointmentDetailResponseSchema,
    appointmentCalendarResponseSchema,
    appointmentSummaryResponseSchema,
    appointmentPortalResponseSchema,
} = require("../schemas/appointment.response.schema");

// ─── Patient Display Name Resolution ────────────────────────────────────────

/**
 * Resolves display name from a populated patient ref.
 * Mirrors patient.dto.js resolveDisplayName but works on populated subdocs.
 */
function resolvePatientDisplayName(p) {
    if (!p) return "Unknown";
    return (
        (p.nameEnglish && p.nameEnglish.trim()) ||
        (p.nameArabic && p.nameArabic.trim()) ||
        (p.fullNameNormalized && p.fullNameNormalized.trim()) ||
        `${p.firstName || ""} ${p.lastName || ""}`.trim() ||
        p.patientCode ||
        "Unknown"
    );
}

// ─── Detail DTO (single appointment — full populated view) ──────────────────

/**
 * Builds the detail DTO for a single appointment.
 * Used by GET /appointments/:id
 *
 * @param {object} doc — Lean appointment document with populated refs
 * @returns {object|null}
 */
function buildAppointmentDetailDTO(doc) {
    if (!doc) return null;

    const dto = {
        id:        doc._id.toString(),
        startTime: doc.startTime,
        endTime:   doc.endTime,
        duration:  doc.duration,
        status:    doc.status,
        type:      doc.type || "consultation",
        notes:     doc.notes || null,
        branchId:  doc.branchId?._id?.toString() || doc.branchId?.toString() || null,
        chairId:   doc.chairId?._id?.toString() || doc.chairId?.toString() || null,

        patient: doc.patientId ? {
            _id:         doc.patientId._id.toString(),
            nameEnglish: doc.patientId.nameEnglish || null,
            nameArabic:  doc.patientId.nameArabic || null,
            firstName:   doc.patientId.firstName || null,
            lastName:    doc.patientId.lastName || null,
            patientCode: doc.patientId.patientCode || null,
            displayName: resolvePatientDisplayName(doc.patientId),
        } : null,

        dentist: doc.dentistId ? {
            _id:  doc.dentistId._id.toString(),
            name: doc.dentistId.name || null,
        } : null,

        chair: doc.chairId && typeof doc.chairId === "object" ? {
            _id:      doc.chairId._id?.toString(),
            name:     doc.chairId.name || null,
            branchId: doc.chairId.branchId?.toString() || null,
        } : null,

        branch: doc.branchId && typeof doc.branchId === "object" ? {
            _id:  doc.branchId._id?.toString(),
            name: doc.branchId.name || null,
        } : null,

        treatment: doc.treatment ? {
            procedureId:  doc.treatment.procedureId?.toString() || null,
            categoryId:   doc.treatment.categoryId?.toString() || null,
            categoryName: doc.treatment.categoryName || null,
            name:         doc.treatment.name || null,
            duration:     doc.treatment.duration || null,
            color:        doc.treatment.color || null,
        } : null,

        statusHistory: (doc.statusHistory || []).map(h => ({
            status:    h.status,
            changedBy: h.changedBy?.toString() || null,
            changedAt: h.changedAt,
        })),

        // Ortho integration
        clinicalCaseId:      doc.clinicalCaseId?.toString() || null,
        visitSequenceNumber: doc.visitSequenceNumber || null,

        // Timestamps
        checkedInAt: doc.checkedInAt || null,
        startedAt:   doc.startedAt || null,
        completedAt: doc.completedAt || null,
        cancelledAt: doc.cancelledAt || null,
        createdAt:   doc.createdAt || null,
    };

    return enforce(dto, appointmentDetailResponseSchema, "buildAppointmentDetailDTO");
}

// ─── Calendar DTO (compact grid shape for calendar views) ───────────────────

/**
 * Builds the calendar-grid DTO for an appointment.
 * Used by buildCalendarView in appointment.projection.js
 *
 * @param {object} doc — Lean appointment document with populated refs
 * @returns {object|null}
 */
function buildAppointmentCalendarDTO(doc) {
    if (!doc) return null;

    const dto = {
        // Dual-key: id for RBC, _id for AppointmentCard/DnDCalendarView
        _id:       doc._id.toString(),
        id:        doc._id.toString(),
        startTime: doc.startTime,
        endTime:   doc.endTime,
        duration:  doc.duration,
        status:    doc.status,
        type:      doc.type || "consultation",
        notes:     doc.notes || null,
        branchId:  doc.branchId?._id?.toString() || doc.branchId?.toString() || null,
        chairId:   doc.chairId?._id?.toString() || doc.chairId?.toString() || null,

        patient: doc.patientId ? {
            _id:         doc.patientId._id.toString(),
            nameEnglish: doc.patientId.nameEnglish || null,
            nameArabic:  doc.patientId.nameArabic || null,
            firstName:   doc.patientId.firstName || null,
            lastName:    doc.patientId.lastName || null,
            patientCode: doc.patientId.patientCode || null,
            displayName: resolvePatientDisplayName(doc.patientId),
        } : null,

        dentist: doc.dentistId ? {
            _id:  doc.dentistId._id.toString(),
            name: doc.dentistId.name || null,
        } : null,

        chair: doc.chairId && typeof doc.chairId === "object" ? {
            _id:      doc.chairId._id?.toString(),
            name:     doc.chairId.name || null,
            branchId: doc.chairId.branchId?.toString() || null,
        } : null,

        branch: doc.branchId && typeof doc.branchId === "object" ? {
            _id:  doc.branchId._id?.toString(),
            name: doc.branchId.name || null,
        } : null,

        // Legacy flat fields (backward compat with older components)
        patientName: doc.patientId
            ? (doc.patientId.nameEnglish ||
               `${doc.patientId.firstName || ""} ${doc.patientId.lastName || ""}`.trim() ||
               doc.patientId.nameArabic || "")
            : "",
        doctorName: doc.dentistId?.name || "",
        chairName:  doc.chairId?.name  || "",
    };

    return enforce(dto, appointmentCalendarResponseSchema, "buildAppointmentCalendarDTO");
}

// ─── Summary DTO (cross-domain embeds — patient aggregate, timeline) ────────

/**
 * Builds a minimal summary DTO for cross-domain contexts.
 * Used by patient.aggregate.service, patient timeline, etc.
 *
 * @param {object} doc — Lean appointment document (may have populated or plain refs)
 * @returns {object|null}
 */
function buildAppointmentSummaryDTO(doc) {
    if (!doc) return null;

    const dto = {
        id:          doc._id.toString(),
        startTime:   doc.startTime,
        endTime:     doc.endTime,
        duration:    doc.duration,
        status:      doc.status,
        type:        doc.type || "consultation",
        dentistName: doc.dentistId?.name || doc.dentistName || null,
        branchName:  doc.branchId?.name  || doc.branchName  || null,
        createdAt:   doc.createdAt || null,
    };

    return enforce(dto, appointmentSummaryResponseSchema, "buildAppointmentSummaryDTO");
}

// ─── Portal DTO (patient-facing — no internal fields) ───────────────────────

/**
 * Builds a portal-safe DTO for the patient portal.
 * Excludes: statusHistory, treatment internals, ortho refs, revenueAmount.
 *
 * @param {object} doc — Lean appointment document with populated refs
 * @returns {object|null}
 */
function buildAppointmentPortalDTO(doc) {
    if (!doc) return null;

    const dto = {
        id:        doc._id.toString(),
        startTime: doc.startTime,
        endTime:   doc.endTime,
        duration:  doc.duration,
        status:    doc.status,
        type:      doc.type || "consultation",
        notes:     doc.notes || null,

        branch: doc.branchId && typeof doc.branchId === "object" ? {
            _id:  doc.branchId._id?.toString(),
            name: doc.branchId.name || null,
        } : null,

        dentist: doc.dentistId && typeof doc.dentistId === "object" ? {
            _id:  doc.dentistId._id.toString(),
            name: doc.dentistId.name || null,
        } : null,

        createdAt: doc.createdAt || null,
    };

    return enforce(dto, appointmentPortalResponseSchema, "buildAppointmentPortalDTO");
}

module.exports = {
    resolvePatientDisplayName,
    buildAppointmentDetailDTO,
    buildAppointmentCalendarDTO,
    buildAppointmentSummaryDTO,
    buildAppointmentPortalDTO,
};
