/**
 * orthoTodo.validator.js
 * Domain: ortho-todos
 * Layer: Application > Validators
 */

"use strict";

const { z } = require("zod");

const TODO_TYPES      = ["BRACKET_REPOSITION", "BOND_BRACKET", "WIRE_BEND", "OCCLUSAL_ADJUSTMENT", "MINISCREW_REINSERTION"];
const TODO_STATUSES   = ["pending", "done", "skipped"];
const TODO_PRIORITIES = ["low", "medium", "high"];
const CLINICAL_PHASES = ["LEVEL_ALIGNMENT", "SPACE_MANAGEMENT", "FINISHING"];
const SURFACES        = ["mesial", "distal", "occlusal", "buccal", "lingual"];

// ── Create ────────────────────────────────────────────────────────────────────

const createTodoSchema = z.object({
    caseId:        z.string().length(24, "caseId must be a 24-char ObjectId"),
    patientId:     z.string().length(24, "patientId must be a 24-char ObjectId"),
    visitId:       z.union([z.string().length(24), z.literal(""), z.null()]).optional(),
    type:          z.enum(TODO_TYPES),
    tooth:         z.string().max(10).nullable().optional(),
    surface:       z.enum(SURFACES).nullable().optional(),
    description:   z.string().min(1).max(500),
    clinicalPhase: z.enum(CLINICAL_PHASES).nullable().optional(),
    priority:      z.enum(TODO_PRIORITIES).optional().default("medium"),
});

// ── Patch ─────────────────────────────────────────────────────────────────────

const patchTodoSchema = z.object({
    description:   z.string().min(1).max(500).optional(),
    status:        z.enum(TODO_STATUSES).optional(),
    priority:      z.enum(TODO_PRIORITIES).optional(),
    tooth:         z.string().max(10).nullable().optional(),
    surface:       z.enum(SURFACES).nullable().optional(),
    clinicalPhase: z.enum(CLINICAL_PHASES).nullable().optional(),
    visitId:       z.union([z.string().length(24), z.literal(""), z.null()]).optional(),
}).refine(data => Object.keys(data).length > 0, { message: "Patch body must contain at least one field" });

// ── Query params ──────────────────────────────────────────────────────────────

const listTodosQuerySchema = z.object({
    caseId: z.string().length(24, "caseId must be a 24-char ObjectId"),
    status: z.enum(TODO_STATUSES).optional(),
    limit:  z.string().optional(),
    page:   z.string().optional(),
});

module.exports = { createTodoSchema, patchTodoSchema, listTodosQuerySchema };
