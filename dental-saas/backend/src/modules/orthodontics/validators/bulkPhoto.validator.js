/**
 * bulkPhoto.validator.js — TDS-BULK-UPLOAD-v1.1
 * ═══════════════════════════════════════════════════════════════
 * Zod validators for bulk photo upload / pool / assignment endpoints.
 *
 * Uses Zod per CLAUDE.md §6.1 — single validator system, .strict() mode.
 * ═══════════════════════════════════════════════════════════════
 */

"use strict";

const { z } = require("zod");
const { ALLOWED_VIEWS } = require("../services/bulkPhotoUpload.service");

// ─── Assign / Reassign Body ──────────────────────────────────────────────────
// Same shape — reassign is semantically "assign after previous assignment"
const assignBodySchema = z.object({
    view: z.enum(ALLOWED_VIEWS, {
        errorMap: () => ({ message: `view must be one of: ${ALLOWED_VIEWS.join(", ")}` }),
    }),
}).strict();

// ─── Batch Upload Body (clientMeta is optional — sent as form field) ─────────
// Client may attach a JSON-encoded `meta` form field describing per-file
// compression. The value is advisory — server never trusts sizes.
const clientMetaEntrySchema = z.object({
    originalSize:   z.number().int().nonnegative().optional(),
    compressedSize: z.number().int().nonnegative().optional(),
    applied:        z.boolean().optional(),
}).strict().partial();

const batchMetaSchema = z.array(clientMetaEntrySchema).max(30);

// ─── Pool Query Params ───────────────────────────────────────────────────────
const listPoolQuerySchema = z.object({
    filter: z.enum(["unassigned", "assigned", "all"]).optional(),
}).strict();

// ─── Recordset route param (Option B — strict isolation) ─────────────────────
// Applied to every /recordsets/:recordSetId/photos/... endpoint. The string
// must be non-empty — the real existence check runs in the service layer
// against the case's workflowData.recordSets[] list.
const recordSetIdParamSchema = z.object({
    recordSetId: z.string().min(1, "recordSetId is required"),
}).strict();

/**
 * Safe-parse helper — returns { data, error } mimicking project convention.
 */
function parse(schema, input) {
    const result = schema.safeParse(input);
    if (result.success) return { data: result.data, error: null };
    const message = result.error.errors
        .map((e) => `${e.path.join(".") || "root"}: ${e.message}`)
        .join("; ");
    return { data: null, error: message };
}

function validateAssignBody(body) {
    return parse(assignBodySchema, body || {});
}

function validateListPoolQuery(query) {
    return parse(listPoolQuerySchema, query || {});
}

function validateRecordSetIdParam(params) {
    return parse(recordSetIdParamSchema, { recordSetId: params?.recordSetId });
}

function validateBatchMeta(raw) {
    if (raw === undefined || raw === null || raw === "") {
        return { data: [], error: null };
    }
    let parsed;
    try {
        parsed = typeof raw === "string" ? JSON.parse(raw) : raw;
    } catch (_err) {
        return { data: null, error: "meta must be valid JSON array" };
    }
    return parse(batchMetaSchema, parsed);
}

module.exports = {
    validateAssignBody,
    validateListPoolQuery,
    validateBatchMeta,
    validateRecordSetIdParam,
    assignBodySchema,
    listPoolQuerySchema,
    batchMetaSchema,
    recordSetIdParamSchema,
};
