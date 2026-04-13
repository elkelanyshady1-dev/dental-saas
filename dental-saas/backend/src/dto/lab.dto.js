/**
 * lab.dto.js — Lab Domain DTO Builders (Contract Layer)
 *
 * SSOT: These builders are the ONLY way lab data should be shaped
 *        before returning to the frontend.
 *
 * INVARIANTS:
 *   INV-LAB-DTO-1 — Every lab case response MUST include displayName for lab and patient.
 *   INV-LAB-DTO-2 — Every DTO object MUST be Object.freeze'd (immutable).
 *   INV-LAB-DTO-3 — Financial fields (cost) MUST be numeric, never undefined.
 *
 * Phase 10 — Contract Automation:
 *   - All builders enforce Zod response schemas via contractEnforcer
 *   - Violations are LOGGED (never thrown) — CI tests are the hard gate
 *
 * PLANE: Org only. No cross-plane imports.
 */

"use strict";

const { enforce } = require("../schemas/contractEnforcer");
const {
    labPartnerListSchema,
    labPartnerDetailSchema,
    labCaseListSchema,
    labCaseDetailSchema,
    labClaimSchema,
    labMessageSchema,
    labDashboardSchema,
} = require("../schemas/lab.response.schema");

// ── Helpers ────────────────────────────────────────────────────────────────────

/**
 * resolveLabDisplayName — canonical display name for a lab partner.
 * @param {object} raw — raw lab document
 * @returns {string}
 */
function resolveLabDisplayName(raw) {
    return raw?.name || raw?.contact?.email || "Unknown Lab";
}

/**
 * resolvePatientDisplayName — canonical patient display in lab context.
 * @param {object} raw — raw lab case document
 * @returns {string}
 */
function resolvePatientDisplayName(raw) {
    return raw?.patientName || `Patient#${raw?.patientId || "—"}`;
}

/**
 * formatCost — ensures numeric representation, never NaN or undefined.
 * @param {*} val
 * @returns {number}
 */
function formatCost(val) {
    const n = Number(val);
    return Number.isFinite(n) ? n : 0;
}

// ── Lab Partner DTOs ──────────────────────────────────────────────────────────

/**
 * buildLabPartnerListDTO — for directory/table listing.
 */
function buildLabPartnerListDTO(raw) {
    const dto = {
        _id:            raw._id?.toString(),
        displayName:    resolveLabDisplayName(raw),
        name:           raw.name   || "",
        location:       raw.location || "",
        specialties:    Array.isArray(raw.specialties) ? [...raw.specialties] : [],
        turnaroundDays: raw.turnaroundDays ?? null,
        rating:         raw.rating ?? 0,
        ratingCount:    raw.ratingCount ?? 0,
        status:         raw.status || "active",
        avatar:         raw.avatar || null,
    };
    return enforce(dto, labPartnerListSchema, "buildLabPartnerListDTO");
}

/**
 * buildLabPartnerDetailDTO — full partner profile.
 */
function buildLabPartnerDetailDTO(raw) {
    const dto = {
        _id:            raw._id?.toString(),
        displayName:    resolveLabDisplayName(raw),
        name:           raw.name   || "",
        location:       raw.location || "",
        specialties:    Array.isArray(raw.specialties) ? [...raw.specialties] : [],
        turnaroundDays: raw.turnaroundDays ?? null,
        rating:         raw.rating ?? 0,
        ratingCount:    raw.ratingCount ?? 0,
        contact:        Object.freeze({
            phone:   raw.contact?.phone   || "",
            email:   raw.contact?.email   || "",
            website: raw.contact?.website || "",
        }),
        status:         raw.status || "active",
        avatar:         raw.avatar || null,
        verifiedAt:     raw.verifiedAt || null,
        notes:          raw.notes  || "",
        createdAt:      raw.createdAt,
        updatedAt:      raw.updatedAt,
    };
    return enforce(dto, labPartnerDetailSchema, "buildLabPartnerDetailDTO");
}

// ── Lab Case DTOs ─────────────────────────────────────────────────────────────

/**
 * buildLabCaseListDTO — for case list/kanban/priority tables.
 */
function buildLabCaseListDTO(raw) {
    const dto = {
        _id:              raw._id?.toString(),
        caseCode:         raw.caseCode || "ORD-???",
        patientDisplayName: resolvePatientDisplayName(raw),
        patientName:      raw.patientName || "",
        patientId:        raw.patientId?.toString() || null,
        labDisplayName:   resolveLabDisplayName(raw),
        labName:          raw.labName || "",
        labId:            raw.labId?.toString() || null,
        applianceType:    raw.applianceType || "",
        status:           raw.status || "draft",
        cost:             formatCost(raw.cost),
        expectedDelivery: raw.expectedDelivery || null,
        actualDelivery:   raw.actualDelivery   || null,
        createdAt:        raw.createdAt,
        updatedAt:        raw.updatedAt,
    };
    return enforce(dto, labCaseListSchema, "buildLabCaseListDTO");
}

/**
 * buildLabCaseDetailDTO — full case detail (used on LabCaseDetail page).
 */
function buildLabCaseDetailDTO(raw) {
    const dto = {
        _id:              raw._id?.toString(),
        caseCode:         raw.caseCode || "ORD-???",
        patientDisplayName: resolvePatientDisplayName(raw),
        patientName:      raw.patientName || "",
        patientId:        raw.patientId?.toString() || null,
        labDisplayName:   resolveLabDisplayName(raw),
        labName:          raw.labName || "",
        labId:            raw.labId?.toString() || null,
        applianceType:    raw.applianceType || "",
        status:           raw.status || "draft",
        prescription:     raw.prescription || {},
        notes:            raw.notes || "",
        cost:             formatCost(raw.cost),
        expectedDelivery: raw.expectedDelivery || null,
        actualDelivery:   raw.actualDelivery   || null,
        trackingNumber:   raw.trackingNumber   || null,
        trackingCarrier:  raw.trackingCarrier  || null,
        claimId:          raw.claimId?.toString() || null,
        createdAt:        raw.createdAt,
        updatedAt:        raw.updatedAt,
    };
    return enforce(dto, labCaseDetailSchema, "buildLabCaseDetailDTO");
}

// ── Lab Claim DTOs ────────────────────────────────────────────────────────────

/**
 * buildLabClaimListDTO — for claims table.
 */
function buildLabClaimListDTO(raw) {
    const dto = {
        _id:            raw._id?.toString(),
        caseId:         raw.caseId?.toString() || null,
        caseCode:       raw.caseCode   || "",
        labDisplayName: resolveLabDisplayName(raw),
        labName:        raw.labName    || "",
        labId:          raw.labId?.toString() || null,
        applianceType:  raw.applianceType || "",
        cost:           formatCost(raw.cost),
        status:         raw.status || "pending",
        approvedBy:     raw.approvedBy || null,
        approvedAt:     raw.approvedAt || null,
        paidAt:         raw.paidAt     || null,
        serviceDate:    raw.serviceDate || null,
        notes:          raw.notes || "",
        createdAt:      raw.createdAt,
        updatedAt:      raw.updatedAt,
    };
    return enforce(dto, labClaimSchema, "buildLabClaimListDTO");
}

// ── Lab Message DTO ───────────────────────────────────────────────────────────

/**
 * buildLabMessageDTO — for chat display.
 */
function buildLabMessageDTO(raw) {
    const dto = {
        _id:          raw._id?.toString(),
        caseId:       raw.caseId?.toString() || null,
        sender:       raw.sender     || "system",
        senderName:   raw.senderName || "",
        senderType:   raw.senderType || "clinic",
        message:      raw.message    || "",
        attachments:  Array.isArray(raw.attachments) ? [...raw.attachments] : [],
        isSystem:     !!raw.isSystem,
        createdAt:    raw.createdAt,
    };
    return enforce(dto, labMessageSchema, "buildLabMessageDTO");
}

// ── Dashboard DTO ─────────────────────────────────────────────────────────────

/**
 * buildLabDashboardDTO — shapes the dashboard KPI + activity response.
 */
function buildLabDashboardDTO(raw) {
    const kpis = Object.freeze({
        activeCases:        raw?.kpis?.activeCases        ?? 0,
        pendingSubmissions: raw?.kpis?.pendingSubmissions  ?? 0,
        inProduction:       raw?.kpis?.inProduction        ?? 0,
        monthlyExpenses:    formatCost(raw?.kpis?.monthlyExpenses),
    });

    const recentActivity = Array.isArray(raw?.recentActivity)
        ? raw.recentActivity.map(a => buildLabCaseListDTO(a))
        : [];

    return Object.freeze({ kpis, recentActivity });
}

module.exports = {
    resolveLabDisplayName,
    resolvePatientDisplayName,
    formatCost,
    buildLabPartnerListDTO,
    buildLabPartnerDetailDTO,
    buildLabCaseListDTO,
    buildLabCaseDetailDTO,
    buildLabClaimListDTO,
    buildLabMessageDTO,
    buildLabDashboardDTO,
};
