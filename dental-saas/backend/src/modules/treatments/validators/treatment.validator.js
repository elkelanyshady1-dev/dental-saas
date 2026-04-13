/**
 * treatment.validator.js
 * Phase 3 — Input Validation Schemas (Zod)
 *
 * Validates treatment + treatment plan creation/update payloads
 * BEFORE they reach the controller or service layer.
 */

"use strict";

const { z } = require("zod");

const mongoId = z.string().min(1, "Required").regex(/^[a-f\d]{24}$/i, "Invalid ID format");

// ─── Treatment Record ─────────────────────────────────────────────────────

const createTreatmentSchema = z.object({
    patientId: mongoId,
    procedureId: mongoId,
    branchId: mongoId,
    appointmentId: mongoId.optional(),
    toothNumber: z.string().max(3).optional(),
    surfaces: z.array(
        z.enum(["mesial", "distal", "buccal", "lingual", "occlusal", "incisal"])
    ).optional(),
    priceOverride: z.number().min(0).optional(),
    notes: z.string().max(2000).optional(),
    treatmentPlanId: mongoId.optional(),
});

const updateTreatmentStatusSchema = z.object({
    status: z.enum(["in_progress", "completed", "cancelled"]),
    notes: z.string().max(2000).optional(),
});

// ─── Treatment Plan ───────────────────────────────────────────────────────

const treatmentPlanItemSchema = z.object({
    procedureId: mongoId,
    toothNumber: z.string().max(3).optional(),
    estimatedPrice: z.number().min(0).optional(),
    priority: z.number().int().min(1).max(100).optional(),
});

const createTreatmentPlanSchema = z.object({
    patientId: mongoId,
    branchId: mongoId,
    title: z.string().max(200).optional(),
    notes: z.string().max(2000).optional(),
    planItems: z.array(treatmentPlanItemSchema).min(1, "At least one plan item required"),
});

module.exports = {
    createTreatmentSchema,
    updateTreatmentStatusSchema,
    createTreatmentPlanSchema,
};
