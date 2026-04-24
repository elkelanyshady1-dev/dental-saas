/**
 * appointment.dto.js — Appointment Data Transfer Object Builder
 *
 * SINGLE SOURCE OF TRUTH for appointment API response shape.
 *
 * Rules (per CLAUDE.md §4):
 *   1. Every API response containing appointment data MUST go through here.
 *   2. Raw Mongoose documents MUST NOT leave the controller.
 *   3. Derived/computed fields (display labels, formatted times) belong
 *      in the DTO — never in the frontend.
 *   4. FLS applies here: sensitive fields are masked by role.
 *
 * Field visibility matrix (FLS §5.6):
 *   - Always hidden:    __v, deletedAt, externalRequestId (internal)
 *   - Admin/Manager:    + statusHistory (audit trail)
 *   - Finance roles:    + revenueAmount (financial)
 *   - Everyone else:    core operational fields only
 */

"use strict";

const {
  enforce
} = require("../../../schemas/contractEnforcer");
const {
  appointmentResponseSchema,
  appointmentSummaryResponseSchema
} = require("../../../schemas/appointment.response.schema");

// ── Role Policy ────────────────────────────────────────────────────────────

// Roles that may view the status audit trail on an appointment.
const AUDIT_VISIBLE_ROLES = new Set(["admin", "owner", "manager", "branch_manager", "clinic_admin"]);

// Roles that may view the revenue figure on a completed appointment.
const FINANCE_VISIBLE_ROLES = new Set(["admin", "owner", "manager", "finance", "accountant"]);
function _canSeeAudit(roleName) {
  if (!roleName) return false;
  return AUDIT_VISIBLE_ROLES.has(String(roleName).toLowerCase());
}
function _canSeeFinance(roleName) {
  if (!roleName) return false;
  return FINANCE_VISIBLE_ROLES.has(String(roleName).toLowerCase());
}

// ── Serialization Helpers ──────────────────────────────────────────────────

function _idToString(v) {
  if (v === null || v === undefined) return null;
  if (typeof v === "string") return v;
  if (typeof v.toString === "function") return v.toString();
  return null;
}
function _toPlain(doc) {
  if (!doc) return doc;
  if (typeof doc.toObject === "function") return doc.toObject();
  return doc;
}
function _serializeTreatment(t) {
  if (!t) return null;
  return {
    procedureId: _idToString(t.procedureId),
    categoryId: _idToString(t.categoryId),
    categoryName: t.categoryName || null,
    name: t.name || null,
    duration: typeof t.duration === "number" ? t.duration : null,
    color: t.color || null
  };
}
function _serializeStatusHistory(history) {
  if (!Array.isArray(history)) return [];
  return history.map(entry => ({
    status: entry.status,
    changedBy: _idToString(entry.changedBy),
    changedAt: entry.changedAt || null
  }));
}

// ── Canonical DTO ──────────────────────────────────────────────────────────

/**
 * buildAppointmentDto — full response shape for mutation responses and detail reads.
 *
 * @param {object}  doc          — Appointment document (mongoose or lean)
 * @param {object}  [ctx]        — Caller context
 * @param {string}  [ctx.role]   — Caller roleName (from req.context.roleName)
 * @param {boolean} [ctx.includeAudit]     — Force audit visibility on
 * @param {boolean} [ctx.includeFinancials] — Force financial visibility on
 * @returns {object} frozen, schema-validated DTO
 */
function buildAppointmentDto(doc, ctx = {}) {
  const p = _toPlain(doc);
  if (!p) return null;
  const role = ctx.role || null;
  const includeAudit = ctx.includeAudit === true || _canSeeAudit(role);
  const includeFinancials = ctx.includeFinancials === true || _canSeeFinance(role);
  const dto = {
    _id: _idToString(p._id),
    branchId: _idToString(p.branchId),
    patientId: _idToString(p.patientId),
    dentistId: _idToString(p.dentistId),
    chairId: _idToString(p.chairId),
    startTime: p.startTime || null,
    endTime: p.endTime || null,
    duration: typeof p.duration === "number" ? p.duration : null,
    status: p.status || "open",
    type: p.type || "consultation",
    checkedInAt: p.checkedInAt || null,
    startedAt: p.startedAt || null,
    completedAt: p.completedAt || null,
    cancelledAt: p.cancelledAt || null,
    waitingDuration: typeof p.waitingDuration === "number" ? p.waitingDuration : null,
    notes: p.notes || "",
    treatment: _serializeTreatment(p.treatment),
    isActive: p.isActive !== false,
    clinicalCaseId: _idToString(p.clinicalCaseId),
    phaseId: _idToString(p.phaseId),
    visitSequenceNumber: typeof p.visitSequenceNumber === "number" ? p.visitSequenceNumber : null,
    version: typeof p.version === "number" ? p.version : 0,
    createdAt: p.createdAt || null,
    updatedAt: p.updatedAt || null,
    // Conditional fields — include ONLY when role permits.
    ...(includeAudit ? {
      statusHistory: _serializeStatusHistory(p.statusHistory)
    } : {}),
    ...(includeFinancials ? {
      revenueAmount: typeof p.revenueAmount === "number" ? p.revenueAmount : 0
    } : {
      revenueAmount: null
    })
  };
  return enforce(dto, appointmentResponseSchema, "buildAppointmentDto");
}

// ── Summary DTO ────────────────────────────────────────────────────────────

/**
 * buildAppointmentSummaryDto — minimal shape for lists and notifications.
 * Never exposes audit or financial fields regardless of role.
 */
function buildAppointmentSummaryDto(doc) {
  const p = _toPlain(doc);
  if (!p) return null;
  const dto = {
    _id: _idToString(p._id),
    branchId: _idToString(p.branchId),
    patientId: _idToString(p.patientId),
    dentistId: _idToString(p.dentistId),
    chairId: _idToString(p.chairId),
    startTime: p.startTime || null,
    endTime: p.endTime || null,
    duration: typeof p.duration === "number" ? p.duration : null,
    status: p.status || "open",
    type: p.type || "consultation"
  };
  return enforce(dto, appointmentSummaryResponseSchema, "buildAppointmentSummaryDto");
}

// ── Convenience: build from req ─────────────────────────────────────────────

/**
 * buildAppointmentDtoForReq — resolves role from req.context and builds.
 * Controllers should prefer this over calling buildAppointmentDto directly.
 */
function buildAppointmentDtoForReq(doc, req) {
  return buildAppointmentDto(doc, {
    role: req?.context?.roleName || null
  });
}
module.exports = {
  buildAppointmentDto,
  buildAppointmentDtoForReq,
  buildAppointmentSummaryDto,
  // exported for tests
  _canSeeAudit,
  _canSeeFinance
};