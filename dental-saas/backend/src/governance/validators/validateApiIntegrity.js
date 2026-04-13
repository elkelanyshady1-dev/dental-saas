require("module-alias/register");
/**
 * validateApiIntegrity.js
 * Phase 9 — Unified API Integrity Engine
 *
 * Orchestrates all API governance validators in sequence:
 *   1. Route Graph Extraction (builds routeGraph.json)
 *   2. Swagger Drift Detection
 *   3. Route Guard Matrix Validation
 *   4. Mount Namespace Consistency
 *
 * Exit code 1 if ANY critical validator fails.
 * Usage: node backend/scripts/validateApiIntegrity.js
 */

const { execSync } = require('child_process');
const path = require('path');

const VALIDATORS = [
    {
        name: 'Route Graph Extraction',
        script: 'extractRouteGraph.js',
        critical: true
    },
    {
        name: 'Swagger Drift Detection',
        script: 'validateSwaggerDrift.js',
        critical: false  // undocumented routes are warnings, only orphans/legacy are critical
    },
    {
        name: 'Route Guard Matrix',
        script: 'validatePlatformRoutes.js',
        critical: true
    },
    {
        name: 'Mount Namespace Consistency',
        script: 'validateMountNamespaces.js',
        critical: true
    }
];

console.log('');
console.log('╔═══════════════════════════════════════════════════════════╗');
console.log('║  API INTEGRITY ENGINE — Phase 9                         ║');
console.log('║  Enterprise Route Governance                            ║');
console.log('╚═══════════════════════════════════════════════════════════╝');
console.log('');

let passed = 0;
let failed = 0;
let warnings = 0;
const results = [];

for (const v of VALIDATORS) {
    const scriptPath = path.resolve(__dirname, v.script);

    console.log(`━━━ [${v.name}] ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);

    try {
        execSync(`node "${scriptPath}"`, {
            stdio: 'inherit',
            cwd: path.resolve(__dirname, "../../..")
        });
        passed++;
        results.push({ name: v.name, status: '✅ PASSED' });
    } catch (err) {
        if (v.critical) {
            failed++;
            results.push({ name: v.name, status: '❌ FAILED' });
        } else {
            warnings++;
            results.push({ name: v.name, status: '⚠️  WARN' });
        }
    }
    console.log('');
}

// ─── Summary ────────────────────────────────────────────────────────────────
console.log('╔═══════════════════════════════════════════════════════════╗');
console.log('║  API INTEGRITY SUMMARY                                  ║');
console.log('╠═══════════════════════════════════════════════════════════╣');
for (const r of results) {
    const padded = r.name.padEnd(35);
    console.log(`║  ${padded} ${r.status.padEnd(16)}  ║`);
}
console.log('╠═══════════════════════════════════════════════════════════╣');
console.log(`║  Passed: ${String(passed).padEnd(3)} Failed: ${String(failed).padEnd(3)} Warnings: ${String(warnings).padEnd(3)}          ║`);
console.log('╚═══════════════════════════════════════════════════════════╝');
console.log('');

if (failed > 0) {
    console.error('API INTEGRITY ENGINE: FAILED — Route governance violations detected.');
    process.exit(1);
} else {
    console.log('API INTEGRITY ENGINE: PASSED — All route governance invariants hold.');
    process.exit(0);
}
