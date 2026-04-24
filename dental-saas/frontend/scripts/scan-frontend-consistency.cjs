/**
 * scan-frontend-consistency.js
 *
 * Guards the frontend patient modules + standalone portal from drifting back
 * to manual-fetch / hardcoded-key / role-check anti-patterns.
 *
 * Scope (configurable via SCAN_ROOTS):
 *   - frontend/src/org/modules/patients
 *   - frontend/src/modules/org/patients
 *   - frontend/src/modules/patientDomain
 *   - portal/src
 *
 * Rules:
 *   1. No `useState(...)` paired with a `useEffect` that calls `api.` / `fetch(`.
 *   2. No hardcoded query keys — any `useQuery({ queryKey: [...] })` that is
 *      not sourced from QK.* or a _KEYS module (e.g. TODO_KEYS, QUERY_KEYS).
 *   3. No role-name comparisons (`roleName === 'Admin'`, `role === "doctor"`).
 *   4. No `refetch()` or `window.location.reload()` / `window.location.href =`.
 *   5. No unscoped localStorage keys matching known draft prefixes
 *      (chart_draft_, visit_notes_draft_) without an org prefix.
 *
 * Usage: node frontend/scripts/scan-frontend-consistency.js
 * Exit 0 if clean, 1 otherwise — suitable for CI.
 */

"use strict";

const fs = require("fs");
const path = require("path");

const REPO_ROOT = path.resolve(__dirname, "..", "..");
const SCAN_ROOTS = [
    path.join(REPO_ROOT, "frontend", "src", "org", "modules", "patients"),
    path.join(REPO_ROOT, "frontend", "src", "modules", "org", "patients"),
    path.join(REPO_ROOT, "frontend", "src", "modules", "patientDomain"),
    path.join(REPO_ROOT, "portal", "src"),
].filter((p) => fs.existsSync(p));

const findings = [];

function rel(p) {
    return path.relative(REPO_ROOT, p).replace(/\\/g, "/");
}

function scanFile(file, content) {
    // Skip test files + scanner output.
    if (/\.test\.(jsx?|tsx?)$/.test(file)) return;
    if (file.endsWith(".d.ts")) return;

    // Rule 1: useState + useEffect + api/fetch for server data.
    // Heuristic: file contains `useState(` and (`api.` or `fetch(`) inside a `useEffect`.
    if (/useState\s*\(/.test(content) && /useEffect\s*\(/.test(content)) {
        const effectBlocks = content.match(/useEffect\s*\(\s*(?:async\s*)?\(\s*\)?\s*=>\s*\{[\s\S]*?\}\s*,\s*\[[^\]]*\]\s*\)/g) || [];
        for (const block of effectBlocks) {
            const hasApiOrFetch = /\bapi\.(get|post|put|patch|delete)\b/.test(block) ||
                                  /\bfetch\s*\(/.test(block) ||
                                  /\baxios\.(get|post|put|patch|delete)\b/.test(block) ||
                                  /patientsApi\.\w+\s*\(/.test(block);
            const setsState = /\bset[A-Z]\w+\s*\(/.test(block);
            if (hasApiOrFetch && setsState) {
                findings.push({
                    rule: "manual-fetch",
                    file: rel(file),
                    hint: "useEffect that fetches and writes to useState — use useQuery instead",
                });
                break;
            }
        }
    }

    // Rule 2: hardcoded query keys (but allow sourced-from-registry patterns).
    // Matches `queryKey: ['literal-string', ...]` — flags unless the first element
    // is Uppercase (suggesting a registry constant interpolation).
    const queryKeyRe = /queryKey\s*:\s*\[\s*(['"][a-z][\w-]*['"])/g;
    let qkMatch;
    while ((qkMatch = queryKeyRe.exec(content)) !== null) {
        const slice = content.slice(Math.max(0, qkMatch.index - 80), qkMatch.index + 120);
        if (/QK\./.test(slice) || /_KEYS\[/.test(slice) || /_KEYS\./.test(slice)) continue;
        findings.push({
            rule: "hardcoded-query-key",
            file: rel(file),
            hint: `queryKey starts with ${qkMatch[1]} — use QK registry`,
        });
    }

    // Also flag any `const X_KEY = (...) => [...]` pattern living outside queryKeys registry.
    if (!/queryKeys\.js$/.test(file)) {
        const localKeyRe = /const\s+[A-Z_]+_KEY\s*=\s*(?:\([^)]*\)\s*=>\s*)?\[['"]/g;
        const localKeyDef = localKeyRe.exec(content);
        if (localKeyDef) {
            findings.push({
                rule: "local-query-key",
                file: rel(file),
                hint: "Local *_KEY constant defined — move to QK registry",
            });
        }
    }

    // Rule 3: role-name string comparisons.
    const roleRe = /\brole(?:Name)?\s*===\s*['"][A-Za-z_]+['"]/g;
    if (roleRe.test(content)) {
        findings.push({
            rule: "role-check",
            file: rel(file),
            hint: "role/roleName string comparison — use useCapability",
        });
    }

    // Rule 4: manual refetch / reload.
    // Hooks that destructure and re-export `refetch` from useQuery are
    // legitimate — skip files that do that but still flag truly manual
    // `refetch()` invocations inside components/effects.
    const legitReExport = /\brefetch\s*:\s*\w+\.refetch\b/.test(content) ||
                          /\breturn\s*\{\s*[\s\S]*?\brefetch\s*,?[\s\S]*?\}/.test(content);
    if (/\brefetch\s*\(\s*\)/.test(content) && !legitReExport) {
        findings.push({
            rule: "manual-refetch",
            file: rel(file),
            hint: "manual refetch() call — prefer queryClient.invalidateQueries()",
        });
    }
    if (/window\.location\.reload\s*\(/.test(content) || /window\.location\.href\s*=/.test(content)) {
        findings.push({
            rule: "manual-reload",
            file: rel(file),
            hint: "window.location.reload/href=… — use navigate() + invalidateQueries()",
        });
    }

    // Rule 5: unscoped localStorage keys matching known draft prefixes.
    const unscopedKey = /(?:localStorage|sessionStorage)\.(?:setItem|getItem|removeItem)\(\s*[`'"]((?:chart_draft_|visit_notes_draft_)[^`'"]+)[`'"]/;
    const unscopedMatch = unscopedKey.exec(content);
    if (unscopedMatch) {
        // Allow ${orgId}: or `org:${orgId}:` prefix in a template literal.
        const templateLiteral = new RegExp("`[^`]*\\$\\{[^}]*(orgId|organizationId)[^}]*\\}[^`]*" + unscopedMatch[1].split("_")[0]);
        if (!templateLiteral.test(content)) {
            findings.push({
                rule: "unscoped-storage",
                file: rel(file),
                hint: `${unscopedMatch[1]}… — prefix with orgId`,
            });
        }
    }
}

function walk(dir) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
            if (entry.name === "node_modules" || entry.name === "dist" || entry.name === "__tests__") continue;
            walk(full);
            continue;
        }
        if (!/\.(jsx?|tsx?)$/.test(entry.name)) continue;
        const content = fs.readFileSync(full, "utf8");
        scanFile(full, content);
    }
}

for (const root of SCAN_ROOTS) walk(root);

// Deduplicate: one finding per (file, rule).
const unique = new Map();
for (const f of findings) {
    const key = `${f.file}:${f.rule}`;
    if (!unique.has(key)) unique.set(key, f);
}
const list = Array.from(unique.values());

console.log(`Scan roots: ${SCAN_ROOTS.length}`);
console.log(`Files flagged: ${list.length}`);
if (list.length === 0) {
    console.log("\nOK — no frontend consistency violations.");
    process.exit(0);
}

const byRule = {};
for (const f of list) (byRule[f.rule] = byRule[f.rule] || []).push(f);
for (const rule of Object.keys(byRule).sort()) {
    console.log(`\n== ${rule} (${byRule[rule].length}) ==`);
    for (const f of byRule[rule]) console.log(`  ${f.file} — ${f.hint}`);
}
process.exit(1);
