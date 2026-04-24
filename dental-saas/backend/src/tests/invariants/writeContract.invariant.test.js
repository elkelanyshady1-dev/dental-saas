/**
 * writeContract.invariant.test.js — Write Contract Architectural Invariants
 *
 * Static analysis tests that scan source code files to verify Write Contract
 * architectural invariants WITHOUT requiring a database connection.
 *
 * Invariants Tested:
 *   1. No controller DB writes (controllers must delegate to services)
 *   2. No setImmediate DB writes (critical writes must not be deferred)
 *   3. No mongoose.startSession in org-plane (must use req.dbConnection)
 *   4. Inventory domain uses transactions for multi-write operations
 *   5. Booking domain uses transactions for multi-write operations
 *   6. Financial services use idempotency keys
 *   7. No find-then-create anti-pattern (use upsert or handle E11000)
 *   8. All services accept req as first parameter
 *
 * RUN: jest src/tests/invariants/writeContract.invariant.test.js
 */

"use strict";

const fs = require("fs");
const path = require("path");
const glob = require("glob");

const BACKEND_SRC = path.resolve(__dirname, "../../");

function readFile(filePath) {
    return fs.readFileSync(filePath, "utf8");
}

function getAllSourceFiles(pattern = "**/*.js") {
    return glob.sync(pattern, {
        cwd: BACKEND_SRC,
        absolute: true,
        ignore: ["**/node_modules/**", "**/tests/**", "**/scripts/**"],
    });
}

/**
 * Strip single-line comments and block comments from source text.
 * Returns the cleaned source for pattern matching.
 */
function stripComments(source) {
    // Remove block comments
    let cleaned = source.replace(/\/\*[\s\S]*?\*\//g, "");
    // Remove single-line comments
    cleaned = cleaned.replace(/\/\/.*$/gm, "");
    return cleaned;
}

/** DB write method patterns */
const DB_WRITE_METHODS = [
    "\\.create\\(",
    "\\.save\\(",
    "\\.updateOne\\(",
    "\\.updateMany\\(",
    "\\.findOneAndUpdate\\(",
    "\\.deleteOne\\(",
    "\\.deleteMany\\(",
    "\\.insertMany\\(",
    "\\.bulkWrite\\(",
    "\\.findByIdAndUpdate\\(",
];

const DB_WRITE_REGEX = new RegExp(DB_WRITE_METHODS.join("|"));

describe("Write Contract Enforcement v2.0 — Invariants", () => {

    // ─── Invariant 1: No controller DB writes ─────────────────────────────
    it("controllers must NOT contain direct DB write method calls", () => {
        const controllerFiles = [
            ...getAllSourceFiles("**/controllers/**/*.js"),
            ...getAllSourceFiles("**/*controller*.js"),
        ];
        // Deduplicate
        const seen = new Set();
        const unique = controllerFiles.filter((f) => {
            if (seen.has(f)) return false;
            seen.add(f);
            return true;
        });

        const violations = [];

        for (const filePath of unique) {
            const raw = readFile(filePath);
            const content = stripComments(raw);
            const lines = content.split("\n");

            for (let i = 0; i < lines.length; i++) {
                const line = lines[i];
                const match = line.match(DB_WRITE_REGEX);
                if (match) {
                    const rel = path.relative(BACKEND_SRC, filePath);
                    violations.push({ file: rel, line: i + 1, match: match[0] });
                }
            }
        }

        if (violations.length > 0) {
            const detail = violations
                .map((v) => `  - ${v.file}:${v.line} => ${v.match}`)
                .join("\n");
            expect(violations).toEqual(
                expect.objectContaining({ length: 0 }),
            );
            throw new Error(
                `Found ${violations.length} direct DB write(s) in controllers:\n${detail}\n\n` +
                "Controllers must delegate ALL writes to the service layer."
            );
        }

        expect(violations).toEqual([]);
    });

    // ─── Invariant 2: No setImmediate DB writes ───────────────────────────
    it("setImmediate blocks should not contain DB write methods", () => {
        const files = getAllSourceFiles();
        const violations = [];

        for (const filePath of files) {
            const raw = readFile(filePath);
            // Check for eslint-disable exemptions
            if (raw.includes("eslint-disable") && raw.includes("setImmediate")) {
                continue;
            }

            const content = stripComments(raw);
            const lines = content.split("\n");

            for (let i = 0; i < lines.length; i++) {
                if (!lines[i].includes("setImmediate(async") && !lines[i].includes("setImmediate(function")) {
                    continue;
                }

                // Look ahead 30 lines for DB write methods
                const blockEnd = Math.min(i + 30, lines.length);
                for (let j = i + 1; j < blockEnd; j++) {
                    const match = lines[j].match(DB_WRITE_REGEX);
                    if (match) {
                        const rel = path.relative(BACKEND_SRC, filePath);
                        violations.push({ file: rel, line: j + 1, match: match[0] });
                        break; // One violation per setImmediate block is enough
                    }
                }
            }
        }

        if (violations.length > 0) {
            const detail = violations
                .map((v) => `  - ${v.file}:${v.line} => ${v.match}`)
                .join("\n");
            console.warn(
                `[WARN] Found ${violations.length} setImmediate block(s) with DB writes ` +
                `(add eslint-disable comment to suppress):\n${detail}`
            );
        }

        // Track the count but do not hard-fail — log only
        console.log(`[INFO] setImmediate DB-write scan: ${violations.length} finding(s)`);
    });

    // ─── Invariant 3: No mongoose.startSession in org-plane ───────────────
    it("org-plane modules must NOT use mongoose.startSession()", () => {
        const orgFiles = [
            ...getAllSourceFiles("modules/**/*.js"),
            ...getAllSourceFiles("organization/**/*.js"),
        ];

        const violations = [];

        for (const filePath of orgFiles) {
            // Exclude models, validators, and eslint-disabled files
            if (filePath.includes("/models/") || filePath.includes("\\models\\")) continue;
            if (filePath.includes("/validators/") || filePath.includes("\\validators\\")) continue;

            const raw = readFile(filePath);
            if (raw.includes("eslint-disable") && raw.includes("mongoose.startSession")) {
                continue;
            }

            const content = stripComments(raw);
            const lines = content.split("\n");

            for (let i = 0; i < lines.length; i++) {
                if (lines[i].includes("mongoose.startSession()")) {
                    const rel = path.relative(BACKEND_SRC, filePath);
                    violations.push({ file: rel, line: i + 1, match: "mongoose.startSession()" });
                }
            }
        }

        if (violations.length > 0) {
            const detail = violations
                .map((v) => `  - ${v.file}:${v.line} => ${v.match}`)
                .join("\n");
            expect(violations).toEqual(
                expect.objectContaining({ length: 0 }),
            );
            throw new Error(
                `Found ${violations.length} mongoose.startSession() call(s) in org-plane:\n${detail}\n\n` +
                "Use req.dbConnection.startSession() instead of mongoose.startSession()."
            );
        }

        expect(violations).toEqual([]);
    });

    // ─── Invariant 4: Inventory domain uses transactions ──────────────────
    it("inventory domain services with multiple writes must use transactions", () => {
        const serviceFiles = getAllSourceFiles("modules/inventoryDomain/**/*.service.js");
        const violations = [];

        for (const filePath of serviceFiles) {
            const raw = readFile(filePath);
            const content = stripComments(raw);

            // Count write method occurrences
            const writeMatches = content.match(DB_WRITE_REGEX);
            const writeCount = writeMatches ? writeMatches.length : 0;

            if (writeCount >= 2) {
                const hasTransaction =
                    content.includes("withTransaction") ||
                    content.includes("session") ||
                    content.includes("startSession");

                if (!hasTransaction) {
                    const rel = path.relative(BACKEND_SRC, filePath);
                    violations.push({
                        file: rel,
                        line: 0,
                        match: `${writeCount} writes without transaction/session`,
                    });
                }
            }
        }

        if (violations.length > 0) {
            const detail = violations
                .map((v) => `  - ${v.file} => ${v.match}`)
                .join("\n");
            expect(violations).toEqual(
                expect.objectContaining({ length: 0 }),
            );
            throw new Error(
                `Found ${violations.length} inventory service(s) with multi-write but no transaction:\n${detail}\n\n` +
                "All multi-write operations MUST use withTransaction() or pass session."
            );
        }

        expect(violations).toEqual([]);
    });

    // ─── Invariant 5: Booking domain uses transactions ────────────────────
    it("booking services with multiple writes must use transactions", () => {
        const serviceFiles = [
            ...getAllSourceFiles("modules/booking/**/*.service.js"),
            ...getAllSourceFiles("modules/booking/**/*.js"),
        ];
        // Deduplicate and keep only service-like files
        const seen = new Set();
        const unique = serviceFiles.filter((f) => {
            if (seen.has(f)) return false;
            seen.add(f);
            // Include .service.js files and general .js files (but skip models/validators/routes)
            if (f.includes("/models/") || f.includes("\\models\\")) return false;
            if (f.includes("/validators/") || f.includes("\\validators\\")) return false;
            if (f.includes("/routes/") || f.includes("\\routes\\")) return false;
            if (f.includes(".routes.js") || f.includes(".model.js") || f.includes(".validator.js")) return false;
            return true;
        });

        const violations = [];

        for (const filePath of unique) {
            const raw = readFile(filePath);
            const content = stripComments(raw);

            const writeMatches = content.match(DB_WRITE_REGEX);
            const writeCount = writeMatches ? writeMatches.length : 0;

            if (writeCount >= 2) {
                const hasTransaction =
                    content.includes("withTransaction") ||
                    content.includes("session") ||
                    content.includes("startSession");

                if (!hasTransaction) {
                    const rel = path.relative(BACKEND_SRC, filePath);
                    violations.push({
                        file: rel,
                        line: 0,
                        match: `${writeCount} writes without transaction/session`,
                    });
                }
            }
        }

        if (violations.length > 0) {
            const detail = violations
                .map((v) => `  - ${v.file} => ${v.match}`)
                .join("\n");
            expect(violations).toEqual(
                expect.objectContaining({ length: 0 }),
            );
            throw new Error(
                `Found ${violations.length} booking service(s) with multi-write but no transaction:\n${detail}\n\n` +
                "All multi-write operations MUST use withTransaction() or pass session."
            );
        }

        expect(violations).toEqual([]);
    });

    // ─── Invariant 6: Financial services use idempotency (lenient) ────────
    it("financial services with writes should use idempotency keys", () => {
        const financialPatterns = [
            "modules/**/*billing*/**/*.service.js",
            "modules/**/*payment*/**/*.service.js",
            "modules/**/*refund*/**/*.service.js",
            "modules/**/*invoice*/**/*.service.js",
            "modules/**/*ledger*/**/*.service.js",
            "platform/**/*billing*/**/*.service.js",
            "platform/**/*payment*/**/*.service.js",
            "platform/**/*ledger*/**/*.service.js",
            "modules/**/*billing*.service.js",
            "modules/**/*payment*.service.js",
            "modules/**/*refund*.service.js",
            "modules/**/*invoice*.service.js",
            "modules/**/*ledger*.service.js",
            "platform/**/*billing*.service.js",
            "platform/**/*payment*.service.js",
            "platform/**/*ledger*.service.js",
        ];

        const seen = new Set();
        const financialFiles = [];
        for (const pattern of financialPatterns) {
            for (const f of getAllSourceFiles(pattern)) {
                if (!seen.has(f)) {
                    seen.add(f);
                    financialFiles.push(f);
                }
            }
        }

        const violations = [];

        for (const filePath of financialFiles) {
            const raw = readFile(filePath);
            const content = stripComments(raw);

            const hasWrites = DB_WRITE_REGEX.test(content);
            if (!hasWrites) continue;

            const hasIdempotency =
                content.includes("idempotency") ||
                content.includes("idempotencyKey") ||
                content.includes("idempotent");

            if (!hasIdempotency) {
                const rel = path.relative(BACKEND_SRC, filePath);
                violations.push({ file: rel, line: 0, match: "writes without idempotency" });
            }
        }

        if (violations.length > 0) {
            const detail = violations
                .map((v) => `  - ${v.file} => ${v.match}`)
                .join("\n");
            console.warn(
                `[WARN] Found ${violations.length} financial service(s) with writes but no idempotency key:\n${detail}\n` +
                "Consider adding idempotencyKey support to prevent double-charge."
            );
        }

        // Lenient: log but do not fail
        console.log(`[INFO] Financial idempotency scan: ${violations.length} finding(s) out of ${financialFiles.length} file(s)`);
    });

    // ─── Invariant 7: No find-then-create anti-pattern ────────────────────
    it("source files should not use find-then-create pattern (use upsert or handle E11000)", () => {
        const files = getAllSourceFiles();
        const violations = [];

        for (const filePath of files) {
            const raw = readFile(filePath);
            const content = stripComments(raw);
            const lines = content.split("\n");

            for (let i = 0; i < lines.length; i++) {
                const line = lines[i];

                // Detect findOne/findById/find assignment with await
                const isFindLine =
                    /\b(findOne|findById)\b.*=\s*await/.test(line) ||
                    /await\b.*\.(findOne|findById)\(/.test(line);

                if (!isFindLine) continue;

                // Look ahead up to 10 lines for `if (!` pattern
                const ifCheckEnd = Math.min(i + 10, lines.length);
                let foundIfNot = -1;

                for (let j = i + 1; j < ifCheckEnd; j++) {
                    if (/if\s*\(\s*!/.test(lines[j])) {
                        foundIfNot = j;
                        break;
                    }
                }

                if (foundIfNot === -1) continue;

                // Look ahead from the `if (!` line up to 5 lines for .create( or .save(
                const createEnd = Math.min(foundIfNot + 5, lines.length);
                for (let k = foundIfNot; k < createEnd; k++) {
                    if (/\.(create|save)\(/.test(lines[k])) {
                        const rel = path.relative(BACKEND_SRC, filePath);
                        violations.push({
                            file: rel,
                            line: i + 1,
                            match: "find-then-create pattern detected",
                        });
                        break;
                    }
                }
            }
        }

        if (violations.length > 0) {
            const detail = violations
                .map((v) => `  - ${v.file}:${v.line} => ${v.match}`)
                .join("\n");
            expect(violations).toEqual(
                expect.objectContaining({ length: 0 }),
            );
            throw new Error(
                `Found ${violations.length} find-then-create anti-pattern(s):\n${detail}\n\n` +
                "Use upsert with { upsert: true } or handle E11000 duplicate key error instead."
            );
        }

        expect(violations).toEqual([]);
    });

    // ─── Invariant 8: All services accept req as first parameter (lenient) ─
    it("service exported async functions should accept req as first parameter", () => {
        const serviceFiles = getAllSourceFiles("**/*.service.js");
        const violations = [];
        let totalFunctions = 0;
        let compliantFunctions = 0;

        // Patterns for exported async functions
        const exportedFunctionPatterns = [
            // async function name(req, ...)  with module.exports
            /(?:async\s+function\s+(\w+)\s*\(([^)]*)\))/g,
            // exports.name = async (req, ...) =>
            /(?:exports\.(\w+)\s*=\s*async\s*\(([^)]*)\))/g,
            // name: async (req, ...) =>  (in module.exports = { ... })
            /(\w+)\s*:\s*async\s*\(([^)]*)\)/g,
        ];

        for (const filePath of serviceFiles) {
            const raw = readFile(filePath);
            const content = stripComments(raw);

            // Check if this file exports anything
            if (!content.includes("module.exports") && !content.includes("exports.")) {
                continue;
            }

            for (const pattern of exportedFunctionPatterns) {
                // Reset regex lastIndex
                pattern.lastIndex = 0;
                let funcMatch;

                while ((funcMatch = pattern.exec(content)) !== null) {
                    const funcName = funcMatch[1];
                    const params = funcMatch[2].trim();

                    // Skip utility/helper functions (common internal names)
                    if (/^(init|setup|configure|register|build|format|validate|parse|transform|map|reduce|filter|helper|util|log|emit|_)/i.test(funcName)) {
                        continue;
                    }

                    totalFunctions++;

                    const firstParam = params.split(",")[0].trim();
                    if (firstParam === "req" || firstParam === "{ req }") {
                        compliantFunctions++;
                    } else {
                        const rel = path.relative(BACKEND_SRC, filePath);
                        violations.push({
                            file: rel,
                            line: 0,
                            match: `${funcName}(${params.substring(0, 40)})`,
                        });
                    }
                }
            }
        }

        if (violations.length > 0) {
            const detail = violations
                .slice(0, 20) // Limit output to first 20
                .map((v) => `  - ${v.file} => ${v.match}`)
                .join("\n");
            const moreMsg = violations.length > 20
                ? `\n  ... and ${violations.length - 20} more`
                : "";
            console.warn(
                `[WARN] Found ${violations.length} service function(s) not accepting req as first param:\n${detail}${moreMsg}`
            );
        }

        // Lenient: log stats but do not fail
        console.log(
            `[INFO] Service req-param scan: ${compliantFunctions}/${totalFunctions} compliant ` +
            `(${violations.length} non-compliant)`
        );
    });
});
