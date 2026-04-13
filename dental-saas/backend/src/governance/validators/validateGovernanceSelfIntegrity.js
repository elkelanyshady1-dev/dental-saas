require("module-alias/register");
/**
 * validateGovernanceSelfIntegrity.js
 * Phase 28 — Governance Self-Integrity Validator
 *
 * Ensures the governance system itself is correctly configured:
 *   1. All expected validators registered in policy
 *   2. No duplicate registrations
 *   3. Policy version exists
 *   4. History file is writable
 *   5. All npm scripts exist for registered validators
 *
 * Must run LAST. Never crashes governance engine.
 */

require("dotenv").config();

const fs = require("fs");
const path = require("path");

const failures = [];
const warnings = [];
const startTime = Date.now();

console.log("╔══════════════════════════════════════════════╗");
console.log("║  GOVERNANCE SELF-INTEGRITY — Phase 28        ║");
console.log("╚══════════════════════════════════════════════╝");
console.log("");

const BACKEND_ROOT = path.resolve(__dirname, "../../../");
const POLICY_PATH = path.resolve(BACKEND_ROOT, "src/config/config/platform-governance.policy.json");
const HISTORY_PATH = path.resolve(BACKEND_ROOT, "governance-history.json");
const PKG_PATH = path.resolve(BACKEND_ROOT, "package.json");

try {
    // ── 1. Policy file exists ────────────────────────────────────────
    if (!fs.existsSync(POLICY_PATH)) {
        failures.push({
            type: "POLICY_MISSING",
            severity: "high",
            message: "platform-governance.policy.json not found",
            code: "GOV_POLICY_MISSING",
            recommendation: "Restore policy file at src/config/config/platform-governance.policy.json",
            classification: "FAILED_FUNCTIONAL",
        });
        finish();
    }

    const policy = JSON.parse(fs.readFileSync(POLICY_PATH, "utf8"));
    console.log("  ✅ Policy file loaded");

    // ── 2. Policy version exists ─────────────────────────────────────
    if (!policy.policyVersion) {
        failures.push({
            type: "NO_POLICY_VERSION",
            severity: "high",
            message: "Policy file has no policyVersion field",
            code: "GOV_NO_VERSION",
            recommendation: "Add policyVersion to policy JSON root",
            classification: "FAILED_FUNCTIONAL",
        });
    } else {
        console.log(`  ✅ Policy version: ${policy.policyVersion}`);
    }

    // ── 3. Required scripts in policy ────────────────────────────────
    const registeredScripts = policy.platformPlane?.ci?.requiredScripts || [];
    console.log(`  🔍 Registered validators: ${registeredScripts.length}`);

    if (registeredScripts.length === 0) {
        failures.push({
            type: "NO_VALIDATORS",
            severity: "high",
            message: "No validators registered in policy ci.requiredScripts",
            code: "GOV_NO_VALIDATORS",
            recommendation: "Add validator entries to ci.requiredScripts in policy",
            classification: "FAILED_FUNCTIONAL",
        });
    }

    // ── 4. Check for duplicates ──────────────────────────────────────
    const unique = new Set(registeredScripts);
    if (unique.size !== registeredScripts.length) {
        const seen = {};
        const dupes = [];
        for (const s of registeredScripts) {
            seen[s] = (seen[s] || 0) + 1;
            if (seen[s] === 2) dupes.push(s);
        }
        failures.push({
            type: "DUPLICATE_VALIDATORS",
            severity: "high",
            message: `Duplicate validator(s) in policy: ${dupes.join(", ")}`,
            code: "GOV_DUPLICATES",
            recommendation: "Remove duplicate entries from ci.requiredScripts",
            classification: "FAILED_FUNCTIONAL",
        });
        console.log(`  ❌ Duplicate validators: ${dupes.join(", ")}`);
    } else {
        console.log("  ✅ No duplicate registrations");
    }

    // ── 5. Validate npm scripts exist for each validator ─────────────
    const pkg = JSON.parse(fs.readFileSync(PKG_PATH, "utf8"));
    const npmScripts = pkg.scripts || {};

    let missingScripts = 0;
    for (const script of registeredScripts) {
        if (!npmScripts[script]) {
            failures.push({
                type: "MISSING_NPM_SCRIPT",
                severity: "high",
                message: `Validator "${script}" is registered in policy but has no npm script`,
                code: "GOV_MISSING_SCRIPT",
                recommendation: `Add "${script}" to package.json scripts`,
                classification: "FAILED_FUNCTIONAL",
            });
            console.log(`  ❌ Missing npm script: ${script}`);
            missingScripts++;
        }
    }
    if (missingScripts === 0) {
        console.log(`  ✅ All ${registeredScripts.length} validator scripts exist in package.json`);
    }

    // ── 6. Validate script files exist ───────────────────────────────
    let missingFiles = 0;
    for (const script of registeredScripts) {
        const npmCmd = npmScripts[script];
        if (!npmCmd) continue;
        // Extract the file path from "node path/to/file.js"
        const fileMatch = npmCmd.match(/node\s+(.+\.js)/);
        if (fileMatch) {
            const firstFile = fileMatch[1].split("&&")[0].trim();
            const filePath = path.resolve(BACKEND_ROOT, firstFile);
            if (!fs.existsSync(filePath)) {
                failures.push({
                    type: "MISSING_VALIDATOR_FILE",
                    severity: "high",
                    message: `Validator file missing: ${firstFile}`,
                    code: "GOV_MISSING_FILE",
                    recommendation: `Create validator file at ${firstFile}`,
                    classification: "FAILED_FUNCTIONAL",
                });
                console.log(`  ❌ Missing file: ${firstFile}`);
                missingFiles++;
            }
        }
    }
    if (missingFiles === 0) {
        console.log(`  ✅ All validator files exist on disk`);
    }

    // ── 7. History file writable ─────────────────────────────────────
    try {
        fs.accessSync(HISTORY_PATH, fs.constants.W_OK);
        console.log("  ✅ History file writable");
    } catch {
        if (!fs.existsSync(HISTORY_PATH)) {
            warnings.push({
                type: "NO_HISTORY_FILE",
                severity: "low",
                message: "governance-history.json does not exist yet",
                code: "GOV_NO_HISTORY",
                recommendation: "Run governance engine once to create history file",
            });
            console.log("  ⚠️  [GOV_NO_HISTORY] History file doesn't exist yet");
        } else {
            warnings.push({
                type: "HISTORY_NOT_WRITABLE",
                severity: "medium",
                message: "governance-history.json is not writable",
                code: "GOV_HISTORY_READONLY",
                recommendation: "Fix file permissions on governance-history.json",
            });
            console.log("  ⚠️  [GOV_HISTORY_READONLY] History file not writable");
        }
    }

    // ── 8. Self-integrity: this validator should be last ──────────────
    const lastScript = registeredScripts[registeredScripts.length - 1];
    if (lastScript !== "validate:governance-self-integrity") {
        warnings.push({
            type: "NOT_LAST_VALIDATOR",
            severity: "low",
            message: `governance-self-integrity is not the last validator (last is: ${lastScript})`,
            code: "GOV_NOT_LAST",
            recommendation: "Move validate:governance-self-integrity to the end of ci.requiredScripts",
        });
        console.log(`  ⚠️  [GOV_NOT_LAST] This validator should be last (currently: ${lastScript})`);
    } else {
        console.log("  ✅ Self-integrity is the last registered validator");
    }

} catch (err) {
    failures.push({
        type: "VALIDATOR_ERROR",
        severity: "high",
        message: `Governance self-integrity error: ${err.message}`,
        code: "GOV_SELF_ERROR",
        recommendation: "Check validator script, policy file, and package.json",
        classification: "FAILED_FUNCTIONAL",
    });
}

finish();

function finish() {
    const durationMs = Date.now() - startTime;
    const status = failures.length === 0 ? "PASSED" : "FAILED";
    const classification = failures.some(f => f.classification === "FAILED_FUNCTIONAL")
        ? "FAILED_FUNCTIONAL"
        : "PASSED";

    console.log("");
    if (warnings.length > 0) {
        for (const w of warnings) console.log(`  ⚠️  [${w.code}] ${w.message}`);
    }
    if (failures.length > 0) {
        for (const f of failures) console.log(`  ❌ [${f.code}] ${f.message}`);
    }
    console.log(`  RESULT: ${status} (${durationMs}ms, ${failures.length} failures, ${warnings.length} warnings)`);

    const result = {
        name: "validate:governance-self-integrity",
        status,
        durationMs,
        warnings,
        failures,
        classification,
    };
    console.log("__GOVERNANCE_JSON_START__");
    console.log(JSON.stringify(result));
    console.log("__GOVERNANCE_JSON_END__");

    process.exit(status === "PASSED" ? 0 : 1);
}
