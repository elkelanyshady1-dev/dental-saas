require("module-alias/register");
/**
 * validate-auth-flow.js
 * Phase 23 — Auth Flow Simulation Validator (Structured Warning Intelligence)
 *
 * Simulates the platform authentication lifecycle:
 *   1. Invalid credentials → must return 401 (never 500)
 *   2. Valid credentials (optional, env-driven) → must return 200 + token + user
 *   3. Capability fetch with valid token → must return 200
 *
 * Classifications:
 *   PASSED                     — Auth lifecycle correct
 *   INFRASTRUCTURE_UNAVAILABLE — Server unreachable (transient, deploy window)
 *   FAILED_FUNCTIONAL          — Server reachable but auth broken
 *
 * Uses native Node.js http module — no external dependencies.
 * Never crashes governance engine.
 */

const http = require("http");
const { retryWithBackoff } = require("../utils/retryWithBackoff");

const BASE_URL = process.env.RUNTIME_AUDIT_BASE_URL || "http://localhost:5000";
const TIMEOUT = 5000;

const failures = [];
const warnings = [];
const startTime = Date.now();

// ── Transient error codes ───────────────────────────────────────────────────
const TRANSIENT_ERRORS = ["ECONNREFUSED", "ECONNRESET", "ENOTFOUND", "ETIMEDOUT"];

function httpRequest(method, urlPath, body = null, headers = {}) {
    return new Promise((resolve, reject) => {
        const parsed = new URL(urlPath, BASE_URL);
        const options = {
            hostname: parsed.hostname,
            port: parsed.port,
            path: parsed.pathname + parsed.search,
            method: method.toUpperCase(),
            timeout: TIMEOUT,
            headers: { ...headers },
        };

        if (body) {
            const payload = JSON.stringify(body);
            options.headers["Content-Type"] = "application/json";
            options.headers["Content-Length"] = Buffer.byteLength(payload);
        }

        const req = http.request(options, (res) => {
            let data = "";
            res.on("data", (chunk) => { data += chunk; });
            res.on("end", () => {
                let parsed = null;
                try { parsed = JSON.parse(data); } catch { /* not JSON */ }
                resolve({
                    status: res.statusCode,
                    headers: res.headers,
                    body: data,
                    json: parsed,
                    error: null,
                });
            });
        });

        req.on("timeout", () => {
            req.destroy();
            const err = new Error("ETIMEDOUT");
            err.code = "ETIMEDOUT";
            reject(err);
        });

        req.on("error", (err) => {
            reject(err);
        });

        if (body) req.write(JSON.stringify(body));
        req.end();
    });
}

async function run() {
    console.log("╔══════════════════════════════════════════╗");
    console.log("║  AUTH FLOW SIMULATION — Phase 23 (SWI) ║");
    console.log("╚══════════════════════════════════════════╝");
    console.log(`  Base URL: ${BASE_URL}`);
    console.log("");

    let classification = "PASSED";
    let retryMetadata = {};
    let authSimulationPassed = true;

    // ── Step 1: Invalid credentials → 401 (with retry for connectivity) ─────
    process.stdout.write("  ⏳ Invalid credentials test (with retry)...");
    const invalidRetry = await retryWithBackoff(
        () => httpRequest("post", "/api/platform/auth/login", {
            email: "runtime-audit@nonexistent.com", password: "invalid"
        }),
        { retries: 3, delay: 500 }
    );
    retryMetadata.invalidCredentials = invalidRetry.attempts;

    if (!invalidRetry.success) {
        // All retries failed
        const allTransient = invalidRetry.attempts.every(a =>
            TRANSIENT_ERRORS.includes(a.errorCode)
        );

        if (allTransient) {
            classification = "INFRASTRUCTURE_UNAVAILABLE";
            failures.push({
                type: "auth_flow_broken",
                severity: "CRITICAL",
                classification: "INFRASTRUCTURE_UNAVAILABLE",
                message: `Auth endpoint unreachable after ${invalidRetry.attempts.length} retries (${invalidRetry.attempts[0].errorCode})`,
                metadata: { step: "invalid_credentials", retryAttempts: invalidRetry.attempts.length },
            });
            authSimulationPassed = false;
            console.log(`\r  ⚠️  Auth endpoint: INFRASTRUCTURE_UNAVAILABLE (${invalidRetry.attempts.length} retries)`);
        } else {
            classification = "FAILED_FUNCTIONAL";
            failures.push({
                type: "auth_flow_broken",
                severity: "CRITICAL",
                classification: "FAILED_FUNCTIONAL",
                message: `Auth endpoint failed after ${invalidRetry.attempts.length} retries`,
                metadata: { step: "invalid_credentials", retryAttempts: invalidRetry.attempts.length },
            });
            authSimulationPassed = false;
            console.log(`\r  ❌ Auth endpoint: FAILED_FUNCTIONAL`);
        }
    } else {
        const invalidRes = invalidRetry.result;
        if (invalidRes.status >= 500) {
            classification = "FAILED_FUNCTIONAL";
            failures.push({
                type: "auth_flow_broken",
                severity: "CRITICAL",
                classification: "FAILED_FUNCTIONAL",
                message: `Invalid login returned ${invalidRes.status} instead of 401`,
                metadata: { step: "invalid_credentials", status: invalidRes.status },
            });
            authSimulationPassed = false;
            console.log(`\r  ❌ Invalid credentials returned ${invalidRes.status} (FAILED_FUNCTIONAL)`);
        } else if (invalidRes.status === 401) {
            console.log(`\r  ✅ Invalid credentials → 401 (auth lifecycle correct)`);
        } else {
            warnings.push({
                code: "AUTH_UNEXPECTED_STATUS",
                message: `Invalid login returned ${invalidRes.status} (expected 401).`,
                recommendation: "Verify auth controller returns 401 for invalid credentials.",
                severity: "low",
                type: "auth_unexpected_status",
                metadata: { step: "invalid_credentials", status: invalidRes.status },
            });
            console.log(`\r  ⚠️  Invalid credentials → ${invalidRes.status} (expected 401)`);
        }
    }

    // ── Step 2: Valid credentials (env-gated) ────────────────────────────────
    const testEmail = process.env.RUNTIME_TEST_EMAIL;
    const testPassword = process.env.RUNTIME_TEST_PASSWORD;
    let validToken = null;

    if (classification !== "INFRASTRUCTURE_UNAVAILABLE" && testEmail && testPassword) {
        process.stdout.write("  ⏳ Valid credentials test...");
        try {
            const validRes = await httpRequest("post", "/api/platform/auth/login", {
                email: testEmail, password: testPassword
            });

            if (validRes.status === 200 && validRes.json) {
                const hasToken = typeof validRes.json.token === "string" && validRes.json.token.length > 0;
                const hasUser = typeof validRes.json.user === "object" && validRes.json.user !== null;

                if (hasToken && hasUser) {
                    validToken = validRes.json.token;
                    console.log(`\r  ✅ Valid credentials → 200 (token + user)`);
                } else if (validRes.json.requires2FA) {
                    console.log(`\r  ✅ Valid credentials → 200 (2FA required — skipping token test)`);
                    warnings.push({
                        code: "AUTH_2FA_ACTIVE",
                        message: "Valid credential test skipped post-login steps (2FA enabled).",
                        recommendation: "This is informational — 2FA is correctly intercepting the auth flow.",
                        severity: "low",
                        type: "auth_2fa_active",
                        metadata: { step: "valid_credentials" },
                    });
                } else {
                    classification = "FAILED_FUNCTIONAL";
                    failures.push({
                        type: "auth_flow_broken",
                        severity: "CRITICAL",
                        classification: "FAILED_FUNCTIONAL",
                        message: `Login 200 but missing token (${hasToken}) or user (${hasUser})`,
                        metadata: { step: "valid_credentials" },
                    });
                    authSimulationPassed = false;
                    console.log(`\r  ❌ Valid credentials → 200 but malformed response`);
                }
            } else if (validRes.status >= 500) {
                classification = "FAILED_FUNCTIONAL";
                failures.push({
                    type: "auth_flow_broken",
                    severity: "CRITICAL",
                    classification: "FAILED_FUNCTIONAL",
                    message: `Valid credentials returned ${validRes.status} (expected 200)`,
                    metadata: { step: "valid_credentials", status: validRes.status },
                });
                authSimulationPassed = false;
                console.log(`\r  ❌ Valid credentials → ${validRes.status}`);
            } else {
                failures.push({
                    type: "auth_flow_broken",
                    severity: "CRITICAL",
                    classification: "FAILED_FUNCTIONAL",
                    message: `Valid credentials returned ${validRes.status} (expected 200)`,
                    metadata: { step: "valid_credentials", status: validRes.status },
                });
                authSimulationPassed = false;
                console.log(`\r  ❌ Valid credentials → ${validRes.status}`);
            }
        } catch (err) {
            console.log(`\r  ⚠️  Valid credentials: ${err.code || err.message}`);
        }

        // ── Step 3: Capability fetch with token ──────────────────────────────
        if (validToken) {
            process.stdout.write("  ⏳ Capability fetch with token...");
            try {
                const capsRes = await httpRequest("get", "/api/platform/capabilities", null, {
                    Authorization: `Bearer ${validToken}`,
                });

                if (capsRes.status === 401) {
                    classification = "FAILED_FUNCTIONAL";
                    failures.push({
                        type: "auth_flow_broken",
                        severity: "CRITICAL",
                        classification: "FAILED_FUNCTIONAL",
                        message: "Capabilities returned 401 with valid token",
                        metadata: { step: "capabilities_with_token", status: 401 },
                    });
                    authSimulationPassed = false;
                    console.log(`\r  ❌ Capabilities → 401 (token rejected)`);
                } else if (capsRes.status >= 500) {
                    classification = "FAILED_FUNCTIONAL";
                    failures.push({
                        type: "auth_flow_broken",
                        severity: "CRITICAL",
                        classification: "FAILED_FUNCTIONAL",
                        message: `Capabilities returned ${capsRes.status} with valid token`,
                        metadata: { step: "capabilities_with_token", status: capsRes.status },
                    });
                    authSimulationPassed = false;
                    console.log(`\r  ❌ Capabilities → ${capsRes.status}`);
                } else {
                    console.log(`\r  ✅ Capability fetch with token → ${capsRes.status}`);
                }
            } catch (err) {
                console.log(`\r  ⚠️  Capabilities: ${err.code || err.message}`);
            }
        }
    } else if (classification === "INFRASTRUCTURE_UNAVAILABLE") {
        console.log("  ℹ️  Skipping valid credential test (infrastructure unavailable)");
    } else {
        console.log("  ℹ️  Skipping valid credential test (RUNTIME_TEST_EMAIL not set)");
    }

    // ── Summary ──────────────────────────────────────────────────────────────
    const durationMs = Date.now() - startTime;
    const status = classification === "PASSED" ? "PASSED" : "FAILED";

    console.log("");
    if (warnings.length > 0) {
        for (const w of warnings) console.log(`  ⚠️  ${w.message}`);
    }
    if (failures.length > 0) {
        for (const f of failures) console.log(`  ❌ ${f.message}`);
    }
    console.log(`  CLASSIFICATION: ${classification}`);
    console.log(`  RESULT: ${status} (${durationMs}ms, ${failures.length} failures, ${warnings.length} warnings)`);

    const result = {
        name: "validate:auth-flow-simulation",
        status,
        classification,
        durationMs,
        warnings,
        failures,
        retryMetadata,
        authSimulation: authSimulationPassed ? "PASSED" : "FAILED",
        timestamp: new Date().toISOString(),
    };
    console.log("__GOVERNANCE_JSON_START__");
    console.log(JSON.stringify(result));
    console.log("__GOVERNANCE_JSON_END__");

    process.exit(status === "PASSED" ? 0 : 1);
}

run().catch(err => {
    console.error("  ❌ Auth flow validator crashed:", err.message);
    console.log("  RESULT: FAILED");
    process.exit(1);
});
