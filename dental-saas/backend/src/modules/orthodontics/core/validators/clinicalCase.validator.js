/**
 * clinicalCase.validator.js
 * Domain: orthodontic-cases
 * Layer: Interfaces > Validators (Phase 3)
 *
 * Zod schemas for case creation, snapshot save, workflow, and phase API endpoints.
 */

"use strict";

const { z } = require("zod");

// ── Create Case ────────────────────────────────────────────────────────────────

const CASE_TYPES = ["comprehensive", "limited", "interceptive", "surgical", "aligner", "retention"];

const createCaseSchema = z.object({
    patientId: z.string().min(24, "patientId must be a valid ObjectId"),
    caseType:  z.enum(CASE_TYPES).default("comprehensive"),
}).strict();

// ── Save Snapshot ─────────────────────────────────────────────────────────────

const saveSnapshotSchema = z.object({
    // Optional optimistic lock version (FIX 3 — concurrency safety)
    // Client sends the version of the snapshot they started editing from.
    // If omitted, conflict detection is skipped (safe for first-time saves).
    expectedVersion: z.number().int().positive().optional().nullable(),

    // appointmentId is optional — allows "manual" snapshots outside appointment flow
    appointmentId: z.string().min(24).optional().nullable(),

    // chartState is REQUIRED — it IS the clinical record
    chartState: z.record(z.string(), z.unknown()).refine(
        (v) => v !== null && typeof v === "object",
        { message: "chartState must be a non-null object" }
    ),

    // Thumbnail: base64 or URL
    thumbnail: z.string().nullable().optional(),

    // Clinical notes (string or structured)
    notes: z.union([
        z.string().max(5000),
        z.object({
            text:     z.string().max(5000).optional(),
            tags:     z.array(z.string().max(50)).max(20).optional(),
            warnings: z.array(z.string().max(200)).max(10).optional(),
        }),
    ]).optional(),

    // Attachments (URL-only metadata)
    attachments: z.array(
        z.object({
            url:      z.string().url("Attachment URL must be valid"),
            type:     z.enum(["image", "xray", "stl", "document", "photo"]),
            name:     z.string().optional(),
            fileName: z.string().optional(),
            size:     z.number().nonnegative().optional(),
        })
    ).max(50).optional().default([]),
}).strict();

// ── Advance Phase ─────────────────────────────────────────────────────────────

const advancePhaseSchema = z.object({}).strict(); // No body required

// ── Update Case Status ────────────────────────────────────────────────────────

const CASE_STATUSES = ["draft", "diagnosis", "treatment_planning", "active", "completed", "cancelled"];

const updateCaseStatusSchema = z.object({
    status: z.enum(CASE_STATUSES, {
        errorMap: () => ({ message: `status must be one of: ${CASE_STATUSES.join(", ")}` }),
    }),
}).strict();

// ── Save Workflow (PUT) ───────────────────────────────────────────────────────

const WORKFLOW_TOP_LEVEL_KEYS = new Set([
    "recordSets", "problemList", "treatmentGoals", "treatmentOptions",
    "selectedOptionId", "finalPlan", "currentStep", "printLayout", "derivedProblems",
]);

const saveWorkflowSchema = z.object({
    workflowData: z.record(z.string(), z.unknown()).refine(
        (v) => v !== null && typeof v === "object",
        { message: "workflowData must be a non-null object" }
    ),
    expectedVersion: z.number().int().nonnegative().optional().nullable(),
    trigger: z.enum(["SAVE", "AUTO", "SNAPSHOT_PROMOTE"]).default("SAVE").optional(),
    label: z.string().max(200).optional().nullable(),
}).strict();

// ── Patch Workflow (PATCH) ─────────────────────────────────────────────────────
// Sparse diff — only PATCHABLE_FIELDS may appear in `changes`.

const PATCHABLE_WORKFLOW_FIELDS = new Set([
    "recordSets", "problemList", "treatmentGoals", "treatmentOptions",
    "selectedOptionId", "finalPlan", "currentStep", "printLayout", "derivedProblems",
]);

const patchWorkflowSchema = z.object({
    changes: z.record(z.string(), z.unknown()).refine(
        (obj) => {
            if (!obj || typeof obj !== "object") return false;
            return Object.keys(obj).every((k) => PATCHABLE_WORKFLOW_FIELDS.has(k));
        },
        { message: `changes may only contain: ${[...PATCHABLE_WORKFLOW_FIELDS].join(", ")}` }
    ),
    expectedVersion: z.number().int().nonnegative().optional().nullable(),
    trigger: z.enum(["SAVE", "AUTO", "SNAPSHOT_PROMOTE"]).default("AUTO").optional(),
}).strict();

module.exports = {
    createCaseSchema,
    saveSnapshotSchema,
    updateCaseStatusSchema,
    advancePhaseSchema,
    saveWorkflowSchema,
    patchWorkflowSchema,
    CASE_TYPES,
    CASE_STATUSES,
    PATCHABLE_WORKFLOW_FIELDS,
};
