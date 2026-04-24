/**
 * ticketDTO.contract.test.js — Contract tests for Ticket DTO builders (Plan A2, E9, E15)
 *
 * Enforces:
 *   - Org DTO keys ⊆ Platform DTO keys (anti-drift)
 *   - Org DTO NEVER leaks internalNotes / ticketHistory / slaProcessedAt / providerRefundId
 *   - Platform DTO includes forensic envelope
 *   - Role-based masking for platform_support_readonly strips financial minors
 *   - Base/list DTOs stay slim
 *
 * Runs under the `contracts` jest project (no DB, no setup).
 */

"use strict";

const {
    TICKET_DTO_VERSION,
    buildBaseTicketDTO,
    buildOrgTicketDTO,
    buildOrgTicketListItemDTO,
    buildPlatformTicketDTO,
    buildPlatformTicketListItemDTO,
    envelope,
} = require("@modules/supportDomain/dto/ticket.dto");

function makeTicket(overrides = {}) {
    return {
        _id: "507f1f77bcf86cd799439011",
        organizationId: "507f1f77bcf86cd799439099",
        regionCode: "MEA",
        category: "billing",
        priority: "HIGH",
        status: "IN_REVIEW",
        subject: "Invoice dispute",
        description: "Row 4 on invoice INV-1234 is wrong.",
        slaDeadline: new Date("2026-04-20T00:00:00Z"),
        breachFlag: false,
        escalationLevel: 2,
        threadMessageCount: 3,
        isArchived: false,
        version: 7,
        createdBy: "507f1f77bcf86cd799439022",
        createdAt: new Date("2026-04-14T00:00:00Z"),
        updatedAt: new Date("2026-04-15T00:00:00Z"),
        resolvedAt: null,
        linkedInvoiceId: "507f1f77bcf86cd799439088",
        linkedSubscriptionId: "sub_123",
        linkedMutationId: "507f1f77bcf86cd799439077",
        providerDisputeId: "dp_abc",
        providerRefundId: "re_xyz",
        refundAmountRequestedMinor: 50000,
        refundAmountApprovedMinor: 0,
        financialImpactMinor: 50000,
        assignedTo: "507f1f77bcf86cd799439066",
        assignedToPlatformUserId: "507f1f77bcf86cd799439066",
        slaProcessedAt: new Date("2026-04-14T12:00:00Z"),
        conversationThread: [{
            _id: "507f1f77bcf86cd799439033",
            actorId: "507f1f77bcf86cd799439022",
            actorType: "tenant_user",
            message: "Please help",
            createdAt: new Date("2026-04-14T01:00:00Z"),
        }],
        internalNotes: [{
            _id: "507f1f77bcf86cd799439044",
            actorId: "507f1f77bcf86cd799439055",
            note: "Investigating — check provider logs",
            createdAt: new Date("2026-04-14T02:00:00Z"),
        }],
        ticketHistory: [{
            action: "TICKET_CREATED",
            actorId: "507f1f77bcf86cd799439022",
            actorPlane: "org",
            actorType: "tenant_user",
            timestamp: new Date("2026-04-14T00:00:00Z"),
            diff: { category: "billing" },
            ip: "1.2.3.4",
        }],
        ...overrides,
    };
}

describe("ticket.dto", () => {
    test("dto version is exported", () => {
        expect(TICKET_DTO_VERSION).toMatch(/^\d+\.\d+\.\d+$/);
    });

    test("buildBaseTicketDTO returns null for null input", () => {
        expect(buildBaseTicketDTO(null)).toBeNull();
        expect(buildBaseTicketDTO(undefined)).toBeNull();
    });

    test("buildBaseTicketDTO stringifies ObjectIds and ISO-formats dates", () => {
        const dto = buildBaseTicketDTO(makeTicket());
        expect(typeof dto.id).toBe("string");
        expect(typeof dto.organizationId).toBe("string");
        expect(dto.slaDeadline).toMatch(/T/);
        expect(dto.createdAt).toMatch(/T/);
    });

    describe("org DTO isolation (E15 — no internal leaks)", () => {
        const orgDTO = buildOrgTicketDTO(makeTicket());

        test("never includes internalNotes", () => {
            expect("internalNotes" in orgDTO).toBe(false);
        });

        test("never includes ticketHistory", () => {
            expect("ticketHistory" in orgDTO).toBe(false);
        });

        test("never includes slaProcessedAt", () => {
            expect("slaProcessedAt" in orgDTO).toBe(false);
        });

        test("never includes providerDisputeId / providerRefundId", () => {
            expect("providerDisputeId" in orgDTO).toBe(false);
            expect("providerRefundId" in orgDTO).toBe(false);
        });

        test("never includes assignedToPlatformUserId", () => {
            expect("assignedToPlatformUserId" in orgDTO).toBe(false);
        });

        test("never includes financialImpactMinor or refundAmountApprovedMinor", () => {
            expect("financialImpactMinor" in orgDTO).toBe(false);
            expect("refundAmountApprovedMinor" in orgDTO).toBe(false);
        });

        test("exposes refundAmountRequestedMinor (visible to requesting user)", () => {
            expect(orgDTO.refundAmountRequestedMinor).toBe(50000);
        });

        test("includes conversationThread without raw _id leaks", () => {
            expect(Array.isArray(orgDTO.conversationThread)).toBe(true);
            expect(typeof orgDTO.conversationThread[0].id).toBe("string");
        });
    });

    describe("platform DTO forensic envelope", () => {
        const platformDTO = buildPlatformTicketDTO(makeTicket(), { role: "platform_support" });

        test("includes internalNotes + ticketHistory", () => {
            expect(platformDTO.internalNotes).toHaveLength(1);
            expect(platformDTO.ticketHistory).toHaveLength(1);
        });

        test("includes forensic fields", () => {
            expect(platformDTO.providerRefundId).toBe("re_xyz");
            expect(platformDTO.providerDisputeId).toBe("dp_abc");
            expect(platformDTO.financialImpactMinor).toBe(50000);
            expect(platformDTO.slaProcessedAt).toBeTruthy();
        });
    });

    describe("E9 anti-drift — org keys ⊆ platform keys", () => {
        test("every key in org DTO exists on platform DTO", () => {
            const orgDTO = buildOrgTicketDTO(makeTicket());
            const platformDTO = buildPlatformTicketDTO(makeTicket());
            const platformKeys = new Set(Object.keys(platformDTO));
            for (const k of Object.keys(orgDTO)) {
                expect(platformKeys.has(k)).toBe(true);
            }
        });
    });

    describe("role-based masking", () => {
        test("platform_support_readonly strips financial minors", () => {
            const dto = buildPlatformTicketDTO(makeTicket(), { role: "platform_support_readonly" });
            expect(dto.refundAmountRequestedMinor).toBeNull();
            expect(dto.refundAmountApprovedMinor).toBeNull();
            expect(dto.financialImpactMinor).toBeNull();
            expect(dto.providerRefundId).toBeNull();
        });
    });

    describe("list DTOs", () => {
        test("org list DTO is slim and keeps no forensic fields", () => {
            const dto = buildOrgTicketListItemDTO(makeTicket());
            expect(dto).toEqual(expect.objectContaining({
                id: expect.any(String),
                subject: expect.any(String),
                status: expect.any(String),
            }));
            expect("internalNotes" in dto).toBe(false);
            expect("ticketHistory" in dto).toBe(false);
            expect("description" in dto).toBe(false);
        });

        test("platform list DTO includes assignedToPlatformUserId but not notes", () => {
            const dto = buildPlatformTicketListItemDTO(makeTicket());
            expect(dto.assignedToPlatformUserId).toBeTruthy();
            expect("internalNotes" in dto).toBe(false);
            expect("ticketHistory" in dto).toBe(false);
        });
    });

    describe("envelope helper", () => {
        test("wraps data with success + version metadata", () => {
            const env = envelope({ foo: "bar" });
            expect(env.success).toBe(true);
            expect(env.version).toBe(TICKET_DTO_VERSION);
            expect(env.data).toEqual({ foo: "bar" });
        });
    });
});
