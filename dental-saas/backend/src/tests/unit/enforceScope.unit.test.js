/**
 * enforceScope.unit.test.js — Phase C enforceScope utility unit tests
 *
 * Pure function tests. No DB, no mongoose. Verifies query scoping
 * behavior for org, branch, and edge-case scenarios.
 */

"use strict";

const enforceScope = require("@utils/enforceScope");

// ─── Helpers ────────────────────────────────────────────────────────────────

function makeReq(scope) {
    return { context: { scope } };
}

// ─── Tests ──────────────────────────────────────────────────────────────────

describe("enforceScope", () => {
    const baseQuery = { status: "active" };

    test("returns query unchanged for org scope", () => {
        const req = makeReq({ type: "org", branchIds: [] });
        const result = enforceScope(baseQuery, req);
        expect(result).toEqual(baseQuery);
    });

    test("returns query unchanged when scope is missing", () => {
        const req = { context: {} };
        const result = enforceScope(baseQuery, req);
        expect(result).toEqual(baseQuery);
    });

    test("returns query unchanged when context is missing", () => {
        const req = {};
        const result = enforceScope(baseQuery, req);
        expect(result).toEqual(baseQuery);
    });

    test("injects $in filter for branch scope with branchIds", () => {
        const branchIds = ["branch1", "branch2"];
        const req = makeReq({ type: "branch", branchIds });
        const result = enforceScope(baseQuery, req);
        expect(result).toEqual({
            status: "active",
            branchId: { $in: branchIds },
        });
    });

    test("uses custom branchField when provided", () => {
        const branchIds = ["branch1"];
        const req = makeReq({ type: "branch", branchIds });
        const result = enforceScope(baseQuery, req, { branchField: "primaryBranchId" });
        expect(result).toEqual({
            status: "active",
            primaryBranchId: { $in: branchIds },
        });
    });

    test("fail-closed: branch scope with empty branchIds returns $in:[]", () => {
        const req = makeReq({ type: "branch", branchIds: [] });
        const result = enforceScope(baseQuery, req);
        expect(result).toEqual({
            status: "active",
            branchId: { $in: [] },
        });
    });

    test("fail-closed: branch scope with undefined branchIds returns $in:[]", () => {
        const req = makeReq({ type: "branch" });
        const result = enforceScope(baseQuery, req);
        expect(result).toEqual({
            status: "active",
            branchId: { $in: [] },
        });
    });

    test("does not mutate the original query object", () => {
        const original = { status: "active" };
        const frozen = { ...original };
        const req = makeReq({ type: "branch", branchIds: ["b1"] });
        enforceScope(original, req);
        expect(original).toEqual(frozen);
    });

    test("preserves existing query fields alongside scope filter", () => {
        const query = { status: "active", deletedAt: null, isActive: true };
        const req = makeReq({ type: "branch", branchIds: ["b1", "b2"] });
        const result = enforceScope(query, req);
        expect(result).toEqual({
            status: "active",
            deletedAt: null,
            isActive: true,
            branchId: { $in: ["b1", "b2"] },
        });
    });
});
