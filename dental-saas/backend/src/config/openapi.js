/**
 * openapi.js — DentalSaaS OpenAPI Contract Spec (Phase 10)
 *
 * Registers all Zod response schemas from patient + lab domains
 * and generates a unified OpenAPI 3.0 document.
 *
 * Serves two purposes:
 *   1. /api/docs      → Swagger UI (interactive documentation)
 *   2. /api/docs-json → Raw JSON spec (consumed by type generators)
 *
 * ARCHITECTURE:
 *   Zod Response Schemas → OpenApiRegistry → OpenAPI 3.0 JSON → Swagger UI
 *                                                              → openapi-typescript
 *                                                              → Contract Tests
 */

"use strict";

const { OpenApiRegistry } = require("../schemas/openApiRegistry");

// ── Import Response Schemas ─────────────────────────────────────────────────

const {
    patientListResponseSchema,
    patientSearchResponseSchema,
    patientCoreResponseSchema,
    patientSummaryResponseSchema,
} = require("../schemas/patient.response.schema");

const {
    labPartnerListSchema,
    labPartnerDetailSchema,
    labCaseListSchema,
    labCaseDetailSchema,
    labClaimSchema,
    labMessageSchema,
    labDashboardSchema,
} = require("../schemas/lab.response.schema");

// ── Build Registry ──────────────────────────────────────────────────────────

const registry = new OpenApiRegistry();

// Patient Domain
registry.register("PatientListDTO", patientListResponseSchema,
    "Patient directory list item — compact view for tables and search results.");
registry.register("PatientSearchDTO", patientSearchResponseSchema,
    "Patient search result — includes _matchType metadata.");
registry.register("PatientCoreDTO", patientCoreResponseSchema,
    "Patient detail/aggregate view — full profile data.");
registry.register("PatientSummaryDTO", patientSummaryResponseSchema,
    "Patient minimal summary — for notifications, intake links.");

// Lab Domain
registry.register("LabPartnerListDTO", labPartnerListSchema,
    "Lab partner directory listing — compact view.");
registry.register("LabPartnerDetailDTO", labPartnerDetailSchema,
    "Lab partner full profile — includes contact, notes.");
registry.register("LabCaseListDTO", labCaseListSchema,
    "Lab case list/kanban item — includes display names and cost.");
registry.register("LabCaseDetailDTO", labCaseDetailSchema,
    "Lab case full detail — includes prescription, tracking.");
registry.register("LabClaimDTO", labClaimSchema,
    "Lab billing claim — financial record with approval workflow.");
registry.register("LabMessageDTO", labMessageSchema,
    "Lab chat message — per-case communication.");
registry.register("LabDashboardDTO", labDashboardSchema,
    "Lab dashboard — KPI aggregation + recent activity.");

// ── Register API Paths ──────────────────────────────────────────────────────

registry.registerPath("get", "/api/v1/patient/domain", {
    summary: "List patients",
    tags: ["Patients"],
    responses: {
        200: {
            description: "Paginated patient list",
            content: {
                "application/json": {
                    schema: {
                        type: "object",
                        properties: {
                            success: { type: "boolean" },
                            data: {
                                type: "array",
                                items: { $ref: "#/components/schemas/PatientListDTO" },
                            },
                        },
                    },
                },
            },
        },
    },
});

registry.registerPath("get", "/api/v1/org/labs", {
    summary: "List lab partners",
    tags: ["Lab"],
    responses: {
        200: {
            description: "Paginated lab partner list",
            content: {
                "application/json": {
                    schema: {
                        type: "object",
                        properties: {
                            success: { type: "boolean" },
                            data: {
                                type: "array",
                                items: { $ref: "#/components/schemas/LabPartnerListDTO" },
                            },
                        },
                    },
                },
            },
        },
    },
});

registry.registerPath("get", "/api/v1/org/lab-cases", {
    summary: "List lab cases",
    tags: ["Lab"],
    responses: {
        200: {
            description: "Paginated lab case list",
            content: {
                "application/json": {
                    schema: {
                        type: "object",
                        properties: {
                            success: { type: "boolean" },
                            data: {
                                type: "array",
                                items: { $ref: "#/components/schemas/LabCaseListDTO" },
                            },
                        },
                    },
                },
            },
        },
    },
});

registry.registerPath("get", "/api/v1/org/lab-cases/dashboard", {
    summary: "Lab dashboard KPIs",
    tags: ["Lab"],
    responses: {
        200: {
            description: "Dashboard aggregation",
            content: {
                "application/json": {
                    schema: {
                        type: "object",
                        properties: {
                            success: { type: "boolean" },
                            data: { $ref: "#/components/schemas/LabDashboardDTO" },
                        },
                    },
                },
            },
        },
    },
});

// ── Generate Document ───────────────────────────────────────────────────────

const contractOpenApiDoc = registry.generateDocument({
    servers: [
        {
            url: process.env.BASE_URL || "http://localhost:5000",
            description: "Development Server",
        },
    ],
});

module.exports = { contractOpenApiDoc, registry };
