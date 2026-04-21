/**
 * check-lock-usage.js — DistributedLock import allowlist scanner
 *
 * Enforces the Phase B invariant: only two files are allowed to import
 * src/utils/DistributedLock. Any other caller is suspect — it likely means
 * someone is trying to build a one-off lock or pub/sub pattern that will
 * quietly misuse the primitive (e.g. subscribe-in-a-loop, see the one-shot
 * warning on subscribeWithTimeout).
 *
 * If you have a legitimate new caller:
 *   1. Add it to ALLOWED below with a one-line rationale.
 *   2. Verify the new caller respects the API:
 *        - token-verified release()
 *        - subscribeWithTimeout treated as one-shot, not a consumer loop
 *
 * Exit 0 if all imports are from allowed files, exit 1 otherwise
 * (CI-blocking — same pattern as check-polling-annotations.js).
 */

"use strict";

const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..", "src");

// Relative path (from src/) of each file allowed to import DistributedLock.
// Keep in lock-step with the `# callers` audit in DistributedLock.js — if the
// list there grows, this list must grow with it (and vice versa).
const ALLOWED = new Set([
    path.join("platform", "billing", "services", "platformSubscriptionService.js"),
    path.join("services", "platformUserService.js"),
    // Stripe webhook event-id dedup. Single-shot lock keyed on
    // `webhook:lock:${regionCode}:${event.id}` — acquire → process → release
    // inside try/finally. Phase 6 migration from utils/redisLock (deleted).
    path.join("platform", "billing", "controllers", "stripe.webhook.controller.js"),
    // The module itself, obviously.
    path.join("utils", "DistributedLock.js"),
]);

// Matches both `require(".../DistributedLock")` and `from ".../DistributedLock"`
// with optional .js extension. Captures any relative or alias-based path.
const IMPORT_RE = /(?:require\s*\(\s*["']|from\s+["'])([^"']*DistributedLock)(?:\.js)?["']/;

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
    const rel = path.relative(ROOT, filePath);
    const lines = fs.readFileSync(filePath, "utf8").split(/\r?\n/);
    for (let i = 0; i < lines.length; i++) {
        if (!IMPORT_RE.test(lines[i])) continue;
        if (ALLOWED.has(rel)) continue;
        violations.push({
            file: rel,
            line: i + 1,
            content: lines[i].trim(),
        });
    }
}

scan(ROOT);

if (violations.length > 0) {
    console.error("\u274C DistributedLock import allowlist violations:\n");
    for (const v of violations) {
        console.error(`  src/${v.file}:${v.line}`);
        console.error(`    ${v.content}`);
    }
    console.error(
        "\nDistributedLock is an internal coordination primitive. Only the " +
        "following files may import it:\n" +
        [...ALLOWED].map(f => `  - src/${f}`).join("\n") +
        "\n\nIf you have a legitimate new caller, add it to ALLOWED in " +
        "scripts/check-lock-usage.js with a one-line rationale."
    );
    process.exit(1);
}

console.log("\u2705 DistributedLock import allowlist: only sanctioned callers.");
