require("module-alias/register");
/**
 * validateJwtSecretEntropy.js
 * Phase 26 — JWT Secret Entropy Validator
 *
 * Validates JWT_SECRET strength without logging or printing it.
 * Checks: length, character class diversity, pattern detection,
 *         repeated character ratio.
 *
 * Never logs the secret. Never prints it.
 * Never crashes governance engine.
 */

require("dotenv").config();

const failures = [];
const warnings = [];
const startTime = Date.now();

console.log("╔══════════════════════════════════════════════╗");
console.log("║  JWT SECRET ENTROPY — Phase 26               ║");
console.log("╚══════════════════════════════════════════════╝");
console.log("");

const secret = process.env.JWT_SECRET || "";

// ── 1. Existence ─────────────────────────────────────────────────────────────
if (!secret || secret.trim().length === 0) {
    failures.push({
        type: "JWT_SECRET_MISSING",
        severity: "high",
        message: "JWT_SECRET is not set or empty",
        code: "ENTROPY_NO_SECRET",
        recommendation: "Set JWT_SECRET in .env with a cryptographically random value >= 64 chars",
        classification: "FAILED_FUNCTIONAL",
    });
    console.log("  ❌ JWT_SECRET is missing or empty");
    finish();
}

// ── 2. Length ─────────────────────────────────────────────────────────────────
const len = secret.length;
console.log(`  🔍 JWT_SECRET length: ${len} characters`);

if (len < 32) {
    failures.push({
        type: "JWT_SECRET_TOO_SHORT",
        severity: "high",
        message: `JWT_SECRET is only ${len} chars — minimum 32 required`,
        code: "ENTROPY_LENGTH_CRITICAL",
        recommendation: "Generate a new secret: node -e \"console.log(require('crypto').randomBytes(64).toString('hex'))\"",
        classification: "FAILED_FUNCTIONAL",
    });
    console.log(`  ❌ Length ${len} < 32 — CRITICAL`);
} else if (len < 64) {
    warnings.push({
        type: "JWT_SECRET_SHORT",
        severity: "medium",
        message: `JWT_SECRET is ${len} chars — recommended >= 64`,
        code: "ENTROPY_LENGTH_WARN",
        recommendation: "Consider upgrading to a 64+ character secret for production hardening",
    });
    console.log(`  ⚠️  Length ${len} < 64 — recommended upgrade`);
} else {
    console.log(`  ✅ Length: ${len} >= 64`);
}

// ── 3. Character class diversity ─────────────────────────────────────────────
const hasUpper = /[A-Z]/.test(secret);
const hasLower = /[a-z]/.test(secret);
const hasDigit = /[0-9]/.test(secret);
const hasSymbol = /[^A-Za-z0-9]/.test(secret);

const classCount = [hasUpper, hasLower, hasDigit, hasSymbol].filter(Boolean).length;
console.log(`  🔍 Character classes: ${classCount}/4 (upper=${hasUpper}, lower=${hasLower}, digit=${hasDigit}, symbol=${hasSymbol})`);

if (classCount < 2) {
    failures.push({
        type: "LOW_CHAR_DIVERSITY",
        severity: "high",
        message: `JWT_SECRET uses only ${classCount} character class(es) — minimum 2 required`,
        code: "ENTROPY_LOW_DIVERSITY",
        recommendation: "Use a mix of uppercase, lowercase, digits, and symbols",
        classification: "FAILED_FUNCTIONAL",
    });
    console.log(`  ❌ Character diversity: ${classCount}/4 — too low`);
} else if (classCount < 3) {
    warnings.push({
        type: "MODERATE_CHAR_DIVERSITY",
        severity: "low",
        message: `JWT_SECRET uses ${classCount}/4 character classes`,
        code: "ENTROPY_MODERATE_DIVERSITY",
        recommendation: "Adding more character classes improves entropy",
    });
    console.log(`  ⚠️  Character diversity: ${classCount}/4`);
} else {
    console.log(`  ✅ Character diversity: ${classCount}/4`);
}

// ── 4. Obvious pattern detection ─────────────────────────────────────────────
const WEAK_PATTERNS = [
    { pattern: /^(.)\1+$/, code: "ENTROPY_ALL_SAME", msg: "All characters identical" },
    { pattern: /password/i, code: "ENTROPY_CONTAINS_PASSWORD", msg: "Contains 'password'" },
    { pattern: /secret/i, code: "ENTROPY_CONTAINS_SECRET", msg: "Contains 'secret'" },
    { pattern: /123456/, code: "ENTROPY_SEQUENTIAL", msg: "Contains sequential '123456'" },
    { pattern: /abcdef/i, code: "ENTROPY_ALPHABETICAL", msg: "Contains alphabetical 'abcdef'" },
    { pattern: /qwerty/i, code: "ENTROPY_KEYBOARD", msg: "Contains keyboard pattern 'qwerty'" },
];

let patternFailures = 0;
for (const wp of WEAK_PATTERNS) {
    if (wp.pattern.test(secret)) {
        failures.push({
            type: "WEAK_PATTERN",
            severity: "high",
            message: wp.msg,
            code: wp.code,
            recommendation: "Generate a cryptographically random secret",
            classification: "FAILED_FUNCTIONAL",
        });
        console.log(`  ❌ Weak pattern: ${wp.msg}`);
        patternFailures++;
    }
}
if (patternFailures === 0) {
    console.log("  ✅ No weak patterns detected");
}

// ── 5. Repeated character ratio ──────────────────────────────────────────────
const charFreq = {};
for (const c of secret) {
    charFreq[c] = (charFreq[c] || 0) + 1;
}
const maxFreq = Math.max(...Object.values(charFreq));
const repeatRatio = maxFreq / len;

if (repeatRatio > 0.3) {
    warnings.push({
        type: "HIGH_REPEAT_RATIO",
        severity: "medium",
        message: `Most frequent character appears ${maxFreq} times (${(repeatRatio * 100).toFixed(1)}% of secret)`,
        code: "ENTROPY_HIGH_REPEAT",
        recommendation: "Use a more uniformly random secret",
    });
    console.log(`  ⚠️  [ENTROPY_HIGH_REPEAT] Repeat ratio: ${(repeatRatio * 100).toFixed(1)}%`);
} else {
    console.log(`  ✅ Repeat ratio: ${(repeatRatio * 100).toFixed(1)}% (healthy)`);
}

// ── 6. Entropy estimate (Shannon) ────────────────────────────────────────────
const uniqueChars = Object.keys(charFreq).length;
let shannonBits = 0;
for (const count of Object.values(charFreq)) {
    const p = count / len;
    shannonBits -= p * Math.log2(p);
}
const totalEntropy = shannonBits * len;
console.log(`  🔍 Estimated entropy: ${totalEntropy.toFixed(1)} bits (${uniqueChars} unique chars)`);

if (totalEntropy < 128) {
    warnings.push({
        type: "LOW_ENTROPY",
        severity: "medium",
        message: `Estimated entropy is ${totalEntropy.toFixed(1)} bits — recommended >= 128`,
        code: "ENTROPY_LOW_BITS",
        recommendation: "Use a longer, more random secret for higher entropy",
    });
    console.log(`  ⚠️  Entropy ${totalEntropy.toFixed(1)} bits < 128 recommended`);
} else {
    console.log(`  ✅ Entropy: ${totalEntropy.toFixed(1)} bits >= 128`);
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
        name: "validate:jwt-secret-entropy",
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
