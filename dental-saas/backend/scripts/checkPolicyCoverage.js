#!/usr/bin/env node
/**
 * checkPolicyCoverage.js — CI/CD Policy Coverage Hard-Fail Gate
 *
 * ZERO-EXCLUSION policy enforcement script.
 * Validates that EVERY RBAC permission has a valid, non-empty PBAC policy.
 *
 * This script is the governance enforcement point:
 *   orgPermissions.js (RBAC SSOT)
 *       ↓
 *   policyRegistry.js (PBAC rules)
 *       ↓
 *   checkPolicyCoverage.js (STATIC VALIDATION) ← YOU ARE HERE
 *       ↓
 *   CI/CD PIPELINE (HARD FAIL)
 *       ↓
 *   DEPLOYMENT
 *
 * INVARIANTS ENFORCED:
 *   ❌ No RBAC permission without PBAC policy
 *   ❌ No empty policy arrays
 *   ❌ No orphan policies (strict mode)
 *   ❌ No invalid policy rule structure
 *   ❌ No missing deny rules for critical write actions (advisory)
 *
 * Usage:
 *   node scripts/checkPolicyCoverage.js                # Standard CI mode
 *   node scripts/checkPolicyCoverage.js --strict       # + orphan enforcement
 *   node scripts/checkPolicyCoverage.js --writes-only  # Write permissions only
 *   npm run validate:policies                          # CI convenience
 *   npm run audit:policy                               # Alias
 *
 * Exit codes:
 *   0 = All validations passed
 *   1 = Validation failed — deployment blocked
 *
 * @version 2.0.0 — Phase D.5 (Zero-Exclusion Enforcement)
 */

"use strict";

// ─── Bootstrap module aliases ───────────────────────────────────────────────
require("module-alias/register");

const { P } = require("../src/rbac/orgPermissions");
const { policies: policyRegistry } = require("../src/rbac/policyRegistry");

// ─── Configuration ──────────────────────────────────────────────────────────

const WRITE_SUFFIXES = [".create", ".update", ".delete", ".manage", ".review", ".send", ".export"];

/**
 * Financial/critical WRITE permissions that SHOULD have at least one
 * hard-deny rule (priority ≥ 110) for status-based immutability.
 */
const CRITICAL_IMMUTABLE_PERMISSIONS = new Set([
    "invoices.update",
    "invoices.delete",
    "payments.update",
    "payments.delete",
    "accounting.update",
    "accounting.delete",
    "lab.update",
    "lab.delete",
]);

// ─── CLI Flags ──────────────────────────────────────────────────────────────

const args = process.argv.slice(2);
const isStrictMode = args.includes("--strict") || process.env.POLICY_VALIDATION_STRICT === "true";
const isWritesOnly = args.includes("--writes-only");

// ─── Helpers ────────────────────────────────────────────────────────────────

function isWritePermission(permission) {
    return WRITE_SUFFIXES.some((s) => permission.endsWith(s));
}

function hasHardDenyRule(rules) {
    return rules.some(
        (rule) => rule.effect === "deny" && (rule.priority || 0) >= 110
    );
}

/**
 * Validate the structure of a single policy rule.
 */
function validateRuleStructure(rule, index) {
    const errors = [];
    if (typeof rule !== "object" || rule === null) {
        return [`Rule ${index}: not an object`];
    }
    if (rule.effect !== "allow" && rule.effect !== "deny") {
        errors.push(`effect="${rule.effect}" (must be "allow"|"deny")`);
    }
    if (typeof rule.condition !== "function") {
        errors.push(`condition is ${typeof rule.condition} (must be function)`);
    }
    if (typeof rule.description !== "string" || !rule.description.trim()) {
        errors.push(`missing description`);
    }
    if (rule.priority !== undefined && typeof rule.priority !== "number") {
        errors.push(`priority is ${typeof rule.priority} (must be number)`);
    }
    return errors;
}

// ─── Analysis ───────────────────────────────────────────────────────────────

function run() {
    console.log();
    console.log("🛡️  PBAC Policy Coverage Validator v2.0 — Zero-Exclusion Enforcement");
    console.log("═".repeat(72));
    console.log(`   Mode:   ${isWritesOnly ? "WRITES-ONLY" : "FULL COVERAGE (ALL)"}`);
    console.log(`   Strict: ${isStrictMode ? "ON (orphans = error)" : "OFF (orphans = warning)"}`);
    console.log("═".repeat(72));
    console.log();

    const allPermissionValues = Object.values(P);
    const uniquePermissions = [...new Set(allPermissionValues)];
    const registeredPolicyKeys = new Set(Object.keys(policyRegistry));

    // ── Determine target permissions ────────────────────────────────────────
    const targetPermissions = isWritesOnly
        ? uniquePermissions.filter(isWritePermission)
        : uniquePermissions;

    const writePerms = uniquePermissions.filter(isWritePermission);
    const readPerms = uniquePermissions.filter((p) => !isWritePermission(p));

    // ── 1. Coverage Check ───────────────────────────────────────────────────
    const missingPolicies = [];
    const emptyPolicies = [];
    const covered = [];

    for (const perm of targetPermissions) {
        const rules = policyRegistry[perm];
        if (!rules) {
            missingPolicies.push(perm);
        } else if (!Array.isArray(rules) || rules.length === 0) {
            emptyPolicies.push(perm);
        } else {
            covered.push(perm);
        }
    }

    // ── 2. Structural Validation ────────────────────────────────────────────
    const structuralErrors = [];

    for (const [permission, rules] of Object.entries(policyRegistry)) {
        if (!Array.isArray(rules)) continue;
        for (let i = 0; i < rules.length; i++) {
            const errors = validateRuleStructure(rules[i], i);
            if (errors.length > 0) {
                structuralErrors.push({ permission, ruleIndex: i, errors });
            }
        }
    }

    // ── 3. Orphan Detection ─────────────────────────────────────────────────
    const uniquePermSet = new Set(uniquePermissions);
    const orphanPolicies = [...registeredPolicyKeys].filter(
        (key) => !uniquePermSet.has(key)
    );

    // ── 4. Hard-Deny Check ──────────────────────────────────────────────────
    const missingHardDenies = [];

    for (const perm of CRITICAL_IMMUTABLE_PERMISSIONS) {
        const rules = policyRegistry[perm];
        if (rules && Array.isArray(rules) && rules.length > 0) {
            if (!hasHardDenyRule(rules)) {
                missingHardDenies.push(perm);
            }
        }
    }

    // ── 5. Policy Rule Statistics ───────────────────────────────────────────
    let totalRules = 0;
    const rulesByEffect = { allow: 0, deny: 0 };
    const priorityBuckets = { hard_deny_110: 0, admin_100: 0, doctor_90: 0, specialized_85: 0, branch_80: 0, other: 0 };

    for (const rules of Object.values(policyRegistry)) {
        if (!Array.isArray(rules)) continue;
        totalRules += rules.length;
        for (const rule of rules) {
            rulesByEffect[rule.effect] = (rulesByEffect[rule.effect] || 0) + 1;
            const p = rule.priority || 0;
            if (p >= 110) priorityBuckets.hard_deny_110++;
            else if (p >= 100) priorityBuckets.admin_100++;
            else if (p >= 90) priorityBuckets.doctor_90++;
            else if (p >= 85) priorityBuckets.specialized_85++;
            else if (p >= 80) priorityBuckets.branch_80++;
            else priorityBuckets.other++;
        }
    }

    // ─── Report ─────────────────────────────────────────────────────────────

    console.log("📊 Permission Inventory:");
    console.log(`   Total permissions (P.*):   ${uniquePermissions.length}`);
    console.log(`   Read permissions:          ${readPerms.length}`);
    console.log(`   Write permissions:         ${writePerms.length}`);
    console.log(`   Target (this run):         ${targetPermissions.length}`);
    console.log();

    console.log("📋 Policy Engine Statistics:");
    console.log(`   Registered policies:       ${registeredPolicyKeys.size}`);
    console.log(`   Total rules:               ${totalRules}`);
    console.log(`   Allow rules:               ${rulesByEffect.allow}`);
    console.log(`   Deny rules:                ${rulesByEffect.deny}`);
    console.log();
    console.log("   Priority distribution:");
    console.log(`     Hard-deny (≥110):        ${priorityBuckets.hard_deny_110}`);
    console.log(`     Admin (100):             ${priorityBuckets.admin_100}`);
    console.log(`     Doctor (90):             ${priorityBuckets.doctor_90}`);
    console.log(`     Specialized (85):        ${priorityBuckets.specialized_85}`);
    console.log(`     Branch-scoped (80):      ${priorityBuckets.branch_80}`);
    if (priorityBuckets.other > 0) {
        console.log(`     Other:                   ${priorityBuckets.other}`);
    }
    console.log();

    const coveragePct = targetPermissions.length > 0
        ? ((covered.length / targetPermissions.length) * 100).toFixed(1)
        : "100.0";

    console.log("🔐 Coverage Result:");
    console.log(`   Covered:                   ${covered.length}/${targetPermissions.length} (${coveragePct}%)`);
    console.log(`   Missing:                   ${missingPolicies.length}`);
    console.log(`   Empty:                     ${emptyPolicies.length}`);
    console.log(`   Structural errors:         ${structuralErrors.length}`);
    console.log(`   Orphan policies:           ${orphanPolicies.length}`);
    console.log(`   Missing hard-denies:       ${missingHardDenies.length}`);
    console.log();

    // ─── Error Details ──────────────────────────────────────────────────────

    let hasErrors = false;

    if (missingPolicies.length > 0) {
        hasErrors = true;
        console.log("   ❌ MISSING POLICIES (no entry in policyRegistry):");
        for (const p of missingPolicies.sort()) {
            console.log(`      ❌ ${p}`);
        }
        console.log();
    }

    if (emptyPolicies.length > 0) {
        hasErrors = true;
        console.log("   ❌ EMPTY POLICY ARRAYS (registered but no rules):");
        for (const p of emptyPolicies.sort()) {
            console.log(`      ❌ ${p}`);
        }
        console.log();
    }

    if (structuralErrors.length > 0) {
        hasErrors = true;
        console.log("   ❌ INVALID POLICY STRUCTURE:");
        for (const se of structuralErrors) {
            console.log(`      ❌ ${se.permission} [rule ${se.ruleIndex}]: ${se.errors.join("; ")}`);
        }
        console.log();
    }

    if (orphanPolicies.length > 0) {
        if (isStrictMode) {
            hasErrors = true;
            console.log("   ❌ ORPHAN POLICIES (strict mode — no matching P.* constant):");
        } else {
            console.log("   ⚠️  ORPHAN POLICIES (no matching P.* constant — advisory):");
        }
        for (const p of orphanPolicies.sort()) {
            console.log(`      ${isStrictMode ? "❌" : "⚠️ "} ${p}`);
        }
        console.log();
    }

    if (missingHardDenies.length > 0) {
        console.log("   ⚠️  MISSING HARD-DENY RULES (financial operations — advisory):");
        console.log("      These permissions modify immutable records and should have");
        console.log("      a deny rule at priority ≥ 110 to block edits on finalized status.");
        for (const p of missingHardDenies.sort()) {
            console.log(`      ⚠️  ${p}`);
        }
        console.log();
    }

    // ─── Covered (Verbose) ──────────────────────────────────────────────────

    if (covered.length > 0 && args.includes("--verbose")) {
        console.log("   ✅ Covered permissions:");
        for (const p of covered.sort()) {
            const ruleCount = policyRegistry[p].length;
            console.log(`      ✅ ${p} → ${ruleCount} rule(s)`);
        }
        console.log();
    }

    // ─── Final Verdict ──────────────────────────────────────────────────────

    console.log("─".repeat(72));

    if (!hasErrors) {
        console.log("✅ PBAC POLICY COVERAGE OK — All permissions protected");
        console.log(`   ${covered.length} permissions × ${totalRules} rules — authorization system consistent`);
        console.log();
        process.exit(0);
    } else {
        const errorCount =
            missingPolicies.length +
            emptyPolicies.length +
            structuralErrors.length +
            (isStrictMode ? orphanPolicies.length : 0);

        console.log(`❌ PBAC POLICY COVERAGE FAILED — ${errorCount} error(s) detected`);
        console.log();
        console.log("   Fix errors in: backend/src/rbac/policyRegistry.js");
        console.log("   Reference:     specs/spec.md §34");
        console.log();
        process.exit(1);
    }
}

// ─── Execute ────────────────────────────────────────────────────────────────

run();
