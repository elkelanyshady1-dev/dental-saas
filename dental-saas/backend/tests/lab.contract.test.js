/**
 * lab.contract.test.js — Lab Domain Contract Tests
 * Phase 10 — API Contract Automation
 *
 * Validates that lab DTO builders produce output conforming to Zod response schemas.
 * These tests are the CI enforcement gate — any DTO drift is caught here.
 *
 * RULE: No database connection required. Pure data transformations only.
 * PLANE: Org only.
 */

"use strict";

require("module-alias/register");

const {
    labPartnerListSchema,
    labPartnerDetailSchema,
    labCaseListSchema,
    labCaseDetailSchema,
    labClaimSchema,
    labMessageSchema,
} = require("@root/schemas/lab.response.schema");

const {
    buildLabPartnerListDTO,
    buildLabPartnerDetailDTO,
    buildLabCaseListDTO,
    buildLabCaseDetailDTO,
    buildLabClaimListDTO,
    buildLabMessageDTO,
} = require("@root/dto/lab.dto");

// ── Test Fixtures ───────────────────────────────────────────────────────────

const MOCK_LAB_PARTNER = {
    _id: "64b1f000000000000000001a",
    name: "Cairo Dental Lab",
    location: "Cairo, Egypt",
    specialties: ["crowns", "bridges", "implants"],
    turnaroundDays: 5,
    rating: 4.8,
    ratingCount: 32,
    status: "active",
    avatar: "https://cdn.example.com/lab-avatar.jpg",
    contact: {
        phone: "+201000000010",
        email: "lab@example.com",
        website: "https://cairodental.lab",
    },
    verifiedAt: new Date("2025-01-15"),
    notes: "Premium partner",
    createdAt: new Date("2025-01-01"),
    updatedAt: new Date("2026-03-01"),
};

const MOCK_LAB_CASE = {
    _id: "64b1f000000000000000002b",
    caseCode: "ORD-0001",
    patientName: "Ahmed Hassan",
    patientId: "64a1f000000000000000001a",
    labName: "Cairo Dental Lab",
    labId: "64b1f000000000000000001a",
    applianceType: "Crown",
    status: "in_production",
    cost: 1500.00,
    expectedDelivery: new Date("2026-04-15"),
    actualDelivery: null,
    prescription: { shade: "A2", material: "Zirconia" },
    notes: "Urgent case",
    trackingNumber: "TRK-123",
    trackingCarrier: "DHL",
    claimId: "64b1f000000000000000003c",
    createdAt: new Date("2026-03-01"),
    updatedAt: new Date("2026-03-15"),
};

const MOCK_LAB_CLAIM = {
    _id: "64b1f000000000000000003c",
    caseId: "64b1f000000000000000002b",
    caseCode: "ORD-0001",
    labName: "Cairo Dental Lab",
    labId: "64b1f000000000000000001a",
    applianceType: "Crown",
    cost: 1500.00,
    status: "approved",
    approvedBy: "64c1f000000000000000001a",
    approvedAt: new Date("2026-03-10"),
    paidAt: null,
    serviceDate: new Date("2026-03-01"),
    notes: "Approved for payment",
    createdAt: new Date("2026-03-01"),
    updatedAt: new Date("2026-03-10"),
};

const MOCK_LAB_MESSAGE = {
    _id: "64b1f000000000000000004d",
    caseId: "64b1f000000000000000002b",
    sender: "doctor01",
    senderName: "Dr. Khaled",
    senderType: "clinic",
    message: "Please adjust shade to A3.",
    attachments: ["photo1.jpg"],
    isSystem: false,
    createdAt: new Date("2026-03-15"),
};

// ── Tests ───────────────────────────────────────────────────────────────────

describe("Lab DTO Contract Tests", () => {

    describe("buildLabPartnerListDTO", () => {
        it("should produce a valid DTO", () => {
            const dto = buildLabPartnerListDTO(MOCK_LAB_PARTNER);
            const result = labPartnerListSchema.safeParse(dto);
            expect(result.success).toBe(true);
            expect(dto.displayName).toBe("Cairo Dental Lab");
        });

        it("should produce frozen output", () => {
            const dto = buildLabPartnerListDTO(MOCK_LAB_PARTNER);
            expect(Object.isFrozen(dto)).toBe(true);
        });
    });

    describe("buildLabPartnerDetailDTO", () => {
        it("should produce a valid DTO with contact", () => {
            const dto = buildLabPartnerDetailDTO(MOCK_LAB_PARTNER);
            const result = labPartnerDetailSchema.safeParse(dto);
            expect(result.success).toBe(true);
            expect(dto.contact.email).toBe("lab@example.com");
        });
    });

    describe("buildLabCaseListDTO", () => {
        it("should produce a valid DTO with numeric cost", () => {
            const dto = buildLabCaseListDTO(MOCK_LAB_CASE);
            const result = labCaseListSchema.safeParse(dto);
            expect(result.success).toBe(true);
            expect(typeof dto.cost).toBe("number");
            expect(dto.cost).toBe(1500.00);
        });

        it("should enforce INV-LAB-DTO-3: cost is always numeric", () => {
            const withStringCost = { ...MOCK_LAB_CASE, cost: "1500" };
            const dto = buildLabCaseListDTO(withStringCost);
            expect(typeof dto.cost).toBe("number");
        });

        it("should enforce INV-LAB-DTO-1: display names present", () => {
            const dto = buildLabCaseListDTO(MOCK_LAB_CASE);
            expect(dto.patientDisplayName).toBeTruthy();
            expect(dto.labDisplayName).toBeTruthy();
        });
    });

    describe("buildLabCaseDetailDTO", () => {
        it("should produce a valid DTO with prescription", () => {
            const dto = buildLabCaseDetailDTO(MOCK_LAB_CASE);
            const result = labCaseDetailSchema.safeParse(dto);
            expect(result.success).toBe(true);
            expect(dto.prescription.shade).toBe("A2");
        });
    });

    describe("buildLabClaimListDTO", () => {
        it("should produce a valid DTO", () => {
            const dto = buildLabClaimListDTO(MOCK_LAB_CLAIM);
            const result = labClaimSchema.safeParse(dto);
            expect(result.success).toBe(true);
            expect(dto.status).toBe("approved");
        });
    });

    describe("buildLabMessageDTO", () => {
        it("should produce a valid DTO", () => {
            const dto = buildLabMessageDTO(MOCK_LAB_MESSAGE);
            const result = labMessageSchema.safeParse(dto);
            expect(result.success).toBe(true);
            expect(dto.isSystem).toBe(false);
            expect(dto.attachments).toEqual(["photo1.jpg"]);
        });
    });

    describe("Schema Strictness", () => {
        it("should reject unknown fields in LabCaseListDTO", () => {
            const dto = buildLabCaseListDTO(MOCK_LAB_CASE);
            const unfrozen = { ...dto, unknownField: "leak" };
            const result = labCaseListSchema.safeParse(unfrozen);
            expect(result.success).toBe(false);
        });
    });
});
