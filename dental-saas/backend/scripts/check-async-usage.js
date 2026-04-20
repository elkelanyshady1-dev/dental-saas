/**
 * check-async-usage.js — Async layer drift detector (advisory)
 *
 * Visibility, not blocking. Reports external-call patterns that sit
 * outside the sanctioned async layer so architectural drift surfaces
 * during review rather than in production.
 *
 * Currently flags:
 *   1. Direct `axios` import/require in src/ files OTHER than the
 *      sanctioned integration boundaries (whatsappProvider.js is the
 *      current baseline; new callers should prefer the async dispatcher).
 *   2. Direct `fetch(` calls to absolute URLs from service-layer code
 *      (modules/, services/, infrastructure/ outside handlers/).
 *
 * Exit code is always 0 — this is an advisory run. CI can still fail
 * by piping grep on the stdout if stronger enforcement is desired.
 */

"use strict";

const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..", "src");

// Files explicitly allowed to make direct external calls. Adding to this
// list is intentional — it means you've reviewed the integration and
// accepted the drift (or it belongs here because it IS the boundary).
const SANCTIONED = new Set([
    // Existing WhatsApp provider boundary.
    path.join("infrastructure", "communication", "whatsappProvider.js"),
    // QStash publisher already encapsulated via ESLint no-restricted-modules.
    path.join("infrastructure", "communication", "handlers", "async.handler.js"),
    // QStash receiver.
    path.join("jobs", "controllers", "job.controller.js"),
]);

const findings = [];

function scan(dir) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
            scan(full);
        } else if (entry.isFile() && entry.name.endsWith(".js")) {
            checkFile(full);
        }
    }
}

function checkFile(filePath) {
    const rel = path.relative(ROOT, filePath);
    if (SANCTIONED.has(rel)) return;

    const lines = fs.readFileSync(filePath, "utf8").split(/\r?\n/);
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        if (/require\(\s*["']axios["']\s*\)/.test(line) || /from\s+["']axios["']/.test(line)) {
            findings.push({ file: rel, line: i + 1, kind: "axios import" });
        }
        if (/\bfetch\s*\(\s*["']https?:\/\//.test(line)) {
            findings.push({ file: rel, line: i + 1, kind: "direct fetch(absolute URL)" });
        }
    }
}

scan(ROOT);

if (findings.length === 0) {
    console.log("\u2705 Async usage: no drift detected outside sanctioned boundaries.");
    process.exit(0);
}

console.warn("\u26A0\uFE0F  Async layer drift (advisory \u2014 not blocking):\n");
for (const f of findings) {
    console.warn(`  src/${f.file}:${f.line} \u2014 ${f.kind}`);
}
console.warn(
    "\nSanctioned boundaries: " +
    [...SANCTIONED].map(s => `src/${s}`).join(", ") +
    "\nRoute new external I/O through the async dispatcher, or add the caller to " +
    "SANCTIONED in scripts/check-async-usage.js with a review note."
);
// Advisory only \u2014 always exit 0.
process.exit(0);
