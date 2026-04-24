/**
 * ticket.validator.js — Zod schemas for all support ticket operations (Plan A1)
 *
 * Every write endpoint in both platform and org planes MUST parse req.body
 * through one of these schemas. Raw req.body destructuring is forbidden.
 *
 * Validation is strict: unknown keys are stripped, required fields must be
 * present, enums are enforced, lengths are capped.
 *
 * All write operations that require optimistic concurrency include
 * `expectedVersion` (integer ≥ 0).
 */

"use strict";

const { z } = require("zod");

// ─── Shared primitives ───────────────────────────────────────────────
const objectId = z.string().regex(/^[a-f0-9]{24}$/i, "INVALID_OBJECT_ID");
const nonEmptyString = (max) => z.string().trim().min(1).max(max);
const expectedVersion = z.number().int().min(0);

const CATEGORIES = ["technical", "billing", "security", "subscription", "dispute", "refund_request"];
const PRIORITIES = ["CRITICAL", "HIGH", "MEDIUM", "LOW"];

// ─── Schemas ─────────────────────────────────────────────────────────
const createTicketSchema = z.object({
    category: z.enum(CATEGORIES),
    priority: z.enum(PRIORITIES).default("MEDIUM"),
    subject: nonEmptyString(200),
    description: nonEmptyString(4000),
    linkedInvoiceId: objectId.optional(),
    linkedSubscriptionId: z.string().max(200).optional(),
    refundAmountRequestedMinor: z.number().int().nonnegative().optional(),
}).strict()
    .refine(
        (d) => d.category !== "refund_request" || typeof d.refundAmountRequestedMinor === "number",
        { message: "refundAmountRequestedMinor is required when category is refund_request", path: ["refundAmountRequestedMinor"] }
    );

const listTicketsQuerySchema = z.object({
    limit: z.coerce.number().int().min(1).max(50).default(20),
    skip: z.coerce.number().int().min(0).default(0),
    status: z.enum([
        "OPEN", "IN_REVIEW", "WAITING_CUSTOMER", "ESCALATED",
        "REFUND_APPROVED", "RESOLVED", "CLOSED", "REJECTED",
    ]).optional(),
    priority: z.enum(PRIORITIES).optional(),
    category: z.enum(CATEGORIES).optional(),
}).strict();

const addMessageSchema = z.object({
    message: nonEmptyString(4000),
    expectedVersion,
}).strict();

const addInternalNoteSchema = z.object({
    note: nonEmptyString(4000),
    expectedVersion,
}).strict();

const assignTicketSchema = z.object({
    assigneeUserId: objectId,
    expectedVersion,
}).strict();

const transitionStatusSchema = z.object({
    newStatus: z.enum([
        "OPEN", "IN_REVIEW", "WAITING_CUSTOMER", "ESCALATED",
        "REFUND_APPROVED", "RESOLVED", "CLOSED", "REJECTED",
    ]),
    expectedVersion,
    reopen: z.boolean().optional(),
    reason: z.string().trim().max(500).optional(),
}).strict();

const approveRefundSchema = z.object({
    amountMinor: z.number().int().positive(),
    reason: nonEmptyString(500),
    expectedVersion,
}).strict();

const archiveTicketSchema = z.object({
    reason: nonEmptyString(500),
    expectedVersion,
}).strict();

// ─── Helper: parse + surface a structured ValidationError ───────────
function parse(schema, payload) {
    const result = schema.safeParse(payload);
    if (!result.success) {
        const err = new Error("VALIDATION_ERROR");
        err.code = "VALIDATION_ERROR";
        err.status = 400;
        err.details = result.error.issues.map((i) => ({
            path: i.path.join("."),
            message: i.message,
            code: i.code,
        }));
        throw err;
    }
    return result.data;
}

module.exports = {
    // Schemas
    createTicketSchema,
    listTicketsQuerySchema,
    addMessageSchema,
    addInternalNoteSchema,
    assignTicketSchema,
    transitionStatusSchema,
    approveRefundSchema,
    archiveTicketSchema,

    // Enums (exported for FE contract generation / tests)
    CATEGORIES,
    PRIORITIES,

    // Helper
    parse,
};
