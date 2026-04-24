/**
 * orthoTodo.model.js
 * Domain: ortho-todos
 * Layer: Infrastructure > Model
 *
 * OrthoTodo = a clinical action item created during or between orthodontic visits.
 *
 * KEY DESIGN RULES:
 *   - Todos persist ACROSS visits (unresolved = carries forward)
 *   - Todos are NOT CasePhase events — they are visit-level action items
 *   - clinicalPhase is a SUGGESTION context, NOT enforced state
 *   - Soft-delete only (isDeleted) — never hard-delete clinical records
 *
 * Tenant isolation is at the DB level (per-org database).
 */

"use strict";

const mongoose = require("mongoose");
const TODO_TYPES = ["BRACKET_REPOSITION", "BOND_BRACKET", "WIRE_BEND", "OCCLUSAL_ADJUSTMENT", "MINISCREW_REINSERTION"];
const TODO_STATUSES = ["pending", "done", "skipped"];
const TODO_PRIORITIES = ["low", "medium", "high"];
const CLINICAL_PHASES = ["LEVEL_ALIGNMENT", "SPACE_MANAGEMENT", "FINISHING"];
const SURFACES = ["mesial", "distal", "occlusal", "buccal", "lingual"];
const orthoTodoSchema = new mongoose.Schema({
  // ── Aggregate Links ───────────────────────────────────────────────
  patientId: {
    type: mongoose.Schema.Types.ObjectId,
    required: true
  },
  caseId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "OrthodonticCase",
    required: true
  },
  // Visit where the issue was first detected (optional — todos may be created outside a visit)
  visitId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "VisitRecord",
    default: null
  },
  // ── Todo Classification ───────────────────────────────────────────
  type: {
    type: String,
    enum: TODO_TYPES,
    required: true
  },
  // ── Tooth Reference ───────────────────────────────────────────────
  // FDI notation preferred (e.g. "11", "21", "UR3")
  tooth: {
    type: String,
    default: null
  },
  surface: {
    type: String,
    enum: [...SURFACES, null],
    default: null
  },
  // ── Clinical Content ──────────────────────────────────────────────
  description: {
    type: String,
    required: true,
    maxlength: 500
  },
  // ── Clinical Phase Context (suggestion only — NOT enforced) ───────
  clinicalPhase: {
    type: String,
    enum: [...CLINICAL_PHASES, null],
    default: null
  },
  // ── Lifecycle ─────────────────────────────────────────────────────
  status: {
    type: String,
    enum: TODO_STATUSES,
    default: "pending"
  },
  priority: {
    type: String,
    enum: TODO_PRIORITIES,
    default: "medium"
  },
  // Completion tracking
  completedAt: {
    type: Date,
    default: null
  },
  completedBy: {
    type: mongoose.Schema.Types.ObjectId,
    default: null
  },
  // Soft-delete
  isDeleted: {
    type: Boolean,
    default: false
  }
}, {
  timestamps: true
});

// ── Indexes ───────────────────────────────────────────────────────────────────

// Primary: "all todos for a case"
orthoTodoSchema.index({
  caseId: 1,
  status: 1,
  createdAt: -1
});

// Pending todos for a patient
orthoTodoSchema.index({
  patientId: 1,
  status: 1
});

// Tenant-scoped
orthoTodoSchema.index({
  caseId: 1
});

// Visit-scoped
orthoTodoSchema.index({
  visitId: 1
});
const modelName = "OrthoTodo";
module.exports = {
  modelName,
  schema: orthoTodoSchema,
  TODO_TYPES,
  TODO_STATUSES,
  TODO_PRIORITIES,
  CLINICAL_PHASES
};