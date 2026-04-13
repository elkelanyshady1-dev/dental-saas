require("module-alias/register");
/**
 * validateAuthControllerIntegrity.js
 * Phase 27 — Auth Controller Drift Detector
 *
 * Static string inspection of platformAuthController.js
 * Ensures critical security invariants haven't been removed.
 *
 * No AST parsing — simple regex/includes checks.
 * Never modifies auth logic. Never crashes governance engine.
 */

require("dotenv").config();

const fs = require("fs");
const path = require("path");

const failures = [];
const warnings = [];
const startTime = Date.now();

console.log("╔══════════════════════════════════════════════╗");
console.log("║  AUTH CONTROLLER INTEGRITY — Phase 27        ║");
console.log("╚══════════════════════════════════════════════╝");
console.log("");

const CONTROLLER_PATH = path.resolve(
    __dirname,
    "../../platform/controllers/platformAuthController.js"
);

try {
    // ── 1. File existence ────────────────────────────────────────────
    if (!fs.existsSync(CONTROLLER_PATH)) {
        failures.push({
            type: "CONTROLLER_MISSING",
            severity: "high",
            message: "platformAuthController.js not found",
            code: "AUTH_CONTROLLER_MISSING",
            recommendation: "Verify controller exists at src/platform/controllers/platformAuthController.js",
            classification: "FAILED_FUNCTIONAL",
        });
        finish();
    }

    const source = fs.readFileSync(CONTROLLER_PATH, "utf8");
    console.log(`  🔍 Controller size: ${source.length} bytes, ${source.split("\n").length} lines`);

    // ── 2. Critical invariants ───────────────────────────────────────
    const INVARIANTS = [
        {
            pattern: /bcrypt\.compare/,
            code: "AUTH_NO_BCRYPT",
            message: "bcrypt.compare() call not found — password verification removed",
            recommendation: "Restore bcrypt.compare(password, user.password) in login flow",
        },
        {
            pattern: /\.select\(\s*["']\+password["']\s*\)/,
            code: "AUTH_NO_PASSWORD_SELECT",
            message: 'select("+password") not found — password field not being fetched',
            recommendation: 'Restore .select("+password") on user query in login',
        },
        {
            pattern: /\.toLowerCase\(\)/,
            code: "AUTH_NO_EMAIL_NORMALIZE",
            message: "email.toLowerCase() not found — email normalization removed",
            recommendation: "Restore email normalization to prevent case-sensitivity issues",
        },
        {
            pattern: /process\.env\.JWT_SECRET/,
            code: "AUTH_NO_JWT_SECRET_REF",
            message: "process.env.JWT_SECRET reference not found — token signing broken",
            recommendation: "Restore JWT signing with process.env.JWT_SECRET",
        },
        {
            pattern: /expiresIn/,
            code: "AUTH_NO_EXPIRY",
            message: "expiresIn not found — tokens may never expire",
            recommendation: "Restore expiresIn option in jwt.sign() call",
        },
        {
            pattern: /type:\s*["']platform["']/,
            code: "AUTH_NO_PLATFORM_TYPE",
            message: 'type: "platform" not found — plane isolation broken',
            recommendation: 'Restore type: "platform" in JWT payload and response',
        },
    ];

    let invariantsPassed = 0;
    for (const inv of INVARIANTS) {
        if (inv.pattern.test(source)) {
            console.log(`  ✅ Invariant present: ${inv.code.replace("AUTH_NO_", "")}`);
            invariantsPassed++;
        } else {
            failures.push({
                type: "INVARIANT_MISSING",
                severity: "high",
                message: inv.message,
                code: inv.code,
                recommendation: inv.recommendation,
                classification: "FAILED_FUNCTIONAL",
            });
            console.log(`  ❌ Invariant MISSING: ${inv.code}`);
        }
    }
    console.log(`  📋 Invariants: ${invariantsPassed}/${INVARIANTS.length} present`);

    // ── 3. Security warnings ─────────────────────────────────────────
    // Check for information leak risks
    const LEAK_PATTERNS = [
        {
            pattern: /["']User not found["']/i,
            code: "AUTH_LEAK_USER_NOT_FOUND",
            message: 'Error message "User not found" leaks user existence',
            recommendation: 'Use generic "Invalid credentials" instead',
        },
        {
            pattern: /["']Wrong password["']/i,
            code: "AUTH_LEAK_WRONG_PASSWORD",
            message: 'Error message "Wrong password" leaks credential validity',
            recommendation: 'Use generic "Invalid credentials" instead',
        },
        {
            pattern: /["']Password incorrect["']/i,
            code: "AUTH_LEAK_PASSWORD_INCORRECT",
            message: 'Error message "Password incorrect" leaks credential info',
            recommendation: 'Use generic "Invalid credentials" instead',
        },
    ];

    let leakCount = 0;
    for (const lp of LEAK_PATTERNS) {
        if (lp.pattern.test(source)) {
            warnings.push({
                type: "ERROR_LEAK_RISK",
                severity: "medium",
                message: lp.message,
                code: lp.code,
                recommendation: lp.recommendation,
            });
            console.log(`  ⚠️  [${lp.code}] ${lp.message}`);
            leakCount++;
        }
    }

    // Check generic error message exists (good practice)
    if (!/["']Invalid credentials["']/.test(source)) {
        warnings.push({
            type: "GENERIC_ERROR_MISSING",
            severity: "low",
            message: 'Generic "Invalid credentials" error message not found',
            code: "AUTH_NO_GENERIC_ERROR",
            recommendation: 'Ensure login returns generic "Invalid credentials" for both user-not-found and wrong-password',
        });
        console.log('  ⚠️  [AUTH_NO_GENERIC_ERROR] Generic "Invalid credentials" not found');
    } else {
        console.log('  ✅ Generic "Invalid credentials" error message present');
    }

    if (leakCount === 0) {
        console.log("  ✅ No error leak risks detected");
    }

    // ── 4. Module exports check ──────────────────────────────────────
    if (!/platformLogin/.test(source)) {
        warnings.push({
            type: "LOGIN_EXPORT_MISSING",
            severity: "high",
            message: "platformLogin function not found in controller",
            code: "AUTH_NO_LOGIN_EXPORT",
            recommendation: "Ensure platformLogin is exported from the controller",
        });
        console.log("  ⚠️  [AUTH_NO_LOGIN_EXPORT] platformLogin export missing");
    } else {
        console.log("  ✅ platformLogin function present");
    }

} catch (err) {
    failures.push({
        type: "VALIDATOR_ERROR",
        severity: "high",
        message: `Auth controller integrity error: ${err.message}`,
        code: "AUTH_VALIDATOR_ERROR",
        recommendation: "Check validator script and controller file path",
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
        name: "validate:auth-controller-integrity",
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
