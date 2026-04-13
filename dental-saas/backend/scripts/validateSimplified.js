#!/usr/bin/env node
/**
 * validateSimplified.js — CI Architecture Guard
 * Phase X.3 — Prevents re-introduction of legacy patterns.
 *
 * Run: node scripts/validateSimplified.js
 * CI:  npm run validate:architecture
 *
 * Exits with code 1 on violations, 0 on clean.
 */

"use strict";

const fs = require("fs");
const path = require("path");

const SRC = path.join(__dirname, "..", "src");
let violations = 0;

// ─── Helpers ─────────────────────────────────────────────────────────────────

function scanFiles(dir, extensions = [".js"]) {
    const results = [];
    let entries;
    try {
        entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
        return results;
    }
    for (const entry of entries) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
            if (entry.name === "node_modules" || entry.name === ".git") continue;
            results.push(...scanFiles(full, extensions));
        } else if (extensions.some((ext) => entry.name.endsWith(ext))) {
            results.push(full);
        }
    }
    return results;
}

function report(file, lineNum, rule, match) {
    const rel = path.relative(SRC, file);
    console.error(`  ❌ [${rule}] ${rel}:${lineNum} → ${match.trim()}`);
    violations++;
}

// ─── Rules ───────────────────────────────────────────────────────────────────

const RULES = [
    // ── Forbidden guards ──
    {
        id: "NO_SUBSCRIPTION_GUARD",
        pattern: /subscriptionGuard/,
        message: "subscriptionGuard is removed — use requireEntitlement() only",
        exclude: [/validateSimplified\.js$/, /sovereignGuard\.js$/, /validateAuthPipeline\.js$/, /subscriptionGuard\.js$/],
    },
    {
        id: "NO_REQUIRE_FEATURE",
        pattern: /requireFeature/,
        message: "requireFeature middleware is removed — use featureFlagMiddleware only",
        exclude: [/validateSimplified\.js$/, /validateAuthPipeline\.js$/],
    },
    {
        id: "NO_BILLING_GUARD",
        pattern: /billingGuard/,
        message: "billingGuard is removed — use requireEntitlement() only",
        exclude: [/validateSimplified\.js$/],
    },
    {
        id: "NO_BRANCH_SCOPE_MW",
        pattern: /branchScopeMiddleware/,
        message: "branchScopeMiddleware is removed — use branchContextMiddleware only",
        exclude: [/validateSimplified\.js$/, /branchContext\.middleware\.js$/],
    },
    {
        id: "NO_VERIFY_ORG_ACCESS",
        pattern: /verifyOrganizationAccess/,
        message: "verifyOrganizationAccess is removed — RLS handles this",
        exclude: [/validateSimplified\.js$/],
    },
    {
        id: "NO_ENFORCE_PERM_MATRIX",
        pattern: /enforcePermissionMatrix/,
        message: "enforcePermissionMatrix is removed — use requireOrgPermission() only",
        exclude: [/validateSimplified\.js$/],
    },

    // ── Raw DB access ──
    {
        id: "NO_RAW_MODEL_FIND",
        pattern: /(?<!secureModel\()(?<!Secure\w+)\bModel\.find\(/,
        message: "Raw Model.find() detected — use secureModel(Model).find(query, req)",
        exclude: [/validateSimplified\.js$/, /secureModel\.js$/, /test/, /rlsValidat/, /rlsValidator/],
    },

    // ── Forbidden direct axios ──
    {
        id: "NO_DIRECT_AXIOS",
        pattern: /require\(["']axios["']\)/,
        message: "Direct axios usage — use the API layer from apiClient",
        exclude: [/validateSimplified\.js$/, /apiClient/, /services[/\\]/, /infrastructure[/\\]/],
    },

    // ── Duplicate rate limiters ──
    {
        id: "NO_SETTINGS_RATE_LIMIT",
        pattern: /settingsRateLimit/,
        message: "settingsRateLimit is removed — use rateLimiter.js only",
        exclude: [/validateSimplified\.js$/],
    },
    {
        id: "NO_INTAKE_RATE_LIMIT",
        pattern: /intakeRateLimit/,
        message: "intakeRateLimit is removed — use rateLimiter.js only",
        exclude: [/validateSimplified\.js$/],
    },

    // ── Inline permissions ──
    {
        id: "NO_INLINE_PERMISSION_CHECK",
        pattern: /req\.user\.role\s*===\s*["']/,
        message: "Inline role check — use requireOrgPermission() or capabilities.includes()",
        exclude: [/validateSimplified\.js$/, /test/, /policyConditions\.js$/],
    },
];

// ─── Scan ────────────────────────────────────────────────────────────────────

console.log("🔍 Architecture Guard — scanning src/...\n");

const files = scanFiles(SRC);

for (const file of files) {
    const content = fs.readFileSync(file, "utf-8");
    const lines = content.split("\n");

    for (const rule of RULES) {
        // Check exclusions
        if (rule.exclude?.some((re) => re.test(file))) continue;

        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            // Skip comments
            if (line.trim().startsWith("//") || line.trim().startsWith("*")) continue;

            if (rule.pattern.test(line)) {
                report(file, i + 1, rule.id, line);
            }
        }
    }
}

// ─── Result ──────────────────────────────────────────────────────────────────

console.log("");
if (violations > 0) {
    console.error(`\n❌ FAIL — ${violations} architecture violation(s) found.`);
    console.error("Fix the above violations before merging.\n");
    process.exit(1);
} else {
    console.log("✅ PASS — 0 architecture violations. Codebase is clean.\n");
    process.exit(0);
}
