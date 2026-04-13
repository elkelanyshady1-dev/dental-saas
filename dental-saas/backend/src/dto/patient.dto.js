/**
 * patient.dto.js — Patient Data Transfer Object Builder
 * Phase 9 — Contract-Driven Architecture
 *
 * SINGLE SOURCE OF TRUTH for all patient shape transformations.
 *
 * Rules:
 *   1. Every API response that includes patient data MUST go through this DTO.
 *   2. displayName is ALWAYS computed here — never inline in controllers/services.
 *   3. Frontend renders patient.displayName — no fallback chains in UI.
 *   4. Null coalescing is the DTO's job, not the consumer's.
 *
 * Consumers:
 *   - patient.list.service.js      → buildPatientListDTO (list view)
 *   - patient.aggregate.service.js → buildPatientCoreDTO (detail view)
 *   - patient.search.controller.js → buildPatientSearchDTO (search results)
 *   - intake.controller.js         → buildPatientSummaryDTO (minimal shape)
 *
 * Phase 9.1 Hardening:
 *   - All DTO builders return Object.freeze() (immutable)
 *   - resolveDisplayName has a hard fallback ("—") — never returns empty string
 *
 * Phase 10 — Contract Automation:
 *   - All builders enforce Zod response schemas via contractEnforcer
 *   - Violations are LOGGED (never thrown) — CI tests are the hard gate
 *   - ObjectId refs MUST be serialized to string via .toString()
 */

"use strict";

const { enforce } = require("../schemas/contractEnforcer");
const {
    patientListResponseSchema,
    patientSearchResponseSchema,
    patientCoreResponseSchema,
    patientSummaryResponseSchema,
} = require("../schemas/patient.response.schema");

// ─── Display Name Resolution ────────────────────────────────────────────────

/**
 * Resolves the canonical display name for a patient.
 *
 * Priority chain (backend-authoritative):
 *   1. nameEnglish (primary — UI language)
 *   2. nameArabic  (secondary — regional)
 *   3. fullNameNormalized (pre-save hook indexed copy)
 *   4. patientCode (last resort — always present)
 *   5. "—" (hard fallback — should never reach here if schema is valid)
 *
 * @param {object} p — Raw patient document (lean or POJO)
 * @returns {string}
 */
function resolveDisplayName(p) {
    return (
        (p.nameEnglish && p.nameEnglish.trim()) ||
        (p.nameArabic && p.nameArabic.trim()) ||
        (p.fullNameNormalized && p.fullNameNormalized.trim()) ||
        p.patientCode ||
        "—"
    );
}

// ─── List DTO (compact, for table/directory views) ──────────────────────────

/**
 * Builds the list-view DTO for the Patient Directory.
 * Used by patient.list.service.js → GET /patient/domain
 *
 * @param {object} p — Lean patient document with list projection fields
 * @returns {object}
 */
function buildPatientListDTO(p) {
    const dto = {
        _id: p._id,
        displayName: resolveDisplayName(p),
        nameEnglish: p.nameEnglish || null,
        nameArabic: p.nameArabic || null,
        patientCode: p.patientCode || null,
        phone: p.phone || null,
        phoneDigits: p.phoneDigits || null,
        gender: p.gender || null,
        dateOfBirth: p.dateOfBirth || null,
        status: p.status || "complete",
        isActive: p.isActive ?? true,

        // Enrichment fields — ObjectId refs MUST be serialized to string
        primaryBranchId: p.primaryBranchId?.toString() || null,
        tags: p.tags || [],
        alerts: p.alerts || [],
        lastVisit: p.lastVisit || null,
        nextAppointment: p.nextAppointment || null,
        assignedDoctorId: p.assignedDoctorId?.toString() || null,
        priorityScore: p.priorityScore || 0,

        // Financial summary (enriched by intelligence engine)
        balance: p.balance || 0,
        currency: p.currency || null,
        hasActiveTreatment: p.hasActiveTreatment || false,
        insurance: p.insurance ? Object.freeze({
            provider: p.insurance.provider || null,
            policyNumber: p.insurance.policyNumber || null,
        }) : null,

        // Timestamps
        createdAt: p.createdAt || null,

        // Academic vs Private Classification (v32.0)
        careType: p.careType || "PRIVATE",
    };
    return enforce(dto, patientListResponseSchema, "buildPatientListDTO");
}

// ─── Search DTO (matches list but includes match metadata) ──────────────────

/**
 * Builds the search-result DTO.
 * Used by patient.search.controller.js → GET /patient/domain/search
 *
 * @param {object} p — Lean patient document from search query
 * @param {string} matchType — "phone" | "name"
 * @returns {object}
 */
function buildPatientSearchDTO(p, matchType) {
    const dto = {
        _id: p._id,
        displayName: resolveDisplayName(p),
        nameEnglish: p.nameEnglish || null,
        nameArabic: p.nameArabic || null,
        patientCode: p.patientCode || null,
        phone: p.phone || null,
        phoneDigits: p.phoneDigits || null,
        gender: p.gender || null,
        dateOfBirth: p.dateOfBirth || null,
        primaryBranchId: p.primaryBranchId?.toString() || null,
        createdAt: p.createdAt || null,
        _matchType: matchType,
    };
    return enforce(dto, patientSearchResponseSchema, "buildPatientSearchDTO");
}

// ─── Aggregate DTO (full detail view — used by profile/layout) ──────────────

/**
 * Builds the aggregate projection DTO.
 * Used by patient.aggregate.service.js → getPatientAggregate
 *
 * NOTE: This builds the `core` sub-object of the aggregate response.
 *       The aggregate service adds clinical, financial, governance, etc.
 *
 * @param {object} p — Full lean patient document
 * @returns {object}
 */
function buildPatientCoreDTO(p) {
    const dto = {
        patientCode: p.patientCode,
        nameArabic: p.nameArabic || null,
        nameEnglish: p.nameEnglish || null,
        displayName: resolveDisplayName(p),
        phone: p.phone || null,
        email: p.email || null,
        gender: p.gender || null,
        dob: p.dateOfBirth || null,
        address: p.address || null,
        nationality: p.nationality || null,
        nationalId: p.nationalId || null,
        insurance: p.insurance ? Object.freeze({ ...p.insurance }) : Object.freeze({}),
        emergencyContact: p.emergencyContact ? Object.freeze({ ...p.emergencyContact }) : Object.freeze({}),
        isActive: p.isActive ?? true,
        status: p.status || "complete",
        version: p.version,
        // Doctor assignment (v32.0)
        assignedDoctorId: p.assignedDoctorId?.toString() || null,
        // Academic vs Private Classification (v32.0)
        careType: p.careType || "PRIVATE",
    };
    return enforce(dto, patientCoreResponseSchema, "buildPatientCoreDTO");
}

// ─── Summary DTO (minimal — for intake links, notifications, etc.) ───────────

/**
 * Builds a minimal summary DTO for non-UI consumers.
 * Used by intake.controller.js, notification payloads, etc.
 *
 * @param {object} p — Lean patient document
 * @returns {object}
 */
function buildPatientSummaryDTO(p) {
    const dto = {
        _id: p._id,
        displayName: resolveDisplayName(p),
        patientCode: p.patientCode || null,
        phone: p.phone || null,
    };
    return enforce(dto, patientSummaryResponseSchema, "buildPatientSummaryDTO");
}


module.exports = {
    resolveDisplayName,
    buildPatientListDTO,
    buildPatientSearchDTO,
    buildPatientCoreDTO,
    buildPatientSummaryDTO,
};
