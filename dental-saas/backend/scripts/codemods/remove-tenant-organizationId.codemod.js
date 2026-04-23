#!/usr/bin/env node
/**
 * remove-tenant-organizationId.codemod.js
 *
 * Step 5c of the 3-Layer DB refactor — mechanical removal of tenant-plane
 * `organizationId` from:
 *   1. Mongoose schema field definitions
 *   2. Query filters (find/findOne/count/update/delete) and create payloads
 *   3. Compound index prefixes `{ organizationId: 1, X }` → `{ X }`
 *
 * DELIBERATELY NOT TOUCHED:
 *   - Logger / audit `orgId: ...` fields (different key name, already safe)
 *   - `req.context.organizationId` *reads* (destructuring, param passing)
 *   - Aggregation `$match: { organizationId: ... }` — too risky, manual review
 *   - Dynamic assignment `query.organizationId = orgId` — manual review
 *   - `meta.organizationId`, `payload.organizationId` — external/log context
 *
 * USAGE:
 *   node scripts/codemods/remove-tenant-organizationId.codemod.js \
 *     --path src/modules/orthodontics          # scope (REQUIRED)
 *     --dry-run                                 # show diffs, do not write
 *     --verbose                                 # per-match log lines
 *
 * After running, the script emits:
 *   - Per-file summary of removals
 *   - Global count
 *   - Grep audit: remaining organizationId occurrences (edge cases to review)
 *
 * SAFETY:
 *   - Will REFUSE to run against src/platform/, src/shared/, or any non-tenant path.
 *   - Blocks if `--path` is not set (no accidental whole-repo sweep).
 */

"use strict";

const fs = require("fs");
const path = require("path");

// ─── CLI ────────────────────────────────────────────────────────────────────

const args = process.argv.slice(2);
const flag = (name) => args.includes(name);
const arg  = (name) => {
    const i = args.indexOf(name);
    return i >= 0 ? args[i + 1] : null;
};

const dryRun = flag("--dry-run");
const verbose = flag("--verbose");
const targetArg = arg("--path");

if (!targetArg) {
    console.error(
        "[codemod] --path is required (e.g. --path src/modules/orthodontics). " +
        "Refusing to sweep the whole tree by accident."
    );
    process.exit(2);
}

const target = path.resolve(process.cwd(), targetArg);
if (!fs.existsSync(target) || !fs.statSync(target).isDirectory()) {
    console.error(`[codemod] Target path does not exist or is not a directory: ${target}`);
    process.exit(2);
}

// Tenant-plane allowlist. Anything outside these roots is REJECTED.
const TENANT_ROOTS = [
    path.resolve(process.cwd(), "src/modules"),
    path.resolve(process.cwd(), "src/organization"),
];

if (!TENANT_ROOTS.some((root) => target === root || target.startsWith(root + path.sep))) {
    console.error(
        `[codemod] Target ${target} is NOT under a tenant-plane root.\n` +
        `         Allowed roots: ${TENANT_ROOTS.join(", ")}\n` +
        `         Platform + shared collections keep organizationId for legitimate cross-tenant references.`
    );
    process.exit(2);
}

// ─── Patterns ───────────────────────────────────────────────────────────────

/**
 * Each pattern is applied to the file text sequentially.
 * Patterns report the number of times they matched so the per-file summary
 * can flag anomalies (e.g. a file with 50 query filters suggests manual review).
 */
const PATTERNS = [
    // 1) Schema field definition (multi-line block).
    //    Matches ONLY when the body contains `type:` AND no nested `{` — guards
    //    against accidental matches on schemas that happen to define a nested
    //    `organizationId` object for a different purpose.
    {
        name: "schema-field-block",
        //   Handles:  "organizationId: {\n    type: ...,\n    ref: ...,\n    ...\n},\n"
        //   Keeps: blocks that have nested braces (unusual for this field).
        regex: /([ \t]*)organizationId:\s*\{[^{}]*?type[^{}]*?\}\s*,?[ \t]*\r?\n/gs,
        replacement: "",
    },

    // 2) Inline schema field on a single line (e.g., "organizationId: { type: X, ref: Y, required: true },")
    //    Same rules: needs `type:` in the body, no nesting.
    {
        name: "schema-field-inline",
        regex: /([ \t]*)organizationId:\s*\{[^{}]*?type[^{}]*?\}\s*,?[ \t]*(?=\r?\n|[},])/g,
        replacement: "",
    },

    // 3) Query filter / create-payload property — value is req.context.organizationId
    //    Matches `organizationId: req.context.organizationId` with optional comma/whitespace.
    {
        name: "query-reqContext",
        regex: /organizationId:\s*req\.context\.organizationId\s*,?\s*/g,
        replacement: "",
    },

    // 4) Query filter / create-payload property — value is a bare `orgId` identifier.
    //    Narrower than #3 to avoid matching identifiers with similar names.
    {
        name: "query-orgId",
        regex: /organizationId:\s*orgId\s*,?\s*/g,
        replacement: "",
    },

    // 5) Query filter / create-payload property — value is a bare `organizationId` identifier
    //    (destructured from req/context upstream). ONLY matches when followed by
    //    a comma, close-brace, or newline — i.e., the END of a property. Prevents
    //    matching longer expressions like:
    //        organizationId: organizationId?.toString?.() ?? String(...)
    //    which was a false positive in the first sweep.
    {
        name: "query-shorthand-organizationId",
        regex: /organizationId:\s*organizationId\s*(?=[,}\n])[,]?\s*/g,
        replacement: "",
    },

    // 6) Compound index prefix — `{ organizationId: 1, X }` → `{ X }`
    //    Supports asc (1) or desc (-1). Requires at least one subsequent field
    //    after the comma so we don't accidentally leave `{  }`.
    {
        name: "index-prefix",
        //   matches the leading `{ organizationId: ±1, `  (whitespace-tolerant)
        regex: /\{\s*organizationId:\s*-?1\s*,\s*(?=\S)/g,
        replacement: "{ ",
    },

    // 7) Standalone single-field `{ organizationId: 1 }` index call line.
    //    Removes the full `.index({ organizationId: 1 })` or `.index({ organizationId: 1 }, opts)` call.
    //    Single-field org index is a no-op in a per-org DB.
    {
        name: "index-standalone-call",
        regex: /^[ \t]*\w+Schema\.index\(\s*\{\s*organizationId:\s*-?1\s*\}[^;]*\)\s*;?\s*\r?\n/gm,
        replacement: "",
    },
];

// ─── Walk + apply ───────────────────────────────────────────────────────────

/** @type {{ file: string, perPattern: Record<string, number>, before: string, after: string }[]} */
const fileReports = [];

function listJsFiles(dir) {
    const out = [];
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
            // Skip tests + migrations — manual review
            if (entry.name === "__tests__" || entry.name === "migrations") continue;
            out.push(...listJsFiles(full));
        } else if (entry.isFile() && full.endsWith(".js") && !full.endsWith(".test.js")) {
            out.push(full);
        }
    }
    return out;
}

function processFile(filePath) {
    const before = fs.readFileSync(filePath, "utf-8");
    let after = before;
    const perPattern = {};

    for (const p of PATTERNS) {
        let count = 0;
        after = after.replace(p.regex, (match) => {
            count++;
            if (verbose) {
                console.log(`  [${p.name}] ${JSON.stringify(match.slice(0, 60))}`);
            }
            return p.replacement;
        });
        if (count > 0) perPattern[p.name] = count;
    }

    // Clean up double blank lines left behind by block removal.
    after = after.replace(/\r?\n\r?\n\r?\n+/g, "\n\n");

    if (before !== after) {
        fileReports.push({ file: filePath, perPattern, before, after });
        if (!dryRun) {
            fs.writeFileSync(filePath, after);
        }
    }
}

const files = listJsFiles(target);
console.log(`[codemod] Scanning ${files.length} files under ${target}`);
console.log(`[codemod] Mode: ${dryRun ? "DRY-RUN (no writes)" : "APPLY"}`);

for (const file of files) {
    processFile(file);
}

// ─── Summary ────────────────────────────────────────────────────────────────

const totalPerPattern = {};
for (const r of fileReports) {
    for (const [k, v] of Object.entries(r.perPattern)) {
        totalPerPattern[k] = (totalPerPattern[k] || 0) + v;
    }
}

console.log("\n─── Summary ───────────────────────────────────────────");
console.log(`Files changed: ${fileReports.length} / ${files.length}`);
for (const [k, v] of Object.entries(totalPerPattern)) {
    console.log(`  ${k.padEnd(32)} ${v}`);
}

if (verbose || fileReports.length <= 10) {
    console.log("\n─── Per-file ──────────────────────────────────────────");
    for (const r of fileReports) {
        const rel = path.relative(process.cwd(), r.file);
        const parts = Object.entries(r.perPattern).map(([k, v]) => `${k}=${v}`);
        console.log(`  ${rel}  [${parts.join(", ")}]`);
    }
}

console.log("\n─── Manual review needed (grep remaining) ───────────");
console.log(`Run:  grep -rn "organizationId" ${path.relative(process.cwd(), target)} | grep -v "\\borgId\\b"`);
console.log("Expected remaining:");
console.log("  - logger fields with 'orgId:' key  (FALSE positive; grep -v filter handles)");
console.log("  - req.context.organizationId reads (parameters/destructuring)  → OK, leave");
console.log("  - meta.organizationId / payload.organizationId  → OK, external context");
console.log("  - $match aggregation stages  → MANUAL fix required");
console.log("  - dynamic assignments `query.organizationId = ...`  → MANUAL fix required");

if (dryRun) {
    console.log("\n[codemod] --dry-run: no files written. Re-run without --dry-run to apply.");
}
