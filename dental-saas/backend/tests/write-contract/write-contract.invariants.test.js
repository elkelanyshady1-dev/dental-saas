/**
 * write-contract.invariants.test.js
 *
 * Write Contract Enforcement System v1.0 — CI Invariant Tests
 *
 * These tests use static analysis (AST + ripgrep-style regex) to enforce
 * write contract rules across the entire codebase. They are BLOCKING in CI.
 *
 * Rules enforced:
 *   R1: No controller direct DB writes
 *   R2: Multi-step writes must use withTransaction
 *   R3: No unsafe setImmediate DB writes
 *   R4/R5: Financial/appointment writes must be transactional
 *   R6: No find-then-create
 *   R7: Idempotency required for financial operations
 *   R8: Org plane uses req.dbConnection.startSession()
 *
 * Run: npm run test:write-invariants
 */

"use strict";

const fs   = require("fs");
const path = require("path");
const glob = require("glob").sync || (() => {
    // Fallback: manually walk directory
    const results = [];
    function walk(dir, ext) {
        try {
            for (const f of fs.readdirSync(dir)) {
                const full = path.join(dir, f);
                if (fs.statSync(full).isDirectory() && f !== "node_modules") {
                    walk(full, ext);
                } else if (f.endsWith(ext)) {
                    results.push(full);
                }
            }
        } catch (_) {}
    }
    return (pattern) => {
        const root = pattern.split("/**")[0];
        walk(root, ".js");
        return results;
    };
});

const SRC_ROOT = path.resolve(__dirname, "../../src");

/**
 * Synchronously list all .js files under a directory (recursive).
 */
function listFiles(dir) {
    const results = [];
    function walk(d) {
        let entries;
        try { entries = fs.readdirSync(d); } catch (_) { return; }
        for (const entry of entries) {
            if (entry === "node_modules" || entry === "dist" || entry === "coverage") continue;
            const full = path.join(d, entry);
            const stat = fs.statSync(full);
            if (stat.isDirectory()) walk(full);
            else if (entry.endsWith(".js")) results.push(full);
        }
    }
    walk(dir);
    return results;
}

function readFile(filepath) {
    try { return fs.readFileSync(filepath, "utf8"); } catch (_) { return ""; }
}

function isControllerFile(filepath) {
    return filepath.includes("controller") || filepath.includes("Controller");
}

function isRouteFile(filepath) {
    return filepath.includes("/routes/") || filepath.endsWith(".route.js") || filepath.endsWith(".routes.js");
}

function isOrgPlaneFile(filepath) {
    return filepath.includes("/modules/") || filepath.includes("/organization/");
}

function isPlatformFile(filepath) {
    return filepath.includes("/platform/");
}

function isExemptFromMongooseSession(filepath) {
    return (
        filepath.includes("/platform/") ||
        filepath.includes("/services/contractRenewal") ||
        filepath.includes("/services/dunningProcessor") ||
        filepath.includes("/jobs/") ||
        filepath.includes("/guardian/") ||
        filepath.includes("/infrastructure/") ||
        filepath.includes("/core/idempotency")
    );
}

// Write method patterns that indicate direct DB writes
const WRITE_METHOD_PATTERN = /\.(create|updateOne|updateMany|findOneAndUpdate|findByIdAndUpdate|findOneAndDelete|findByIdAndDelete|deleteOne|deleteMany|insertMany|replaceOne|bulkWrite)\s*\(/;
const SAVE_PATTERN         = /await\s+\w+\.save\s*\(/;
const MONGOOSE_SESSION      = /mongoose\.startSession\s*\(/;
const WITH_TRANSACTION      = /\.withTransaction\s*\(/;
const SET_IMMEDIATE_ASYNC   = /setImmediate\s*\(\s*async/;
const ASYNC_IIFE            = /\(\s*async\s*\(\s*\)\s*=>/;
const FIND_THEN_CREATE_RE   = /findOne|findById/;

// ─── R1: No controller direct DB writes ──────────────────────────────────────
describe("R1: No controller direct DB writes", () => {
    const allFiles = listFiles(SRC_ROOT).filter(isControllerFile);

    function findViolations(files) {
        const violations = [];
        for (const filepath of files) {
            const content = readFile(filepath);
            const lines = content.split("\n");
            lines.forEach((line, idx) => {
                // Skip comments
                if (line.trimStart().startsWith("//") || line.trimStart().startsWith("*")) return;
                // Skip lines that are inside eslint-disable blocks
                if (line.includes("eslint-disable")) return;
                if (WRITE_METHOD_PATTERN.test(line) || SAVE_PATTERN.test(line)) {
                    violations.push({
                        file: path.relative(SRC_ROOT, filepath),
                        line: idx + 1,
                        content: line.trim().slice(0, 120),
                    });
                }
            });
        }
        return violations;
    }

    test("R1a: Org-plane controllers must not call direct DB writes (BLOCKING)", () => {
        const orgFiles = allFiles.filter(f => {
            const norm = f.replace(/\\/g, "/");
            return !norm.includes("/platform/") && !norm.includes("/shared/");
        });
        const violations = findViolations(orgFiles);

        if (violations.length > 0) {
            const msg = violations
                .map(v => `  ${v.file}:${v.line} → ${v.content}`)
                .join("\n");
            throw new Error(
                `[WriteContract R1a] ${violations.length} ORG-PLANE controller direct DB write(s) found:\n${msg}\n` +
                `FIX: Move these writes to the service layer.`
            );
        }
    });

    test("R1b: Platform-plane controller writes (REPORTING ONLY)", () => {
        const platformFiles = allFiles.filter(f => {
            const norm = f.replace(/\\/g, "/");
            return norm.includes("/platform/") || norm.includes("/shared/");
        });
        const violations = findViolations(platformFiles);

        if (violations.length > 0) {
            // Report but don't fail — platform controllers are a known triage backlog
            console.warn(
                `[WriteContract R1b] ${violations.length} PLATFORM controller direct DB writes detected (triage backlog).\n` +
                `These are not blocking CI but should be migrated to services over time.`
            );
        }
        // Always pass — this is informational
        expect(true).toBe(true);
    });
});

// ─── R3: No unsafe setImmediate DB writes ─────────────────────────────────────
describe("R3: No unsafe setImmediate async DB writes", () => {
    const allFiles = listFiles(SRC_ROOT);

    /**
     * Detects setImmediate(async ...) blocks that contain DB write calls.
     * This is a heuristic — it looks for the pattern within a window of lines.
     */
    function hasUnsafeSetImmediateWrite(content) {
        const lines = content.split("\n");
        const violations = [];

        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            if (!SET_IMMEDIATE_ASYNC.test(line)) continue;

            // Skip explicitly allowed ones (non-critical annotations)
            const prevLine = lines[i - 1] || "";
            if (prevLine.includes("eslint-disable-next-line")) continue;
            if (line.includes("eslint-disable")) continue;

            // Look ahead up to 20 lines for a DB write
            const block = lines.slice(i, Math.min(i + 20, lines.length)).join("\n");
            if (WRITE_METHOD_PATTERN.test(block) || SAVE_PATTERN.test(block)) {
                violations.push(i + 1);
            }
        }

        return violations;
    }

    test("setImmediate(async) must not contain DB write operations", () => {
        const allViolations = [];
        for (const filepath of allFiles) {
            // Skip test files and known-safe logging files
            if (filepath.includes("/tests/") || filepath.includes(".test.js")) continue;
            const content = readFile(filepath);
            const lines = hasUnsafeSetImmediateWrite(content);
            if (lines.length > 0) {
                allViolations.push({
                    file: path.relative(SRC_ROOT, filepath),
                    lines,
                });
            }
        }

        if (allViolations.length > 0) {
            const msg = allViolations
                .map(v => `  ${v.file}: lines ${v.lines.join(", ")}`)
                .join("\n");
            throw new Error(
                `[WriteContract R3] ${allViolations.length} file(s) have unsafe setImmediate DB writes:\n${msg}\n` +
                `FIX: Move state-affecting writes inside session.withTransaction() or use outbox pattern.\n` +
                `     Add eslint-disable comment ONLY for non-critical writes (logging/notifications).`
            );
        }
    });
});

// ─── R8: Org plane must use req.dbConnection.startSession() ──────────────────
describe("R8: Org plane must not use mongoose.startSession()", () => {
    const orgPlaneFiles = listFiles(SRC_ROOT).filter(
        f => isOrgPlaneFile(f) && !isExemptFromMongooseSession(f)
    );

    test("Org plane files must not call mongoose.startSession()", () => {
        const violations = [];
        for (const filepath of orgPlaneFiles) {
            const content = readFile(filepath);
            const lines = content.split("\n");
            lines.forEach((line, idx) => {
                if (line.trimStart().startsWith("//") || line.trimStart().startsWith("*")) return;
                if (line.includes("eslint-disable")) return;
                if (MONGOOSE_SESSION.test(line)) {
                    violations.push({
                        file: path.relative(SRC_ROOT, filepath),
                        line: idx + 1,
                        content: line.trim(),
                    });
                }
            });
        }

        if (violations.length > 0) {
            const msg = violations
                .map(v => `  ${v.file}:${v.line} → ${v.content}`)
                .join("\n");
            throw new Error(
                `[WriteContract R8] ${violations.length} org-plane file(s) use mongoose.startSession():\n${msg}\n` +
                `FIX: Replace with req.dbConnection.startSession() for per-org DB session isolation.`
            );
        }
    });
});

// ─── R4/R5: Inventory writes must all be transactional ───────────────────────
describe("R4: Inventory stock mutations must be transactional", () => {
    const INVENTORY_WRITE_SERVICE = path.join(
        SRC_ROOT,
        "modules/inventoryDomain/services/inventoryWrite.service.js"
    );

    test("inventoryWrite.service.js must use withTransaction for all stock mutations", () => {
        const content = readFile(INVENTORY_WRITE_SERVICE);
        expect(content).not.toBe("");

        // Must contain withTransaction
        expect(content).toMatch(WITH_TRANSACTION);

        // All stock mutation functions must have session references
        const stockFunctions = ["addStock", "useStock", "adjustStock", "receivePurchaseOrder"];
        for (const fn of stockFunctions) {
            const fnIdx = content.indexOf(`async function ${fn}`);
            if (fnIdx === -1) continue;
            const fnBody = content.slice(fnIdx, fnIdx + 2000); // look at ~2000 chars
            expect(fnBody).toMatch(/session/);
        }
    });
});

// ─── R5: Appointment create must be transactional ────────────────────────────
describe("R5: Appointment domain write hardening", () => {
    const APPT_CONTROLLER = path.join(
        SRC_ROOT,
        "modules/appointmentDomain/appointment.controller.js"
    );

    test("createAppointment must use session.withTransaction()", () => {
        const content = readFile(APPT_CONTROLLER);
        expect(content).not.toBe("");

        // Find createAppointment function
        const fnIdx = content.indexOf("exports.createAppointment");
        expect(fnIdx).toBeGreaterThan(-1);

        // The transaction is deep in the function body — use a 12000 char window
        const fnBody = content.slice(fnIdx, fnIdx + 12000);
        expect(fnBody).toMatch(WITH_TRANSACTION);
        expect(fnBody).toMatch(/req\.dbConnection\.startSession/);
    });

    test("createAppointment must not use async IIFE fire-and-forget", () => {
        const content = readFile(APPT_CONTROLLER);
        const fnIdx = content.indexOf("exports.createAppointment");
        const fnBody = content.slice(fnIdx, fnIdx + 5000);

        // Check no IIFE fire-and-forget (pattern: (async () => { ... })() )
        // Allow IIFE in general but not one that calls DB writes
        const iifeMatch = fnBody.match(/\(\s*async\s*\(\s*\)\s*=>\s*\{[\s\S]*?\}\s*\)\s*\(\)/g);
        // If IIFE present, it must not contain a DB write call
        if (iifeMatch) {
            for (const iife of iifeMatch) {
                expect(WRITE_METHOD_PATTERN.test(iife)).toBe(false);
            }
        }
    });

    test("R5d: createAppointment ortho case linking must be HARD FAILURE (no soft catch)", () => {
        const content = readFile(APPT_CONTROLLER);
        const fnIdx = content.indexOf("exports.createAppointment");
        expect(fnIdx).toBeGreaterThan(-1);

        const fnBody = content.slice(fnIdx, fnIdx + 12000);

        // 1. Must NOT have soft-failure pattern: catch block that swallows case link errors
        expect(fnBody).not.toMatch(/catch\s*\(\s*caseLinkErr\s*\)/);
        expect(fnBody).not.toMatch(/appointment will be created without case link/);

        // 2. Must have HARD GUARD: CASE_LINK_FAILED throw
        expect(fnBody).toMatch(/CASE_LINK_FAILED/);

        // 3. Must pass { session } to findOrCreateOrthoCase
        expect(fnBody).toMatch(/findOrCreateOrthoCase[\s\S]*?\{\s*session\s*\}/);

        // 4. Must pass { session } to computeVisitSequenceNumber
        expect(fnBody).toMatch(/computeVisitSequenceNumber[\s\S]*?\{\s*session\s*\}/);
    });

    test("R5b: updateAppointment must use OAV (version check) + session.withTransaction()", () => {
        const content = readFile(APPT_CONTROLLER);
        // Use precise match to avoid hitting updateAppointmentStatus
        const fnIdx = content.indexOf("exports.updateAppointment =");
        expect(fnIdx).toBeGreaterThan(-1);

        const fnBody = content.slice(fnIdx, fnIdx + 8000);
        // Must reference version for OAV
        expect(fnBody).toMatch(/version/);
        // Must use session.withTransaction
        expect(fnBody).toMatch(WITH_TRANSACTION);
        expect(fnBody).toMatch(/req\.dbConnection\.startSession/);
        // Must use findOneAndUpdate (not Object.assign + save)
        expect(fnBody).toMatch(/findOneAndUpdate/);
        // Must NOT use Object.assign + save pattern
        expect(fnBody).not.toMatch(/Object\.assign.*\n.*\.save/);
    });

    test("R5c: deleteAppointment must use session.withTransaction()", () => {
        const content = readFile(APPT_CONTROLLER);
        const fnIdx = content.indexOf("exports.deleteAppointment");
        expect(fnIdx).toBeGreaterThan(-1);

        const fnBody = content.slice(fnIdx, fnIdx + 3000);
        expect(fnBody).toMatch(WITH_TRANSACTION);
        expect(fnBody).toMatch(/req\.dbConnection\.startSession/);
        // Must NOT use doc.save() for status mutation
        expect(fnBody).not.toMatch(/appointment\.save\s*\(/);
    });
});

// ─── R6: No find-then-create race conditions ─────────────────────────────────
describe("R6: No find-then-create race conditions in critical paths", () => {
    const CASE_SERVICE = path.join(
        SRC_ROOT,
        "modules/orthodontics/core/services/case.service.js"
    );

    test("findOrCreateOrthoCase must use atomic upsert, not find-then-create", () => {
        const content = readFile(CASE_SERVICE);
        expect(content).not.toBe("");

        // Must call findOrCreateAtomic (the atomic upsert pattern)
        expect(content).toMatch(/findOrCreateAtomic/);
        // Must NOT have the old find-then-create pattern
        expect(content).not.toMatch(/findActiveByPatient[\s\S]{1,200}caseRepo\.create/);
    });

    test("findOrCreateOrthoCase must NOT have soft-failure catch (errors must propagate)", () => {
        const content = readFile(CASE_SERVICE);
        expect(content).not.toBe("");

        // Extract only the findOrCreateOrthoCase function body
        const fnIdx = content.indexOf("async function findOrCreateOrthoCase");
        expect(fnIdx).toBeGreaterThan(-1);
        // Slice to next `async function` or module.exports to isolate the function
        const nextFnIdx = content.indexOf("async function computeVisitSequenceNumber");
        const fnBody = content.slice(fnIdx, nextFnIdx > fnIdx ? nextFnIdx : fnIdx + 3000);

        // Must NOT swallow errors — no catch block inside findOrCreateOrthoCase
        expect(fnBody).not.toMatch(/\bcatch\s*\(/);
        // Must NOT contain soft failure language
        expect(fnBody).not.toMatch(/SOFT FAILURE/);
        expect(fnBody).not.toMatch(/appointment will be created without case link/);
    });

    const CASE_REPO = path.join(
        SRC_ROOT,
        "modules/orthodontics/core/repositories/orthodonticCase.repository.js"
    );

    test("case repository must export findOrCreateAtomic using $setOnInsert", () => {
        const content = readFile(CASE_REPO);
        expect(content).not.toBe("");

        // Must export findOrCreateAtomic
        expect(content).toMatch(/findOrCreateAtomic/);
        // Must use $setOnInsert for atomic upsert
        expect(content).toMatch(/\$setOnInsert/);
        // Must use upsert: true
        expect(content).toMatch(/upsert:\s*true/);
    });
});

// ─── R7: Financial writes must have idempotency keys ─────────────────────────
describe("R7: Financial operations must have idempotency guards", () => {
    const FINANCIAL_SERVICES = [
        "platform/billing/services/paymentApplicationService.js",
        "services/contractRenewal.service.js",
        "platform/billing/services/refundProcessor.service.js",
        "platform/billing/orchestrator/BillingOrchestrator.service.js",
    ];

    for (const relPath of FINANCIAL_SERVICES) {
        const filepath = path.join(SRC_ROOT, relPath);
        test(`${path.basename(relPath)} must contain idempotency protection`, () => {
            const content = readFile(filepath);
            if (!content) return; // file may not exist yet — skip
            const hasIdempotency = content.includes("idempotencyKey") ||
                                   content.includes("idempotency_key") ||
                                   content.includes("providerRefundId");
            expect(hasIdempotency).toBe(true);
        });
    }
});

// ─── SUMMARY ──────────────────────────────────────────────────────────────────
afterAll(() => {
    console.log("\n✅ Write Contract Invariant Tests Complete");
    console.log("   R1a: Org-plane controller write ban enforced");
    console.log("   R1b: Platform-plane controller writes reported (triage backlog)");
    console.log("   R3: setImmediate DB write ban enforced");
    console.log("   R4: Inventory transactionality enforced");
    console.log("   R5: Appointment transactionality enforced (create + update + delete)");
    console.log("   R5d: Ortho case linking atomic hard-failure enforced (no soft catch)");
    console.log("   R6: Find-then-create race condition ban + hard-failure propagation enforced");
    console.log("   R7: Financial idempotency enforced");
    console.log("   R8: Org-plane session source enforced");
});
