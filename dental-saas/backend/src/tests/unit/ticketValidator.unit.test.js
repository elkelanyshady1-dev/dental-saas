/**
 * ticketValidator.unit.test.js — Unit tests for Zod ticket validators (Plan A1)
 */

"use strict";

const {
    parse,
    createTicketSchema,
    addMessageSchema,
    assignTicketSchema,
    transitionStatusSchema,
    approveRefundSchema,
    listTicketsQuerySchema,
} = require("@modules/supportDomain/validators/ticket.validator");

describe("ticket validators", () => {
    describe("createTicketSchema", () => {
        const valid = {
            category: "technical",
            priority: "HIGH",
            subject: "Cannot log in",
            description: "Repro: clicking submit does nothing.",
        };

        test("accepts a valid payload", () => {
            expect(() => parse(createTicketSchema, valid)).not.toThrow();
        });

        test("defaults priority to MEDIUM", () => {
            const { priority, ...rest } = valid;
            const parsed = parse(createTicketSchema, rest);
            expect(parsed.priority).toBe("MEDIUM");
        });

        test("rejects empty subject", () => {
            expect(() => parse(createTicketSchema, { ...valid, subject: "" })).toThrow(/VALIDATION_ERROR/);
        });

        test("rejects unknown keys (strict mode)", () => {
            expect(() => parse(createTicketSchema, { ...valid, evil: "payload" })).toThrow(/VALIDATION_ERROR/);
        });

        test("rejects invalid category enum", () => {
            expect(() => parse(createTicketSchema, { ...valid, category: "nope" })).toThrow(/VALIDATION_ERROR/);
        });

        test("rejects description over 4000 chars", () => {
            expect(() => parse(createTicketSchema, { ...valid, description: "a".repeat(4001) })).toThrow();
        });

        test("refund_request requires refundAmountRequestedMinor", () => {
            expect(() => parse(createTicketSchema, { ...valid, category: "refund_request" })).toThrow(/VALIDATION_ERROR/);
            expect(() => parse(createTicketSchema, { ...valid, category: "refund_request", refundAmountRequestedMinor: 5000 })).not.toThrow();
        });

        test("surfaces structured details with path + message", () => {
            let err;
            try { parse(createTicketSchema, { ...valid, subject: "" }); } catch (e) { err = e; }
            expect(err.code).toBe("VALIDATION_ERROR");
            expect(err.status).toBe(400);
            expect(Array.isArray(err.details)).toBe(true);
            expect(err.details[0].path).toContain("subject");
        });
    });

    describe("addMessageSchema", () => {
        test("requires message and expectedVersion", () => {
            expect(() => parse(addMessageSchema, { message: "hi" })).toThrow(/VALIDATION_ERROR/);
            expect(() => parse(addMessageSchema, { expectedVersion: 3 })).toThrow(/VALIDATION_ERROR/);
            expect(() => parse(addMessageSchema, { message: "hi", expectedVersion: 3 })).not.toThrow();
        });

        test("rejects non-integer version", () => {
            expect(() => parse(addMessageSchema, { message: "hi", expectedVersion: 1.5 })).toThrow();
            expect(() => parse(addMessageSchema, { message: "hi", expectedVersion: -1 })).toThrow();
        });
    });

    describe("assignTicketSchema", () => {
        test("requires valid ObjectId", () => {
            expect(() => parse(assignTicketSchema, { assigneeUserId: "abc", expectedVersion: 0 })).toThrow();
            expect(() => parse(assignTicketSchema, { assigneeUserId: "507f1f77bcf86cd799439011", expectedVersion: 0 })).not.toThrow();
        });
    });

    describe("transitionStatusSchema", () => {
        test("accepts reopen context", () => {
            const parsed = parse(transitionStatusSchema, {
                newStatus: "IN_REVIEW",
                expectedVersion: 4,
                reopen: true,
                reason: "Regression",
            });
            expect(parsed.reopen).toBe(true);
        });

        test("rejects invalid status enum", () => {
            expect(() => parse(transitionStatusSchema, { newStatus: "NOPE", expectedVersion: 0 })).toThrow();
        });
    });

    describe("approveRefundSchema", () => {
        test("requires positive amountMinor", () => {
            expect(() => parse(approveRefundSchema, { amountMinor: 0, reason: "x", expectedVersion: 1 })).toThrow();
            expect(() => parse(approveRefundSchema, { amountMinor: -1, reason: "x", expectedVersion: 1 })).toThrow();
            expect(() => parse(approveRefundSchema, { amountMinor: 100, reason: "x", expectedVersion: 1 })).not.toThrow();
        });

        test("rejects non-integer amount", () => {
            expect(() => parse(approveRefundSchema, { amountMinor: 100.5, reason: "x", expectedVersion: 1 })).toThrow();
        });
    });

    describe("listTicketsQuerySchema", () => {
        test("coerces string numbers", () => {
            const parsed = parse(listTicketsQuerySchema, { limit: "25", skip: "10" });
            expect(parsed.limit).toBe(25);
            expect(parsed.skip).toBe(10);
        });

        test("caps limit at 50", () => {
            expect(() => parse(listTicketsQuerySchema, { limit: 200 })).toThrow();
        });

        test("defaults limit and skip", () => {
            const parsed = parse(listTicketsQuerySchema, {});
            expect(parsed.limit).toBe(20);
            expect(parsed.skip).toBe(0);
        });
    });
});
