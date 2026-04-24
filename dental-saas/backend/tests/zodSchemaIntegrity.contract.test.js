/**
 * zodSchemaIntegrity.contract.test.js
 * ────────────────────────────────────
 * Walks every Zod-using module under backend/src and asserts:
 *   1. Every exported schema is structurally well-formed (no malformed
 *      records, undefined union options, missing inner types, …).
 *   2. Every exported schema's `.safeParse({})` does not throw a
 *      TypeError — only returns `{ success: true|false }`.
 *
 * Catches the Zod v4 `z.record(value)` regression (and its siblings)
 * before they reach a request. Should run in CI on every PR.
 *
 * Lives under tests/*.contract.test.js → no MongoDB, no bootstrap, fast.
 */

"use strict";

const fs = require("fs");
const path = require("path");
const { assertSchemaIntegrity, isZodSchema } = require("../src/core/validation/assertSchemaIntegrity");

const SCAN_ROOT = path.resolve(__dirname, "..", "src");
const SKIP_DIRS = new Set(["node_modules", ".git", "dist", "coverage", "__mocks__"]);

function walk(dir, files = []) {
    let entries;
    try {
        entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
        return files;
    }
    for (const entry of entries) {
        if (SKIP_DIRS.has(entry.name)) continue;
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) walk(full, files);
        else if (entry.isFile() && entry.name.endsWith(".js")) files.push(full);
    }
    return files;
}

function fileUsesZod(filePath) {
    try {
        return /require\(\s*["']zod["']\s*\)/.test(fs.readFileSync(filePath, "utf8"));
    } catch {
        return false;
    }
}

function discoverSchemas() {
    const out = [];
    for (const file of walk(SCAN_ROOT).filter(fileUsesZod)) {
        let mod;
        try {
            mod = require(file);
        } catch {
            // Modules that need request context to load are skipped — they
            // can't expose a top-level schema anyway.
            continue;
        }
        if (!mod || typeof mod !== "object") continue;
        const moduleLabel = path.relative(SCAN_ROOT, file).replace(/\\/g, "/");
        for (const [name, value] of Object.entries(mod)) {
            if (!isZodSchema(value)) continue;
            out.push({ moduleLabel, name, schema: value });
        }
    }
    return out;
}

const SCHEMAS = discoverSchemas();

describe("Zod schema integrity (CI guard)", () => {
    test("at least one schema discovered (sanity)", () => {
        expect(SCHEMAS.length).toBeGreaterThan(0);
    });

    describe.each(SCHEMAS)("$moduleLabel :: $name", ({ schema, moduleLabel, name }) => {
        test("structural integrity", () => {
            expect(() => assertSchemaIntegrity(schema, `${moduleLabel}::${name}`)).not.toThrow();
        });

        test("safeParse({}) does not throw a TypeError", () => {
            // The bug we're guarding against surfaces as a TypeError from
            // Zod's internals ('Cannot read properties of undefined ...').
            // We don't care whether validation succeeds — only that the
            // parser doesn't crash on a malformed schema definition.
            let threw = null;
            try {
                schema.safeParse({});
            } catch (err) {
                threw = err;
            }
            if (threw) {
                throw new Error(
                    `${moduleLabel}::${name} threw during safeParse: ${threw.message}`
                );
            }
        });
    });
});
