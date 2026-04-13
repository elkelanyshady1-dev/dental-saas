#!/usr/bin/env node
// module-alias must be registered before any @-alias requires
require("module-alias/register");
/**
 * validateCrossPlaneIsolation.js
 * Phase 20: Cross-Plane Isolation Validator
 *
 * Statically analyzes backend code to detect Platform ↔ Organization
 * plane isolation violations.
 *
 * Detection rules:
 *   1. PLATFORM_IMPORTS_ORG — Platform file imports org model/controller/route
 *   2. ORG_IMPORTS_PLATFORM — Org file imports platform model/controller/route
 *   3. ORG_USES_PLATFORM_CAPABILITY — Org file uses authorizePlatformPermission
 *   4. ROUTE_PREFIX_MISMATCH — File plane doesn't match route prefix
 *
 * Architecture-aware severity:
 *   - Platform controllers reading org models = MEDIUM (admin read-access pattern)
 *   - Org files importing platform domain = HIGH (true isolation break)
 *   - Middleware/infrastructure = shared (bridges planes by design)
 *
 * All classification is path-based. No hardcoded file lists.
 *
 * Usage: node scripts/validateCrossPlaneIsolation.js
 * Exit code: 0 = pass (warnings only), 1 = fail (HIGH violations)
 */

const fs = require("fs");
const path = require("path");

const SRC_ROOT = path.resolve(__dirname, "../../..", "src");

// ─── Plane Classification (path-based, dynamic) ─────────────────────────────
// Priority 1: Canonical structure (src/platform/, src/organization/, etc.)
// Priority 2: Legacy module paths (src/modules/platformDomain, etc.)
// Priority 3: Shared infrastructure fallback

const SHARED_PATTERNS = [
    /[/\\]middleware[/\\]/i,
    /[/\\]config[/\\]/i,
    /[/\\]utils[/\\]/i,
    /[/\\]helpers[/\\]/i,
    /[/\\]lib[/\\]/i,
    /[/\\]types[/\\]/i,
    /[/\\]core[/\\]/i,
    /[/\\]infrastructure[/\\]/i,
    /[/\\]jobs[/\\](?!.*platform)/i,       // shared jobs (not inside platform/)
    /[/\\]services[/\\](?!platform)/i,     // shared services (not platformXxx)
    /[/\\]integrity[/\\]/i,
    /[/\\]scripts[/\\]/i,
    /[/\\]tests?[/\\]/i,
    /app\.js$/i,
    /server\.js$/i,
];

function classifyFilePlane(filePath) {
    const rel = filePath.replace(/\\/g, "/");

    // ─── Priority 1: Canonical directory structure ────────────────────────
    // src/platform/** → PLATFORM (includes domain/, billing/, support/, controllers/, models/)
    if (/\/src\/platform\//i.test(rel)) return "platform";

    // src/organization/** → ORGANIZATION
    if (/\/src\/organization\//i.test(rel)) return "organization";

    // src/shared/** → SHARED
    if (/\/src\/shared\//i.test(rel)) return "shared";

    // src/governance/** → SHARED
    if (/\/src\/governance\//i.test(rel)) return "shared";

    // src/routes/platform/** → PLATFORM
    if (/\/src\/routes\/platform\//i.test(rel)) return "platform";

    // src/routes/** (non-platform route files) → ORGANIZATION
    if (/\/src\/routes\//i.test(rel)) return "organization";

    // ─── Priority 2: Legacy module paths ─────────────────────────────────
    // modules/platformDomain/** → PLATFORM
    if (/[/\\]modules[/\\]platformDomain[/\\]/i.test(rel)) return "platform";

    // modules/supportDomain/** → PLATFORM
    if (/[/\\]modules[/\\]supportDomain[/\\]/i.test(rel)) return "platform";

    // modules/billingDomain/platformFinance/** → PLATFORM
    if (/[/\\]billingDomain[/\\]platformFinance[/\\]/i.test(rel)) return "platform";

    // modules/billingDomain (non-platformFinance) → ORGANIZATION
    if (/[/\\]modules[/\\]billingDomain[/\\]/i.test(rel)) return "organization";

    // Other org domain modules (Phase G: financialDomain deleted — superseded by billingDomain/projections/snapshot)
    if (/[/\\]modules[/\\](?:patientDomain|appointmentDomain|clinicDomain|recallDomain|familyDomain|booking|notificationDomain|inventoryDomain|documentEngineDomain|clinicalProtocolDomain|stageDomain|orthodonticDomain|alignerProductionDomain|communicationDomain|intelligenceDomain|patientPortal|organization)[/\\]/i.test(rel)) return "organization";

    // modules/authorization → SHARED
    if (/[/\\]modules[/\\]authorization[/\\]/i.test(rel)) return "shared";

    // ─── Priority 3: Shared infrastructure fallback ──────────────────────
    for (const rx of SHARED_PATTERNS) {
        if (rx.test(rel)) return "shared";
    }

    // Files with "platform" in their basename → platform
    const basename = path.basename(rel).toLowerCase();
    if (basename.startsWith("platform")) return "platform";

    // projections/platform → platform
    if (/[/\\]projections[/\\]platform[/\\]/i.test(rel)) return "platform";

    // Controllers/routes without platform prefix → org
    if (/[/\\]controllers[/\\]/i.test(rel) && !basename.startsWith("platform")) return "organization";

    // Models without platform prefix → org
    if (/[/\\]models[/\\]/i.test(rel)) {
        if (basename.startsWith("platform")) return "platform";
        return "organization";
    }

    return "shared";
}

function classifyImportTarget(importPath, importingFilePath) {
    // For relative imports, resolve against the importing file's directory
    let effectivePath = importPath;
    if (importPath.startsWith(".")) {
        const dir = path.dirname(importingFilePath);
        effectivePath = path.resolve(dir, importPath).replace(/\\/g, "/");
    }
    const lower = effectivePath.toLowerCase().replace(/\\/g, "/");

    // ─── Priority 1: Canonical structure ──────────────────────────────────
    // Shared proxies — must check before platform to allow shared/ re-exports
    if (/\/src\/shared\//i.test(lower) || /[/\\]shared[/\\]/i.test(lower)) return "shared";

    // Governance → shared
    if (/\/src\/governance\//i.test(lower)) return "shared";

    // Canonical platform/ directory → PLATFORM
    if (/\/src\/platform\//i.test(lower)) return "platform";

    // Canonical organization/ directory → ORGANIZATION
    if (/\/src\/organization\//i.test(lower)) return "organization";

    // Routes: platform/ subfolder → PLATFORM, others → ORGANIZATION
    if (/\/src\/routes\/platform\//i.test(lower)) return "platform";
    if (/\/src\/routes\//i.test(lower)) return "organization";

    // ─── Priority 2: Legacy module paths ─────────────────────────────────
    if (/modules[/\\]platformDomain/i.test(lower)) return "platform";
    if (/modules[/\\]supportDomain/i.test(lower)) return "platform";
    if (/billingDomain[/\\]platformFinance/i.test(lower)) return "platform";
    if (/platformCapabilityResolver/i.test(lower)) return "platform";
    if (/platformProtect/i.test(lower)) return "platform";
    if (/platformAudit/i.test(lower)) return "platform";

    // Platform models by basename
    const basename = path.basename(lower).replace(/\.js$/, "").replace(/\.model$/, "");
    if (/^platform/i.test(basename)) return "platform";

    // Org domain modules (legacy module paths) — Phase G: financialDomain removed, billingDomain is SSOT
    if (/modules[/\\](?:patientDomain|appointmentDomain|clinicDomain|recallDomain|familyDomain|booking|notificationDomain|inventoryDomain|documentEngineDomain|clinicalProtocolDomain|stageDomain|orthodonticDomain|alignerProductionDomain|communicationDomain|intelligenceDomain|patientPortal|organization)[/\\]/i.test(lower)) return "organization";
    if (/modules[/\\]billingDomain[/\\]/i.test(lower)) return "organization";
    if (/organizationFinance/i.test(lower)) return "organization";
    if (/organizationService/i.test(lower)) return "organization";

    // Org models (non-platform models in models/)
    if (/models[/\\]/i.test(lower) && !/platform/i.test(basename)) return "organization";

    // modules/authorization → SHARED
    if (/modules[/\\]authorization/i.test(lower)) return "shared";

    return "shared";
}

// ─── File Discovery ──────────────────────────────────────────────────────────
function findJsFiles(dir) {
    const results = [];
    if (!fs.existsSync(dir)) return results;
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
            if (entry.name === "node_modules" || entry.name === ".git") continue;
            results.push(...findJsFiles(fullPath));
        } else if (entry.name.endsWith(".js") && !entry.name.endsWith(".test.js") && !entry.name.endsWith(".spec.js")) {
            results.push(fullPath);
        }
    }
    return results;
}

// ─── Import Detection ────────────────────────────────────────────────────────
const REQUIRE_REGEX = /require\s*\(\s*['"]([^'"]+)['"]\s*\)/g;
const IMPORT_REGEX = /import\s+(?:.*?\s+from\s+)?['"]([^'"]+)['"]/g;

function extractImports(content) {
    const imports = [];
    let m;
    const r1 = new RegExp(REQUIRE_REGEX.source, "g");
    while ((m = r1.exec(content)) !== null) {
        imports.push({ path: m[1], line: content.substring(0, m.index).split("\n").length });
    }
    const r2 = new RegExp(IMPORT_REGEX.source, "g");
    while ((m = r2.exec(content)) !== null) {
        imports.push({ path: m[1], line: content.substring(0, m.index).split("\n").length });
    }
    return imports;
}

// ─── Route Prefix Detection ─────────────────────────────────────────────────
const ROUTE_DEF_REGEX = /(?:router|app)\s*\.\s*(?:get|post|put|patch|delete|use)\s*\(\s*['"]([^'"]+)['"]/g;

function extractRoutePrefixes(content) {
    const routes = [];
    let m;
    const rx = new RegExp(ROUTE_DEF_REGEX.source, "g");
    while ((m = rx.exec(content)) !== null) {
        routes.push({ path: m[1], line: content.substring(0, m.index).split("\n").length });
    }
    return routes;
}

// ─── Capability Misuse Detection ─────────────────────────────────────────────
function detectCapabilityMisuse(content) {
    const hits = [];
    const rx = /authorizePlatformPermission/g;
    let m;
    while ((m = rx.exec(content)) !== null) {
        hits.push({ line: content.substring(0, m.index).split("\n").length });
    }
    return hits;
}

// ─── Severity Assignment ─────────────────────────────────────────────────────
// Platform controllers accessing org models is an expected admin pattern (MEDIUM)
// Org code reaching into platform domain is a structural violation (HIGH)
function assignSeverity(type, filePath) {
    if (type === "PLATFORM_IMPORTS_ORG") {
        // Platform controllers reading org data = admin access pattern
        if (/controllers[/\\]platform/i.test(filePath)) return "MEDIUM";
        if (/platform[/\\]controllers/i.test(filePath)) return "MEDIUM";
        if (/platform[/\\]domain[/\\]controllers/i.test(filePath)) return "MEDIUM";
        if (/platform[/\\]billing/i.test(filePath)) return "MEDIUM";
        if (/platform[/\\]support/i.test(filePath)) return "MEDIUM";
        if (/platformFinance/i.test(filePath)) return "MEDIUM";
        if (/platformSubscription/i.test(filePath)) return "MEDIUM";
        // Platform service reading org model = borderline
        if (/services[/\\]platform/i.test(filePath)) return "MEDIUM";
        if (/platform[/\\]domain[/\\]services/i.test(filePath)) return "MEDIUM";
        return "HIGH";
    }
    if (type === "ORG_IMPORTS_PLATFORM") return "HIGH";
    if (type === "ORG_USES_PLATFORM_CAPABILITY") return "HIGH";
    if (type === "ROUTE_PREFIX_MISMATCH") return "MEDIUM";
    return "MEDIUM";
}

// ═══════════════════════════════════════════════════════════════════════════════
//  MAIN ANALYSIS
// ═══════════════════════════════════════════════════════════════════════════════

const violations = [];
const files = findJsFiles(SRC_ROOT);
let filesScanned = 0;
let platformFiles = 0;
let orgFiles = 0;
let sharedFiles = 0;

for (const filePath of files) {
    const plane = classifyFilePlane(filePath);
    if (plane === "shared") { sharedFiles++; continue; }

    filesScanned++;
    if (plane === "platform") platformFiles++;
    else orgFiles++;

    const relPath = path.relative(path.resolve(__dirname, "../../.."), filePath).replace(/\\/g, "/");
    let content;
    try {
        content = fs.readFileSync(filePath, "utf8");
    } catch {
        continue;
    }

    // Rule 1 & 2: Cross-plane imports
    const imports = extractImports(content);
    for (const imp of imports) {
        const targetPlane = classifyImportTarget(imp.path, filePath);
        if (targetPlane === "shared") continue;

        if (plane === "platform" && targetPlane === "organization") {
            const severity = assignSeverity("PLATFORM_IMPORTS_ORG", relPath);
            violations.push({
                type: "PLATFORM_IMPORTS_ORG",
                severity,
                file: relPath,
                line: imp.line,
                message: `Platform file imports organization module: ${imp.path}`,
            });
        } else if (plane === "organization" && targetPlane === "platform") {
            violations.push({
                type: "ORG_IMPORTS_PLATFORM",
                severity: "HIGH",
                file: relPath,
                line: imp.line,
                message: `Organization file imports platform module: ${imp.path}`,
            });
        }
    }

    // Rule 3: Capability misuse (org file using platform auth)
    if (plane === "organization") {
        const capHits = detectCapabilityMisuse(content);
        for (const hit of capHits) {
            violations.push({
                type: "ORG_USES_PLATFORM_CAPABILITY",
                severity: "HIGH",
                file: relPath,
                line: hit.line,
                message: "Organization file uses authorizePlatformPermission (platform-only middleware)",
            });
        }
    }

    // Rule 4: Route prefix mismatch
    const routes = extractRoutePrefixes(content);
    for (const route of routes) {
        if (plane === "organization" && route.path.startsWith("/api/platform")) {
            violations.push({
                type: "ROUTE_PREFIX_MISMATCH",
                severity: "MEDIUM",
                file: relPath,
                line: route.line,
                message: `Org-plane file defines platform route: ${route.path}`,
            });
        } else if (plane === "platform" && route.path.startsWith("/api/org")) {
            violations.push({
                type: "ROUTE_PREFIX_MISMATCH",
                severity: "MEDIUM",
                file: relPath,
                line: route.line,
                message: `Platform file defines org route: ${route.path}`,
            });
        }
    }
}

// ─── Output ──────────────────────────────────────────────────────────────────
const highCount = violations.filter(v => v.severity === "HIGH").length;
const medCount = violations.filter(v => v.severity === "MEDIUM").length;
const lowCount = violations.filter(v => v.severity === "LOW").length;

console.log("");
console.log("╔════════════════════════════════════════════════════════════╗");
console.log("║  CROSS-PLANE ISOLATION VALIDATOR — Phase 20              ║");
console.log("╠════════════════════════════════════════════════════════════╣");
console.log(`║  Files scanned:   ${String(filesScanned).padEnd(38)}║`);
console.log(`║  Platform files:  ${String(platformFiles).padEnd(38)}║`);
console.log(`║  Org files:       ${String(orgFiles).padEnd(38)}║`);
console.log(`║  Shared files:    ${String(sharedFiles).padEnd(38)}║`);
console.log(`║  Violations:      ${String(violations.length).padEnd(38)}║`);
console.log(`║  HIGH:            ${String(highCount).padEnd(38)}║`);
console.log(`║  MEDIUM:          ${String(medCount).padEnd(38)}║`);
console.log("╚════════════════════════════════════════════════════════════╝");
console.log("");

if (violations.length > 0) {
    // Group by type for cleaner output
    const byType = {};
    for (const v of violations) {
        if (!byType[v.type]) byType[v.type] = [];
        byType[v.type].push(v);
    }
    for (const [type, items] of Object.entries(byType)) {
        const icon = items[0].severity === "HIGH" ? "❌" : "⚠️";
        console.log(`  ${icon} ${type} (${items.length} occurrence${items.length !== 1 ? "s" : ""}):`);
        for (const v of items) {
            console.log(`     [${v.severity}] ${v.file}:${v.line} — ${v.message}`);
        }
        console.log("");
    }
}

if (violations.length === 0) {
    console.log("  ✅ No cross-plane isolation violations detected.");
    console.log("");
}

// Output JSON result for governance engine parsing
const result = {
    validator: "validate:cross-plane-isolation",
    violations,
    summary: { total: violations.length, high: highCount, medium: medCount },
};
console.log("__GOVERNANCE_JSON_START__");
console.log(JSON.stringify(result));
console.log("__GOVERNANCE_JSON_END__");

// Exit 0 on pass (no HIGH violations), 1 on fail
process.exit(highCount > 0 ? 1 : 0);
