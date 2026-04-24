/**
 * recall.response.schema.js — Recall Response Contract (Zod)
 *
 * Strict contract for recall DTO output. Builder lives at
 * src/dto/recall.dto.js and enforces this schema via contractEnforcer.
 */

"use strict";

const { z } = require("zod");

const mongoId = z.any();
const nullableString = z.string().nullable().optional();
const nullableDate = z.any().nullable().optional();

const RECALL_STATUS = ["pending", "sent", "booked", "cancelled"];

// Populated patient/branch subdocs — subset only; no PII beyond what's
// needed for staff to identify the recall in a list view.
const patientRefSchema = z
    .object({
        _id: mongoId,
        name: nullableString,
        phone: nullableString,
        email: nullableString,
    })
    .partial()
    .nullable()
    .optional();

const branchRefSchema = z
    .object({
        _id: mongoId,
        name: nullableString,
    })
    .partial()
    .nullable()
    .optional();

const recallResponseSchema = z
    .object({
        _id: mongoId,
        organizationId: nullableString,
        branchId: mongoId.nullable().optional(),
        patientId: mongoId.nullable().optional(),
        dueDate: nullableDate,
        reason: z.string().default(""),
        status: z.enum(RECALL_STATUS),

        // Populated refs (when present). Kept partial so server can elect
        // to include only what's needed per view.
        patient: patientRefSchema,
        branch: branchRefSchema,

        createdAt: nullableDate,
        updatedAt: nullableDate,
    })
    .strict();

module.exports = {
    recallResponseSchema,
    RECALL_STATUS,
};
