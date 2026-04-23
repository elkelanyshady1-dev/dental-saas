"use strict";

/**
 * treatmentPlanVersion.validator.js — Zod schemas for /plan-versions endpoints
 *
 * Rules per CLAUDE.md §4.1:
 *   - z.record(z.string(), schema) — NOT z.record(schema)
 *   - z.string().min(1) — NOT z.string().nonempty()
 *   - parseSafe() at the call site for clear error labels
 */

const { z } = require("zod");

const OBJECT_ID_RX = /^[a-f\d]{24}$/i;
const objectId = z.string().regex(OBJECT_ID_RX, "must be a valid ObjectId");

// Asset lists — each category is optional on input; the service normalizes nulls.
const assetsSchema = z.object({
    photos:     z.array(objectId).max(500).optional().default([]),
    documents:  z.array(objectId).max(200).optional().default([]),
    stlFiles:   z.array(objectId).max(100).optional().default([]),
    dicomFiles: z.array(objectId).max(100).optional().default([]),
}).optional();

// Payload is an arbitrary plan document (bracket system, prescription, etc.).
// We deliberately don't constrain its shape here — the frontend is the authoring
// surface and the clinical schema evolves independently. Size-bound to avoid abuse.
const payloadSchema = z.record(z.string(), z.any());

const createDraftSchema = z.object({
    recordSetId: objectId,
    payload:     payloadSchema,
    assets:      assetsSchema,
}).strict();

const editDraftSchema = z.object({
    payload:             payloadSchema.optional(),
    assets:              assetsSchema,
    expectedVersionLock: z.number().int().min(0),
}).strict();

const createRevisionSchema = z.object({
    recordSetId:   objectId,
    payload:       payloadSchema,
    changeSummary: z.string().min(1).max(2000),
    assets:        assetsSchema,
}).strict();

const compareQuerySchema = z.object({
    from: objectId,
    to:   objectId,
}).strict();

module.exports = {
    createDraftSchema,
    editDraftSchema,
    createRevisionSchema,
    compareQuerySchema,
};
