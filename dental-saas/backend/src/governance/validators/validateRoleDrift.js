require("module-alias/register");
/**
 * validateRoleDrift.js
 * Phase 25 — Role Drift Validator
 *
 * Detects mutations to the PlatformUser role enum.
 * Ensures required roles exist and enum hasn't been tampered with.
 *
 * Never modifies schema. Static analysis only.
 * Never crashes governance engine.
 */

require("dotenv").config();

const path = require("path");

const REQUIRED_ROLES = ["superadmin", "finance_admin", "operations_admin", "analyst"];
const EXPECTED_ORDER = ["superadmin", "finance_admin", "operations_admin", "analyst"];

const failures = [];
const warnings = [];
const startTime = Date.now();

console.log("╔══════════════════════════════════════════════╗");
console.log("║  ROLE DRIFT VALIDATOR — Phase 25             ║");
console.log("╚══════════════════════════════════════════════╝");
console.log("");

try {
    // ── 1. Load PlatformUser model file as text (static analysis) ─────
    const fs = require("fs");
    const modelPath = path.resolve(__dirname, "../../platform/models/PlatformUser.js");

    if (!fs.existsSync(modelPath)) {
        failures.push({
            type: "MODEL_NOT_FOUND",
            severity: "high",
            message: "PlatformUser.js not found at expected path",
            code: "ROLE_MODEL_MISSING",
            recommendation: "Verify model exists at src/platform/models/PlatformUser.js",
            classification: "FAILED_FUNCTIONAL",
        });
        finish();
    }

    const modelSource = fs.readFileSync(modelPath, "utf8");

    // ── 2. Extract enum array from source ────────────────────────────
    const enumMatch = modelSource.match(/enum:\s*\[([^\]]+)\]/);
    if (!enumMatch) {
        failures.push({
            type: "ENUM_NOT_FOUND",
            severity: "high",
            message: "Could not find role enum definition in PlatformUser schema",
            code: "ROLE_ENUM_MISSING",
            recommendation: "Ensure role field has enum constraint in PlatformUser schema",
            classification: "FAILED_FUNCTIONAL",
        });
        finish();
    }

    const rawEnum = enumMatch[1];
    const currentRoles = rawEnum.match(/"([^"]+)"/g).map(s => s.replace(/"/g, ""));

    console.log(`  🔍 Detected roles: [${currentRoles.join(", ")}]`);
    console.log(`  📋 Expected roles: [${REQUIRED_ROLES.join(", ")}]`);

    // ── 3. Check required roles exist ────────────────────────────────
    for (const role of REQUIRED_ROLES) {
        if (!currentRoles.includes(role)) {
            failures.push({
                type: "REQUIRED_ROLE_MISSING",
                severity: "high",
                message: `Required role "${role}" missing from schema enum`,
                code: "ROLE_MISSING_" + role.toUpperCase(),
                recommendation: `Add "${role}" back to PlatformUser role enum`,
                classification: "FAILED_FUNCTIONAL",
            });
            console.log(`  ❌ Missing required role: ${role}`);
        } else {
            console.log(`  ✅ Role present: ${role}`);
        }
    }

    // ── 4. Check for unexpected additions ────────────────────────────
    const extraRoles = currentRoles.filter(r => !REQUIRED_ROLES.includes(r));
    if (extraRoles.length > 0) {
        warnings.push({
            type: "EXTRA_ROLES_DETECTED",
            severity: "medium",
            message: `${extraRoles.length} unexpected role(s) detected: ${extraRoles.join(", ")}`,
            code: "ROLE_EXTRA_DETECTED",
            recommendation: "Verify additional roles are intentional and update REQUIRED_ROLES if permanent",
        });
        console.log(`  ⚠️  [ROLE_EXTRA_DETECTED] Extra roles: ${extraRoles.join(", ")}`);
    }

    // ── 5. Check enum order (strict mode) ────────────────────────────
    const orderMatch = EXPECTED_ORDER.every((role, i) => currentRoles[i] === role);
    if (!orderMatch && failures.length === 0) {
        warnings.push({
            type: "ENUM_ORDER_CHANGED",
            severity: "low",
            message: "Role enum order differs from expected canonical order",
            code: "ROLE_ORDER_DRIFT",
            recommendation: "Restore canonical role order: " + EXPECTED_ORDER.join(", "),
        });
        console.log("  ⚠️  [ROLE_ORDER_DRIFT] Enum order changed");
    }

    // ── 6. Superadmin must be first ──────────────────────────────────
    if (currentRoles[0] !== "superadmin") {
        warnings.push({
            type: "SUPERADMIN_NOT_FIRST",
            severity: "medium",
            message: `superadmin is at position ${currentRoles.indexOf("superadmin")} instead of 0`,
            code: "ROLE_SUPERADMIN_POSITION",
            recommendation: "Ensure superadmin is the first role in the enum array",
        });
        console.log("  ⚠️  [ROLE_SUPERADMIN_POSITION] superadmin not first in enum");
    }

} catch (err) {
    failures.push({
        type: "VALIDATOR_ERROR",
        severity: "high",
        message: `Role drift validator error: ${err.message}`,
        code: "ROLE_VALIDATOR_ERROR",
        recommendation: "Check validator script and PlatformUser model",
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
        name: "validate:role-drift",
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
