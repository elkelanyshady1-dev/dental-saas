/**
 * clinicalSnapshot.validator.js
 * Domain: clinical-snapshots
 * Layer: Interfaces > Validators
 *
 * Phase 3.X — Snapshot System V2
 *
 * CHANGES FROM Phase 3.2:
 *   + type:              REQUIRED — "pretreatment" | "treatment" | "post-treatment"
 *   + visitDateOverride: optional ISO datetime string — client-side time override
 *   + diagnosticData:   optional object — pretreatment diagnostic payload
 *   ~ appointmentId:    now optional/nullable (was required)
 *   + expectedVersion:  exposed at validator level (was only in service)
 *
 * ALL mutations MUST pass validation before DB write. (System Rule §7)
 */

"use strict";

const { z } = require("zod");

// ── Procedure Schema ──────────────────────────────────────────────────────────

const procedureSchema = z.object({
    id:        z.string().min(1, "Procedure id is required"),
    type:      z.string().min(1, "Procedure type is required"),
    target: z.object({
        toothId:  z.number().int().min(11).max(48).optional(),
        teethIds: z.array(z.number().int().min(11).max(48)).optional(),
        arch:     z.enum(["upper", "lower"]).optional(),
    }).optional(),
    details:   z.unknown().optional(),
    timestamp: z.number().int().positive("Procedure timestamp must be a positive Unix ms"),
});

// ── Attachment Schema ─────────────────────────────────────────────────────────

const attachmentSchema = z.object({
    id:           z.string().min(1),
    type:         z.enum(["photo", "xray", "stl", "document"]),
    url:          z.string().url("Attachment URL must be a valid URL"),
    thumbnailUrl: z.string().url().nullable().optional(),
    fileName:     z.string().optional(),
    size:         z.number().nonnegative().optional(),
    uploadedAt:   z.number().int().positive().optional(),
    uploadedBy:   z.string().optional(),
    relatedTo: z.object({
        toothId:     z.number().int().min(11).max(48).optional(),
        procedureId: z.string().optional(),
    }).optional(),
});

// ── Notes Schema ─────────────────────────────────────────────────────────────

const notesSchema = z.object({
    text:     z.string().max(5000).optional(),
    tags:     z.array(z.string().max(50)).max(20).optional(),
    warnings: z.array(z.string().max(200)).max(10).optional(),
});

// ── Create Snapshot Schema ────────────────────────────────────────────────────
// organizationId and createdBy come from req.context — NEVER from client.
// snapshotDate is resolved SERVER-SIDE from appointment/override/now — NOT from client.

const createSnapshotSchema = z.object({
    // ── Required ─────────────────────────────────────────────────
    caseId: z.string().min(24, "caseId must be a valid ObjectId"),

    // Phase 3.X: Optional name sent by frontend
    name: z.string().trim().max(100).optional(),

    // Phase 3.X: type is REQUIRED on all new snapshots
    type: z.enum(["diagnostic", "pretreatment", "treatment", "post-treatment"], {
        required_error: "Snapshot type is required",
        invalid_type_error: 'type must be "diagnostic", "pretreatment", "treatment", or "post-treatment"',
    }),

    // Full chart state — dynamic clinical JSON, not strictly typed
    // CRITICAL: z.any() is intentional. chartState contains dynamic orthodontic
    // engine state (teeth, archwires, bonding) that cannot be strictly validated.
    chartState: z.any(),

    // ── Optional / Nullable ───────────────────────────────────────

    // Phase 3.X: appointmentId is now OPTIONAL — snapshot can exist without appointment
    // Accepts: valid 24-char ObjectId | null | undefined | "" (empty string filtered by controller)
    appointmentId: z.union([z.string().length(24), z.literal(""), z.null()]).optional(),

    // Phase 3.X: override the auto-resolved snapshotDate
    // ISO 8601 datetime string — server resolves to snapshotDate
    visitDateOverride: z.string().datetime({ offset: true }).nullable().optional(),

    // Phase 3.X: diagnostic payload for pretreatment snapshots
    // Must be null / omitted for treatment + post-treatment (service enforces this)
    diagnosticData: z.record(z.unknown()).nullable().optional(),

    // Optimistic concurrency — send the last-known version
    expectedVersion: z.number().int().nonnegative().nullable().optional(),

    // Phase tracking
    phaseId: z.string().min(24).nullable().optional(),

    // Structured procedures
    procedures: z.array(procedureSchema).default([]),

    // Clinical notes — accepts structured object OR plain string from frontend
    notes: z.union([notesSchema, z.string().max(5000)]).optional(),

    // Attachments (clinical state — lives in snapshot, not VisitRecord)
    attachments: z.array(attachmentSchema).max(50).default([]),

    // Thumbnail
    thumbnail: z.string().nullable().optional(),

    // Visit type classification — independent of snapshot type
    visitType: z.enum(["bonding", "adjustment", "wire_change", "debonding"]).optional(),

    // Phase 6C: Active visit session link — REQUIRED for treatment/post-treatment types.
    // Validated at service layer against visit status. Optional for diagnostic/pretreatment.
    visitId: z.string().length(24).nullable().optional(),
}); // No .strict() — frontend may send extra metadata fields safely ignored

module.exports = {
    createSnapshotSchema,
    procedureSchema,
    attachmentSchema,
    notesSchema,
};
