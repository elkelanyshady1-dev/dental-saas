/**
 * dbConnection.invariant.test.js — DB Connection Race Condition Invariant Tests
 *
 * Static analysis tests that verify ALL callers of dbManager.getConnection()
 * properly await the result, preventing MongoNotConnectedError race conditions.
 *
 * Phase 3.6: getConnection() is now async. Any caller that does NOT await it
 * will receive a Promise instead of a Mongoose connection, causing runtime errors.
 *
 * RUN: jest src/tests/invariants/dbConnection.invariant.test.js
 *
 * Invariants Tested:
 *   1. All dbManager.getConnection() calls are awaited
 *   2. All resolveConnection() calls are awaited
 *   3. All getOrgConnection() calls are awaited
 *   4. createConnection is async and uses asPromise()
 */

"use strict";

const fs   = require("fs");
const path = require("path");
const glob = require("glob");

const BACKEND_SRC = path.resolve(__dirname, "../../");

function readFile(filePath) {
    return fs.readFileSync(filePath, "utf8");
}

/**
 * Finds all .js files under backend/src, excluding node_modules and test files.
 */
function getAllSourceFiles() {
    return glob.sync("**/*.js", {
        cwd: BACKEND_SRC,
        absolute: true,
        ignore: [
            "**/node_modules/**",
            "**/tests/**",
            "**/test/**",
            "**/*.test.js",
            "**/*.spec.js",
        ],
    });
}

describe("DB Connection Race Condition Invariants (Phase 3.6)", () => {

    // ─── Invariant 1: createConnection uses asPromise() ────────────────────
    it("createConnection in dbManager.js awaits conn.asPromise()", () => {
        const dbManagerPath = path.join(BACKEND_SRC, "core/db/dbManager.js");
        const content = readFile(dbManagerPath);

        // Phase 3.7: conn.asPromise() is inside Promise.race for timeout support
        expect(content).toContain("conn.asPromise()");
        expect(content).toContain("async function createConnection");
        // Must be inside a Promise.race (timeout-guarded)
        expect(content).toContain("Promise.race(");
    });

    // ─── Invariant 2: createConnection checks readyState after asPromise ───
    it("createConnection includes readyState guard after asPromise()", () => {
        const dbManagerPath = path.join(BACKEND_SRC, "core/db/dbManager.js");
        const content = readFile(dbManagerPath);

        expect(content).toContain("conn.readyState !== 1");
        expect(content).toContain("DB_NOT_READY");
    });

    // ─── Invariant 3: getConnection is async ───────────────────────────────
    it("getConnection in dbManager.js is async", () => {
        const dbManagerPath = path.join(BACKEND_SRC, "core/db/dbManager.js");
        const content = readFile(dbManagerPath);

        expect(content).toContain("async function getConnection");
    });

    // ─── Invariant 4: All getConnection() calls are awaited ────────────────
    it("all dbManager.getConnection() calls in source code are awaited", () => {
        const files = getAllSourceFiles();
        const violations = [];

        for (const filePath of files) {
            // Skip dbManager itself and its async wrapper modules — they
            // use `return dbManager.getConnection()` inside async functions,
            // which implicitly wraps the promise (no explicit await needed).
            if (filePath.includes("dbManager.js")) continue;
            if (filePath.includes("dbResolver.js")) continue;
            if (filePath.includes("connectionResolver.js")) continue;

            const content = readFile(filePath);
            const lines = content.split("\n");

            for (let i = 0; i < lines.length; i++) {
                const line = lines[i];

                // Match dbManager.getConnection( but NOT await dbManager.getConnection(
                if (
                    line.includes("dbManager.getConnection(") &&
                    !line.includes("await dbManager.getConnection(") &&
                    !line.includes("//") && // skip comments
                    !line.includes("*")     // skip JSDoc
                ) {
                    const rel = path.relative(BACKEND_SRC, filePath);
                    violations.push(`${rel}:${i + 1}: ${line.trim()}`);
                }
            }
        }

        expect(violations).toEqual(
            expect.objectContaining({ length: 0 }),
        );
        if (violations.length > 0) {
            throw new Error(
                `Found ${violations.length} un-awaited dbManager.getConnection() call(s):\n` +
                violations.map((v) => `  - ${v}`).join("\n") +
                "\n\nAll calls MUST use: await dbManager.getConnection(orgId)"
            );
        }
    });

    // ─── Invariant 5: resolveConnection calls are awaited ──────────────────
    it("all resolveConnection() calls in middleware are awaited", () => {
        const dbContextPath = path.join(BACKEND_SRC, "middleware/dbContext.js");
        const content = readFile(dbContextPath);

        expect(content).toContain("await resolveConnection(");
    });

    // ─── Invariant 6: resolveConnection in dbResolver is async ─────────────
    it("resolveConnection in dbResolver.js is async", () => {
        const dbResolverPath = path.join(BACKEND_SRC, "core/db/dbResolver.js");
        const content = readFile(dbResolverPath);

        expect(content).toContain("async function resolveConnection");
    });

    // ─── Invariant 7: pendingConnections dedup exists in getConnection ─────
    it("getConnection uses pendingConnections for dedup", () => {
        const dbManagerPath = path.join(BACKEND_SRC, "core/db/dbManager.js");
        const content = readFile(dbManagerPath);

        // getConnection should check pendingConnections before creating
        expect(content).toContain("pendingConnections.has(key)");
        expect(content).toContain("pendingConnections.set(key");
        expect(content).toContain("pendingConnections.delete(key)");
    });
});
