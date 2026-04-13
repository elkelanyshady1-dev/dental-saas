/**
 * patient.dto.test.js — DTO Contract Tests
 * Phase 9.1 — Automated Contract Testing
 *
 * Validates that the DTO builders maintain the contract regardless of
 * input shape or missing fields. These tests are the REGRESSION GATE
 * against future contract drift.
 */
"use strict";

const {
    resolveDisplayName,
    buildPatientListDTO,
    buildPatientSearchDTO,
    buildPatientCoreDTO,
    buildPatientSummaryDTO,
} = require("../../src/dto/patient.dto");

// ═══════════════════════════════════════════════════════════════════════════════
// resolveDisplayName — Centralized SSOT for display name resolution
// ═══════════════════════════════════════════════════════════════════════════════

describe("resolveDisplayName", () => {
    test("returns nameEnglish when available", () => {
        expect(resolveDisplayName({ nameEnglish: "John Doe" })).toBe("John Doe");
    });

    test("falls back to nameArabic when nameEnglish is missing", () => {
        expect(resolveDisplayName({ nameArabic: "أحمد" })).toBe("أحمد");
    });

    test("falls back to fullNameNormalized", () => {
        expect(resolveDisplayName({ fullNameNormalized: "JANE DOE" })).toBe("JANE DOE");
    });

    test("falls back to patientCode", () => {
        expect(resolveDisplayName({ patientCode: "PT-0042" })).toBe("PT-0042");
    });

    test("returns dash when all name fields are empty", () => {
        expect(resolveDisplayName({})).toBe("—");
    });

    test("skips whitespace-only names", () => {
        expect(resolveDisplayName({ nameEnglish: "   ", nameArabic: "  " })).toBe("—");
    });

    test("trims leading/trailing whitespace", () => {
        expect(resolveDisplayName({ nameEnglish: "  John  " })).toBe("John");
    });

    test("handles null/undefined fields gracefully", () => {
        expect(resolveDisplayName({ nameEnglish: null, nameArabic: undefined })).toBe("—");
    });
});

// ═══════════════════════════════════════════════════════════════════════════════
// buildPatientListDTO — List view shape
// ═══════════════════════════════════════════════════════════════════════════════

describe("buildPatientListDTO", () => {
    const FULL_PATIENT = {
        _id: "507f191e810c19729de860ea",
        nameEnglish: "John Doe",
        nameArabic: "جون دو",
        patientCode: "PT-0042",
        phone: "+201234567890",
        phoneDigits: "201234567890",
        gender: "male",
        dateOfBirth: new Date("1990-05-15"),
        status: "complete",
        isActive: true,
        primaryBranchId: "branch-1",
        tags: ["orthodontics"],
        alerts: [{ type: "balance_due", message: "Has overdue balance" }],
        lastVisit: new Date("2026-01-15"),
        nextAppointment: new Date("2026-04-01"),
        assignedDoctorId: "doc-1",
        priorityScore: 45,
        balance: 1500,
        currency: "EGP",
        hasActiveTreatment: true,
        insurance: { provider: "MedNet", policyNumber: "POL-123" },
        createdAt: new Date("2025-01-01"),
    };

    test("contains displayName (REQUIRED DTO FIELD)", () => {
        const dto = buildPatientListDTO(FULL_PATIENT);
        expect(dto.displayName).toBe("John Doe");
    });

    test("contains all required list fields", () => {
        const dto = buildPatientListDTO(FULL_PATIENT);

        expect(dto._id).toBeDefined();
        expect(dto.displayName).toBeDefined();
        expect(dto.patientCode).toBeDefined();
        expect(dto.phone).toBeDefined();
        expect(dto.isActive).toBeDefined();
    });

    test("is immutable (Object.freeze)", () => {
        const dto = buildPatientListDTO(FULL_PATIENT);
        expect(Object.isFrozen(dto)).toBe(true);
    });

    test("insurance sub-object is also frozen", () => {
        const dto = buildPatientListDTO(FULL_PATIENT);
        expect(Object.isFrozen(dto.insurance)).toBe(true);
    });

    test("handles empty patient gracefully", () => {
        const dto = buildPatientListDTO({});
        expect(dto.displayName).toBe("—");
        expect(dto.isActive).toBe(true);
        expect(dto.status).toBe("complete");
        expect(dto.tags).toEqual([]);
        expect(dto.alerts).toEqual([]);
        expect(dto.balance).toBe(0);
    });

    test("does NOT contain raw DB fields", () => {
        const dto = buildPatientListDTO({
            ...FULL_PATIENT,
            __v: 3,
            organizationId: "org-secret",
            passwordHash: "hash-secret",
        });

        expect(dto.__v).toBeUndefined();
        expect(dto.organizationId).toBeUndefined();
        expect(dto.passwordHash).toBeUndefined();
    });
});

// ═══════════════════════════════════════════════════════════════════════════════
// buildPatientSearchDTO — Search result shape
// ═══════════════════════════════════════════════════════════════════════════════

describe("buildPatientSearchDTO", () => {
    test("contains displayName and match metadata", () => {
        const dto = buildPatientSearchDTO({ nameEnglish: "Ahmed" }, "name");
        expect(dto.displayName).toBe("Ahmed");
        expect(dto._matchType).toBe("name");
    });

    test("is immutable", () => {
        const dto = buildPatientSearchDTO({ nameArabic: "أحمد" }, "name");
        expect(Object.isFrozen(dto)).toBe(true);
    });
});

// ═══════════════════════════════════════════════════════════════════════════════
// buildPatientCoreDTO — Detail/profile view shape
// ═══════════════════════════════════════════════════════════════════════════════

describe("buildPatientCoreDTO", () => {
    test("contains displayName", () => {
        const dto = buildPatientCoreDTO({ nameEnglish: "Sarah" });
        expect(dto.displayName).toBe("Sarah");
    });

    test("is immutable", () => {
        const dto = buildPatientCoreDTO({ nameEnglish: "Sarah" });
        expect(Object.isFrozen(dto)).toBe(true);
    });

    test("freezes nested insurance and emergency contact", () => {
        const dto = buildPatientCoreDTO({
            nameEnglish: "Sarah",
            insurance: { provider: "AXA" },
            emergencyContact: { name: "Mom", phone: "123" },
        });
        expect(Object.isFrozen(dto.insurance)).toBe(true);
        expect(Object.isFrozen(dto.emergencyContact)).toBe(true);
    });

    test("defaults insurance and emergencyContact to frozen empty objects", () => {
        const dto = buildPatientCoreDTO({ nameEnglish: "Sarah" });
        expect(dto.insurance).toEqual({});
        expect(Object.isFrozen(dto.insurance)).toBe(true);
        expect(dto.emergencyContact).toEqual({});
        expect(Object.isFrozen(dto.emergencyContact)).toBe(true);
    });
});

// ═══════════════════════════════════════════════════════════════════════════════
// buildPatientSummaryDTO — Minimal shape (intake, notifications)
// ═══════════════════════════════════════════════════════════════════════════════

describe("buildPatientSummaryDTO", () => {
    test("contains displayName", () => {
        const dto = buildPatientSummaryDTO({ nameEnglish: "Test" });
        expect(dto.displayName).toBe("Test");
    });

    test("is immutable", () => {
        const dto = buildPatientSummaryDTO({ nameEnglish: "Test" });
        expect(Object.isFrozen(dto)).toBe(true);
    });

    test("contains only minimal fields", () => {
        const dto = buildPatientSummaryDTO({
            _id: "id-1",
            nameEnglish: "Test",
            patientCode: "PT-001",
            phone: "123",
            extraField: "should not appear",
        });

        expect(Object.keys(dto)).toEqual(["_id", "displayName", "patientCode", "phone"]);
    });
});

// ═══════════════════════════════════════════════════════════════════════════════
// MUTATION SAFETY — Object.freeze enforcement
// ═══════════════════════════════════════════════════════════════════════════════

describe("DTO Immutability", () => {
    test("attempting to modify a frozen DTO throws in strict mode", () => {
        "use strict";
        const dto = buildPatientListDTO({ nameEnglish: "Frozen" });

        expect(() => {
            dto.displayName = "Mutated";
        }).toThrow();
    });

    test("attempting to add a new field to a frozen DTO throws in strict mode", () => {
        "use strict";
        const dto = buildPatientSummaryDTO({ nameEnglish: "Frozen" });

        expect(() => {
            dto.newField = "injected";
        }).toThrow();
    });

    test("attempting to delete a field from a frozen DTO throws in strict mode", () => {
        "use strict";
        const dto = buildPatientCoreDTO({ nameEnglish: "Frozen" });

        expect(() => {
            delete dto.displayName;
        }).toThrow();
    });
});
