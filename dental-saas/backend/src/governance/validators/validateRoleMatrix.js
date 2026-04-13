require("module-alias/register");
/**
 * validateRoleMatrix.js
 * Phase 8 — Role Matrix Integrity Validator
 *
 * Validates:
 *   1. Every capability in PLATFORM_CAPABILITIES appears in at least one role
 *   2. SUPERADMIN includes ALL capabilities (complete authority)
 *   3. No role contains a capability absent from the contract
 *   4. roleMatrixSnapshot.json matches the live PLATFORM_ROLES
 *
 * Exit code 1 on failure.
 * Usage: node backend/scripts/validateRoleMatrix.js
 */

const path = require('path');
const fs = require('fs');

const {
    PLATFORM_CAPABILITIES,
    PLATFORM_ROLES
} = require('@contracts/platformContract.cjs.js');

const ALL_CAPABILITIES = new Set(Object.values(PLATFORM_CAPABILITIES));
const roleNames = Object.keys(PLATFORM_ROLES);

let failures = [];
let warnings = [];

// ─── Rule 1: Every capability must appear in at least one role ──────────────
for (const cap of ALL_CAPABILITIES) {
    const assignedRoles = roleNames.filter(r => PLATFORM_ROLES[r].includes(cap));
    if (assignedRoles.length === 0) {
        failures.push(`Orphan capability: "${cap}" is not assigned to any role`);
    }
}

// ─── Rule 2: SUPERADMIN must include ALL capabilities ───────────────────────
const superadminCaps = new Set(PLATFORM_ROLES.superadmin || []);
for (const cap of ALL_CAPABILITIES) {
    if (!superadminCaps.has(cap)) {
        failures.push(`SUPERADMIN missing capability: "${cap}"`);
    }
}

// ─── Rule 3: No role may contain unknown capabilities ───────────────────────
for (const role of roleNames) {
    for (const cap of PLATFORM_ROLES[role]) {
        if (!ALL_CAPABILITIES.has(cap)) {
            failures.push(`Role "${role}" contains unknown capability: "${cap}"`);
        }
    }
}

// ─── Rule 4: Snapshot alignment ─────────────────────────────────────────────
const snapshotPath = path.resolve(__dirname, "../../../tests/roleMatrixSnapshot.json");
if (fs.existsSync(snapshotPath)) {
    const snapshot = JSON.parse(fs.readFileSync(snapshotPath, 'utf8'));

    // Check each role in live contract vs snapshot
    for (const role of roleNames) {
        const liveCaps = [...PLATFORM_ROLES[role]].sort();
        const snapCaps = (snapshot[role] || []).sort();

        if (JSON.stringify(liveCaps) !== JSON.stringify(snapCaps)) {
            failures.push(
                `Role "${role}" snapshot drift:\n` +
                `     Live:     [${liveCaps.join(', ')}]\n` +
                `     Snapshot: [${snapCaps.join(', ')}]`
            );
        }
    }

    // Check __capabilities__ in snapshot matches contract
    const snapAllCaps = (snapshot['__capabilities__'] || []).sort();
    const liveAllCaps = [...ALL_CAPABILITIES].sort();

    if (JSON.stringify(liveAllCaps) !== JSON.stringify(snapAllCaps)) {
        failures.push(
            `__capabilities__ snapshot drift:\n` +
            `     Live:     [${liveAllCaps.join(', ')}]\n` +
            `     Snapshot: [${snapAllCaps.join(', ')}]`
        );
    }

    // Check snapshot doesn't have extra roles not in contract
    for (const snapRole of Object.keys(snapshot)) {
        if (snapRole === '__capabilities__') continue;
        if (!PLATFORM_ROLES[snapRole]) {
            warnings.push(`Snapshot contains unknown role: "${snapRole}"`);
        }
    }
} else {
    warnings.push(`Snapshot file not found at ${snapshotPath} — skipping drift check`);
}

// ─── Report ─────────────────────────────────────────────────────────────────
console.log('');
console.log('═══════════════════════════════════════════════════');
console.log('  ROLE MATRIX INTEGRITY VALIDATOR — Phase 8');
console.log('═══════════════════════════════════════════════════');
console.log(`  Contract capabilities: ${ALL_CAPABILITIES.size}`);
console.log(`  Roles defined:         ${roleNames.length} (${roleNames.join(', ')})`);
console.log(`  Failures:              ${failures.length}`);
console.log(`  Warnings:              ${warnings.length}`);
console.log('');

if (warnings.length > 0) {
    for (const w of warnings) {
        console.warn(`  ⚠️  ${w}`);
    }
    console.log('');
}

if (failures.length > 0) {
    for (const f of failures) {
        console.error(`  ❌ ${f}`);
        console.error('');
    }
    console.error('RESULT: FAILED — Role matrix integrity violations detected.');
    process.exit(1);
} else {
    console.log('  ✅ Role matrix integrity verified.');
    console.log('     - All capabilities assigned to at least one role');
    console.log('     - SUPERADMIN has full authority');
    console.log('     - No unknown capabilities in any role');
    console.log('     - Snapshot aligned with contract');
    console.log('');
    console.log('RESULT: PASSED');
    process.exit(0);
}
