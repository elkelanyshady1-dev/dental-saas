#!/usr/bin/env node
/**
 * check-idempotency-coverage.js — critical-surface idempotency coverage scan
 *
 * Enforces that files in designated critical directories (payments, refunds,
 * ledger orchestrators, QStash handlers) reference an idempotency primitive.
 * The idempotency systems already exist in the repo — this scanner guards
 * against someone adding a new payment/refund/ledger path without calling
 * one of them.
 *
 * What counts as "referencing idempotency" (case-insensitive match for any):
 *   - ensureIdempotent          (src/core/idempotency.js)
 *   - executeIdempotent         (forward-compat — spec's proposed helper)
 *   - idempotencyService        (src/core/idempotency.service.js — event layer)
 *   - IdempotencyKey / IdempotencyRecord / SignupIdempotency  (models)
 *   - idempotency(              (Express middleware call site)
 *
 * Configuration lives in scripts/idempotency-critical-map.json:
 *   - `critical`                — map of scope name → directories to scan
 *   - `excludeFilenamePatterns` — skip models / DTOs / validators / tests
 *   - `exceptions`              — explicit allowlist for genuinely-read-only
 *                                 services in critical directories
 *   - `grandfatheredGaps`       — known existing gaps tracked as warnings;
 *                                 exit code stays 0 for these so CI isn't
 *                                 blocked on a mass-migration, but they're
 *                                 visible in the output. Remove entries as
 *                                 each is fixed. NEW files not in this list
 *                                 still fail CI — the enforcement floor.
 *   - `_grandfatheredNotes`     — object keyed by file path, values are
 *                                 structured metadata { owner, severity,
 *                                 category, targetFix, note }. The scanner
 *                                 uses `severity` to group warnings (CRITICAL
 *                                 → HIGH → MEDIUM → UNKNOWN). Legacy string
 *                                 values are accepted and treated as UNKNOWN
 *                                 severity until migrated.
 *
 * Exit code:
 *   0 — every scanned file either references an idempotency primitive OR
 *       is listed in exceptions / grandfatheredGaps
 *   1 — a file missing idempotency is NOT in exceptions / grandfatheredGaps
 *       (new gap that CI should block on)
 *
 * False-positive management:
 *   - This is a STRING match. A file that mentions "idempotency" only in a
 *     comment passes. That's acceptable — the purpose is "did the author
 *     consciously think about idempotency?" not "is it bullet-proof?".
 *   - If the scanner flags a legitimate read-only file, add it to the
 *     `exceptions` list with a one-line rationale.
 */

"use strict";

const fs = require("fs");
const path = require("path");

const BACKEND_ROOT = path.resolve(__dirname, "..");
const CONFIG_PATH = path.join(__dirname, "idempotency-critical-map.json");

const config = JSON.parse(fs.readFileSync(CONFIG_PATH, "utf8"));

// Normalize exceptions to forward-slash for cross-platform compare against
// scanned file paths (which we also normalize). Windows + WSL + *nix all
// produce the same set.
const exceptions = new Set(
    (config.exceptions || []).map((f) => f.replace(/\\/g, "/"))
);

const grandfathered = new Set(
    (config.grandfatheredGaps || []).map((f) => f.replace(/\\/g, "/"))
);

// _grandfatheredNotes is documentation-adjacent: the scanner uses it for
// severity grouping + ownership display, but missing entries or missing
// fields degrade gracefully (UNKNOWN severity, no owner shown) rather than
// breaking the run.
const notes = config._grandfatheredNotes || {};

const excludePatterns = config.excludeFilenamePatterns || [];

// Severity bucket order for grouped output. Anything not in this list lands
// under UNKNOWN. Intentionally short — more tiers = more argument over
// which tier each file belongs in, without making the output more useful.
const SEVERITY_ORDER = ["CRITICAL", "HIGH", "MEDIUM", "UNKNOWN"];

function _meta(rel) {
    const raw = notes[rel];
    // Back-compat: old string-format notes → UNKNOWN severity, raw note text.
    if (typeof raw === "string") {
        return { severity: "UNKNOWN", owner: null, category: null, targetFix: null, note: raw };
    }
    if (raw && typeof raw === "object") {
        const sev = SEVERITY_ORDER.includes(raw.severity) ? raw.severity : "UNKNOWN";
        return {
            severity: sev,
            owner: raw.owner || null,
            category: raw.category || null,
            targetFix: raw.targetFix || null,
            note: raw.note || null,
        };
    }
    return { severity: "UNKNOWN", owner: null, category: null, targetFix: null, note: null };
}

// Single regex matching any idempotency primitive. Case-insensitive because
// comments/log messages in the codebase use mixed casing. The word-boundary
// wrapper keeps us from matching `idempotency` substrings inside unrelated
// identifiers.
const IDEMPOTENCY_PATTERN = /\b(?:ensureidempotent|executeidempotent|idempotencyservice|idempotencykey|idempotencyrecord|signupidempotency|idempotency\s*\()/i;

function isExcluded(filePath) {
    return excludePatterns.some((p) => filePath.endsWith(p) || filePath.includes(p));
}

function toRel(filePath) {
    return path.relative(BACKEND_ROOT, filePath).replace(/\\/g, "/");
}

function walk(dir, out) {
    if (!fs.existsSync(dir)) {
        // Directory listed in critical but doesn't exist on disk — config
        // drift. Surface as a coverage violation so whoever moved/removed
        // the directory updates the map.
        out.missingDirs.push(toRel(dir));
        return;
    }
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
            walk(full, out);
        } else if (entry.isFile() && entry.name.endsWith(".js") && !isExcluded(full)) {
            out.files.push(full);
        }
    }
}

const result = { files: [], missingDirs: [] };
for (const [, dirs] of Object.entries(config.critical || {})) {
    for (const rel of dirs) {
        walk(path.resolve(BACKEND_ROOT, rel), result);
    }
}

const violations = [];      // new gaps — exit 1
const warnings = [];        // grandfathered gaps — exit 0, visible
let scanned = 0;
let exempted = 0;

for (const full of result.files) {
    const rel = toRel(full);
    if (exceptions.has(rel)) {
        exempted++;
        continue;
    }
    scanned++;
    const content = fs.readFileSync(full, "utf8");
    if (IDEMPOTENCY_PATTERN.test(content)) continue;

    if (grandfathered.has(rel)) {
        warnings.push(rel);
    } else {
        violations.push(rel);
    }
}

if (result.missingDirs.length > 0) {
    console.error("\u274C Missing critical directories (config drift):");
    for (const d of result.missingDirs) {
        console.error(`  ${d}`);
    }
}

if (warnings.length > 0) {
    // Group warnings by severity for actionable output. Within a severity
    // bucket, sort by path so output is deterministic across runs.
    const bySev = Object.fromEntries(SEVERITY_ORDER.map((s) => [s, []]));
    for (const w of warnings) {
        const m = _meta(w);
        bySev[m.severity].push({ path: w, ...m });
    }

    console.warn(
        `\u26A0\uFE0F  Grandfathered idempotency gaps (${warnings.length}) \u2014 ` +
        `tracked, not blocking:\n`
    );

    for (const sev of SEVERITY_ORDER) {
        const entries = bySev[sev];
        if (entries.length === 0) continue;
        entries.sort((a, b) => a.path.localeCompare(b.path));
        console.warn(`=== ${sev} (${entries.length}) ===`);
        for (const e of entries) {
            console.warn(`  ${e.path}`);
            const tags = [];
            if (e.owner) tags.push(`owner: ${e.owner}`);
            if (e.category) tags.push(`category: ${e.category}`);
            if (tags.length > 0) console.warn(`    ${tags.join(" | ")}`);
            if (e.targetFix) console.warn(`    fix: ${e.targetFix}`);
        }
        console.warn("");
    }

    console.warn(
        "These files are in `grandfatheredGaps` in scripts/idempotency-critical-map.json.\n" +
        "As each is migrated to use an idempotency primitive, remove its entry from that list.\n"
    );
}

if (violations.length > 0) {
    console.error(
        `\u274C NEW idempotency coverage violations (${violations.length}) — blocking:\n`
    );
    for (const v of violations) {
        console.error(`  ${v}`);
    }
    console.error(
        "\nEach file must either:\n" +
        "  1. Call one of: ensureIdempotent() / executeIdempotent() / idempotencyService / idempotency()\n" +
        "  2. Reference an idempotency model: IdempotencyKey / IdempotencyRecord / SignupIdempotency\n" +
        "  3. Be added to `exceptions` in scripts/idempotency-critical-map.json with a\n" +
        "     one-line rationale — ONLY if the file is genuinely read-only / side-effect-free."
    );
    process.exit(1);
}

if (result.missingDirs.length > 0) {
    process.exit(1);
}

console.log(
    `\u2705 Idempotency coverage: ${scanned} files scanned, ${exempted} exempted, ` +
    `${warnings.length} grandfathered, 0 new violations.`
);
