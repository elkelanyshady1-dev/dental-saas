/**
 * check-polling-annotations.js — CI-blocking polling annotation scanner
 *
 * Enforces the Phase 6 hardening rule that every `setInterval(...)` in
 * src/ must carry an `ALLOWED_POLLING: <REASON>` marker within the three
 * lines immediately above it.
 *
 * Why per-line, not per-file?
 *   File-level presence is coarse: a file with two setIntervals would
 *   pass even if only one is annotated. Per-line enforcement catches
 *   new pollers that drift in without declared intent.
 *
 * Allowed reasons:
 *   OUTBOX     — event outbox / retry worker poll cycles
 *   CLEANUP    — TTL sweeps, in-memory cache eviction, GC
 *   HEALTH     — connection pool / runtime guardian probes
 *   SCHEDULER  — periodic domain jobs (reconciliation, contract expiry)
 *   SOCKET     — socket-session revalidation
 *
 * Exit codes:
 *   0 — all setIntervals annotated
 *   1 — one or more missing or use an unknown reason
 */

"use strict";

const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..", "src");
const ALLOWED = ["OUTBOX", "CLEANUP", "HEALTH", "SCHEDULER", "SOCKET"];
// Tolerance window: how many lines above the setInterval we look for the marker.
// 3 covers the common case of a leading comment or blank line.
const LOOKBACK = 3;

const violations = [];

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
    const lines = fs.readFileSync(filePath, "utf8").split(/\r?\n/);
    for (let i = 0; i < lines.length; i++) {
        if (!/\bsetInterval\s*\(/.test(lines[i])) continue;
        const window = lines.slice(Math.max(0, i - LOOKBACK), i).join("\n");
        const match = window.match(/ALLOWED_POLLING:\s*([A-Z_]+)/);
        if (!match) {
            violations.push({
                file: path.relative(process.cwd(), filePath),
                line: i + 1,
                reason: "missing ALLOWED_POLLING marker",
            });
        } else if (!ALLOWED.includes(match[1])) {
            violations.push({
                file: path.relative(process.cwd(), filePath),
                line: i + 1,
                reason: `unknown reason "${match[1]}" (allowed: ${ALLOWED.join(" | ")})`,
            });
        }
    }
}

scan(ROOT);

if (violations.length > 0) {
    console.error("\u274C Polling annotation violations:\n");
    for (const v of violations) {
        console.error(`  ${v.file}:${v.line} \u2014 ${v.reason}`);
    }
    console.error(
        `\nEvery setInterval(...) must have a // ALLOWED_POLLING: <REASON> comment ` +
        `within ${LOOKBACK} lines above it.\nAllowed reasons: ${ALLOWED.join(" | ")}`
    );
    process.exit(1);
}

console.log("\u2705 Polling annotations verified \u2014 every setInterval has a declared reason.");
