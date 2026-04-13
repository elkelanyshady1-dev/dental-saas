require("module-alias/register");
/**
 * validateCapabilityInvariants.js
 * Phase 8 — Unified Capability Invariant Engine
 *
 * Orchestrates all governance validators in sequence:
 *   1. Capability Contract (phantom detection)
 *   2. Route Guard Matrix (guard compliance)
 *   3. Frontend Capability Scanner (bracket access, unknown caps)
 *   4. Swagger Synchronization (annotation coverage)
 *   5. Role Matrix Integrity (snapshot alignment)
 *
 * Exit code 1 if ANY validator fails.
 * Usage: node backend/scripts/validateCapabilityInvariants.js
 */

const { execSync } = require('child_process');
const path = require('path');

const VALIDATORS = [
    {
        name: 'Capability Contract',
        script: 'validateCapabilities.js',
        critical: true
    },
    {
        name: 'Route Guard Matrix',
        script: 'validatePlatformRoutes.js',
        critical: true
    },
    {
        name: 'Frontend Capability Scanner',
        script: path.resolve(__dirname, "../../../../frontend/scripts/validatePlatformCapabilities.cjs"),
        absolute: true,
        critical: true
    },
    {
        name: 'Swagger Synchronization',
        script: 'validateSwaggerAnnotations.js',
        critical: false  // warnings allowed
    },
    {
        name: 'Role Matrix Integrity',
        script: 'validateRoleMatrix.js',
        critical: true
    }
];

console.log('');
console.log('╔═══════════════════════════════════════════════════════════╗');
console.log('║  CAPABILITY INVARIANT ENGINE — Phase 8                   ║');
console.log('║  Enterprise Deterministic Governance                     ║');
console.log('╚═══════════════════════════════════════════════════════════╝');
console.log('');

let passed = 0;
let failed = 0;
let warnings = 0;
const results = [];

for (const v of VALIDATORS) {
    const scriptPath = v.absolute
        ? v.script
        : path.resolve(__dirname, v.script);

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
console.log('║  INVARIANT ENGINE SUMMARY                               ║');
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
    console.error('INVARIANT ENGINE: FAILED — Governance violations detected.');
    process.exit(1);
} else {
    console.log('INVARIANT ENGINE: PASSED — All governance invariants hold.');
    process.exit(0);
}
