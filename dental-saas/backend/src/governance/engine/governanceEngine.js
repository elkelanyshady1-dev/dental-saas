require("module-alias/register");
/**
 * governanceEngine.js
 * Unified Governance Engine — Data-Driven Enforcement Layer
 * Phase 13: Forensic Governance + Score History + Delta Detection
 *
 * Reads /config/platform-governance.policy.json and orchestrates
 * all governance validators dynamically.
 *
 * Features:
 *   - Policy-driven validator execution
 *   - Structured forensic violation registry
 *   - Governance score history tracking (last 50 runs)
 *   - Delta detection (current vs previous run)
 *   - Solo/Enterprise scoring modes
 *
 * Usage: node scripts/governanceEngine.js
 * Exit code: 0 = PASSED, 1 = FAILED
 *
 * HARD RESTRICTIONS:
 *   - Does NOT modify validator logic
 *   - Does NOT hardcode capability lists
 *   - Does NOT modify route guards, Stripe, or subscription logic
 *   - Orchestration layer ONLY
 */

const { spawnSync } = require("child_process");
const fs = require("fs");
const path = require("path");

// ─── Constants ──────────────────────────────────────────────────────────────────
const BACKEND_ROOT = path.resolve(__dirname, "../../..");
const POLICY_PATH = path.resolve(BACKEND_ROOT, "src/config/config/platform-governance.policy.json");
const PACKAGE_JSON_PATH = path.resolve(BACKEND_ROOT, "package.json");
const REPORT_PATH = path.resolve(__dirname, "../reports/governance-report.json");
const HISTORY_PATH = path.resolve(BACKEND_ROOT, "governance-history.json");
const HISTORY_MAX_ENTRIES = 50;

// Score defaults (Solo Developer Optimized)
// Policy can override via platformPlane.scoring.warningPenalty / failurePenalty
const SCORE_INITIAL = 100;
const DEFAULT_WARNING_PENALTY = 2;
const DEFAULT_FAILURE_PENALTY = 20;

// ─── Policy Loading & Validation ─────────────────────────────────────────────
function loadPolicy() {
    if (!fs.existsSync(POLICY_PATH)) {
        console.error(`❌ Policy file not found: ${POLICY_PATH}`);
        process.exit(1);
    }

    let raw;
    try {
        raw = JSON.parse(fs.readFileSync(POLICY_PATH, "utf8"));
    } catch (err) {
        console.error(`❌ Failed to parse policy file: ${err.message}`);
        process.exit(1);
    }

    // Validate required structure
    const required = ["policyVersion", "platformPlane"];
    for (const key of required) {
        if (!(key in raw)) {
            console.error(`❌ Policy missing required key: ${key}`);
            process.exit(1);
        }
    }

    const pp = raw.platformPlane;
    const requiredSections = ["ci", "namespace", "swagger", "responseContract"];
    for (const section of requiredSections) {
        if (!(section in pp)) {
            console.error(`❌ Policy.platformPlane missing required section: ${section}`);
            process.exit(1);
        }
    }

    if (!Array.isArray(pp.ci.requiredScripts) || pp.ci.requiredScripts.length === 0) {
        console.error("❌ Policy.platformPlane.ci.requiredScripts must be a non-empty array");
        process.exit(1);
    }

    return raw;
}

// ─── NPM Script Resolution ──────────────────────────────────────────────────
function resolveNpmScripts(scriptNames) {
    const pkg = JSON.parse(fs.readFileSync(PACKAGE_JSON_PATH, "utf8"));
    const scripts = pkg.scripts || {};

    const resolved = [];

    for (const name of scriptNames) {
        const command = scripts[name];
        if (!command) {
            resolved.push({
                npmScript: name,
                command: null,
                resolved: false,
                error: `npm script "${name}" not found in package.json`,
            });
        } else {
            resolved.push({
                npmScript: name,
                command,
                resolved: true,
            });
        }
    }

    return resolved;
}

// ─── Script Execution ────────────────────────────────────────────────────────
function executeScript(entry) {
    if (!entry.resolved) {
        return {
            ...entry,
            exitCode: 1,
            status: "FAILED",
            stdout: "",
            stderr: entry.error,
            durationMs: 0,
        };
    }

    const isCompound = entry.command.includes("&&");
    const startTime = Date.now();

    let result;
    if (isCompound) {
        result = spawnSync("cmd", ["/c", entry.command], {
            cwd: BACKEND_ROOT,
            timeout: 60000,
            encoding: "utf8",
            stdio: ["pipe", "pipe", "pipe"],
        });
    } else {
        const parts = entry.command.split(/\s+/);
        result = spawnSync(parts[0], parts.slice(1), {
            cwd: BACKEND_ROOT,
            timeout: 60000,
            encoding: "utf8",
            stdio: ["pipe", "pipe", "pipe"],
        });
    }

    const durationMs = Date.now() - startTime;

    return {
        ...entry,
        exitCode: result.status ?? 1,
        status: result.status === 0 ? "PASSED" : "FAILED",
        stdout: (result.stdout || "").trim(),
        stderr: (result.stderr || "").trim(),
        durationMs,
    };
}

// ─── Output Parsing ──────────────────────────────────────────────────────────
function extractResultLine(output) {
    const match = /RESULT:\s*(.+)/m.exec(output);
    return match ? match[1].trim() : null;
}

function countWarningsInOutput(output) {
    if (!output) return 0;
    // Match ⚠️ emoji or words WARNING/WARN that are NOT followed by ": 0" or similar zero status
    const regex = /⚠️|\b(?:WARNINGS?|WARN)\b(?!\s*:\s*[0\s]*(?:\n|║|$))/gi;
    const matches = output.match(regex);
    return matches ? matches.length : 0;
}

// ─── Phase 13: Forensic Violation Extraction ─────────────────────────────────
function extractForensicViolations(scriptName, stdout, stderr) {
    // Combine stdout + stderr since validators output warnings to stderr
    const combined = (stdout || "") + "\n" + (stderr || "");
    const warnings = [];
    const failures = [];

    if (scriptName.includes("swagger-drift")) {
        // Parse undocumented routes
        const undocRegex = /^\s+(GET|POST|PUT|PATCH|DELETE)\s+(\/api\/\S+)\s+—\s+(\S+):(\d+)/gm;
        let m;
        while ((m = undocRegex.exec(combined)) !== null) {
            warnings.push({
                type: "undocumented_route",
                severity: "MEDIUM",
                message: "Route exists but missing @swagger block",
                metadata: { method: m[1], path: m[2], file: m[3], line: parseInt(m[4]) },
            });
        }

        // Parse orphan swagger paths
        const orphanRegex = /ORPHAN.*?:\s*(GET|POST|PUT|PATCH|DELETE)\s+(\/api\/\S+)/gm;
        while ((m = orphanRegex.exec(combined)) !== null) {
            failures.push({
                type: "orphan_swagger_path",
                severity: "HIGH",
                message: "Swagger path documented but no route exists in code",
                metadata: { method: m[1], path: m[2] },
            });
        }
    }

    if (scriptName.includes("response-schema")) {
        // Parse schema drift warnings
        const driftRegex = /\[(\w+)]\s+(GET|POST|PUT|PATCH|DELETE)\s+(\/api\/\S+)\s*\n\s*(.+)/gm;
        let m;
        while ((m = driftRegex.exec(combined)) !== null) {
            warnings.push({
                type: m[1].toLowerCase(),
                severity: "MEDIUM",
                message: m[4].trim(),
                metadata: { method: m[2], path: m[3] },
            });
        }

        // Parse errors
        const errorCountMatch = /Errors:\s+(\d+)/m.exec(combined);
        if (errorCountMatch && parseInt(errorCountMatch[1]) > 0) {
            failures.push({
                type: "response_schema_error",
                severity: "HIGH",
                message: `${errorCountMatch[1]} response schema errors`,
                metadata: {},
            });
        }
    }

    if (scriptName.includes("capability-invariants")) {
        // Parse capability violations from sub-validators
        const violationRegex = /❌\s+(.+)/gm;
        let m;
        while ((m = violationRegex.exec(combined)) !== null) {
            failures.push({
                type: "capability_violation",
                severity: "HIGH",
                message: m[1].trim().substring(0, 120),
                metadata: {},
            });
        }

        // Parse warnings
        const warnRegex = /⚠️\s+(.+)/gm;
        while ((m = warnRegex.exec(combined)) !== null) {
            warnings.push({
                type: "capability_warning",
                severity: "LOW",
                message: m[1].trim().substring(0, 120),
                metadata: {},
            });
        }
    }

    if (scriptName.includes("api-integrity")) {
        // Parse undocumented routes and guard violations
        const undocRegex = /^\s+(GET|POST|PUT|PATCH|DELETE)\s+(\/api\/\S+)\s+—\s+(\S+):(\d+)/gm;
        let m;
        while ((m = undocRegex.exec(combined)) !== null) {
            warnings.push({
                type: "undocumented_route",
                severity: "MEDIUM",
                message: "Route in code but missing swagger documentation",
                metadata: { method: m[1], path: m[2], file: m[3], line: parseInt(m[4]) },
            });
        }

        // Parse mount violations
        const mountRegex = /UNREGISTERED.*?app\.js:(\d+)\s+—\s+(.+)/gm;
        while ((m = mountRegex.exec(combined)) !== null) {
            failures.push({
                type: "unregistered_mount",
                severity: "HIGH",
                message: m[2].trim().substring(0, 120),
                metadata: { file: "app.js", line: parseInt(m[1]) },
            });
        }
    }

    if (scriptName.includes("cross-plane-isolation")) {
        // Parse structured JSON output from the validator
        const jsonMatch = /__GOVERNANCE_JSON_START__\n(.*)\n__GOVERNANCE_JSON_END__/s.exec(combined);
        if (jsonMatch) {
            try {
                const result = JSON.parse(jsonMatch[1]);
                for (const v of (result.violations || [])) {
                    const entry = {
                        type: v.type.toLowerCase(),
                        severity: v.severity,
                        message: v.message.substring(0, 120),
                        metadata: { file: v.file, line: v.line },
                    };
                    if (v.severity === "HIGH") failures.push(entry);
                    else warnings.push(entry);
                }
            } catch { /* JSON parse error — fallback to regex */ }
        }

        // Fallback: regex-based parsing of ❌ and ⚠️ lines
        if (warnings.length === 0 && failures.length === 0) {
            const highRegex = /❌\s+\[HIGH\]\s+(\S+)\s+(\S+):(\d+)\s+—\s+(.+)/gm;
            let m;
            while ((m = highRegex.exec(combined)) !== null) {
                failures.push({
                    type: m[1].toLowerCase(),
                    severity: "HIGH",
                    message: m[4].trim().substring(0, 120),
                    metadata: { file: m[2], line: parseInt(m[3]) },
                });
            }
            const medRegex = /⚠️\s+\[MEDIUM\]\s+(\S+)\s+(\S+):(\d+)\s+—\s+(.+)/gm;
            while ((m = medRegex.exec(combined)) !== null) {
                warnings.push({
                    type: m[1].toLowerCase(),
                    severity: "MEDIUM",
                    message: m[4].trim().substring(0, 120),
                    metadata: { file: m[2], line: parseInt(m[3]) },
                });
            }
        }
    }

    // Phase 17-28: Runtime & Operational Integrity validators
    // All use __GOVERNANCE_JSON_START__/END__ structured output
    // Phase 22: Also extracts classification and retryMetadata
    // Phase 24: Added platform-seed-integrity
    // Phase 25-28: Added role-drift, jwt-secret-entropy, auth-controller-integrity, governance-self-integrity
    // Auth Reset: Added auth-model-alignment
    const runtimeValidators = ["runtime-integrity", "auth-flow", "auth-controller-integrity", "jwt-env-integrity", "jwt-secret-entropy", "environment-config", "platform-seed-integrity", "role-drift", "auth-model-alignment", "governance-self-integrity"];
    let classification = null;
    let retryMetadata = null;
    if (runtimeValidators.some(v => scriptName.includes(v))) {
        const jsonMatch = /__GOVERNANCE_JSON_START__\n(.*)\n__GOVERNANCE_JSON_END__/s.exec(combined);
        if (jsonMatch) {
            try {
                const result = JSON.parse(jsonMatch[1]);
                // Phase 22: Capture classification
                classification = result.classification || null;
                retryMetadata = result.retryMetadata || null;
                for (const f of (result.failures || [])) {
                    failures.push({
                        type: f.type,
                        severity: f.severity || "HIGH",
                        message: (f.message || "").substring(0, 120),
                        metadata: f.metadata || {},
                        classification: f.classification || null,
                    });
                }
                for (const w of (result.warnings || [])) {
                    warnings.push({
                        type: w.type,
                        severity: w.severity || "medium",
                        message: (w.message || "").substring(0, 200),
                        metadata: w.metadata || {},
                        code: w.code || null,
                        recommendation: w.recommendation || null,
                    });
                }
            } catch { /* JSON parse error — continue */ }
        }
    }

    return { warnings, failures, classification, retryMetadata };
}

// ─── Dynamic Enforcement ─────────────────────────────────────────────────────
function applyDynamicEnforcement(policy, results) {
    const pp = policy.platformPlane;
    const issues = [];

    // Check forbiddenPrefixes in route graph
    if (pp.namespace?.forbiddenPrefixes?.length > 0) {
        const routeGraphPath = path.resolve(BACKEND_ROOT, "src/governance/reports/routeGraph.json");
        if (fs.existsSync(routeGraphPath)) {
            try {
                const graph = JSON.parse(fs.readFileSync(routeGraphPath, "utf8"));
                for (const prefix of pp.namespace.forbiddenPrefixes) {
                    const forbidden = (graph.routes || []).filter(r =>
                        r.fullPath && r.fullPath.startsWith(prefix) && !r.fullPath.includes("// legacy")
                    );
                    if (forbidden.length > 0) {
                        issues.push({
                            type: "FORBIDDEN_PREFIX",
                            severity: "ERROR",
                            message: `${forbidden.length} routes still use forbidden prefix "${prefix}"`,
                        });
                    }
                }
            } catch (e) {
                issues.push({
                    type: "ROUTE_GRAPH_PARSE_ERROR",
                    severity: "WARNING",
                    message: `Could not parse routeGraph.json: ${e.message}`,
                });
            }
        }
    }

    // Check swagger strict mode
    if (pp.swagger?.strictMode === true) {
        const swaggerResult = results.find(r => r.npmScript.includes("swagger-drift"));
        if (swaggerResult && swaggerResult.stdout) {
            const undocMatch = /Undocumented routes:\s+(\d+)/m.exec(swaggerResult.stdout);
            if (undocMatch && parseInt(undocMatch[1]) > 0) {
                issues.push({
                    type: "SWAGGER_STRICT",
                    severity: "ERROR",
                    message: `${undocMatch[1]} undocumented routes found (strictMode enabled)`,
                });
            }
        }
    }

    // Check response contract static drift
    if (pp.responseContract?.staticDriftDetection === true) {
        const driftResult = results.find(r => r.npmScript.includes("response-schema"));
        if (driftResult && driftResult.stdout) {
            const errorMatch = /Errors:\s+(\d+)/m.exec(driftResult.stdout);
            if (errorMatch && parseInt(errorMatch[1]) > 0) {
                issues.push({
                    type: "RESPONSE_DRIFT",
                    severity: "ERROR",
                    message: `${errorMatch[1]} response schema drift errors detected`,
                });
            }
        }
    }

    return issues;
}

// ─── Score Calculation ────────────────────────────────────────────────────────
function resolveScoringConfig(policy) {
    const scoring = policy.platformPlane?.scoring || {};
    return {
        warningPenalty: typeof scoring.warningPenalty === "number" ? scoring.warningPenalty : DEFAULT_WARNING_PENALTY,
        failurePenalty: typeof scoring.failurePenalty === "number" ? scoring.failurePenalty : DEFAULT_FAILURE_PENALTY,
    };
}

function calculateScore(results, dynamicIssues, scoringConfig, forensicResults, enforcementLevel) {
    const { warningPenalty, failurePenalty } = scoringConfig;
    const isStrict = enforcementLevel === 'strict';
    let score = SCORE_INITIAL;
    let totalWarningPenalty = 0;
    let totalFailurePenalty = 0;
    let transientSkipped = 0;

    for (const r of results) {
        const forensic = (forensicResults || []).find(fr => fr.npmScript === r.npmScript);

        // Strict Mode Math: Use forensic failures count (which includes escalated warnings)
        if (isStrict) {
            const failCount = forensic?.forensicFailures?.length || 0;
            totalFailurePenalty += failCount * failurePenalty;
        } else {
            if (r.status === "FAILED") {
                const cls = forensic && forensic.classification;
                if (cls === "INFRASTRUCTURE_UNAVAILABLE") {
                    transientSkipped++;
                } else {
                    totalFailurePenalty += failurePenalty;
                }
            } else {
                const warnCount = countWarningsInOutput(r.stdout);
                totalWarningPenalty += warnCount * warningPenalty;
            }
        }
    }

    for (const issue of dynamicIssues) {
        if (issue.severity === "ERROR") {
            totalFailurePenalty += failurePenalty;
        } else {
            totalWarningPenalty += warningPenalty;
        }
    }

    score -= totalWarningPenalty + totalFailurePenalty;

    return {
        finalScore: Math.max(0, score),
        baseScore: SCORE_INITIAL,
        warningPenalty: totalWarningPenalty,
        failurePenalty: totalFailurePenalty,
        transientSkipped,
        config: scoringConfig,
    };
}

// ─── Phase 13: Score History ─────────────────────────────────────────────────
function loadHistory() {
    if (!fs.existsSync(HISTORY_PATH)) return [];
    try {
        const raw = JSON.parse(fs.readFileSync(HISTORY_PATH, "utf8"));
        return Array.isArray(raw) ? raw : [];
    } catch {
        return [];
    }
}

function appendHistory(history, entry) {
    history.push(entry);
    // Auto-trim to last N entries
    if (history.length > HISTORY_MAX_ENTRIES) {
        history = history.slice(history.length - HISTORY_MAX_ENTRIES);
    }
    fs.writeFileSync(HISTORY_PATH, JSON.stringify(history, null, 2), "utf8");
    return history;
}

// ─── Phase 13: Delta Detection ───────────────────────────────────────────────
function computeDelta(history, currentEntry) {
    if (history.length === 0) return null;

    const prev = history[history.length - 1];
    return {
        scoreChange: currentEntry.score - prev.score,
        warningsChange: currentEntry.warnings - prev.warnings,
        failuresChange: currentEntry.failures - prev.failures,
        previousTimestamp: prev.timestamp,
    };
}

function formatDelta(num) {
    if (num > 0) return `+${num}`;
    if (num < 0) return `${num}`;
    return "0";
}

// ─── Phase 14: Endpoint-Centric Aggregation ──────────────────────────────────
const SEVERITY_RANK = { CRITICAL: 4, HIGH: 3, MEDIUM: 2, LOW: 1 };

function buildEndpointMap(forensicResults) {
    const map = {};

    for (const r of forensicResults) {
        const allIssues = [...(r.forensicFailures || []), ...(r.forensicWarnings || [])];
        for (const issue of allIssues) {
            const meta = issue.metadata || {};
            const key = (meta.method && meta.path)
                ? `${meta.method} ${meta.path}`
                : "GLOBAL";

            if (!map[key]) map[key] = [];
            map[key].push({
                validator: r.npmScript,
                type: issue.type,
                severity: issue.severity,
                file: meta.file || null,
                line: meta.line || null,
                message: issue.message,
            });
        }
    }

    return map;
}

function buildEndpointSummary(endpointMap) {
    const summary = Object.entries(endpointMap).map(([endpoint, issues]) => {
        let highestRank = 0;
        let highestSeverity = "LOW";
        for (const issue of issues) {
            const rank = SEVERITY_RANK[issue.severity] || 0;
            if (rank > highestRank) {
                highestRank = rank;
                highestSeverity = issue.severity;
            }
        }
        return {
            endpoint,
            highestSeverity,
            issueCount: issues.length,
            _rank: highestRank,
        };
    });

    // Sort: highest severity first, then by issue count descending, then alphabetical path
    summary.sort((a, b) => b._rank - a._rank || b.issueCount - a.issueCount || a.endpoint.localeCompare(b.endpoint));

    // Remove internal _rank field
    return summary.map(({ _rank, ...rest }) => rest);
}

// ─── Report Rendering ────────────────────────────────────────────────────────
function renderReport(policy, results, dynamicIssues, scoreResult, overallStatus, delta, enforcementMode) {
    const isStrict = enforcementMode === "strict";
    const modeLabel = isStrict
        ? "ENTERPRISE ENFORCEMENT"
        : "SOLO DEVELOPER OPTIMIZED SCORING";

    const passed = results.filter(r => r.status === "PASSED").length;
    const failed = results.filter(r => r.status === "FAILED").length;
    const totalWarnings = isStrict ? 0 : results.reduce((acc, r) => acc + countWarningsInOutput(r.stdout), 0);

    console.log("");
    console.log("╔══════════════════════════════════════════════════════════════╗");
    console.log("║   GOVERNANCE ENGINE REPORT — Phase 13                      ║");
    console.log("╠══════════════════════════════════════════════════════════════╣");

    // Per-script breakdown
    for (const r of results) {
        const icon = r.status === "PASSED" ? "✅" : "❌";
        const name = r.npmScript.padEnd(35);
        const time = `${r.durationMs}ms`.padStart(8);
        console.log(`║  ${icon} ${name} ${time}  ║`);

        if (r.status === "FAILED" && r.stderr) {
            const shortErr = r.stderr.split("\n")[0].substring(0, 55);
            console.log(`║     └─ ${shortErr.padEnd(52)} ║`);
        }
    }

    // Dynamic enforcement issues
    if (dynamicIssues.length > 0) {
        console.log("╠══════════════════════════════════════════════════════════════╣");
        console.log("║  DYNAMIC ENFORCEMENT                                       ║");
        for (const issue of dynamicIssues) {
            const icon = issue.severity === "ERROR" ? "❌" : "⚠️ ";
            const msg = issue.message.substring(0, 53);
            console.log(`║  ${icon} ${msg.padEnd(55)} ║`);
        }
    }

    // Score breakdown
    console.log("╠══════════════════════════════════════════════════════════════╣");
    console.log("║  SCORE BREAKDOWN                                           ║");
    console.log(`║  Base Score:          ${String(scoreResult.baseScore).padEnd(38)}║`);
    console.log(`║  Warning Penalty:     ${String("-" + scoreResult.warningPenalty + " (" + scoreResult.config.warningPenalty + "/warn)").padEnd(38)}║`);
    console.log(`║  Failure Penalty:     ${String("-" + scoreResult.failurePenalty + " (" + scoreResult.config.failurePenalty + "/fail)").padEnd(38)}║`);
    console.log(`║  Final Score:         ${String(scoreResult.finalScore + " / 100").padEnd(38)}║`);

    // Delta
    if (delta) {
        console.log("╠══════════════════════════════════════════════════════════════╣");
        console.log("║  DELTA (vs previous run)                                   ║");
        console.log(`║  Score:               ${formatDelta(delta.scoreChange).padEnd(38)}║`);
        console.log(`║  Warnings:            ${formatDelta(delta.warningsChange).padEnd(38)}║`);
        console.log(`║  Failures:            ${formatDelta(delta.failuresChange).padEnd(38)}║`);
    }

    console.log("╠══════════════════════════════════════════════════════════════╣");
    console.log(`║  Policy Version:      ${policy.policyVersion.padEnd(38)}║`);
    console.log(`║  Scripts Executed:     ${String(results.length).padEnd(38)}║`);
    console.log(`║  Passed:              ${String(passed).padEnd(38)}║`);
    console.log(`║  Failed:              ${String(failed).padEnd(38)}║`);
    console.log(`║  Warnings:            ${String(totalWarnings).padEnd(38)}║`);
    console.log(`║  Enforcement Mode:    ${enforcementMode.padEnd(38)}║`);
    console.log(`║  Mode:                ${modeLabel.padEnd(38)}║`);
    console.log(`║  Governance Score:    ${String(scoreResult.finalScore + " / 100").padEnd(38)}║`);
    console.log(`║  Overall Status:      ${overallStatus.padEnd(38)}║`);
    console.log("╚══════════════════════════════════════════════════════════════╝");
    console.log("");
}

// ═════════════════════════════════════════════════════════════════════════════
//  MAIN EXECUTION
// ═════════════════════════════════════════════════════════════════════════════

console.log("");
console.log("╔══════════════════════════════════════════════════════════════╗");
console.log("║  UNIFIED GOVERNANCE ENGINE — Phase 13                      ║");
console.log("║  Forensic Governance + Score History + Delta Detection     ║");
console.log("╚══════════════════════════════════════════════════════════════╝");
console.log("");

// 1. Load and validate policy
console.log("  📋 Loading policy...");
const policy = loadPolicy();
console.log(`  ✅ Policy v${policy.policyVersion} loaded`);

// Resolve and Normalize Enforcement Level
const rawMode = process.env.GOVERNANCE_ENFORCEMENT || policy?.platformPlane?.ci?.enforcementLevel || 'lenient';
let enforcementMode = String(rawMode).trim().toLowerCase();

if (!['strict', 'lenient'].includes(enforcementMode)) {
    console.warn(`\n  ⚠️  [Governance] Unknown enforcement mode "${enforcementMode}" — defaulting to lenient`);
    enforcementMode = 'lenient';
}
const isStrict = enforcementMode === 'strict';

if (isStrict) {
    console.log('\n  🔒 STRICT GOVERNANCE MODE ACTIVE\n');
}
console.log("");

// 2. Resolve npm scripts
const pp = policy.platformPlane;
const scriptEntries = resolveNpmScripts(pp.ci.requiredScripts);
const unresolved = scriptEntries.filter(s => !s.resolved);

if (unresolved.length > 0) {
    console.log("  ⚠️  Unresolved scripts:");
    for (const u of unresolved) {
        console.log(`     - ${u.npmScript}: ${u.error}`);
    }
    console.log("");
}

console.log(`  🔧 Executing ${scriptEntries.length} governance validators...`);
console.log("");

// 3. Execute scripts
const results = [];
for (let i = 0; i < scriptEntries.length; i++) {
    const entry = scriptEntries[i];
    const label = `[${i + 1}/${scriptEntries.length}] ${entry.npmScript}`;
    process.stdout.write(`  ⏳ ${label}...`);

    const result = executeScript(entry);
    results.push(result);

    const icon = result.status === "PASSED" ? "✅" : "❌";
    process.stdout.write(`\r  ${icon} ${label} (${result.durationMs}ms)\n`);
}

console.log("");

// 4. Dynamic enforcement
console.log("  🔒 Applying dynamic enforcement rules...");
const dynamicIssues = applyDynamicEnforcement(policy, results);
if (dynamicIssues.length > 0) {
    for (const issue of dynamicIssues) {
        const icon = issue.severity === "ERROR" ? "❌" : "⚠️ ";
        console.log(`  ${icon} ${issue.message}`);
    }
} else {
    console.log("  ✅ All dynamic enforcement rules satisfied");
}

// 5. Extract forensic violations
console.log("  🔍 Extracting forensic violations...");
const rawForensicResults = results.map(r => {
    const forensics = extractForensicViolations(r.npmScript, r.stdout, r.stderr);
    return {
        ...r,
        forensicWarnings: forensics.warnings,
        forensicFailures: forensics.failures,
        classification: forensics.classification || null,
        retryMetadata: forensics.retryMetadata || null,
    };
});

// 5a. Strict Mode Escalation (Defensive)
if (isStrict) {
    for (let i = 0; i < rawForensicResults.length; i++) {
        const r = results[i];
        const forensic = rawForensicResults[i];

        const unstructuredWarnCount = countWarningsInOutput(r.stdout);
        const structuredWarnings = Array.isArray(forensic.forensicWarnings) ? forensic.forensicWarnings : [];
        const structuredWarnCount = structuredWarnings.length;

        // 1. Move structured warnings to failures
        if (structuredWarnCount > 0) {
            forensic.forensicFailures = [
                ...(Array.isArray(forensic.forensicFailures) ? forensic.forensicFailures : []),
                ...structuredWarnings.map(w => ({
                    ...w,
                    severity: w.severity || 'HIGH',
                    escalatedFromWarning: true
                }))
            ];
            forensic.forensicWarnings = [];
        }

        // 2. Handle remaining unstructured warnings (regex matches)
        if (unstructuredWarnCount > structuredWarnCount) {
            const diff = unstructuredWarnCount - structuredWarnCount;
            for (let d = 0; d < diff; d++) {
                forensic.forensicFailures = [
                    ...(Array.isArray(forensic.forensicFailures) ? forensic.forensicFailures : []),
                    {
                        type: "UNSTRUCTURED_WARNING",
                        severity: 'HIGH',
                        message: "Unstructured warning detected in output (escalated in strict mode)",
                        escalatedFromWarning: true
                    }
                ];
            }
        }
    }
}
const forensicResults = rawForensicResults;

// 5b. Aggregate Totals (Recompute after escalation)
const totalForensicWarnings = forensicResults.reduce((acc, r) => acc + (r.forensicWarnings?.length || 0), 0);
const totalForensicFailures = forensicResults.reduce((acc, r) => acc + (r.forensicFailures?.length || 0), 0);
const totalWarnings = isStrict ? 0 : results.reduce((acc, r) => acc + countWarningsInOutput(r.stdout), 0);

console.log(`  ✅ ${totalForensicWarnings} warnings, ${totalForensicFailures} failures catalogued`);

// 5c. Build endpoint-centric issue map (Phase 14)
console.log("  🔎 Building endpoint issue map...");
const issuesByEndpoint = buildEndpointMap(forensicResults);
const endpointSummary = buildEndpointSummary(issuesByEndpoint);
const criticalEndpoints = endpointSummary.filter(e => e.highestSeverity === "CRITICAL" || e.highestSeverity === "HIGH").length;
console.log(`  ✅ ${endpointSummary.length} endpoints mapped (${criticalEndpoints} critical/high)`);

// 6. Determine enforcement level and overall status
const blockOnFailure = policy.platformPlane.ci.blockOnFailure !== false;

const dynamicErrors = dynamicIssues.filter(i => i.severity === "ERROR").length;

// Phase 22: Separate transient vs functional failures for status determination
const transientValidators = forensicResults.filter(r =>
    r.classification === "INFRASTRUCTURE_UNAVAILABLE"
).map(r => r.npmScript);

const functionalFailures = results.filter(r =>
    r.status === "FAILED" && !transientValidators.includes(r.npmScript)
).length;

const scriptFailures = results.filter(r => r.status === "FAILED").length;

let overallStatus;
if (isStrict) {
    // Strict: ANY failure or ANY escalated warning blocks
    overallStatus = (scriptFailures > 0 || dynamicErrors > 0 || totalForensicFailures > 0) ? "FAILED" : "PASSED";
} else {
    // Lenient: Only functional failures block
    overallStatus = (blockOnFailure && (functionalFailures > 0 || dynamicErrors > 0)) ? "FAILED" : "PASSED";
}

// 7. Calculate score (policy-driven penalties)
const scoringConfig = resolveScoringConfig(policy);
const scoreResult = calculateScore(results, dynamicIssues, scoringConfig, forensicResults, enforcementMode);

// 8. Load history and compute delta
console.log("  📊 Computing delta...");
const history = loadHistory();
const currentHistoryEntry = {
    timestamp: new Date().toISOString(),
    score: scoreResult.finalScore,
    warnings: totalWarnings,
    failures: scriptFailures,
    overallStatus,
};
const delta = computeDelta(history, currentHistoryEntry);

if (delta) {
    const arrow = delta.scoreChange > 0 ? "↑" : delta.scoreChange < 0 ? "↓" : "→";
    console.log(`  ✅ Score ${arrow} ${formatDelta(delta.scoreChange)} (${scoreResult.finalScore}/100)`);
} else {
    console.log("  ℹ️  First run — no previous data for delta");
}

// 9. Render report
renderReport(policy, results, dynamicIssues, scoreResult, overallStatus, delta, enforcementMode);

// 10. Load previous endpoint keys for NEW badge detection
let previousEndpoints = [];
if (fs.existsSync(REPORT_PATH)) {
    try {
        const prevReport = JSON.parse(fs.readFileSync(REPORT_PATH, "utf8"));
        if (prevReport.endpointSummary) {
            previousEndpoints = prevReport.endpointSummary.map(e => e.endpoint);
        }
    } catch { /* ignore */ }
}

// 11. Write JSON report with forensic violations
const jsonReport = {
    policyVersion: policy.policyVersion,
    score: scoreResult.finalScore,
    passed: results.filter(r => r.status === "PASSED").length,
    failed: results.filter(r => r.status === "FAILED").length,
    warnings: totalWarnings,
    warningsCount: totalWarnings,
    enforcementMode,
    overallStatus,
    scoreBreakdown: {
        baseScore: scoreResult.baseScore,
        warningPenalty: scoreResult.warningPenalty,
        failurePenalty: scoreResult.failurePenalty,
        warningPenaltyPerItem: scoreResult.config.warningPenalty,
        failurePenaltyPerItem: scoreResult.config.failurePenalty,
    },
    delta,
    validators: forensicResults.map(r => ({
        name: r.npmScript,
        status: r.status,
        classification: r.classification || null,
        durationMs: r.durationMs,
        resultLine: extractResultLine(r.stdout) || r.status,
        warningCount: countWarningsInOutput(r.stdout),
        warnings: r.forensicWarnings,
        failures: r.forensicFailures,
        retryMetadata: r.retryMetadata || null,
    })),
    dynamicIssues: dynamicIssues.map(i => ({
        type: i.type,
        severity: i.severity,
        message: i.message,
    })),
    issuesByEndpoint,
    endpointSummary,
    previousEndpoints,
    timestamp: new Date().toISOString(),
    // Phase 23: Aggregated structured warning details
    warningDetails: forensicResults.reduce((acc, r) => {
        for (const w of (r.forensicWarnings || [])) {
            if (w.code) {
                acc.push({
                    validator: r.npmScript,
                    code: w.code,
                    message: w.message,
                    recommendation: w.recommendation || null,
                    severity: w.severity || "low",
                });
            }
        }
        return acc;
    }, []),
    // Phase 22: Operational Context snapshot
    operationalContext: {
        nodeVersion: process.version,
        platform: process.platform,
        env: process.env.NODE_ENV || "development",
        port: process.env.PORT || "5000",
        serverStartTime: new Date().toISOString(),
        serverUptimeSeconds: Math.round(process.uptime()),
    },
};

// Phase 17-20: Append operationalAudit if runtime validators executed
const runtimeResult = forensicResults.find(r => r.npmScript.includes("runtime-integrity"));
const authFlowResult = forensicResults.find(r => r.npmScript.includes("auth-flow"));
const envIntegrityResult = forensicResults.find(r => r.npmScript.includes("jwt-env-integrity"));

if (runtimeResult || authFlowResult || envIntegrityResult) {
    jsonReport.operationalAudit = {
        runtimeBaseUrl: process.env.RUNTIME_AUDIT_BASE_URL || "http://localhost:5000",
        runtimeIntegrity: runtimeResult ? runtimeResult.status : "SKIPPED",
        authSimulation: authFlowResult ? authFlowResult.status : "SKIPPED",
        envIntegrity: envIntegrityResult ? envIntegrityResult.status : "SKIPPED",
    };
}

// Phase 22: Strict mode — exit on CRITICAL runtime failures
// In strict mode, INFRASTRUCTURE_UNAVAILABLE still blocks deploy
if (enforcementMode === "strict") {
    const hasCriticalRuntime = forensicResults.some(r => {
        const isRuntime = ["runtime-integrity", "auth-flow", "auth-controller-integrity", "jwt-env-integrity", "jwt-secret-entropy", "environment-config", "platform-seed-integrity", "role-drift", "auth-model-alignment", "governance-self-integrity"]
            .some(v => r.npmScript.includes(v));
        if (!isRuntime) return false;
        return (r.forensicFailures || []).some(f => f.severity === "CRITICAL");
    });
    if (hasCriticalRuntime) {
        console.log("  🚨 STRICT MODE: Critical runtime failure detected. Aborting.");
        fs.writeFileSync(REPORT_PATH, JSON.stringify(jsonReport, null, 2), "utf8");
        process.exit(1);
    }
}

// Phase 22: Lenient mode — log transient skip info
if (enforcementMode !== "strict" && scoreResult.transientSkipped > 0) {
    console.log(`  ℹ️  Phase 22: ${scoreResult.transientSkipped} transient failure(s) skipped in scoring (INFRASTRUCTURE_UNAVAILABLE)`);
}

fs.writeFileSync(REPORT_PATH, JSON.stringify(jsonReport, null, 2), "utf8");
console.log(`  📄 Report written to: ${path.relative(BACKEND_ROOT, REPORT_PATH)}`);

// 12. Append to history
appendHistory(history, currentHistoryEntry);
console.log(`  📊 History updated: ${path.relative(BACKEND_ROOT, HISTORY_PATH)} (${Math.min(history.length + 1, HISTORY_MAX_ENTRIES)} entries)`);
console.log("");

// Phase 25-28: CI Enforcement Mode (GOVERNANCE_STRICT)
if (process.env.GOVERNANCE_STRICT === "true") {
    const functionalFailures = forensicResults.filter(r => {
        return r.classification === "FAILED_FUNCTIONAL";
    });
    if (functionalFailures.length > 0) {
        console.log(`  🚨 GOVERNANCE_STRICT: ${functionalFailures.length} FAILED_FUNCTIONAL — blocking CI`);
        functionalFailures.forEach(f => console.log(`     ❌ ${f.npmScript}`));
        process.exit(1);
    }
}

// 13. Exit
if (overallStatus === "FAILED") {
    process.exitCode = 1;
} else {
    process.exitCode = 0;
}
