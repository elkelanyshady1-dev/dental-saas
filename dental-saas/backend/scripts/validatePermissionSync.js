/**
 * validatePermissionSync.js — Permission Drift Detector (CI Guard)
 *
 * Compares the live backend P enum (orgPermissions.js) against the
 * generated frontend artifact (frontend/src/generated/permissionKeys.json).
 *
 * PASSES  if every key in P is present in permissionKeys.json
 * FAILS   if any key is missing (generator was not run after adding permissions)
 *
 * This runs WITHOUT module-alias or mongoose — fully standalone.
 *
 * USAGE:
 *   node scripts/validatePermissionSync.js
 *   npm run validate:permission-drift
 *   npm run validate:permissions
 *
 * CI: Add to your CI before build:
 *   - npm run validate:permission-drift
 *
 * PLANE: Codegen CI — not a runtime file.
 */

"use strict";

const fs   = require("fs");
const path = require("path");

// ─── Load SSOT ────────────────────────────────────────────────────────────────
const { P } = require("../src/rbac/orgPermissions");

const backendValues    = new Set(Object.values(P));
const backendConstants = Object.keys(P);

// ─── Load generated artifact ──────────────────────────────────────────────────
const jsonPath = path.resolve(__dirname, "../../frontend/src/generated/permissionKeys.json");

if (!fs.existsSync(jsonPath)) {
    console.error("❌ PERMISSION DRIFT: permissionKeys.json does not exist.");
    console.error(`   Expected at: ${jsonPath}`);
    console.error("   Run: npm run generate:permission-keys");
    process.exit(1);
}

const artifact = JSON.parse(fs.readFileSync(jsonPath, "utf-8"));
const generatedKeys = new Set(artifact.permissionKeys || []);
const generatedConstants = Object.keys(artifact.constants || {});

// ─── Drift check 1: Backend values missing from generated permissionKeys ───────
const missingFromGenerated = [...backendValues].filter(v => !generatedKeys.has(v));

// ─── Drift check 2: Generated keys not in backend (orphan/removed permissions) ─
const orphanedInGenerated = [...generatedKeys].filter(v => !backendValues.has(v));

// ─── Drift check 3: P constant names missing from generated constants ──────────
const generatedConstantSet = new Set(generatedConstants);
const missingConstants = backendConstants.filter(k => !generatedConstantSet.has(k));

// ─── Report ───────────────────────────────────────────────────────────────────

let failed = false;

if (missingFromGenerated.length > 0) {
    console.error("❌ PERMISSION DRIFT DETECTED — re-run: npm run generate:permission-keys");
    console.error(`\n   Missing from permissionKeys.json (${missingFromGenerated.length} keys):`);
    for (const k of missingFromGenerated) {
        console.error(`     - ${k}`);
    }
    failed = true;
}

if (orphanedInGenerated.length > 0) {
    console.warn(`⚠️  ORPHAN PERMISSIONS in generated file (${orphanedInGenerated.length} keys — removed from backend?):`);
    for (const k of orphanedInGenerated) {
        console.warn(`     - ${k}`);
    }
    // Orphans are warnings (backward compat), not hard failures
}

if (missingConstants.length > 0) {
    console.error(`❌ MISSING P CONSTANTS in generated constants map (${missingConstants.length}):`);
    for (const k of missingConstants) {
        console.error(`     - ${k}: "${P[k]}"`);
    }
    failed = true;
}

if (failed) {
    console.error("\n   Fix: cd backend && npm run generate:permission-keys");
    process.exit(1);
}

console.log(
    `✅ Permission sync validated — ${backendValues.size} keys, ${backendConstants.length} constants ` +
    `(generated: ${generatedKeys.size} keys)`
);

if (orphanedInGenerated.length > 0) {
    console.warn(`   ⚠️  ${orphanedInGenerated.length} orphaned keys in generated file (non-fatal)`);
}
