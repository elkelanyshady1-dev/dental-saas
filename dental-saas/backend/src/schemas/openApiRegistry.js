/**
 * openApiRegistry.js — Zod Schema → OpenAPI 3.0 Spec Generator
 * Phase 10 — API Contract Automation
 *
 * Lightweight, zero-dependency OpenAPI generator that converts Zod schemas
 * into OpenAPI 3.0 JSON schema objects. Works with Zod v4 (z.object/z.string/etc).
 *
 * Architecture:
 *   1. Schemas are registered via register(name, zodSchema)
 *   2. generateDocument() builds an OpenAPI 3.0 spec with all registered schemas
 *   3. The spec is served at /api/docs (Swagger UI) and /api/docs-json (raw JSON)
 *
 * This replaces the need for @asteasolutions/zod-to-openapi (Zod v3 only)
 * with a simple, maintainable converter that handles the shapes we actually use.
 */

"use strict";

// ── Zod → OpenAPI Type Converter ────────────────────────────────────────────

/**
 * Converts a Zod schema into an OpenAPI 3.0 JSON schema object.
 * Handles the subset of Zod types used in our DTOs.
 *
 * @param {import("zod").ZodType} schema — Zod schema
 * @returns {object} — OpenAPI schema object
 */
function zodToOpenApiSchema(schema) {
    if (!schema || !schema._def) {
        return { type: "object", additionalProperties: true };
    }

    const def = schema._def;
    const typeName = def.typeName || schema.constructor?.name || "";

    // z.string()
    if (typeName === "ZodString") {
        const result = { type: "string" };
        if (def.checks) {
            for (const check of def.checks) {
                if (check.kind === "min") result.minLength = check.value;
                if (check.kind === "max") result.maxLength = check.value;
                if (check.kind === "email") result.format = "email";
            }
        }
        return result;
    }

    // z.number()
    if (typeName === "ZodNumber") {
        return { type: "number" };
    }

    // z.boolean()
    if (typeName === "ZodBoolean") {
        return { type: "boolean" };
    }

    // z.enum()
    if (typeName === "ZodEnum") {
        return { type: "string", enum: def.values };
    }

    // z.literal()
    if (typeName === "ZodLiteral") {
        return { type: typeof def.value, enum: [def.value] };
    }

    // z.array()
    if (typeName === "ZodArray") {
        return {
            type: "array",
            items: zodToOpenApiSchema(def.type),
        };
    }

    // z.object()
    if (typeName === "ZodObject") {
        const properties = {};
        const required = [];
        const shape = def.shape ? (typeof def.shape === "function" ? def.shape() : def.shape) : {};

        for (const [key, fieldSchema] of Object.entries(shape)) {
            properties[key] = zodToOpenApiSchema(fieldSchema);

            // Check if field is optional
            const isOptional = fieldSchema?._def?.typeName === "ZodOptional" ||
                               fieldSchema?._def?.typeName === "ZodDefault" ||
                               fieldSchema?.isOptional?.() ||
                               false;
            if (!isOptional) {
                required.push(key);
            }
        }

        const result = { type: "object", properties };
        if (required.length > 0) result.required = required;
        return result;
    }

    // z.nullable()
    if (typeName === "ZodNullable") {
        const inner = zodToOpenApiSchema(def.innerType);
        return { ...inner, nullable: true };
    }

    // z.optional()
    if (typeName === "ZodOptional") {
        return zodToOpenApiSchema(def.innerType);
    }

    // z.default()
    if (typeName === "ZodDefault") {
        const innerSchema = def.innerType || def.type;
        const inner = zodToOpenApiSchema(innerSchema);
        // Zod v4: defaultValue is a plain value; Zod v3: it's a factory function
        const dv = def.defaultValue;
        inner.default = typeof dv === "function" ? dv() : dv;
        return inner;
    }

    // z.any()
    if (typeName === "ZodAny") {
        return {};
    }

    // z.union()
    if (typeName === "ZodUnion") {
        const options = (def.options || []).map(o => zodToOpenApiSchema(o));
        if (options.length === 2 && options.some(o => o.type === "null" || o.nullable)) {
            const nonNull = options.find(o => o.type !== "null");
            return { ...(nonNull || {}), nullable: true };
        }
        return { oneOf: options };
    }

    // z.effects() — transform/refine wrappers
    if (typeName === "ZodEffects") {
        return zodToOpenApiSchema(def.schema);
    }

    // Fallback
    return { type: "object", additionalProperties: true };
}

// ── OpenAPI Registry ────────────────────────────────────────────────────────

class OpenApiRegistry {
    constructor() {
        this._schemas = new Map();
        this._paths = new Map();
    }

    /**
     * Register a named schema.
     * @param {string} name — Schema name (e.g., "PatientListDTO")
     * @param {import("zod").ZodType} zodSchema — Zod schema
     * @param {string} [description] — Optional description
     */
    register(name, zodSchema, description) {
        const openApiSchema = zodToOpenApiSchema(zodSchema);
        if (description) openApiSchema.description = description;
        this._schemas.set(name, openApiSchema);
    }

    /**
     * Register an API path.
     * @param {string} method — HTTP method (get, post, etc.)
     * @param {string} path — URL path
     * @param {object} spec — OpenAPI path item spec
     */
    registerPath(method, path, spec) {
        if (!this._paths.has(path)) this._paths.set(path, {});
        this._paths.get(path)[method.toLowerCase()] = spec;
    }

    /**
     * Generate a complete OpenAPI 3.0 document.
     * @param {object} [overrides] — Merge into top-level spec
     * @returns {object} — OpenAPI 3.0 document
     */
    generateDocument(overrides = {}) {
        const schemas = {};
        for (const [name, schema] of this._schemas) {
            schemas[name] = schema;
        }

        const paths = {};
        for (const [path, methods] of this._paths) {
            paths[path] = methods;
        }

        return {
            openapi: "3.0.0",
            info: {
                title: "DentalSaaS API — Contract-Driven Schemas",
                version: "10.0.0",
                description: [
                    "Auto-generated from Zod response schemas (Phase 10).",
                    "",
                    "These schemas are the SSOT for all DTO contracts.",
                    "Frontend types are generated from this spec.",
                    "Contract tests validate responses against these schemas.",
                ].join("\n"),
            },
            ...overrides,
            components: {
                schemas,
                ...(overrides.components || {}),
            },
            paths: {
                ...paths,
                ...(overrides.paths || {}),
            },
        };
    }
}

module.exports = { OpenApiRegistry, zodToOpenApiSchema };
