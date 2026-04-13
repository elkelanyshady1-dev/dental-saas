require("module-alias/register");
/**
 * validate-jwt-env-integrity.js
 * Phase 23 — JWT & Environment Integrity Scanner (Structured Warning Intelligence)
 *
 * Static analysis of environment configuration:
 *   1. Required env variables present
 *   2. JWT_SECRET minimum strength
 *   3. NODE_ENV whitelist enforcement
 *   4. Production hardening checks
 *
 * Phase 23: All warnings are structured objects with code, message,
 *           recommendation, and severity (low/medium/high).
 *
 * Never performs network calls — reads process.env only.
 * Never crashes governance engine.
 */

require("dotenv").config();

const failures = [];
const warnings = [];
const startTime = Date.now();

// ── Check 1: Required env variables ──────────────────────────────────────────
const REQUIRED_VARS = [
    { name: "JWT_SECRET", severity: "CRITICAL" },
    { name: "NODE_ENV", severity: "HIGH" },
    { name: "PORT", severity: "HIGH" },
    { name: "MONGO_URI", severity: "HIGH" },
];

console.log("╔══════════════════════════════════════════╗");
console.log("║  JWT & ENV INTEGRITY — Phase 23 (SWI)   ║");
console.log("╚══════════════════════════════════════════╝");
console.log("");

for (const v of REQUIRED_VARS) {
    const value = process.env[v.name];
    if (!value || value.trim().length === 0) {
        failures.push({
            type: "missing_env_variable",
            severity: v.severity,
            message: `Required environment variable ${v.name} is missing or empty`,
            metadata: { variable: v.name },
        });
        console.log(`  ❌ ${v.name}: MISSING (${v.severity})`);
    } else {
        console.log(`  ✅ ${v.name}: SET`);
    }
}

// ── Check 2: JWT_SECRET strength ─────────────────────────────────────────────
const jwtSecret = process.env.JWT_SECRET || "";
if (jwtSecret.length > 0 && jwtSecret.length < 32) {
    warnings.push({
        code: "JWT_SECRET_LENGTH",
        message: `JWT_SECRET length is below recommended minimum of 32 characters (current: ${jwtSecret.length}).`,
        recommendation: "Increase JWT_SECRET to at least 32 characters for adequate entropy.",
        severity: "high",
        type: "weak_jwt_secret",
        metadata: { length: jwtSecret.length, required: 32 },
    });
    console.log(`  ⚠️  JWT_SECRET strength: WEAK (${jwtSecret.length}/32 chars)`);
} else if (jwtSecret.length >= 32 && jwtSecret.length < 64) {
    warnings.push({
        code: "JWT_SECRET_SUBOPTIMAL",
        message: `JWT_SECRET is ${jwtSecret.length} chars — acceptable but below recommended 64.`,
        recommendation: "Consider increasing JWT_SECRET to 64+ characters for production-grade entropy.",
        severity: "low",
        type: "suboptimal_jwt_secret",
        metadata: { length: jwtSecret.length, recommended: 64 },
    });
    console.log(`  ✅ JWT_SECRET strength: OK (${jwtSecret.length} chars)`);
} else if (jwtSecret.length >= 64) {
    console.log(`  ✅ JWT_SECRET strength: STRONG (${jwtSecret.length} chars)`);
}

// ── Check 3: NODE_ENV whitelist ──────────────────────────────────────────────
const VALID_ENVS = ["development", "production", "test"];
const nodeEnv = process.env.NODE_ENV || "";
if (nodeEnv && !VALID_ENVS.includes(nodeEnv)) {
    failures.push({
        type: "invalid_node_env",
        severity: "HIGH",
        message: `NODE_ENV="${nodeEnv}" is not in allowed set: ${VALID_ENVS.join(", ")}`,
        metadata: { value: nodeEnv, allowed: VALID_ENVS },
    });
    console.log(`  ❌ NODE_ENV: "${nodeEnv}" is invalid`);
} else if (nodeEnv) {
    console.log(`  ✅ NODE_ENV: "${nodeEnv}"`);
}

// ── Check 4: Production hardening ────────────────────────────────────────────
if (nodeEnv === "production") {
    console.log("");
    console.log("  🔒 Production hardening checks:");

    if (process.env.COOKIE_SECURE !== "true") {
        warnings.push({
            code: "COOKIE_INSECURE_PROD",
            message: "COOKIE_SECURE is not set to 'true' in production.",
            recommendation: "Set COOKIE_SECURE=true to enforce secure cookies in production.",
            severity: "high",
            type: "production_cookie_insecure",
            metadata: { variable: "COOKIE_SECURE" },
        });
        console.log(`  ⚠️  COOKIE_SECURE: not set to "true"`);
    } else {
        console.log(`  ✅ COOKIE_SECURE: true`);
    }

    // Weak JWT in production is always critical warning
    if (jwtSecret.length < 64) {
        warnings.push({
            code: "JWT_SECRET_PROD_WEAK",
            message: `JWT_SECRET in production should be >= 64 chars (current: ${jwtSecret.length}).`,
            recommendation: "Generate a new JWT_SECRET with at least 64 random characters for production.",
            severity: "high",
            type: "production_weak_jwt",
            metadata: { length: jwtSecret.length, recommended: 64 },
        });
        console.log(`  ⚠️  JWT_SECRET: recommended >= 64 chars for production`);
    }
}

// ── Summary ──────────────────────────────────────────────────────────────────
const durationMs = Date.now() - startTime;
const status = failures.length === 0 ? "PASSED" : "FAILED";

console.log("");
if (warnings.length > 0) {
    for (const w of warnings) console.log(`  ⚠️  [${w.code}] ${w.message}`);
}
if (failures.length > 0) {
    for (const f of failures) console.log(`  ❌ ${f.message}`);
}
console.log(`  RESULT: ${status} (${durationMs}ms, ${failures.length} failures, ${warnings.length} warnings)`);

const result = {
    name: "validate:jwt-env-integrity",
    status,
    durationMs,
    warnings,
    failures,
    envIntegrity: status,
};
console.log("__GOVERNANCE_JSON_START__");
console.log(JSON.stringify(result));
console.log("__GOVERNANCE_JSON_END__");

process.exit(status === "PASSED" ? 0 : 1);
