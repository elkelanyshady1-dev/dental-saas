require("module-alias/register");
/**
 * validate-runtime-integrity.js
 * Phase 23 — Runtime Integrity Validator (Structured Warning Intelligence)
 *
 * Tests live backend endpoints for operational integrity:
 *   1. Health endpoint responsiveness (with retry)
 *   2. Auth endpoint crash-safety (no 500s)
 *   3. Capabilities endpoint availability
 *
 * Classifications:
 *   PASSED                     — All endpoints healthy
 *   INFRASTRUCTURE_UNAVAILABLE — Server unreachable (transient, deploy window)
 *   FAILED_FUNCTIONAL          — Server reachable but returning errors
 *
 * Uses native Node.js http module — no external dependencies.
 * Never crashes governance engine — all errors are caught and reported.
 */

const http = require("http");
const { retryWithBackoff } = require("../utils/retryWithBackoff");

const BASE_URL = process.env.RUNTIME_AUDIT_BASE_URL || "http://localhost:5000";
const TIMEOUT = 3000;

const failures = [];
const warnings = [];
const startTime = Date.now();

// ── Transient error codes that indicate infrastructure unavailability ────────
const TRANSIENT_ERRORS = ["ECONNREFUSED", "ECONNRESET", "ENOTFOUND", "ETIMEDOUT"];

function httpRequest(method, urlPath, body = null) {
    return new Promise((resolve, reject) => {
        const parsed = new URL(urlPath, BASE_URL);
        const options = {
            hostname: parsed.hostname,
            port: parsed.port,
            path: parsed.pathname + parsed.search,
            method: method.toUpperCase(),
            timeout: TIMEOUT,
            headers: {},
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
                let json = null;
                try { json = JSON.parse(data); } catch { /* not JSON */ }
                resolve({
                    status: res.statusCode,
                    headers: res.headers,
                    body: data,
                    json,
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
    console.log("║  RUNTIME INTEGRITY — Phase 22 (OI Mode) ║");
    console.log("╚══════════════════════════════════════════╝");
    console.log(`  Base URL: ${BASE_URL}`);
    console.log("");

    let classification = "PASSED";
    let retryMetadata = {};
    let serverUptime = null;
    const nodeVersion = process.version;

    // ── Test 1: Health endpoint (with retry) ─────────────────────────────────
    process.stdout.write("  ⏳ Health check (with retry)...");
    const healthRetry = await retryWithBackoff(
        () => httpRequest("get", "/health"),
        { retries: 3, delay: 500 }
    );
    retryMetadata.health = healthRetry.attempts;

    if (!healthRetry.success) {
        // All retries failed — check if all errors are transient
        const allTransient = healthRetry.attempts.every(a =>
            TRANSIENT_ERRORS.includes(a.errorCode)
        );

        if (allTransient) {
            classification = "INFRASTRUCTURE_UNAVAILABLE";
            failures.push({
                type: "runtime_execution_failure",
                severity: "CRITICAL",
                classification: "INFRASTRUCTURE_UNAVAILABLE",
                message: `Server unreachable after ${healthRetry.attempts.length} retries (${healthRetry.attempts[0].errorCode})`,
                metadata: { endpoint: "/health", retryAttempts: healthRetry.attempts.length },
            });
            console.log(`\r  ⚠️  Health check: INFRASTRUCTURE_UNAVAILABLE (${healthRetry.attempts.length} retries)`);
        } else {
            classification = "FAILED_FUNCTIONAL";
            failures.push({
                type: "runtime_execution_failure",
                severity: "CRITICAL",
                classification: "FAILED_FUNCTIONAL",
                message: `Health check failed after ${healthRetry.attempts.length} retries`,
                metadata: { endpoint: "/health", retryAttempts: healthRetry.attempts.length },
            });
            console.log(`\r  ❌ Health check: FAILED_FUNCTIONAL`);
        }
    } else {
        const healthRes = healthRetry.result;
        if (healthRes.status >= 500) {
            classification = "FAILED_FUNCTIONAL";
            failures.push({
                type: "runtime_execution_failure",
                severity: "CRITICAL",
                classification: "FAILED_FUNCTIONAL",
                message: `Health endpoint returned HTTP ${healthRes.status}`,
                metadata: { endpoint: "/health", status: healthRes.status },
            });
            console.log(`\r  ❌ Health check: ${healthRes.status} (FAILED_FUNCTIONAL)`);
        } else {
            // Extract uptime if available in health response
            if (healthRes.json && typeof healthRes.json.uptime === "number") {
                serverUptime = healthRes.json.uptime;
            }
            console.log(`\r  ✅ Health check (${healthRes.status})${serverUptime != null ? ` uptime=${serverUptime}s` : ""}`);

            // Phase 23: Latency warning
            const healthDuration = healthRetry.attempts.reduce((sum, a) => sum + a.durationMs, 0);
            if (healthDuration > 1500) {
                warnings.push({
                    code: "HIGH_RUNTIME_LATENCY",
                    message: `Health endpoint response exceeded 1500ms (${healthDuration}ms).`,
                    recommendation: "Investigate server load or blocking middleware.",
                    severity: "low",
                    type: "high_latency",
                    metadata: { endpoint: "/health", durationMs: healthDuration, threshold: 1500 },
                });
                console.log(`  ⚠️  [HIGH_RUNTIME_LATENCY] ${healthDuration}ms`);
            }
        }
    }

    // ── Test 2: Login endpoint crash-safety ───────────────────────────────────
    if (classification !== "INFRASTRUCTURE_UNAVAILABLE") {
        process.stdout.write("  ⏳ Login crash-safety...");
        try {
            const loginRes = await httpRequest("post", "/api/platform/auth/login", {
                email: "runtime-audit@test.com", password: "invalid"
            });
            if (loginRes.status >= 500) {
                classification = "FAILED_FUNCTIONAL";
                failures.push({
                    type: "runtime_execution_failure",
                    severity: "CRITICAL",
                    classification: "FAILED_FUNCTIONAL",
                    message: `Login endpoint returned HTTP ${loginRes.status}`,
                    metadata: { endpoint: "/api/platform/auth/login", status: loginRes.status },
                });
                console.log(`\r  ❌ Login crash-safety: ${loginRes.status}`);
            } else {
                console.log(`\r  ✅ Login crash-safety (${loginRes.status})`);
            }
        } catch (err) {
            // Server went down between health and login
            console.log(`\r  ⚠️  Login crash-safety: ${err.code || err.message}`);
        }

        // ── Test 3: Capabilities endpoint ────────────────────────────────────
        process.stdout.write("  ⏳ Capabilities endpoint...");
        try {
            const capsRes = await httpRequest("get", "/api/platform/capabilities");
            if (capsRes.status >= 500) {
                if (classification !== "FAILED_FUNCTIONAL") classification = "FAILED_FUNCTIONAL";
                failures.push({
                    type: "runtime_execution_failure",
                    severity: "CRITICAL",
                    classification: "FAILED_FUNCTIONAL",
                    message: `Capabilities endpoint returned HTTP ${capsRes.status}`,
                    metadata: { endpoint: "/api/platform/capabilities", status: capsRes.status },
                });
                console.log(`\r  ❌ Capabilities endpoint: ${capsRes.status}`);
            } else {
                // Non-JSON for API route
                const ct = capsRes.headers["content-type"] || "";
                if (!ct.includes("application/json")) {
                    warnings.push({
                        code: "NON_JSON_API_RESPONSE",
                        message: `Non-JSON response from GET /api/platform/capabilities (${ct}).`,
                        recommendation: "Ensure API endpoints return Content-Type: application/json.",
                        severity: "medium",
                        type: "non_json_response",
                        metadata: { endpoint: "/api/platform/capabilities", contentType: ct },
                    });
                }
                console.log(`\r  ✅ Capabilities endpoint (${capsRes.status})`);
            }
        } catch (err) {
            console.log(`\r  ⚠️  Capabilities endpoint: ${err.code || err.message}`);
        }
    } else {
        console.log("  ℹ️  Skipping login + capabilities (infrastructure unavailable)");
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

    // Output structured JSON for governance engine forensic extraction
    const result = {
        name: "validate:runtime-integrity",
        status,
        classification,
        durationMs,
        warnings,
        failures,
        retryMetadata,
        serverUptime,
        nodeVersion,
        timestamp: new Date().toISOString(),
    };
    console.log("__GOVERNANCE_JSON_START__");
    console.log(JSON.stringify(result));
    console.log("__GOVERNANCE_JSON_END__");

    process.exit(status === "PASSED" ? 0 : 1);
}

run().catch(err => {
    console.error("  ❌ Runtime integrity validator crashed:", err.message);
    console.log("  RESULT: FAILED");
    process.exit(1);
});
