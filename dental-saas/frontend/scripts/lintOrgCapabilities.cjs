/**
 * lintOrgCapabilities.cjs
 * v1.0 — Org Plane Capability Linter
 *
 * Scans frontend/src/modules/org/** for raw permission string literals
 * used in usePermission() / useCapabilities()[] calls.
 *
 * Raw strings are FORBIDDEN:
 *   ❌  usePermission("patients.read")
 *   ❌  capabilities["patients.read"]
 *   ✅  usePermission(CAP.PATIENTS.READ)
 *
 * Also validates that any CAP constant paths used in JSX permission props
 * exist in the generated capabilities.js ALL_CAPS set.
 *
 * Exit code 1 on failure.
 * Usage: node frontend/scripts/lintOrgCapabilities.cjs
 */

const fs = require("fs");
const path = require("path");

// ─── Load generated capabilities ─────────────────────────────────────────────
// Use static parse instead of dynamic import (ESM module, CJS script)
const capFile = path.resolve(__dirname, "../src/generated/capabilities.js");
const capContent = fs.readFileSync(capFile, "utf8");

// Extract all "module.action" strings from ALL_CAPS block
const keyRegex = /^\s+"([a-z]+\.[a-zA-Z]+)",/gm;
const ALL_CAPS = new Set();
let m;
while ((m = keyRegex.exec(capContent)) !== null) {
    ALL_CAPS.add(m[1]);
}

if (ALL_CAPS.size === 0) {
    console.error("[lintOrgCapabilities] Could not parse capabilities.js — run npm run generate:capabilities first.");
    process.exit(1);
}

// ─── Targets ─────────────────────────────────────────────────────────────────
const ORG_DIR = path.resolve(__dirname, "../src/modules/org");

const EXCLUDE = ["node_modules", "__tests__", ".test.", ".spec.", "generated"];

let violations = [];

// ─── Rule 1: usePermission() called with a raw string ────────────────────────
function checkRawStringInUsePermission(content, relPath) {
    // usePermission("patients.read") or usePermissions(["patients.read", ...])
    const re = /usePermissions?\s*\(\s*["'`]([a-z]+\.[a-zA-Z.]+)["'`]/g;
    let match;
    while ((match = re.exec(content)) !== null) {
        const line = content.substring(0, match.index).split("\n").length;
        violations.push({
            file: relPath, line,
            rule: "RAW_STRING_IN_USE_PERMISSION",
            issue: `usePermission("${match[1]}") — use CAP.${match[1].split(".")[0].toUpperCase()}.${match[1].split(".")[1].toUpperCase()} instead`,
            severity: "HIGH",
        });
    }
}

// ─── Rule 2: capabilities["key"] or capabilities['key'] direct map access ────
function checkDirectCapabilityAccess(content, relPath) {
    const re = /capabilities\[["'`]([^"'`]+)["'`]\]/g;
    let match;
    while ((match = re.exec(content)) !== null) {
        const line = content.substring(0, match.index).split("\n").length;
        violations.push({
            file: relPath, line,
            rule: "DIRECT_CAPABILITY_MAP_ACCESS",
            issue: `capabilities["${match[1]}"] — use usePermission(CAP.X.Y) instead`,
            severity: "HIGH",
        });
    }
}

// ─── Rule 3: permission prop with raw string in JSX ──────────────────────────
// e.g. permission="patients.read" or permission={'patients.read'}
function checkJsxPermissionProp(content, relPath) {
    const re = /permission\s*=\s*[{"'`]+([a-z]+\.[a-zA-Z.]+)[}"'`]+/g;
    let match;
    while ((match = re.exec(content)) !== null) {
        const val = match[1];
        if (!ALL_CAPS.has(val)) {
            // skip if it looks like a variable reference (no dot literal)
            if (/^[a-z]+\.[a-zA-Z]+$/.test(val)) {
                const line = content.substring(0, match.index).split("\n").length;
                violations.push({
                    file: relPath, line,
                    rule: "RAW_STRING_IN_JSX_PERMISSION_PROP",
                    issue: `permission="${val}" — unknown or raw string. Use CAP.X.Y`,
                    severity: "MEDIUM",
                });
            }
        }
    }
}

// ─── Rule 4: CAP path used with unknown key ───────────────────────────────────
// CAP.SOMETHING.ACTION where "something.action" is NOT in ALL_CAPS
function checkUnknownCapPath(content, relPath) {
    const re = /\bCAP\.([A-Z_]+)\.([A-Z_]+)\b/g;
    let match;
    while ((match = re.exec(content)) !== null) {
        const domain = match[1].toLowerCase();
        const action = match[2].toLowerCase();
        const key = `${domain}.${action}`;
        if (!ALL_CAPS.has(key)) {
            const line = content.substring(0, match.index).split("\n").length;
            violations.push({
                file: relPath, line,
                rule: "UNKNOWN_CAP_PATH",
                issue: `CAP.${match[1]}.${match[2]} → "${key}" is not in capabilities.js. Run npm run generate:capabilities.`,
                severity: "HIGH",
            });
        }
    }
}

// ─── Scanner ──────────────────────────────────────────────────────────────────

/**
 * Strip comments from JS/JSX content so JSDoc examples don't trigger false positives.
 * Replaces // line comments and /* block comments with blank space (preserving line numbers).
 */
function stripComments(content) {
    // Block comments: /* ... */ (preserve line breaks for accurate line numbers)
    let stripped = content.replace(/\/\*[\s\S]*?\*\//gm, (m) => m.replace(/[^\n]/g, " "));
    // Line comments: // ...
    stripped = stripped.replace(/\/\/.*/g, (m) => " ".repeat(m.length));
    return stripped;
}

function scanDir(dir) {
    if (!fs.existsSync(dir)) return;
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const fullPath = path.join(dir, entry.name);
        if (EXCLUDE.some((p) => fullPath.includes(p))) continue;

        if (entry.isDirectory()) {
            scanDir(fullPath);
        } else if (/\.(js|jsx|ts|tsx)$/.test(entry.name)) {
            const raw = fs.readFileSync(fullPath, "utf8");
            const content = stripComments(raw);   // check code only, not comments
            const relPath = path.relative(path.resolve(__dirname, ".."), fullPath);
            checkRawStringInUsePermission(content, relPath);
            checkDirectCapabilityAccess(content, relPath);
            checkJsxPermissionProp(content, relPath);
            checkUnknownCapPath(content, relPath);
        }
    }
}

scanDir(ORG_DIR);

// ─── Report ───────────────────────────────────────────────────────────────────
console.log("");
console.log("═══════════════════════════════════════════════════════");
console.log("  ORG CAPABILITY LINTER — DentalSaaS v1.0");
console.log("═══════════════════════════════════════════════════════");
console.log(`  Scanned:    src/modules/org/`);
console.log(`  SSOT keys:  ${ALL_CAPS.size}`);
console.log(`  Violations: ${violations.length}`);
console.log("");

if (violations.length > 0) {
    for (const v of violations) {
        const severity = v.severity === "HIGH" ? "❌" : "⚠️ ";
        console.error(`  ${severity} [${v.rule}] ${v.file}:${v.line}`);
        console.error(`     ${v.issue}`);
        console.error("");
    }
    console.error("RESULT: FAILED — Fix all violations before committing.");
    process.exit(1);
} else {
    console.log("  ✅ All org capability usage is contract-compliant.");
    console.log("");
    console.log("RESULT: PASSED");
    process.exit(0);
}
