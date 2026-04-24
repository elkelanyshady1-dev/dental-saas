#!/usr/bin/env node
/**
 * doc-sweep-orgid.js
 * H10 (v9.4.1) — Tenant model JSDoc sweep.
 *
 * Replaces stale `organizationId`-centric documentation lines inside
 * tenant model files with a single canonical statement:
 *   "Tenant isolation is at the DB level (per-org database)."
 *
 * Target lines — only JSDoc/comment lines that contain `organizationId`
 * AND match one of these stale doc patterns:
 *   • "Tenant-isolated by organizationId"
 *   • "organizationId is required|REQUIRED"
 *   • "organizationId scoped for"
 *   • "organizationId scopes every query"
 *   • "MULTI-TENANCY: organizationId..."
 *   • "TENANT ISOLATION: organizationId..."
 *   • "organizationId ... multi-tenant isolation"
 *
 * Does NOT touch:
 *   • Non-comment lines (schema code, indexes, filter objects).
 *   • Comments that EXPLAIN the REMOVAL of the field (e.g.
 *     "organizationId removed (Step 5c of 3-Layer refactor)"),
 *     or talk about index suffix dropping — those are factually correct.
 *   • Any lines referencing an actual organizationId ref (e.g. JournalEntry
 *     "explicit organizationId" note about session bootstrap).
 *
 * Run:
 *   node scripts/codemods/doc-sweep-orgid.js [--dry-run]
 */

"use strict";

const fs = require("fs");
const path = require("path");

const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");

const ROOT = path.resolve(process.cwd(), "src");

// Tenant model directories — the only place this sweep applies.
const TENANT_MODEL_GLOBS = [
    /\/src\/modules\/.*\/models\/.*\.js$/,
    /\/src\/modules\/.*\.model\.js$/,
    /\/src\/organization\/.*\/models\/.*\.js$/,
    /\/src\/organization\/.*\.model\.js$/,
];

// Lines containing these patterns are stale claims about organizationId
// being required/indexed/scoping queries. Replaced with a single-line
// canonical note.
const STALE_PATTERNS = [
    /Tenant-?isolated by organizationId/i,
    /organizationId\s+is\s+(required|REQUIRED)/,
    /organizationId\s+(REQUIRED|required)\s*\(/,
    /organizationId\s+scoped\s+for/i,
    /organizationId\s+scopes\s+every\s+query/i,
    /TENANT ISOLATION:\s*organizationId/i,
    /MULTI-?TENANCY:\s*organizationId/i,
    /organizationId\s+required\s+for\s+multi-?tenant/i,
    /organizationId\s+is\s+required\s+and\s+indexed/i,
    /organizationId\s+indexed\s+\+\s+enforced/i,
    /One document per\s*\(\s*organizationId/i,
    /\{\s*organizationId\s*,\s*key\s*\}\s+so/i,
];

// Patterns that MUST be kept (legitimate references).
const KEEP_PATTERNS = [
    /organizationId\s+removed/i,          // "removed (Step 5c…)"
    /\(Step 5c/i,
    /no organizationId/i,                  // "no organizationId needed"
    /dropped/i,                            // "indexes simplified … dropped"
    /prefix\s+dropped/i,
    /prefix\s+needed/i,
    /explicit organizationId/i,            // session bootstrap note
];

function isTenantModelFile(filePath) {
    const norm = filePath.replace(/\\/g, "/");
    return TENANT_MODEL_GLOBS.some((re) => re.test(norm));
}

function* walk(dir) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
            if (entry.name === "node_modules") continue;
            yield* walk(full);
        } else if (entry.isFile() && full.endsWith(".js")) {
            yield full;
        }
    }
}

const CANONICAL_NOTE = " * Tenant isolation is at the DB level (per-org database).";

let totalFilesTouched = 0;
let totalLinesReplaced = 0;
let totalLinesKept = 0;

for (const file of walk(ROOT)) {
    if (!isTenantModelFile(file)) continue;

    const src = fs.readFileSync(file, "utf8");
    if (!src.includes("organizationId")) continue;

    const lines = src.split(/\r?\n/);
    const out = [];
    let changed = false;
    let fileReplacedCount = 0;

    for (const line of lines) {
        const trimmed = line.trim();
        const isComment = trimmed.startsWith("*") || trimmed.startsWith("//");

        if (!isComment || !line.includes("organizationId")) {
            out.push(line);
            continue;
        }

        // Keep patterns (legitimate references) win over stale patterns.
        if (KEEP_PATTERNS.some((re) => re.test(line))) {
            out.push(line);
            totalLinesKept++;
            continue;
        }

        if (STALE_PATTERNS.some((re) => re.test(line))) {
            // Preserve the line's leading whitespace + comment marker.
            const prefix = line.match(/^[\s]*[\*\/]+\s?/);
            const indent = prefix ? prefix[0] : " * ";
            out.push(indent.trimEnd() + " Tenant isolation is at the DB level (per-org database).");
            changed = true;
            fileReplacedCount++;
            totalLinesReplaced++;
        } else {
            // Comment mentions organizationId but doesn't match any known
            // stale pattern — keep it for manual review.
            out.push(line);
            totalLinesKept++;
        }
    }

    if (changed) {
        if (!dryRun) {
            fs.writeFileSync(file, out.join("\n"));
        }
        totalFilesTouched++;
        console.log(
            `${dryRun ? "[DRY] " : ""}${path.relative(process.cwd(), file)} — ${fileReplacedCount} line(s) replaced`
        );
    }
}

console.log("");
console.log("─── Summary ───");
console.log(`Files touched  : ${totalFilesTouched}`);
console.log(`Lines replaced : ${totalLinesReplaced}`);
console.log(`Lines kept     : ${totalLinesKept}  (legitimate references or unrecognised pattern)`);
if (dryRun) console.log("[--dry-run: no files written]");
