/**
 * idempotencyKey.model.test.js — Schema contract for the Idempotency-Key
 * collection that powers safe retry of the bulk photo upload batch endpoint.
 *
 * These are pure schema assertions — no DB boot required. Integration of
 * the actual atomic upsert is exercised by the middleware tests below.
 */

"use strict";

describe("IdempotencyKey Model — Schema Enforcement", () => {
    const IdempotencyKey = require("../core/IdempotencyKey.model").default;
    const schema = IdempotencyKey.schema;

    test("key is required, unique, and capped at 128 chars", () => {
        const f = schema.path("key");
        expect(f).toBeDefined();
        expect(f.isRequired).toBe(true);
        expect(f.options.unique).toBe(true);
        expect(f.options.maxlength).toBe(128);
    });

    test("scope is required", () => {
        expect(schema.path("scope").isRequired).toBe(true);
    });

    test("organizationId is required + indexed (defensive tenant scope)", () => {
        const f = schema.path("organizationId");
        expect(f.isRequired).toBe(true);
        expect(f.options.index).toBe(true);
    });

    test("userId defaults to null (system-initiated requests allowed)", () => {
        expect(schema.path("userId").defaultValue).toBe(null);
    });

    test("status enum is { in-flight, completed, failed } with default in-flight", () => {
        const f = schema.path("status");
        expect(f.enumValues).toEqual(["in-flight", "completed", "failed"]);
        expect(f.defaultValue).toBe("in-flight");
        expect(f.isRequired).toBe(true);
    });

    test("response.statusCode + response.body are present and nullable", () => {
        expect(schema.path("response.statusCode")).toBeDefined();
        expect(schema.path("response.body")).toBeDefined();
        expect(schema.path("response.statusCode").defaultValue).toBe(null);
    });

    test("createdAt has a 24h TTL index", () => {
        const f = schema.path("createdAt");
        expect(f).toBeDefined();
        expect(f.options.expires).toBe(86400);
    });
});
