require("module-alias/register");
/**
 * generateGovernanceDashboard.js
 * Phase 16.1: Prompt Sanitization & Classification Engine
 *
 * Reads governance-report.json + governance-history.json
 * Generates a single-file HTML dashboard with:
 *   - Score ring with delta badge
 *   - Score trend chart (pure canvas, zero deps)
 *   - Classification-aware batch Swagger Fix button
 *   - Endpoint Issue Map with Fix Issue / Fix Endpoint buttons
 *   - Deduplicated, classified prompt generation
 *   - Validator Results + Dynamic enforcement
 *
 * Usage: node scripts/generateGovernanceDashboard.js
 * No external dependencies.
 */

const fs = require("fs");
const path = require("path");

const REPORT_PATH = path.resolve(__dirname, "governance-report.json");
const HISTORY_PATH = path.resolve(__dirname, "../../..", "governance-history.json");
const OUTPUT_PATH = path.resolve(__dirname, "../../..", "governance-dashboard.html");

if (!fs.existsSync(REPORT_PATH)) {
    console.error("❌ governance-report.json not found.");
    console.error('   Run "npm run governance:run" first.');
    process.exit(1);
}

const report = JSON.parse(fs.readFileSync(REPORT_PATH, "utf8"));
const history = fs.existsSync(HISTORY_PATH) ? JSON.parse(fs.readFileSync(HISTORY_PATH, "utf8")) : [];

// ─── Helpers ─────────────────────────────────────────────────────────────────
function scoreColor(s) { return s >= 95 ? "#10b981" : s >= 80 ? "#f59e0b" : "#ef4444"; }
function statusBadge(s) { return s === "PASSED" ? '<span class="badge badge-pass">PASSED</span>' : '<span class="badge badge-fail">FAILED</span>'; }
function deltaArrow(d) {
    if (!d) return "";
    const s = d.scoreChange;
    if (s > 0) return `<span class="delta delta-up">▲ +${s}</span>`;
    if (s < 0) return `<span class="delta delta-down">▼ ${s}</span>`;
    return `<span class="delta delta-same">● 0</span>`;
}
function sevColor(s) { return s === "CRITICAL" ? "#ef4444" : s === "HIGH" ? "#f97316" : s === "MEDIUM" ? "#f59e0b" : "#94a3b8"; }
function sevBorderColor(s) { return s === "CRITICAL" ? "rgba(239,68,68,0.5)" : s === "HIGH" ? "rgba(249,115,22,0.5)" : s === "MEDIUM" ? "rgba(245,158,11,0.3)" : "rgba(148,163,184,0.2)"; }
function sevBgColor(s) { return s === "CRITICAL" ? "rgba(239,68,68,0.1)" : s === "HIGH" ? "rgba(249,115,22,0.1)" : s === "MEDIUM" ? "rgba(245,158,11,0.06)" : "rgba(148,163,184,0.06)"; }
function sevIcon(s) { return s === "CRITICAL" ? "🚨" : s === "HIGH" ? "🔴" : s === "MEDIUM" ? "🟡" : "🔵"; }
function esc(s) { return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;"); }

const color = scoreColor(report.score);
const ts = new Date(report.timestamp).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "medium" });
const sb = report.scoreBreakdown || { baseScore: 100, warningPenalty: 0, failurePenalty: 0, warningPenaltyPerItem: 2, failurePenaltyPerItem: 20 };
const historyData = JSON.stringify(history.map(h => ({ t: h.timestamp, s: h.score })));
const endpointSummary = report.endpointSummary || [];
const issuesByEndpoint = report.issuesByEndpoint || {};
const previousEndpointSet = new Set(report.previousEndpoints || []);

// ─── Phase 16.1: Classification-aware batch safety ──────────────────────────
// Classify at build time for batch button rendering
function classifyIssue(issue) {
    if (issue.type === "undocumented_route") return "documentation";
    if (issue.type === "extra_swagger_key" || issue.type === "missing_swagger_key" || issue.type === "UNDOCUMENTED_KEY") return "contract";
    if (issue.type === "dynamic_response" || issue.type === "unresolved_handler" || issue.type === "no_success_response") return "analyzer";
    return "other";
}

const allIssuesFlat = Object.values(issuesByEndpoint).flat();
const hasCriticalOrHigh = endpointSummary.some(e => e.highestSeverity === "CRITICAL" || e.highestSeverity === "HIGH");
const hasNonDocIssues = allIssuesFlat.some(i => classifyIssue(i) !== "documentation");

// Deduplicate issues for batch counting
const deduped = new Map();
allIssuesFlat.forEach(i => {
    const key = `${i.type}|${i.file || ""}|${i.line || ""}|${i.message || ""}`;
    if (!deduped.has(key)) deduped.set(key, i);
});
const uniqueDocIssues = [...deduped.values()].filter(i => classifyIssue(i) === "documentation");

// Batch is ONLY safe if: no CRITICAL/HIGH, no structural issues, and doc issues exist
const batchSwaggerSafe = !hasCriticalOrHigh && !hasNonDocIssues && uniqueDocIssues.length > 0;
// Batch available but blocked (show disabled button with tooltip)
const batchAvailableBlocked = uniqueDocIssues.length > 0 && !batchSwaggerSafe;
const batchBlockReason = hasCriticalOrHigh
    ? "Batch mode disabled — CRITICAL/HIGH severity issues exist"
    : hasNonDocIssues
        ? "Batch mode disabled — structural issues (contract/analyzer) exist"
        : "";

// ─── Validator Sections ──────────────────────────────────────────────────────
const validatorSections = (report.validators || []).map((v, idx) => {
    const icon = v.status === "PASSED" ? "✅" : "❌";
    const cls = v.status === "PASSED" ? "status-pass" : "status-fail";
    const warns = Array.isArray(v.warnings) ? v.warnings : [];
    const fails = Array.isArray(v.failures) ? v.failures : [];
    const all = [...fails, ...warns];
    const has = all.length > 0;
    let rows = "";
    if (has) {
        rows = all.map(i => {
            const sc = sevColor(i.severity);
            const m = i.metadata || {};
            const parts = [];
            if (m.method) parts.push(m.method);
            if (m.path) parts.push(m.path);
            if (m.file) parts.push(m.file + (m.line ? ":" + m.line : ""));
            const meta = parts.length > 0 ? `<span class="violation-meta">${esc(parts.join(" "))}</span>` : "";
            return `<tr><td style="color:${sc};font-weight:600;font-size:0.7rem">${esc(i.severity)}</td><td><span class="violation-type">${esc(i.type)}</span></td><td>${esc(i.message)}${meta}</td></tr>`;
        }).join("");
    }
    const exp = has ? `<div class="expandable" id="v-exp-${idx}"><table class="violation-table"><tbody>${rows}</tbody></table></div>` : "";
    const btn = has ? `<button class="expand-btn" onclick="toggle('v-exp-${idx}')">${all.length} issues ▾</button>` : '<span style="color:#64748b;font-size:0.75rem">No issues</span>';
    return `<tr><td>${icon}</td><td class="script-name">${esc(v.name)}</td><td class="${cls}">${v.status}</td><td class="num">${v.warningCount || 0}</td><td class="num">${v.durationMs}ms</td><td>${btn}</td></tr>${has ? `<tr class="expandable-container"><td colspan="6">${exp}</td></tr>` : ""}`;
}).join("");

// ─── Endpoint Issue Map ──────────────────────────────────────────────────────
const endpointSections = endpointSummary.map((ep, idx) => {
    const issues = issuesByEndpoint[ep.endpoint] || [];
    const sc = sevColor(ep.highestSeverity);
    const borderC = sevBorderColor(ep.highestSeverity);
    const bgC = sevBgColor(ep.highestSeverity);
    const icon = sevIcon(ep.highestSeverity);
    const isCritical = ep.highestSeverity === "CRITICAL";
    const isNew = previousEndpointSet.size > 0 && !previousEndpointSet.has(ep.endpoint);
    const parts = ep.endpoint.split(" ");
    const method = parts[0] || "";
    const epPath = parts.slice(1).join(" ");

    const issueRows = issues.map((issue, iidx) => {
        const isc = sevColor(issue.severity);
        const fl = issue.file ? `${esc(issue.file)}${issue.line ? ":" + issue.line : ""}` : "";
        return `<tr>
            <td style="color:${isc};font-size:0.65rem;font-weight:600">${esc(issue.severity)}</td>
            <td class="violation-type">${esc(issue.type)}</td>
            <td style="font-size:0.75rem">${esc(issue.message)}</td>
            <td style="color:#64748b;font-size:0.7rem;font-family:monospace">${esc(issue.validator.replace("validate:", ""))}</td>
            <td style="color:#64748b;font-size:0.7rem;font-family:monospace">${fl}</td>
            <td><button class="fix-btn" onclick="fixIssue(${idx},${iidx})" title="Generate fix prompt for this issue">Fix</button></td>
        </tr>`;
    }).join("");

    return `<div class="ep-card" style="border-color:${borderC};background:${bgC}" ${isCritical ? 'data-critical="true"' : ""}>
        <div class="ep-header" onclick="toggle('ep-${idx}')">
            <span class="ep-icon">${icon}</span>
            <span class="ep-method" style="color:${sc}">${method}</span>
            <span class="ep-path">${esc(epPath)}</span>
            <span class="ep-badge" style="background:${borderC};color:${sc}">${ep.highestSeverity}</span>
            <span class="ep-count">${ep.issueCount} issue${ep.issueCount !== 1 ? "s" : ""}${isNew ? ' <span class="new-badge">NEW</span>' : ""}</span>
            <button class="fix-ep-btn" onclick="event.stopPropagation();fixEndpoint(${idx})" title="Generate fix prompt for all issues on this endpoint">Fix Endpoint</button>
            <span class="ep-toggle">▾</span>
        </div>
        <div class="expandable" id="ep-${idx}">
            <table class="violation-table ep-table"><thead><tr><th>Sev</th><th>Type</th><th>Message</th><th>Validator</th><th>File</th><th></th></tr></thead><tbody>${issueRows}</tbody></table>
        </div>
    </div>`;
}).join("");

// ─── Dynamic Enforcement ─────────────────────────────────────────────────────
const dynamicRows = report.dynamicIssues.length > 0
    ? report.dynamicIssues.map(i => {
        const icon = i.severity === "ERROR" ? "❌" : "⚠️";
        return `<tr><td>${icon}</td><td class="severity-${i.severity.toLowerCase()}">${i.severity}</td><td>${esc(i.type)}</td><td colspan="3">${esc(i.message)}</td></tr>`;
    }).join("")
    : '<tr><td colspan="6" class="no-issues">✅ All dynamic enforcement rules satisfied</td></tr>';

// ─── Batch button (Phase 16.1 hardened) ──────────────────────────────────────
const batchBtn = batchSwaggerSafe
    ? `<button class="batch-btn" onclick="fixBatchSwagger()">📋 Fix All Swagger Issues (${uniqueDocIssues.length} unique)</button>`
    : batchAvailableBlocked
        ? `<button class="batch-btn batch-disabled" disabled title="${esc(batchBlockReason)}">📋 Fix All Swagger Issues (blocked)</button>`
        : "";

// ─── Phase 19: Dynamic Dual-Plane Classification Engine ─────────────────────
function classifyPlane(routePath) {
    if (!routePath) return "platform";
    const p = routePath.split(" ").pop() || routePath;
    if (p.startsWith("/api/platform")) return "platform";
    return "organization";
}

function classifyLayerFromIssue(issue) {
    const v = issue.validator || "";
    const t = (issue.type || "").toLowerCase();
    // Validator-based classification
    if (v === "validate:capability-invariants") return "rbac";
    if (v === "validate:response-schema") return "controller";
    if (v === "validate:cross-plane-isolation") return "api"; // isolation violations show in api layer
    // Type-based classification — cross-plane isolation types
    if (t.includes("platform_imports_org") || t.includes("org_imports_platform") || t.includes("route_prefix_mismatch")) return "api";
    if (t.includes("org_uses_platform_capability")) return "rbac";
    if (t.includes("capability") || t.includes("guard") || t.includes("permission")) return "rbac";
    if (t.includes("dynamic_response") || t.includes("unresolved_handler") || t.includes("no_success_response")) return "controller";
    if (t.includes("schema") && t.includes("drift")) return "controller";
    if (t.includes("undocumented_route") || t.includes("orphan_swagger") || t.includes("unregistered_mount")) return "api";
    if (t.includes("swagger") || t.includes("undocumented_key") || t.includes("extra_swagger_key") || t.includes("missing_swagger_key")) return "api";
    if (t.includes("auth") || t.includes("token") || t.includes("login")) return "auth";
    if (t.includes("database") || t.includes("model") || t.includes("schema_error")) return "database";
    // Fallback to api-integrity or api
    if (v === "validate:api-integrity" || v === "validate:swagger-drift") return "api";
    return "api";
}

const LAYER_ORDER = ["auth", "rbac", "api", "controller", "database"];
const sevRank = { CRITICAL: 4, HIGH: 3, MEDIUM: 2, LOW: 1 };

// Build dual-plane aggregation dynamically
const planeHealth = { platform: {}, organization: {} };
LAYER_ORDER.forEach(l => {
    planeHealth.platform[l] = { issues: 0, highest: null, sevs: {}, endpoints: new Set() };
    planeHealth.organization[l] = { issues: 0, highest: null, sevs: {}, endpoints: new Set() };
});

// Aggregate from issuesByEndpoint
Object.entries(issuesByEndpoint).forEach(([ep, issues]) => {
    const plane = classifyPlane(ep);
    issues.forEach(i => {
        const layer = classifyLayerFromIssue(i);
        // Auto-create layer if new
        if (!planeHealth[plane]) planeHealth[plane] = {};
        if (!planeHealth[plane][layer]) {
            planeHealth[plane][layer] = { issues: 0, highest: null, sevs: {}, endpoints: new Set() };
        }
        const node = planeHealth[plane][layer];
        node.issues++;
        node.sevs[i.severity] = (node.sevs[i.severity] || 0) + 1;
        node.endpoints.add(ep);
        if (!node.highest || (sevRank[i.severity] || 0) > (sevRank[node.highest] || 0)) {
            node.highest = i.severity;
        }
    });
});

// Convert endpoint Sets to counts + top endpoints for JSON serialization
const planeHealthJson = {};
Object.entries(planeHealth).forEach(([plane, layers]) => {
    planeHealthJson[plane] = {};
    Object.entries(layers).forEach(([layer, data]) => {
        // Rank endpoints by issue count for tooltip top-3
        const epCounts = {};
        Object.entries(issuesByEndpoint).forEach(([ep, iss]) => {
            if (classifyPlane(ep) !== plane) return;
            const layerIssues = iss.filter(i => classifyLayerFromIssue(i) === layer);
            if (layerIssues.length > 0) epCounts[ep] = layerIssues.length;
        });
        const topEndpoints = Object.entries(epCounts)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 3)
            .map(([ep, cnt]) => ({ endpoint: ep, count: cnt }));
        planeHealthJson[plane][layer] = {
            issues: data.issues,
            highest: data.highest,
            sevs: data.sevs,
            endpoints: data.endpoints.size || 0,
            topEndpoints,
        };
    });
});

// Boundary health: detect cross-plane contract + isolation issues
let boundaryStatus = "healthy";
const contractTypes = ["extra_swagger_key", "missing_swagger_key", "undocumented_key", "UNDOCUMENTED_KEY", "capability_mismatch"];
const isolationTypes = ["platform_imports_org", "org_imports_platform", "org_uses_platform_capability", "route_prefix_mismatch"];
const platformIssueTypes = new Set();
const orgIssueTypes = new Set();
let isolationHighCount = 0;
let isolationMedCount = 0;
Object.entries(issuesByEndpoint).forEach(([ep, issues]) => {
    const plane = classifyPlane(ep);
    issues.forEach(i => {
        if (contractTypes.includes(i.type)) {
            if (plane === "platform") platformIssueTypes.add(i.type);
            else orgIssueTypes.add(i.type);
        }
        if (isolationTypes.includes(i.type)) {
            if (i.severity === "HIGH") isolationHighCount++;
            else isolationMedCount++;
        }
    });
});
// If contract issues exist in either plane → boundary warning
if (platformIssueTypes.size > 0 || orgIssueTypes.size > 0) boundaryStatus = "warning";
// If isolation issues exist → escalate
if (isolationMedCount > 0 && boundaryStatus === "healthy") boundaryStatus = "warning";
// If HIGH isolation violations or both-plane contract issues → critical
if (isolationHighCount > 0) boundaryStatus = "critical";
if (platformIssueTypes.size > 0 && orgIssueTypes.size > 0) boundaryStatus = "critical";

// Auto-discover severity levels present in report
const detectedSeverities = new Set();
allIssuesFlat.forEach(i => detectedSeverities.add(i.severity));

// Detect all layer IDs actually used (for auto-expansion)
const detectedLayers = new Set(LAYER_ORDER);
Object.values(planeHealth).forEach(layers => {
    Object.keys(layers).forEach(l => detectedLayers.add(l));
});
const orderedLayers = [...detectedLayers].sort((a, b) => {
    const idx = LAYER_ORDER.indexOf(a) !== -1 ? LAYER_ORDER.indexOf(a) : 99;
    const idy = LAYER_ORDER.indexOf(b) !== -1 ? LAYER_ORDER.indexOf(b) : 99;
    return idx - idy;
});

// ─── Embed report data for JS prompt generation ─────────────────────────────
const reportJson = JSON.stringify({
    endpointSummary,
    issuesByEndpoint,
    planeHealth: planeHealthJson,
    boundaryStatus,
    detectedSeverities: [...detectedSeverities],
    orderedLayers,
    score: report.score,
    policyVersion: report.policyVersion,
    enforcementLevel: report.enforcementLevel,
    validatorResults: (report.validators || []).map(v => ({ name: v.name, status: v.status })),
    warningDetails: report.warningDetails || [],
}).replace(/</g, "\\x3c").replace(/>/g, "\\x3e");

// ─── HTML ────────────────────────────────────────────────────────────────────
const html = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>DentalSaaS — Governance Dashboard</title>
    <style>
        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
        body { font-family: 'Segoe UI', system-ui, -apple-system, sans-serif; background: #0f172a; color: #e2e8f0; min-height: 100vh; padding: 2rem; }
        .container { max-width: 1020px; margin: 0 auto; }
        .header { text-align: center; margin-bottom: 1.5rem; }
        .header h1 { font-size: 1.3rem; font-weight: 600; color: #94a3b8; letter-spacing: 0.05em; text-transform: uppercase; margin-bottom: 0.15rem; }
        .header .subtitle { font-size: 0.75rem; color: #64748b; }
        .score-section { display: flex; justify-content: center; align-items: center; gap: 2rem; margin-bottom: 1.5rem; flex-wrap: wrap; }
        .score-ring { position: relative; width: 150px; height: 150px; }
        .score-ring svg { transform: rotate(-90deg); }
        .score-ring .track { fill: none; stroke: #1e293b; stroke-width: 10; }
        .score-ring .progress { fill: none; stroke: ${color}; stroke-width: 10; stroke-linecap: round; stroke-dasharray: ${2 * Math.PI * 60}; stroke-dashoffset: ${2 * Math.PI * 60 * (1 - report.score / 100)}; transition: stroke-dashoffset 1s ease; }
        .score-ring .label { position: absolute; inset: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; }
        .score-ring .value { font-size: 2.2rem; font-weight: 700; color: ${color}; line-height: 1; }
        .score-ring .caption { font-size: 0.6rem; color: #64748b; text-transform: uppercase; letter-spacing: 0.1em; margin-top: 0.15rem; }
        .delta { display: inline-block; padding: 0.1rem 0.4rem; border-radius: 5px; font-size: 0.7rem; font-weight: 700; margin-top: 0.2rem; }
        .delta-up { background: rgba(16,185,129,0.15); color: #10b981; }
        .delta-down { background: rgba(239,68,68,0.15); color: #ef4444; }
        .delta-same { background: rgba(148,163,184,0.15); color: #94a3b8; }
        .chart-section { margin-bottom: 1.5rem; }
        .chart-wrap { background: #1e293b; border: 1px solid #334155; border-radius: 10px; padding: 0.75rem; }
        canvas { width: 100% !important; height: 120px !important; display: block; }
        .summary { display: grid; grid-template-columns: repeat(4, 1fr); gap: 0.6rem; margin-bottom: 1.25rem; }
        .card { background: #1e293b; border: 1px solid #334155; border-radius: 8px; padding: 0.8rem; text-align: center; }
        .card .card-value { font-size: 1.5rem; font-weight: 700; line-height: 1.2; }
        .card .card-label { font-size: 0.65rem; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.05em; margin-top: 0.2rem; }
        .card-pass .card-value { color: #10b981; }
        .card-fail .card-value { color: #ef4444; }
        .card-warn .card-value { color: #f59e0b; }
        .card-mode .card-value { color: #8b5cf6; font-size: 0.9rem; }
        .section-title { font-size: 0.75rem; font-weight: 600; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.08em; margin-bottom: 0.4rem; padding-left: 0.15rem; display: flex; align-items: center; gap: 0.5rem; }
        .section-subtitle { font-size: 0.6rem; color: #64748b; text-transform: none; letter-spacing: 0; }
        .table-wrap { background: #1e293b; border: 1px solid #334155; border-radius: 8px; overflow: hidden; margin-bottom: 1.25rem; }
        table { width: 100%; border-collapse: collapse; }
        th { background: #0f172a; font-size: 0.6rem; font-weight: 600; color: #64748b; text-transform: uppercase; letter-spacing: 0.06em; padding: 0.5rem 0.6rem; text-align: left; border-bottom: 1px solid #334155; }
        td { padding: 0.4rem 0.6rem; font-size: 0.75rem; border-bottom: 1px solid rgba(51,65,85,0.4); }
        tr:last-child td { border-bottom: none; }
        .script-name { font-family: 'Cascadia Code','Fira Code',monospace; color: #93c5fd; font-size: 0.7rem; }
        .num { text-align: center; color: #94a3b8; }
        .status-pass { color: #10b981; font-weight: 600; }
        .status-fail { color: #ef4444; font-weight: 600; }
        .severity-error { color: #ef4444; font-weight: 600; }
        .severity-warning { color: #f59e0b; font-weight: 600; }
        .no-issues { text-align: center; color: #10b981; padding: 0.6rem !important; }
        .expandable { display: none; padding: 0; }
        .expandable.open { display: block; }
        .expandable-container td { padding: 0 !important; border-bottom: 1px solid rgba(51,65,85,0.4); }
        .expand-btn { background: rgba(99,102,241,0.15); border: 1px solid rgba(99,102,241,0.3); color: #818cf8; padding: 0.12rem 0.4rem; border-radius: 5px; font-size: 0.65rem; cursor: pointer; font-family: inherit; }
        .expand-btn:hover { background: rgba(99,102,241,0.25); }
        .violation-table { width: 100%; background: #0f172a; }
        .violation-table td { font-size: 0.7rem; padding: 0.3rem 0.6rem; border-bottom: 1px solid rgba(51,65,85,0.3); }
        .violation-type { font-family: monospace; color: #fbbf24; font-size: 0.65rem; background: rgba(251,191,36,0.1); padding: 0.05rem 0.3rem; border-radius: 3px; }
        .violation-meta { display: block; font-size: 0.6rem; color: #64748b; margin-top: 0.1rem; font-family: monospace; }
        .ep-grid { display: flex; flex-direction: column; gap: 0.4rem; margin-bottom: 1.25rem; }
        .ep-card { border: 1px solid #334155; border-radius: 8px; border-left: 3px solid; overflow: hidden; transition: border-color 0.2s; }
        .ep-card[data-critical="true"] { animation: pulse-border 2s infinite; }
        @keyframes pulse-border { 0%,100% { border-left-color: rgba(239,68,68,0.5); } 50% { border-left-color: rgba(239,68,68,1); } }
        .ep-header { display: flex; align-items: center; gap: 0.5rem; padding: 0.5rem 0.7rem; cursor: pointer; user-select: none; }
        .ep-header:hover { background: rgba(255,255,255,0.02); }
        .ep-icon { font-size: 0.8rem; }
        .ep-method { font-family: monospace; font-weight: 700; font-size: 0.7rem; min-width: 44px; }
        .ep-path { font-family: monospace; font-size: 0.7rem; color: #93c5fd; flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .ep-badge { font-size: 0.55rem; font-weight: 700; padding: 0.08rem 0.35rem; border-radius: 3px; letter-spacing: 0.03em; }
        .ep-count { font-size: 0.65rem; color: #64748b; white-space: nowrap; }
        .ep-toggle { font-size: 0.7rem; color: #64748b; transition: transform 0.2s; }
        .ep-table td { font-size: 0.68rem; }
        .ep-table th { font-size: 0.55rem; padding: 0.3rem 0.6rem; }
        .new-badge { background: rgba(16,185,129,0.2); color: #10b981; font-size: 0.55rem; font-weight: 700; padding: 0.05rem 0.3rem; border-radius: 3px; letter-spacing: 0.03em; vertical-align: middle; }
        .badge { display: inline-block; padding: 0.12rem 0.5rem; border-radius: 999px; font-size: 0.6rem; font-weight: 700; letter-spacing: 0.06em; text-transform: uppercase; }
        .badge-pass { background: rgba(16,185,129,0.15); color: #10b981; border: 1px solid rgba(16,185,129,0.3); }
        .badge-fail { background: rgba(239,68,68,0.15); color: #ef4444; border: 1px solid rgba(239,68,68,0.3); }
        .overall-status { display: flex; justify-content: center; margin-bottom: 1.25rem; }
        .overall-status .badge { font-size: 0.75rem; padding: 0.3rem 1rem; }
        .footer { text-align: center; font-size: 0.65rem; color: #475569; margin-top: 0.5rem; padding-top: 0.5rem; border-top: 1px solid #1e293b; }
        .fix-btn { background: rgba(99,102,241,0.1); border: 1px solid rgba(99,102,241,0.25); color: #a5b4fc; padding: 0.08rem 0.35rem; border-radius: 4px; font-size: 0.58rem; cursor: pointer; font-family: inherit; transition: all 0.15s; }
        .fix-btn:hover { background: rgba(99,102,241,0.25); color: #c7d2fe; }
        .fix-ep-btn { background: rgba(139,92,246,0.12); border: 1px solid rgba(139,92,246,0.3); color: #c4b5fd; padding: 0.1rem 0.4rem; border-radius: 4px; font-size: 0.58rem; cursor: pointer; font-family: inherit; white-space: nowrap; transition: all 0.15s; }
        .fix-ep-btn:hover { background: rgba(139,92,246,0.25); color: #ddd6fe; }
        .batch-btn { background: rgba(16,185,129,0.1); border: 1px solid rgba(16,185,129,0.3); color: #6ee7b7; padding: 0.35rem 0.8rem; border-radius: 6px; font-size: 0.7rem; cursor: pointer; font-family: inherit; font-weight: 600; transition: all 0.15s; }
        .batch-btn:hover { background: rgba(16,185,129,0.2); }
        .batch-disabled { opacity: 0.4; cursor: not-allowed; }
        .batch-wrap { display: flex; justify-content: flex-end; margin-bottom: 0.5rem; }
        .toast { position: fixed; bottom: 1.5rem; left: 50%; transform: translateX(-50%) translateY(80px); background: #1e293b; border: 1px solid #334155; color: #10b981; padding: 0.5rem 1.2rem; border-radius: 8px; font-size: 0.75rem; font-weight: 600; z-index: 999; opacity: 0; transition: all 0.3s ease; pointer-events: none; box-shadow: 0 4px 20px rgba(0,0,0,0.3); }
        .toast.show { opacity: 1; transform: translateX(-50%) translateY(0); }
        /* ─── Phase 23: Warning Intelligence ─── */
        .wi-panel { background: #1e293b; border: 1px solid #334155; border-radius: 8px; padding: 0.8rem; margin-bottom: 1.25rem; }
        .wi-summary { display: flex; gap: 0.6rem; margin-bottom: 0.6rem; }
        .wi-sev-count { display: flex; align-items: center; gap: 0.3rem; font-size: 0.68rem; color: #94a3b8; }
        .wi-sev-dot { width: 8px; height: 8px; border-radius: 50%; display: inline-block; }
        .wi-sev-dot-high { background: #dc2626; }
        .wi-sev-dot-medium { background: #f59e0b; }
        .wi-sev-dot-low { background: #3b82f6; }
        .wi-item { background: #0f172a; border: 1px solid #334155; border-radius: 6px; padding: 0.5rem 0.7rem; margin-bottom: 0.35rem; cursor: pointer; transition: border-color 0.2s; }
        .wi-item:hover { border-color: #475569; }
        .wi-item-header { display: flex; align-items: center; gap: 0.5rem; }
        .wi-code { font-family: 'Cascadia Code','Fira Code',monospace; font-size: 0.68rem; font-weight: 600; }
        .wi-validator { font-size: 0.6rem; color: #64748b; margin-left: auto; }
        .wi-message { font-size: 0.68rem; color: #94a3b8; margin-top: 0.3rem; }
        .wi-recommendation { font-size: 0.65rem; color: #6ee7b7; margin-top: 0.25rem; padding-left: 0.5rem; border-left: 2px solid rgba(16,185,129,0.3); display: none; }
        .wi-item.expanded .wi-recommendation { display: block; }
        .badge-sev { display: inline-block; padding: 0.05rem 0.35rem; border-radius: 3px; font-size: 0.55rem; font-weight: 700; letter-spacing: 0.03em; text-transform: uppercase; }
        .badge-sev-high { background: rgba(220,38,38,0.15); color: #ef4444; border: 1px solid rgba(220,38,38,0.3); }
        .badge-sev-medium { background: rgba(245,158,11,0.15); color: #f59e0b; border: 1px solid rgba(245,158,11,0.3); }
        .badge-sev-low { background: rgba(59,130,246,0.15); color: #60a5fa; border: 1px solid rgba(59,130,246,0.3); }
        .wi-empty { text-align: center; color: #10b981; font-size: 0.72rem; padding: 0.6rem; }
        /* ─── Tab System ─── */
        .tab-bar { display: flex; gap: 0; margin-bottom: 1.25rem; border-bottom: 1px solid #334155; }
        .tab-btn { background: none; border: none; color: #64748b; font-family: inherit; font-size: 0.72rem; font-weight: 600; padding: 0.55rem 1rem; cursor: pointer; border-bottom: 2px solid transparent; text-transform: uppercase; letter-spacing: 0.06em; transition: all 0.2s; }
        .tab-btn:hover { color: #94a3b8; background: rgba(255,255,255,0.02); }
        .tab-btn.active { color: #818cf8; border-bottom-color: #818cf8; }
        .tab-panel { display: none; }
        .tab-panel.active { display: block; }
        /* ─── Architecture Map ─── */
        .arch-wrap { background: #0b1220; border: 1px solid #1a2742; border-radius: 10px; padding: 0; overflow: hidden; margin-bottom: 1.25rem; position: relative; }
        .arch-wrap svg text { font-family: 'Segoe UI', system-ui, sans-serif; }
        .arch-tooltip { position: absolute; background: #131d33; border: 1px solid #2a3b55; border-radius: 6px; padding: 0.5rem 0.7rem; color: #cde6ff; font-size: 0.68rem; pointer-events: none; opacity: 0; transition: opacity 0.2s; z-index: 10; max-width: 220px; box-shadow: 0 4px 20px rgba(0,0,0,0.5); }
        .arch-tooltip .tt-title { font-weight: 700; font-size: 0.72rem; margin-bottom: 0.25rem; }
        .arch-tooltip .tt-row { display: flex; justify-content: space-between; gap: 0.8rem; }
        .arch-tooltip .tt-label { color: #64748b; }
        .arch-tooltip .tt-val { font-weight: 600; }
        @keyframes node-pulse { 0%,100%{ opacity: 0.6; } 50%{ opacity: 1; } }
        @keyframes glow-pulse { 0%,100%{ filter: url(#glow); } 50%{ filter: url(#glow-strong); } }
        /* ─── Governance Matrix Heatmap ─── */
        .matrix-wrap { background: #0b1220; border: 1px solid #1a2742; border-radius: 10px; padding: 1.5rem; margin-bottom: 1.25rem; position: relative; overflow: hidden; }
        .matrix-wrap::before { content: ''; position: absolute; inset: 0; background: repeating-linear-gradient(0deg, transparent, transparent 39px, rgba(26,39,66,0.3) 39px, rgba(26,39,66,0.3) 40px), repeating-linear-gradient(90deg, transparent, transparent 39px, rgba(26,39,66,0.3) 39px, rgba(26,39,66,0.3) 40px); pointer-events: none; z-index: 0; }
        .matrix-title { font-size: 0.85rem; font-weight: 700; color: #818cf8; text-transform: uppercase; letter-spacing: 0.1em; margin-bottom: 1rem; position: relative; z-index: 1; display: flex; align-items: center; gap: 0.5rem; }
        .matrix-title::before { content: '▣'; font-size: 1rem; }
        .matrix-grid { display: grid; gap: 2px; position: relative; z-index: 1; }
        .matrix-header { background: rgba(30,41,59,0.8); color: #94a3b8; font-size: 0.65rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.08em; padding: 0.6rem 0.5rem; text-align: center; border: 1px solid rgba(51,65,85,0.3); border-radius: 4px; }
        .matrix-row-label { background: rgba(30,41,59,0.6); color: #c4b5fd; font-size: 0.7rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.06em; padding: 0.8rem 0.7rem; display: flex; align-items: center; gap: 0.4rem; border: 1px solid rgba(51,65,85,0.3); border-radius: 4px; }
        .matrix-cell { padding: 0.7rem 0.5rem; text-align: center; border-radius: 6px; cursor: pointer; transition: all 0.25s ease; border: 1px solid transparent; position: relative; min-height: 70px; display: flex; flex-direction: column; align-items: center; justify-content: center; }
        .matrix-cell:hover { transform: scale(1.05); z-index: 2; box-shadow: 0 0 20px rgba(0,0,0,0.5); }
        .matrix-cell .cell-count { font-size: 1.5rem; font-weight: 800; line-height: 1; }
        .matrix-cell .cell-sev { font-size: 0.55rem; font-weight: 600; text-transform: uppercase; letter-spacing: 0.08em; margin-top: 0.3rem; opacity: 0.85; }
        .matrix-cell-none { background: rgba(16,185,129,0.08); border-color: rgba(16,185,129,0.2); }
        .matrix-cell-none .cell-count { color: #10b981; }
        .matrix-cell-none .cell-sev { color: #059669; }
        .matrix-cell-low { background: rgba(163,230,53,0.1); border-color: rgba(163,230,53,0.25); }
        .matrix-cell-low .cell-count { color: #a3e635; }
        .matrix-cell-low .cell-sev { color: #84cc16; }
        .matrix-cell-medium { background: rgba(245,158,11,0.12); border-color: rgba(245,158,11,0.3); }
        .matrix-cell-medium .cell-count { color: #f59e0b; }
        .matrix-cell-medium .cell-sev { color: #d97706; }
        .matrix-cell-high { background: rgba(239,68,68,0.12); border-color: rgba(239,68,68,0.35); animation: matrix-glow-high 2.5s ease-in-out infinite; }
        .matrix-cell-high .cell-count { color: #ef4444; }
        .matrix-cell-high .cell-sev { color: #dc2626; }
        .matrix-cell-critical { background: rgba(220,38,38,0.18); border-color: rgba(220,38,38,0.5); animation: matrix-glow-critical 1.8s ease-in-out infinite; }
        .matrix-cell-critical .cell-count { color: #fca5a5; }
        .matrix-cell-critical .cell-sev { color: #ef4444; }
        @keyframes matrix-glow-high { 0%,100% { box-shadow: 0 0 8px rgba(239,68,68,0.15); } 50% { box-shadow: 0 0 18px rgba(239,68,68,0.35); } }
        @keyframes matrix-glow-critical { 0%,100% { box-shadow: 0 0 12px rgba(220,38,38,0.2); } 50% { box-shadow: 0 0 28px rgba(220,38,38,0.5); } }
        .matrix-tooltip { position: absolute; background: #131d33; border: 1px solid #2a3b55; border-radius: 6px; padding: 0.6rem 0.8rem; color: #cde6ff; font-size: 0.68rem; pointer-events: none; opacity: 0; transition: opacity 0.2s; z-index: 20; min-width: 200px; box-shadow: 0 4px 24px rgba(0,0,0,0.6); }
        .matrix-tooltip.show { opacity: 1; }
        .matrix-tooltip .mtt-title { font-weight: 700; font-size: 0.72rem; margin-bottom: 0.35rem; color: #e0e7ff; }
        .matrix-tooltip .mtt-row { display: flex; justify-content: space-between; gap: 1rem; padding: 0.1rem 0; }
        .matrix-tooltip .mtt-label { color: #64748b; }
        .matrix-tooltip .mtt-val { font-weight: 600; }
        .matrix-tooltip .mtt-divider { border-top: 1px solid rgba(51,65,85,0.5); margin: 0.3rem 0; }
        .matrix-tooltip .mtt-ep { color: #94a3b8; font-size: 0.62rem; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 220px; }
        .matrix-legend { display: flex; gap: 0.8rem; margin-top: 1rem; justify-content: center; flex-wrap: wrap; position: relative; z-index: 1; }
        .matrix-legend-item { display: flex; align-items: center; gap: 0.3rem; font-size: 0.6rem; color: #64748b; }
        .matrix-legend-swatch { width: 12px; height: 12px; border-radius: 3px; border: 1px solid rgba(255,255,255,0.1); }
        @media (max-width: 640px) {
            .summary { grid-template-columns: repeat(2, 1fr); }
            body { padding: 1rem; }
            .score-section { flex-direction: column; align-items: center; }
            .tab-btn { font-size: 0.6rem; padding: 0.4rem 0.6rem; }
            .matrix-grid { font-size: 0.6rem; }
            .matrix-cell .cell-count { font-size: 1.1rem; }
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>🛡 Governance Dashboard</h1>
            <div class="subtitle">DentalSaaS — Platform Plane Governance Remediation Orchestrator</div>
        </div>

        <div class="overall-status">${statusBadge(report.overallStatus)}</div>

        <div class="score-section">
            <div class="score-ring">
                <svg width="150" height="150" viewBox="0 0 150 150">
                    <circle class="track" cx="75" cy="75" r="60"/>
                    <circle class="progress" cx="75" cy="75" r="60"/>
                </svg>
                <div class="label">
                    <span class="value">${report.score}</span>
                    <span class="caption">Gov Score</span>
                    ${deltaArrow(report.delta)}
                </div>
            </div>
        </div>

        <div class="section-title">Score Trend</div>
        <div class="chart-section">
            <div class="chart-wrap"><canvas id="trendChart"></canvas></div>
        </div>

        <div class="summary">
            <div class="card card-pass"><div class="card-value">${report.passed}</div><div class="card-label">Passed</div></div>
            <div class="card card-fail"><div class="card-value">${report.failed}</div><div class="card-label">Failed</div></div>
            <div class="card card-warn"><div class="card-value">${report.warnings}</div><div class="card-label">Warnings</div></div>
            <div class="card card-mode"><div class="card-value">${report.enforcementLevel}</div><div class="card-label">Enforcement</div></div>
        </div>

        <div class="tab-bar">
            <button class="tab-btn active" onclick="switchTab('overview')">Overview</button>
            <button class="tab-btn" onclick="switchTab('issues')">Issues</button>
            <button class="tab-btn" onclick="switchTab('forensics')">Forensics</button>
            <button class="tab-btn" onclick="switchTab('archmap')">Architecture Map</button>
            <button class="tab-btn" onclick="switchTab('matrix')">Governance Matrix</button>
        </div>

        <!-- ═══ TAB: Overview ═══ -->
        <div class="tab-panel active" id="tab-overview">
        <div class="section-title">Score Breakdown</div>
        <div class="table-wrap">
            <table><tbody>
                <tr><td>Base Score</td><td class="num status-pass">${sb.baseScore}</td></tr>
                <tr><td>Warning Penalty <span style="color:#64748b;font-size:0.65rem">(${sb.warningPenaltyPerItem}/warn)</span></td><td class="num" style="color:#f59e0b">-${sb.warningPenalty}</td></tr>
                <tr><td>Failure Penalty <span style="color:#64748b;font-size:0.65rem">(${sb.failurePenaltyPerItem}/fail)</span></td><td class="num" style="color:#ef4444">-${sb.failurePenalty}</td></tr>
                <tr style="border-top:1px solid #334155"><td style="font-weight:700">Final Score</td><td class="num" style="color:${color};font-weight:700;font-size:0.95rem">${report.score}</td></tr>
            </tbody></table>
        </div>

        <div class="section-title">Validator Results <span class="section-subtitle">(click to expand)</span></div>
        <div class="table-wrap">
            <table>
                <thead><tr><th style="width:24px"></th><th>Script</th><th>Status</th><th>Warns</th><th>Time</th><th>Details</th></tr></thead>
                <tbody>${validatorSections}</tbody>
            </table>
        </div>

        <div class="section-title">Dynamic Enforcement</div>
        <div class="table-wrap">
            <table>
                <thead><tr><th style="width:24px"></th><th>Severity</th><th>Type</th><th colspan="3">Message</th></tr></thead>
                <tbody>${dynamicRows}</tbody>
            </table>
        </div>

        <div class="section-title">⚡ Warning Intelligence <span class="section-subtitle">(Phase 23 — click to expand)</span></div>
        <div id="wi-panel-overview" class="wi-panel">
            <div class="wi-empty">Loading warning intelligence...</div>
        </div>
        </div>

        <!-- ═══ TAB: Issues ═══ -->
        <div class="tab-panel" id="tab-issues">
        <div class="section-title">🔎 Endpoint Issue Map <span class="section-subtitle">(${endpointSummary.length} endpoints, sorted by severity)</span></div>
        ${batchBtn ? `<div class="batch-wrap">${batchBtn}</div>` : ""}
        <div class="ep-grid">
            ${endpointSections.length > 0 ? endpointSections : '<div style="text-align:center;color:#64748b;padding:1rem;background:#1e293b;border:1px solid #334155;border-radius:8px">✅ No endpoint issues detected.</div>'}
        </div>
        </div>

        <!-- ═══ TAB: Forensics ═══ -->
        <div class="tab-panel" id="tab-forensics">
        <div class="section-title">Score Breakdown</div>
        <div class="table-wrap">
            <table><tbody>
                <tr><td>Base Score</td><td class="num status-pass">${sb.baseScore}</td></tr>
                <tr><td>Warning Penalty</td><td class="num" style="color:#f59e0b">-${sb.warningPenalty}</td></tr>
                <tr><td>Failure Penalty</td><td class="num" style="color:#ef4444">-${sb.failurePenalty}</td></tr>
                <tr style="border-top:1px solid #334155"><td style="font-weight:700">Final</td><td class="num" style="color:${color};font-weight:700">${report.score}</td></tr>
            </tbody></table>
        </div>
        <div class="section-title">Validator Results <span class="section-subtitle">(click to expand)</span></div>
        <div class="table-wrap">
            <table>
                <thead><tr><th style="width:24px"></th><th>Script</th><th>Status</th><th>Warns</th><th>Time</th><th>Details</th></tr></thead>
                <tbody>${validatorSections}</tbody>
            </table>
        </div>
        <div class="section-title">Dynamic Enforcement</div>
        <div class="table-wrap">
            <table>
                <thead><tr><th style="width:24px"></th><th>Severity</th><th>Type</th><th colspan="3">Message</th></tr></thead>
                <tbody>${dynamicRows}</tbody>
            </table>
        </div>
        </div>

        <!-- ═══ TAB: Architecture Map ═══ -->
        <div class="tab-panel" id="tab-archmap">
        <div class="arch-wrap" id="arch-container">
            <div class="arch-tooltip" id="arch-tt"></div>
            <svg id="arch-svg" width="100%" height="700" viewBox="0 0 1200 700" xmlns="http://www.w3.org/2000/svg">
                <defs>
                    <filter id="glow"><feGaussianBlur stdDeviation="3" result="cb"/><feMerge><feMergeNode in="cb"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
                    <filter id="glow-strong"><feGaussianBlur stdDeviation="6" result="cb"/><feMerge><feMergeNode in="cb"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
                    <linearGradient id="conn-grad" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#2a3b55" stop-opacity="0.8"/><stop offset="100%" stop-color="#2a3b55" stop-opacity="0.2"/></linearGradient>
                    <pattern id="grid" width="40" height="40" patternUnits="userSpaceOnUse"><path d="M 40 0 L 0 0 0 40" fill="none" stroke="#131d33" stroke-width="0.5"/></pattern>
                </defs>
                <!-- Grid background -->
                <rect width="1200" height="700" fill="#0b1220"/>
                <rect width="1200" height="700" fill="url(#grid)"/>
                <!-- Title -->
                <text x="600" y="32" text-anchor="middle" fill="#4a6080" font-size="11" font-weight="600" letter-spacing="3">PLATFORM ARCHITECTURE — GOVERNANCE OVERLAY</text>
                <!-- Score HUD -->
                <circle cx="1140" cy="50" r="28" fill="none" stroke="${color}" stroke-width="2.5" filter="url(#glow)" opacity="0.8"/>
                <text x="1140" y="55" text-anchor="middle" fill="${color}" font-size="18" font-weight="700">${report.score}</text>
                <text x="1140" y="85" text-anchor="middle" fill="#4a6080" font-size="8" letter-spacing="1">GOV SCORE</text>
            </svg>
        </div>
        </div>

        <!-- ═══ TAB: Governance Matrix ═══ -->
        <div class="tab-panel" id="tab-matrix">
        <div class="matrix-wrap" id="matrix-container">
            <div class="matrix-title">Severity Heatmap — Plane × Layer</div>
            <div class="matrix-grid" id="matrix-grid"></div>
            <div class="matrix-legend" id="matrix-legend"></div>
            <div class="matrix-tooltip" id="matrix-tt"></div>
        </div>
        </div>

        <div class="footer">
            <span style="color:${report.enforcementLevel === "strict" ? "#ef4444" : "#8b5cf6"};font-weight:600">${report.enforcementLevel === "strict" ? "ENTERPRISE STRICT" : "SOLO DEVELOPER OPTIMIZED"}</span> &middot;
            <span>Policy v${report.policyVersion}</span> &middot;
            Generated ${ts}
        </div>
    </div>

    <div class="toast" id="toast">✅ Prompt copied to clipboard</div>

    <script>
    // ── Report data ──
    const R = ${reportJson};

    function toggle(id) {
        const el = document.getElementById(id);
        if (el) el.classList.toggle('open');
    }

    // ── Phase 23: Warning Intelligence Renderer ──
    function renderWarningIntelligence(containerId) {
        const panel = document.getElementById(containerId);
        if (!panel) return;
        const details = R.warningDetails || [];

        if (details.length === 0) {
            panel.innerHTML = '<div class="wi-empty">✅ No structured warnings — all validators clean</div>';
            return;
        }

        const high = details.filter(d => d.severity === 'high').length;
        const medium = details.filter(d => d.severity === 'medium').length;
        const low = details.filter(d => d.severity === 'low').length;

        let html = '<div class="wi-summary">';
        if (high > 0) html += '<div class="wi-sev-count"><span class="wi-sev-dot wi-sev-dot-high"></span>High: ' + high + '</div>';
        if (medium > 0) html += '<div class="wi-sev-count"><span class="wi-sev-dot wi-sev-dot-medium"></span>Medium: ' + medium + '</div>';
        if (low > 0) html += '<div class="wi-sev-count"><span class="wi-sev-dot wi-sev-dot-low"></span>Low: ' + low + '</div>';
        html += '</div>';

        const sevOrder = { high: 0, medium: 1, low: 2 };
        const sorted = [...details].sort((a, b) => (sevOrder[a.severity] || 3) - (sevOrder[b.severity] || 3));

        sorted.forEach((w) => {
            const badgeClass = 'badge-sev badge-sev-' + (w.severity || 'low');
            html += '<div class="wi-item">';
            html += '<div class="wi-item-header">';
            html += '<span class="' + badgeClass + '">' + (w.severity || 'low') + '</span>';
            html += '<span class="wi-code">' + (w.code || 'UNKNOWN') + '</span>';
            html += '<span class="wi-validator">' + (w.validator || '').replace('validate:', '') + '</span>';
            html += '</div>';
            html += '<div class="wi-message">' + (w.message || '') + '</div>';
            if (w.recommendation) {
                html += '<div class="wi-recommendation">→ ' + w.recommendation + '</div>';
            }
            html += '</div>';
        });

        panel.innerHTML = html;
        // Delegated click for expand/collapse
        panel.addEventListener('click', function(e) {
            var item = e.target.closest('.wi-item');
            if (item) item.classList.toggle('expanded');
        });
    }
    renderWarningIntelligence('wi-panel-overview');

    // ── Tab System ──
    function switchTab(tabId) {
        document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
        document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
        const panel = document.getElementById('tab-' + tabId);
        if (panel) panel.classList.add('active');
        event.target.classList.add('active');
        if (tabId === 'archmap') renderArchitectureMap();
        if (tabId === 'matrix') renderGovernanceMatrix();
    }

    // ── Governance Matrix (Severity Heatmap) ──
    let matrixRendered = false;
    function renderGovernanceMatrix() {
        if (matrixRendered) return;
        matrixRendered = true;

        const PH = R.planeHealth || {};
        const layers = R.orderedLayers || [];
        const planes = ['platform', 'organization'];
        const planeIcons = { platform: '🔷', organization: '🏢' };
        const sevRank = { CRITICAL: 4, HIGH: 3, MEDIUM: 2, LOW: 1 };
        const sevLabels = ['NONE', 'LOW', 'MEDIUM', 'HIGH', 'CRITICAL'];

        const grid = document.getElementById('matrix-grid');
        const tt = document.getElementById('matrix-tt');
        const legend = document.getElementById('matrix-legend');
        if (!grid) return;

        // Set grid columns: row-label + layer columns
        const cols = layers.length + 1;
        grid.style.gridTemplateColumns = '140px ' + layers.map(() => '1fr').join(' ');

        // Corner cell
        const corner = document.createElement('div');
        corner.className = 'matrix-header';
        corner.textContent = 'Plane \\ Layer';
        corner.style.background = 'rgba(15,23,42,0.9)';
        grid.appendChild(corner);

        // Layer headers
        layers.forEach(layer => {
            const hdr = document.createElement('div');
            hdr.className = 'matrix-header';
            hdr.textContent = layer;
            grid.appendChild(hdr);
        });

        // Rows
        planes.forEach(plane => {
            // Row label
            const rowLabel = document.createElement('div');
            rowLabel.className = 'matrix-row-label';
            rowLabel.innerHTML = (planeIcons[plane] || '📦') + ' ' + plane;
            grid.appendChild(rowLabel);

            // Cells
            layers.forEach(layer => {
                const data = (PH[plane] || {})[layer] || { issues: 0, highest: null, sevs: {}, topEndpoints: [] };
                const sev = data.highest || 'NONE';
                const cellClass = 'matrix-cell matrix-cell-' + sev.toLowerCase();

                const cell = document.createElement('div');
                cell.className = cellClass;
                cell.setAttribute('data-plane', plane);
                cell.setAttribute('data-layer', layer);
                cell.innerHTML = '<div class="cell-count">' + data.issues + '</div><div class="cell-sev">' + sev + '</div>';

                // Tooltip on hover
                cell.addEventListener('mouseenter', function(e) {
                    const sevBreakdown = Object.entries(data.sevs || {}).sort((a,b) => (sevRank[b[0]]||0) - (sevRank[a[0]]||0))
                        .map(([s,c]) => '<div class="mtt-row"><span class="mtt-label">' + s + '</span><span class="mtt-val">' + c + '</span></div>').join('');
                    const epList = (data.topEndpoints || []).map(ep => '<div class="mtt-ep">• ' + ep.endpoint + ' (' + ep.count + ')</div>').join('');
                    tt.innerHTML = '<div class="mtt-title">' + plane.toUpperCase() + ' → ' + layer.toUpperCase() + '</div>'
                        + '<div class="mtt-row"><span class="mtt-label">Total</span><span class="mtt-val">' + data.issues + '</span></div>'
                        + '<div class="mtt-row"><span class="mtt-label">Endpoints</span><span class="mtt-val">' + (data.endpoints || 0) + '</span></div>'
                        + (sevBreakdown ? '<div class="mtt-divider"></div>' + sevBreakdown : '')
                        + (epList ? '<div class="mtt-divider"></div><div style="color:#64748b;font-size:0.58rem;margin-bottom:0.15rem">TOP CONTRIBUTORS</div>' + epList : '');
                    const rect = cell.getBoundingClientRect();
                    const wrap = document.getElementById('matrix-container').getBoundingClientRect();
                    tt.style.left = (rect.left - wrap.left + rect.width / 2 - 100) + 'px';
                    tt.style.top = (rect.bottom - wrap.top + 8) + 'px';
                    tt.classList.add('show');
                });
                cell.addEventListener('mouseleave', function() { tt.classList.remove('show'); });

                // Click → switch to Issues tab with filter
                cell.addEventListener('click', function() {
                    const targetPlane = this.getAttribute('data-plane');
                    const targetLayer = this.getAttribute('data-layer');
                    // Switch to issues tab
                    document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
                    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
                    const issuesPanel = document.getElementById('tab-issues');
                    if (issuesPanel) issuesPanel.classList.add('active');
                    document.querySelectorAll('.tab-btn').forEach(b => { if (b.textContent.trim() === 'Issues') b.classList.add('active'); });
                    // Filter endpoint cards
                    filterIssuesByMatrix(targetPlane, targetLayer);
                });

                grid.appendChild(cell);
            });
        });

        // Legend
        const legendItems = [
            { label: 'None', color: 'rgba(16,185,129,0.25)' },
            { label: 'Low', color: 'rgba(163,230,53,0.3)' },
            { label: 'Medium', color: 'rgba(245,158,11,0.3)' },
            { label: 'High', color: 'rgba(239,68,68,0.3)' },
            { label: 'Critical', color: 'rgba(220,38,38,0.4)' }
        ];
        legendItems.forEach(item => {
            const el = document.createElement('div');
            el.className = 'matrix-legend-item';
            el.innerHTML = '<div class="matrix-legend-swatch" style="background:' + item.color + '"></div>' + item.label;
            legend.appendChild(el);
        });
    }

    // ── Matrix → Issues filter ──
    function filterIssuesByMatrix(plane, layer) {
        const cards = document.querySelectorAll('.ep-card');
        let anyVisible = false;
        cards.forEach(card => {
            const headerEl = card.querySelector('.ep-header .ep-route');
            if (!headerEl) { card.style.display = ''; return; }
            const route = headerEl.textContent || '';
            // Classify plane from route
            const p = route.split(' ').pop() || route;
            const cardPlane = p.startsWith('/api/platform') ? 'platform' : 'organization';
            if (cardPlane !== plane) { card.style.display = 'none'; return; }
            // Check if card has issues in this layer (check issue types in expanded table)
            const issueRows = card.querySelectorAll('.ep-table tbody tr');
            let hasMatchingIssue = false;
            issueRows.forEach(row => {
                const typeCell = row.querySelector('td:nth-child(2)');
                const validatorCell = row.querySelector('td:nth-child(4)');
                if (!typeCell) return;
                const type = (typeCell.textContent || '').toLowerCase();
                const validator = (validatorCell ? validatorCell.textContent : '').toLowerCase();
                // Replicate classifyLayerFromIssue logic client-side
                let issueLayer = 'api';
                if (validator.includes('capability-invariants')) issueLayer = 'rbac';
                else if (validator.includes('response-schema')) issueLayer = 'controller';
                else if (validator.includes('cross-plane-isolation')) issueLayer = 'api';
                else if (type.includes('capability') || type.includes('guard') || type.includes('permission') || type.includes('org_uses_platform_capability')) issueLayer = 'rbac';
                else if (type.includes('dynamic_response') || type.includes('unresolved_handler') || type.includes('no_success_response')) issueLayer = 'controller';
                else if (type.includes('auth') || type.includes('token') || type.includes('login')) issueLayer = 'auth';
                else if (type.includes('database') || type.includes('model') || type.includes('schema_error')) issueLayer = 'database';
                if (issueLayer === layer) hasMatchingIssue = true;
            });
            if (hasMatchingIssue) { card.style.display = ''; anyVisible = true; }
            else { card.style.display = 'none'; }
        });
        // Show reset filter banner
        let banner = document.getElementById('matrix-filter-banner');
        if (!banner) {
            banner = document.createElement('div');
            banner.id = 'matrix-filter-banner';
            banner.style.cssText = 'background:rgba(129,140,248,0.1);border:1px solid rgba(129,140,248,0.3);border-radius:6px;padding:0.5rem 0.8rem;margin-bottom:0.75rem;display:flex;justify-content:space-between;align-items:center;font-size:0.72rem;color:#818cf8;';
            const issuesPanel = document.getElementById('tab-issues');
            if (issuesPanel) issuesPanel.insertBefore(banner, issuesPanel.firstChild);
        }
        banner.innerHTML = '🔍 Filtered: <strong>' + plane.toUpperCase() + ' → ' + layer.toUpperCase() + '</strong> <button onclick="clearMatrixFilter()" style="background:none;border:1px solid #818cf8;color:#818cf8;border-radius:4px;padding:0.2rem 0.6rem;cursor:pointer;font-size:0.65rem;">Clear Filter</button>';
        banner.style.display = 'flex';
    }
    function clearMatrixFilter() {
        document.querySelectorAll('.ep-card').forEach(card => card.style.display = '');
        const banner = document.getElementById('matrix-filter-banner');
        if (banner) banner.style.display = 'none';
    }

// ── Architecture Map (Phase 19: Dynamic Dual-Plane) ──
let archRendered = false;
function renderArchitectureMap() {
    if (archRendered) return;
    archRendered = true;
    const svg = document.getElementById('arch-svg');
    if (!svg) return;
    const PH = R.planeHealth || {};
    const layers = R.orderedLayers || ['auth', 'rbac', 'api', 'controller', 'database'];
    const ns = 'http://www.w3.org/2000/svg';

    function nodeColor(node) {
        if (!node || node.issues === 0) return '#00ff88';
        if (node.highest === 'CRITICAL') return '#ff3b3b';
        if (node.highest === 'HIGH') return '#ff6b35';
        if (node.highest === 'MEDIUM') return '#ffb020';
        return '#00ff88';
    }
    function boundaryColor(status) {
        if (status === 'critical') return '#ff3b3b';
        if (status === 'warning') return '#ffb020';
        return '#00ff88';
    }
    const layerLabels = {
        auth: '🔐 AUTH', rbac: '🛡 RBAC', api: '🌐 API ROUTES',
        controller: '⚙ CONTROLLERS', database: '🗄 DATABASE',
    };
    function layerLabel(l) { return layerLabels[l] || ('📦 ' + l.toUpperCase()); }

    const planeX = 340, nodeW = 420, nodeH = 42, gap = 8;
    const govX = 50, govW = 200, govH = 220;
    const planeNames = ['platform', 'organization'];
    let curY = 55;

    planeNames.forEach((plane, pi) => {
        const planeData = PH[plane] || {};
        const activeLayers = layers.filter(l => planeData[l]);
        const planeH = activeLayers.length * (nodeH + gap) + 50;

        const bg = document.createElementNS(ns, 'rect');
        bg.setAttribute('x', planeX - 20); bg.setAttribute('y', curY - 10);
        bg.setAttribute('width', nodeW + 40); bg.setAttribute('height', planeH);
        bg.setAttribute('rx', '8'); bg.setAttribute('fill', plane === 'platform' ? 'rgba(99,102,241,0.04)' : 'rgba(16,185,129,0.04)');
        bg.setAttribute('stroke', plane === 'platform' ? 'rgba(99,102,241,0.15)' : 'rgba(16,185,129,0.15)');
        bg.setAttribute('stroke-width', '1');
        svg.appendChild(bg);

        const pLabel = document.createElementNS(ns, 'text');
        pLabel.setAttribute('x', planeX + nodeW / 2); pLabel.setAttribute('y', curY + 8);
        pLabel.setAttribute('text-anchor', 'middle');
        pLabel.setAttribute('fill', plane === 'platform' ? '#818cf8' : '#6ee7b7');
        pLabel.setAttribute('font-size', '10'); pLabel.setAttribute('font-weight', '700');
        pLabel.setAttribute('letter-spacing', '3');
        pLabel.textContent = (plane === 'platform' ? '▲ PLATFORM PLANE' : '▼ ORGANIZATION PLANE');
        svg.appendChild(pLabel);

        let nodeY = curY + 28;
        activeLayers.forEach((layer, li) => {
            const node = planeData[layer] || { issues: 0, highest: null, sevs: {}, endpoints: 0 };
            const c = nodeColor(node);
            const hasIssues = node.issues > 0;
            const g = document.createElementNS(ns, 'g');
            g.setAttribute('cursor', 'pointer');

            const rect = document.createElementNS(ns, 'rect');
            rect.setAttribute('x', planeX); rect.setAttribute('y', nodeY);
            rect.setAttribute('width', nodeW); rect.setAttribute('height', nodeH);
            rect.setAttribute('rx', '5');
            rect.setAttribute('fill', c + '15');
            rect.setAttribute('stroke', c);
            rect.setAttribute('stroke-width', hasIssues ? '1.5' : '0.6');
            if (hasIssues) rect.setAttribute('filter', 'url(#glow)');
            if (node.highest === 'CRITICAL' || node.highest === 'HIGH') {
                const a = document.createElementNS(ns, 'animate');
                a.setAttribute('attributeName', 'opacity');
                a.setAttribute('values', '0.6;1;0.6');
                a.setAttribute('dur', '2s');
                a.setAttribute('repeatCount', 'indefinite');
                rect.appendChild(a);
            }
            g.appendChild(rect);

            const txt = document.createElementNS(ns, 'text');
            txt.setAttribute('x', planeX + 14); txt.setAttribute('y', nodeY + nodeH / 2 + 1);
            txt.setAttribute('fill', '#cde6ff'); txt.setAttribute('font-size', '10');
            txt.setAttribute('font-weight', '600'); txt.setAttribute('letter-spacing', '1');
            txt.textContent = layerLabel(layer);
            g.appendChild(txt);

            if (hasIssues) {
                const badge = document.createElementNS(ns, 'text');
                badge.setAttribute('x', planeX + nodeW - 14); badge.setAttribute('y', nodeY + nodeH / 2 + 1);
                badge.setAttribute('text-anchor', 'end');
                badge.setAttribute('fill', c); badge.setAttribute('font-size', '9');
                badge.setAttribute('font-weight', '700');
                badge.textContent = node.issues + ' issue' + (node.issues !== 1 ? 's' : '') + ' · ' + node.endpoints + ' ep';
                g.appendChild(badge);
            }

            if (li < activeLayers.length - 1) {
                const line = document.createElementNS(ns, 'line');
                line.setAttribute('x1', planeX + nodeW / 2); line.setAttribute('y1', nodeY + nodeH);
                line.setAttribute('x2', planeX + nodeW / 2); line.setAttribute('y2', nodeY + nodeH + gap);
                line.setAttribute('stroke', '#2a3b55'); line.setAttribute('stroke-width', '1');
                line.setAttribute('stroke-dasharray', '4,3'); line.setAttribute('opacity', '0.5');
                svg.appendChild(line);
            }

            const tooltip = document.getElementById('arch-tt');
            const container = document.getElementById('arch-container');
            g.addEventListener('mouseenter', (e) => {
                g.style.filter = 'url(#glow-strong)';
                const sevE = Object.entries(node.sevs).map(([k, v]) => '<div class="tt-row"><span class="tt-label">' + k + '</span><span class="tt-val">' + v + '</span></div>').join('');
                tooltip.innerHTML = '<div class="tt-title">' + layerLabel(layer) + ' (' + plane + ')</div>' +
                    '<div class="tt-row"><span class="tt-label">Issues</span><span class="tt-val">' + node.issues + '</span></div>' +
                    '<div class="tt-row"><span class="tt-label">Endpoints</span><span class="tt-val">' + node.endpoints + '</span></div>' +
                    (sevE || '<div class="tt-row"><span class="tt-val" style="color:#00ff88">✅ Clean</span></div>');
                const cr = container.getBoundingClientRect();
                tooltip.style.left = (e.clientX - cr.left + 12) + 'px';
                tooltip.style.top = (e.clientY - cr.top - 10) + 'px';
                tooltip.style.opacity = '1';
            });
            g.addEventListener('mouseleave', () => { g.style.filter = ''; tooltip.style.opacity = '0'; });
            g.addEventListener('click', () => { filterAndSwitchToIssues(plane); });
            svg.appendChild(g);
            nodeY += nodeH + gap;
        });
        curY += planeH + 10;

        if (pi === 0) {
            const bc = boundaryColor(R.boundaryStatus || 'healthy');
            const bY = curY;
            const bRect = document.createElementNS(ns, 'rect');
            bRect.setAttribute('x', planeX - 20); bRect.setAttribute('y', bY);
            bRect.setAttribute('width', nodeW + 40); bRect.setAttribute('height', 32);
            bRect.setAttribute('rx', '4');
            bRect.setAttribute('fill', bc + '12');
            bRect.setAttribute('stroke', bc); bRect.setAttribute('stroke-width', '1');
            bRect.setAttribute('stroke-dasharray', '8,4');
            if (R.boundaryStatus === 'warning' || R.boundaryStatus === 'critical') {
                bRect.setAttribute('filter', 'url(#glow)');
            }
            svg.appendChild(bRect);
            const bt = document.createElementNS(ns, 'text');
            bt.setAttribute('x', planeX + nodeW / 2); bt.setAttribute('y', bY + 20);
            bt.setAttribute('text-anchor', 'middle');
            bt.setAttribute('fill', bc); bt.setAttribute('font-size', '9');
            bt.setAttribute('font-weight', '600'); bt.setAttribute('letter-spacing', '2');
            bt.textContent = '── TENANT BOUNDARY / ISOLATION ──';
            svg.appendChild(bt);
            curY += 42;
        }
    });

    const govY = 90;
    const govG = document.createElementNS(ns, 'g');
    govG.setAttribute('cursor', 'pointer');
    const govR = document.createElementNS(ns, 'rect');
    const sc = R.score >= 95 ? '#00ff88' : R.score >= 80 ? '#ffb020' : '#ff3b3b';
    govR.setAttribute('x', govX); govR.setAttribute('y', govY);
    govR.setAttribute('width', govW); govR.setAttribute('height', govH);
    govR.setAttribute('rx', '10');
    govR.setAttribute('fill', sc + '10');
    govR.setAttribute('stroke', sc); govR.setAttribute('stroke-width', '1.2');
    govR.setAttribute('filter', 'url(#glow)');
    govG.appendChild(govR);

    const gt = document.createElementNS(ns, 'text');
    gt.setAttribute('x', govX + govW / 2); gt.setAttribute('y', govY + 22);
    gt.setAttribute('text-anchor', 'middle'); gt.setAttribute('fill', '#cde6ff');
    gt.setAttribute('font-size', '10'); gt.setAttribute('font-weight', '700');
    gt.setAttribute('letter-spacing', '1.5');
    gt.textContent = '📊 GOVERNANCE ENGINE';
    govG.appendChild(gt);

    const gs = document.createElementNS(ns, 'text');
    gs.setAttribute('x', govX + govW / 2); gs.setAttribute('y', govY + 65);
    gs.setAttribute('text-anchor', 'middle'); gs.setAttribute('fill', sc);
    gs.setAttribute('font-size', '30'); gs.setAttribute('font-weight', '700');
    gs.setAttribute('filter', 'url(#glow)');
    gs.textContent = R.score;
    govG.appendChild(gs);

    const gl = document.createElementNS(ns, 'text');
    gl.setAttribute('x', govX + govW / 2); gl.setAttribute('y', govY + 85);
    gl.setAttribute('text-anchor', 'middle'); gl.setAttribute('fill', '#4a6080');
    gl.setAttribute('font-size', '8'); gl.setAttribute('letter-spacing', '2');
    gl.textContent = 'GOV SCORE';
    govG.appendChild(gl);

    const vResults = R.validatorResults || [];
    vResults.forEach((v, vi) => {
        const vt = document.createElementNS(ns, 'text');
        vt.setAttribute('x', govX + govW / 2); vt.setAttribute('y', govY + 110 + vi * 16);
        vt.setAttribute('text-anchor', 'middle');
        vt.setAttribute('fill', v.status === 'PASSED' ? '#00ff88' : '#ff3b3b');
        vt.setAttribute('font-size', '8'); vt.setAttribute('font-weight', '600');
        vt.textContent = (v.status === 'PASSED' ? '✅' : '❌') + ' ' + v.name.replace('validate:', '');
        govG.appendChild(vt);
    });

    const eml = document.createElementNS(ns, 'text');
    eml.setAttribute('x', govX + govW / 2); eml.setAttribute('y', govY + govH - 12);
    eml.setAttribute('text-anchor', 'middle'); eml.setAttribute('fill', '#4a6080');
    eml.setAttribute('font-size', '7'); eml.setAttribute('letter-spacing', '1.5');
    eml.textContent = (R.enforcementLevel || 'lenient').toUpperCase() + ' MODE';
    govG.appendChild(eml);
    svg.appendChild(govG);

    planeNames.forEach((plane, pi) => {
        const targetY = pi === 0 ? 120 : 420;
        const line = document.createElementNS(ns, 'line');
        line.setAttribute('x1', govX + govW); line.setAttribute('y1', govY + govH / 2);
        line.setAttribute('x2', planeX - 20); line.setAttribute('y2', targetY);
        line.setAttribute('stroke', '#1a2742'); line.setAttribute('stroke-width', '0.8');
        line.setAttribute('stroke-dasharray', '3,6'); line.setAttribute('opacity', '0.4');
        svg.appendChild(line);
    });

    const sevColors = { CRITICAL: '#ff3b3b', HIGH: '#ff6b35', MEDIUM: '#ffb020', LOW: '#94a3b8' };
    const legendSevs = R.detectedSeverities || [];
    const legendItems = [{ color: '#00ff88', label: 'Healthy (no issues)' }];
    ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'].forEach(s => {
        if (legendSevs.includes(s)) legendItems.push({ color: sevColors[s], label: s });
    });
    legendItems.forEach((item, i) => {
        const lx = govX, ly = govY + govH + 30 + i * 20;
        const c2 = document.createElementNS(ns, 'circle');
        c2.setAttribute('cx', lx + 6); c2.setAttribute('cy', ly);
        c2.setAttribute('r', '4'); c2.setAttribute('fill', item.color);
        c2.setAttribute('filter', 'url(#glow)');
        svg.appendChild(c2);
        const lt = document.createElementNS(ns, 'text');
        lt.setAttribute('x', lx + 16); lt.setAttribute('y', ly + 3.5);
        lt.setAttribute('fill', '#4a6080'); lt.setAttribute('font-size', '9');
        lt.textContent = item.label;
        svg.appendChild(lt);
    });

    const totalH = Math.max(curY + 30, govY + govH + 30 + legendItems.length * 20 + 20, 700);
    svg.setAttribute('height', totalH);
    svg.setAttribute('viewBox', '0 0 1200 ' + totalH);
}

function filterAndSwitchToIssues(plane) {
    switchTabDirect('issues');
    document.querySelectorAll('.ep-card').forEach(card => {
        const header = card.querySelector('.ep-path');
        if (!header) return;
        const path = header.textContent;
        const cardPlane = path.startsWith('/api/platform') ? 'platform' : 'organization';
        card.style.opacity = cardPlane === plane ? '1' : '0.3';
        card.style.transition = 'opacity 0.3s';
    });
    setTimeout(() => {
        document.querySelectorAll('.ep-card').forEach(card => { card.style.opacity = '1'; });
    }, 5000);
}

function switchTabDirect(tabId) {
    document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
    document.querySelectorAll('.tab-btn').forEach(b => {
        b.classList.remove('active');
        if (b.textContent.toLowerCase().includes(tabId)) b.classList.add('active');
    });
    const panel = document.getElementById('tab-' + tabId);
    if (panel) panel.classList.add('active');
}

    function showToast(msg) {
        const t = document.getElementById('toast');
        t.textContent = msg || '✅ Prompt copied to clipboard';
        t.classList.add('show');
        setTimeout(() => t.classList.remove('show'), 2200);
    }

    function copyPrompt(text) {
        navigator.clipboard.writeText(text).then(() => showToast()).catch(() => {
            const ta = document.createElement('textarea');
            ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0';
            document.body.appendChild(ta); ta.select();
            document.execCommand('copy'); document.body.removeChild(ta);
            showToast();
        });
    }

    // ── Phase 16.1: Classification Engine ──

    function classifyIssue(issue) {
        if (issue.type === 'undocumented_route') return 'documentation';
        if (issue.type === 'extra_swagger_key' || issue.type === 'missing_swagger_key' || issue.type === 'UNDOCUMENTED_KEY') return 'contract';
        if (issue.type === 'dynamic_response' || issue.type === 'unresolved_handler' || issue.type === 'no_success_response') return 'analyzer';
        return 'other';
    }

    function deduplicateIssues(issues) {
        const map = new Map();
        issues.forEach(issue => {
            const key = issue.type + '|' + (issue.file || '') + '|' + (issue.line || '') + '|' + (issue.message || '');
            if (!map.has(key)) map.set(key, issue);
        });
        return Array.from(map.values());
    }

    function getBatchSafeIssues(issues) {
        return issues.filter(i => classifyIssue(i) === 'documentation');
    }

    function groupByFile(issues) {
        const grouped = {};
        issues.forEach(i => {
            const f = i.file || 'Unknown';
            if (!grouped[f]) grouped[f] = [];
            grouped[f].push(i);
        });
        return grouped;
    }

    // ── Prompt templates ──

    const CONSTRAINTS = \`Constraints:
- Do not modify route path
- Do not modify middleware
- Do not modify RBAC
- Do not modify capability contract
- Follow Swagger schema conventions used in this file
- Maintain Platform Plane isolation
- Do not introduce new capability strings
- Do not modify business logic
- Do not modify subscription/Stripe logic\`;

    const PRE_CHECK = \`SENTINEL PRE-CHECK

1. Contract impact:
2. RBAC impact:
3. Route guard impact:
4. ISO country impact:
5. Swagger impact:
6. Plane isolation impact:
7. Regression risk level: LOW / MEDIUM / HIGH

If HIGH → STOP.\`;

    function objectiveForType(type) {
        switch(type) {
            case 'undocumented_route': return 'Add missing @swagger documentation block for this route.';
            case 'orphan_swagger_path': return 'Remove orphan Swagger path that has no corresponding route in code.';
            case 'unresolved_handler': return 'Ensure controller handler is properly exported and resolvable.';
            case 'no_success_response': return 'Add explicit 2xx response in controller for response schema validation.';
            case 'extra_swagger_key': return 'Align Swagger response schema with actual controller response shape.';
            case 'UNDOCUMENTED_KEY': return 'Update Swagger schema to include this key returned by the controller.';
            case 'dynamic_response': return 'Refactor controller to return explicit response shape instead of spread operator.';
            case 'capability_violation': return 'Fix capability contract violation — ensure capability exists in PLATFORM_CAPABILITIES.';
            case 'capability_warning': return 'Resolve capability warning — ensure guard matrix compliance.';
            case 'response_schema_error': return 'Fix response schema errors to match Swagger documentation.';
            case 'unregistered_mount': return 'Register route mount in app.js or remove dead mount point.';
            default: return 'Resolve this governance issue following platform conventions.';
        }
    }

    function criticalWarning(severity) {
        if (severity === 'CRITICAL') return \`\\n⚠ CRITICAL STRUCTURAL ISSUE\\n\\nProceed carefully.\\nManual review required.\\nDo NOT batch-fix this issue.\\n\`;
        if (severity === 'HIGH') return \`\\n⚠ HIGH SEVERITY ISSUE\\n\\nCareful review required before applying fix.\\n\`;
        return '';
    }

    // ── Per Issue Fix ──

    function fixIssue(epIdx, issueIdx) {
        const ep = R.endpointSummary[epIdx];
        const issues = R.issuesByEndpoint[ep.endpoint] || [];
        const issue = issues[issueIdx];
        if (!issue) return;

        const classification = classifyIssue(issue);

        const prompt = \`\${PRE_CHECK}
\${criticalWarning(issue.severity)}
---

Classification: \${classification.toUpperCase()}

Issue Type:
\${issue.type}

Endpoint:
\${ep.endpoint}

File:
\${issue.file || 'Unknown'}

Line:
\${issue.line || 'Unknown'}

Validator:
\${issue.validator}

Severity:
\${issue.severity}

Message:
\${issue.message}

Objective:
\${objectiveForType(issue.type)}

\${CONSTRAINTS}

Expected Outcome:
The \${issue.validator} validator should pass for this endpoint after the fix.
Run "npm run governance:run" to verify.\`;

        copyPrompt(prompt);
    }

    // ── Per Endpoint Fix ──

    function fixEndpoint(epIdx) {
        const ep = R.endpointSummary[epIdx];
        const rawIssues = R.issuesByEndpoint[ep.endpoint] || [];
        if (rawIssues.length === 0) return;

        const issues = deduplicateIssues(rawIssues);

        const issueList = issues.map((i, idx) => {
            const cls = classifyIssue(i);
            return \`  \${idx+1}. [\${i.severity}] \${i.type} (\${cls})\\n     Validator: \${i.validator}\\n     File: \${i.file || 'N/A'}\${i.line ? ':' + i.line : ''}\\n     Message: \${i.message}\`;
        }).join('\\n\\n');

        const highestSev = issues.reduce((h, i) => {
            const rank = {CRITICAL:4,HIGH:3,MEDIUM:2,LOW:1};
            return (rank[i.severity]||0) > (rank[h]||0) ? i.severity : h;
        }, 'LOW');

        const classifications = [...new Set(issues.map(i => classifyIssue(i)))];

        const prompt = \`\${PRE_CHECK}
\${criticalWarning(highestSev)}
---

Endpoint:
\${ep.endpoint}

Total Unique Issues: \${issues.length}\${rawIssues.length !== issues.length ? ' (deduplicated from ' + rawIssues.length + ')' : ''}
Highest Severity: \${highestSev}
Classifications: \${classifications.join(', ')}

Issues:

\${issueList}

Objective:
Resolve ALL \${issues.length} unique issues listed above for endpoint \${ep.endpoint}.

\${CONSTRAINTS}

Expected Outcome:
All validators should pass for this endpoint after fixes.
Run "npm run governance:run" to verify.\`;

        copyPrompt(prompt);
    }

    // ── Batch Swagger Fix (classification-gated) ──

    function fixBatchSwagger() {
        // Collect ALL issues across all endpoints
        const allIssues = [];
        for (const ep of R.endpointSummary) {
            const issues = R.issuesByEndpoint[ep.endpoint] || [];
            for (const i of issues) {
                allIssues.push({ endpoint: ep.endpoint, ...i });
            }
        }

        // Safety gate: check for CRITICAL/HIGH
        const hasHighSev = allIssues.some(i => i.severity === 'CRITICAL' || i.severity === 'HIGH');
        if (hasHighSev) {
            showToast('⛔ Batch blocked — CRITICAL/HIGH severity issues exist');
            return;
        }

        // Safety gate: check for non-documentation issues
        const nonDoc = allIssues.filter(i => classifyIssue(i) !== 'documentation');
        if (nonDoc.length > 0) {
            showToast('⛔ Batch blocked — structural issues exist');
            return;
        }

        // Get only documentation issues, deduplicated
        const docIssues = deduplicateIssues(getBatchSafeIssues(allIssues));
        if (docIssues.length === 0) return;

        // Group by file for clean prompt
        const grouped = groupByFile(docIssues);

        const fileBlocks = Object.entries(grouped).map(([file, items]) => {
            const routes = items.map(i => \`  - \${i.endpoint} (line \${i.line || '?'})\`).join('\\n');
            return \`File: \${file}\\n\${routes}\`;
        }).join('\\n\\n');

        const prompt = \`\${PRE_CHECK}

---

⚠ BATCH MODE — DOCUMENTATION FIXES ONLY

Batch mode limited to documentation fixes.
Do NOT modify:
- RBAC
- Route guards
- Middleware
- Business logic
- Capability contract

Classification: DOCUMENTATION only
No structural, contract, or analyzer issues in scope.

---

Objective:
Add missing @swagger JSDoc blocks for ALL undocumented routes listed below.

Sanitized Unique Routes: \${docIssues.length}

\${fileBlocks}

\${CONSTRAINTS}

Instructions:
1. For each route, add a @swagger JSDoc block above the route handler
2. Include: path, method, tags, summary, security, responses
3. Follow the existing Swagger documentation patterns in each file
4. Do NOT modify route logic, middleware, or authorization

Expected Outcome:
validate:swagger-drift should report 0 undocumented routes.
Run "npm run governance:run" to verify.\`;

        copyPrompt(prompt);
        showToast('📋 Batch Swagger prompt copied (' + docIssues.length + ' unique routes)');
    }

    // ── Score Trend Chart ──
    (function() {
        const data = ${historyData};
        const canvas = document.getElementById('trendChart');
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        const dpr = window.devicePixelRatio || 1;
        const W = canvas.offsetWidth;
        const H = 120;
        canvas.width = W * dpr;
        canvas.height = H * dpr;
        ctx.scale(dpr, dpr);

        if (data.length < 2) {
            ctx.fillStyle = '#475569'; ctx.font = '11px system-ui'; ctx.textAlign = 'center';
            ctx.fillText('Need at least 2 runs for trend', W / 2, H / 2);
            return;
        }

        const pad = { top: 10, right: 14, bottom: 20, left: 28 };
        const chartW = W - pad.left - pad.right;
        const chartH = H - pad.top - pad.bottom;
        const scores = data.map(d => d.s);
        const minS = Math.max(0, Math.min(...scores) - 10);
        const maxS = Math.min(100, Math.max(...scores) + 10);
        const range = maxS - minS || 1;
        function x(i) { return pad.left + (i / (data.length - 1)) * chartW; }
        function y(s) { return pad.top + chartH - ((s - minS) / range) * chartH; }

        ctx.strokeStyle = 'rgba(51,65,85,0.5)'; ctx.lineWidth = 0.5;
        for (let s = Math.ceil(minS / 10) * 10; s <= maxS; s += 10) {
            ctx.beginPath(); ctx.moveTo(pad.left, y(s)); ctx.lineTo(W - pad.right, y(s)); ctx.stroke();
            ctx.fillStyle = '#475569'; ctx.font = '9px system-ui'; ctx.textAlign = 'right';
            ctx.fillText(s, pad.left - 3, y(s) + 3);
        }

        const grad = ctx.createLinearGradient(0, pad.top, 0, H - pad.bottom);
        grad.addColorStop(0, 'rgba(245,158,11,0.2)'); grad.addColorStop(1, 'rgba(245,158,11,0.01)');
        ctx.beginPath(); ctx.moveTo(x(0), H - pad.bottom);
        data.forEach((d, i) => ctx.lineTo(x(i), y(d.s)));
        ctx.lineTo(x(data.length - 1), H - pad.bottom); ctx.closePath();
        ctx.fillStyle = grad; ctx.fill();

        ctx.beginPath();
        data.forEach((d, i) => { if (i === 0) ctx.moveTo(x(i), y(d.s)); else ctx.lineTo(x(i), y(d.s)); });
        ctx.strokeStyle = '#f59e0b'; ctx.lineWidth = 2; ctx.stroke();

        data.forEach((d, i) => {
            ctx.beginPath(); ctx.arc(x(i), y(d.s), 2.5, 0, Math.PI * 2);
            ctx.fillStyle = '#f59e0b'; ctx.fill();
            ctx.strokeStyle = '#0f172a'; ctx.lineWidth = 1; ctx.stroke();
        });

        const last = data[data.length - 1];
        ctx.beginPath(); ctx.arc(x(data.length - 1), y(last.s), 4, 0, Math.PI * 2);
        ctx.fillStyle = last.s >= 95 ? '#10b981' : last.s >= 80 ? '#f59e0b' : '#ef4444';
        ctx.fill();

        ctx.fillStyle = '#475569'; ctx.font = '8px system-ui'; ctx.textAlign = 'center';
        const fmt = (ts) => { try { return new Date(ts).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }); } catch { return ''; } };
        if (data.length >= 1) ctx.fillText(fmt(data[0].t), x(0), H - 3);
        if (data.length >= 3) ctx.fillText(fmt(data[Math.floor(data.length/2)].t), x(Math.floor(data.length/2)), H - 3);
        if (data.length >= 2) ctx.fillText(fmt(data[data.length-1].t), x(data.length-1), H - 3);
    })();
    </script>
</body>
</html>`;

fs.writeFileSync(OUTPUT_PATH, html, "utf8");

// ─── Compute deduplication stats for CLI report ─────────────────────────────
const totalRaw = allIssuesFlat.length;
const totalDeduped = deduped.size;
const duplicatesRemoved = totalRaw - totalDeduped;

console.log("");
console.log("GOVERNANCE DASHBOARD GENERATED — Phase 16.1");
console.log("---------------------------------------------");
console.log(`Report:       scripts/governance-report.json`);
console.log(`Dashboard:    governance-dashboard.html`);
console.log(`History:      governance-history.json`);
console.log(`Endpoints:    ${endpointSummary.length} mapped`);
console.log(`Issues:       ${totalRaw} total → ${totalDeduped} unique (${duplicatesRemoved} duplicates removed)`);
console.log(`Batch mode:   ${batchSwaggerSafe ? "ENABLED (" + uniqueDocIssues.length + " unique doc issues)" : "DISABLED" + (batchBlockReason ? " — " + batchBlockReason : "")}`);
console.log("Open in browser to view platform health.");
console.log("");
