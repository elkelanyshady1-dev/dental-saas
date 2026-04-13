/**
 * orthodonticCase.validator.js
 * Domain: orthodontic-cases
 * Layer: Interfaces > Validators
 */

"use strict";

const { z } = require("zod");

// Valid status transitions exposed via API
const CASE_STATUSES = ["draft", "diagnosis", "treatment_planning", "active", "completed"];

const updateStatusSchema = z.object({
    status: z.enum(CASE_STATUSES, {
        errorMap: () => ({ message: `status must be one of: ${CASE_STATUSES.join(", ")}` }),
    }),
}).strict();

const listCasesSchema = z.object({
    patientId: z.string().min(24).optional(),
    status:    z.enum(CASE_STATUSES).optional(),
    limit:     z.string().regex(/^\d+$/).optional(),
    page:      z.string().regex(/^\d+$/).optional(),
}).strict();

module.exports = { updateStatusSchema, listCasesSchema, CASE_STATUSES };
