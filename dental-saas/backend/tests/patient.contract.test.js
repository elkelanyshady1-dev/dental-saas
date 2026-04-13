/**
 * patient.contract.test.js — Patient Domain Contract Tests
 * Phase 10 — API Contract Automation
 *
 * Validates that DTO builders produce output conforming to Zod response schemas.
 * These tests are the CI enforcement gate — any DTO drift is caught here.
 *
 * RULE: These tests do NOT require a database connection.
 *       They validate pure data transformations only.
 */

"use strict";

// Minimal module-alias bootstrap for @root/... paths
require("module-alias/register");

const {
    patientListResponseSchema,
    patientSearchResponseSchema,
    patientCoreResponseSchema,
    patientSummaryResponseSchema,
} = require("@root/schemas/patient.response.schema");

const {
    buildPatientListDTO,
    buildPatientSearchDTO,
    buildPatientCoreDTO,
    buildPatientSummaryDTO,
} = require("@root/dto/patient.dto");

// ── Test Fixtures ───────────────────────────────────────────────────────────

const MOCK_PATIENT_FULL = {
    _id: "64a1f000000000000000001a",
    nameEnglish: "John Smith",
    nameArabic: "جون سميث",
    patientCode: "PT-0001",
    phone: "+201000000001",
    phoneDigits: "01000000001",
    gender: "male",
    dateOfBirth: new Date("1990-01-15"),
    status: "complete",
    isActive: true,
    primaryBranchId: "64a1f000000000000000002b",
    tags: ["vip"],
    alerts: [],
    lastVisit: new Date("2026-03-01"),
    nextAppointment: new Date("2026-04-01"),
    assignedDoctorId: "64a1f000000000000000003c",
    priorityScore: 85,
    balance: 250.50,
    currency: "EGP",
    hasActiveTreatment: true,
    insurance: { provider: "AXA", policyNumber: "INS-12345" },
    createdAt: new Date("2025-06-01"),
    email: "john@example.com",
    address: "123 Cairo St",
    nationality: "EG",
    nationalId: "29001011234567",
    emergencyContact: { name: "Jane Smith", phone: "+201000000002" },
    version: 3,
};

const MOCK_PATIENT_MINIMAL = {
    _id: "64a1f000000000000000004d",
    patientCode: "PT-0002",
};

// ── Tests ───────────────────────────────────────────────────────────────────

describe("Patient DTO Contract Tests", () => {

    describe("buildPatientListDTO", () => {
        it("should produce a valid DTO from a full patient document", () => {
            const dto = buildPatientListDTO(MOCK_PATIENT_FULL);
            const result = patientListResponseSchema.safeParse(dto);
            expect(result.success).toBe(true);
            expect(dto.displayName).toBe("John Smith");
            expect(dto.balance).toBe(250.50);
        });

        it("should produce a valid DTO from a minimal patient document", () => {
            const dto = buildPatientListDTO(MOCK_PATIENT_MINIMAL);
            const result = patientListResponseSchema.safeParse(dto);
            expect(result.success).toBe(true);
            expect(dto.displayName).toBe("PT-0002");
            expect(dto.balance).toBe(0);
            expect(dto.isActive).toBe(true);
        });

        it("should produce frozen output", () => {
            const dto = buildPatientListDTO(MOCK_PATIENT_FULL);
            expect(Object.isFrozen(dto)).toBe(true);
        });
    });

    describe("buildPatientSearchDTO", () => {
        it("should include _matchType", () => {
            const dto = buildPatientSearchDTO(MOCK_PATIENT_FULL, "name");
            const result = patientSearchResponseSchema.safeParse(dto);
            expect(result.success).toBe(true);
            expect(dto._matchType).toBe("name");
        });

        it("should produce frozen output", () => {
            const dto = buildPatientSearchDTO(MOCK_PATIENT_FULL, "phone");
            expect(Object.isFrozen(dto)).toBe(true);
        });
    });

    describe("buildPatientCoreDTO", () => {
        it("should produce a valid DTO from full document", () => {
            const dto = buildPatientCoreDTO(MOCK_PATIENT_FULL);
            const result = patientCoreResponseSchema.safeParse(dto);
            expect(result.success).toBe(true);
            expect(dto.displayName).toBe("John Smith");
            expect(dto.email).toBe("john@example.com");
        });

        it("should produce frozen output", () => {
            const dto = buildPatientCoreDTO(MOCK_PATIENT_FULL);
            expect(Object.isFrozen(dto)).toBe(true);
        });
    });

    describe("buildPatientSummaryDTO", () => {
        it("should produce a minimal valid DTO", () => {
            const dto = buildPatientSummaryDTO(MOCK_PATIENT_FULL);
            const result = patientSummaryResponseSchema.safeParse(dto);
            expect(result.success).toBe(true);
            expect(dto.displayName).toBe("John Smith");
            expect(dto.patientCode).toBe("PT-0001");
        });

        it("should produce frozen output", () => {
            const dto = buildPatientSummaryDTO(MOCK_PATIENT_MINIMAL);
            expect(Object.isFrozen(dto)).toBe(true);
        });
    });

    describe("Schema Strictness", () => {
        it("should reject unknown fields in PatientListDTO", () => {
            const withExtra = {
                ...buildPatientListDTO(MOCK_PATIENT_FULL),
                __proto__: null,
            };
            // Manually add extra field to unfrozen copy
            const unfrozen = { ...withExtra, unknownField: "leak" };
            const result = patientListResponseSchema.safeParse(unfrozen);
            expect(result.success).toBe(false);
        });

        it("should reject missing displayName", () => {
            const incomplete = {
                _id: "test",
                nameEnglish: null,
                nameArabic: null,
                patientCode: null,
                phone: null,
            };
            // displayName is required — schema should reject
            const result = patientSummaryResponseSchema.safeParse(incomplete);
            expect(result.success).toBe(false);
        });
    });
});
