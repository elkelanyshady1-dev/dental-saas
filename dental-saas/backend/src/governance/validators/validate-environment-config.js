require("module-alias/register");
/**
 * validate-environment-config.js
 * Phase 23 — Environment Configuration Consistency Audit (Structured Warning Intelligence)
 *
 * Static analysis of app.js and controller files:
 *   1. express.json() middleware present
 *   2. Global error handler middleware present
 *   3. CORS configured (+ permissiveness check)
 *   4. No direct process.exit() in controllers
 *
 * Phase 23: All warnings are structured objects with code, message,
 *           recommendation, and severity (low/medium/high).
 *
 * Reads source files only — no network calls.
 * Never crashes governance engine.
 */

const fs = require("fs");
const path = require("path");

const BACKEND_ROOT = path.resolve(__dirname, "../../..");
const APP_JS_PATH = path.resolve(BACKEND_ROOT, "app.js");
const CONTROLLERS_DIR = path.resolve(BACKEND_ROOT, "src");

const failures = [];
const warnings = [];
const startTime = Date.now();

console.log("╔══════════════════════════════════════════╗");
console.log("║  ENV CONFIG CONSISTENCY — Phase 23 (SWI) ║");
console.log("╚══════════════════════════════════════════╝");
console.log("");

// ── Check 1: express.json() in app.js ────────────────────────────────────────
let appContent = "";
try {
    appContent = fs.readFileSync(APP_JS_PATH, "utf8");
} catch (err) {
    failures.push({
        type: "missing_app_js",
        severity: "CRITICAL",
        message: `Cannot read app.js: ${err.message}`,
        metadata: { file: "app.js" },
    });
    console.log(`  ❌ app.js: NOT FOUND`);
}

if (appContent) {
    // Check express.json()
    if (appContent.includes("express.json()")) {
        console.log("  ✅ express.json() middleware: PRESENT");
    } else {
        failures.push({
            type: "missing_json_middleware",
            severity: "HIGH",
            message: "express.json() middleware not found in app.js — req.body will be undefined",
            metadata: { file: "app.js" },
        });
        console.log("  ❌ express.json() middleware: MISSING");
    }

    // Check global error handler (err, req, res, next) pattern
    const hasErrorHandler =
        appContent.includes("errorHandler") ||
        /app\.use\s*\(\s*(?:\(|function\s*\()\s*err\s*,\s*req\s*,\s*res\s*,\s*next/.test(appContent);

    if (hasErrorHandler) {
        console.log("  ✅ Global error handler: PRESENT");
    } else {
        failures.push({
            type: "missing_error_handler",
            severity: "HIGH",
            message: "Global error handler middleware not found in app.js — unhandled errors will crash server",
            metadata: { file: "app.js" },
        });
        console.log("  ❌ Global error handler: MISSING");
    }

    // Check CORS
    const hasCors = appContent.includes("cors") || appContent.includes("CORS");
    if (hasCors) {
        console.log("  ✅ CORS configuration: PRESENT");

        // Phase 23: Check for overly permissive CORS
        const hasWildcardOrigin =
            appContent.includes("origin: '*'") ||
            appContent.includes('origin: "*"') ||
            appContent.includes("origin: true");
        const isProduction = process.env.NODE_ENV === "production";

        if (hasWildcardOrigin && isProduction) {
            warnings.push({
                code: "CORS_PERMISSIVE",
                message: "CORS origin is set to wildcard in production.",
                recommendation: "Restrict allowed origins explicitly to your frontend domain(s).",
                severity: "medium",
                type: "cors_permissive",
                metadata: { file: "app.js", env: "production" },
            });
            console.log("  ⚠️  [CORS_PERMISSIVE] CORS origin is wildcard in production");
        } else if (hasWildcardOrigin) {
            warnings.push({
                code: "CORS_WILDCARD_DEV",
                message: "CORS origin is set to wildcard (acceptable in development).",
                recommendation: "Ensure CORS is restricted before deploying to production.",
                severity: "low",
                type: "cors_wildcard_dev",
                metadata: { file: "app.js", env: process.env.NODE_ENV || "development" },
            });
            console.log("  ⚠️  [CORS_WILDCARD_DEV] CORS uses wildcard origin");
        }
    } else {
        warnings.push({
            code: "CORS_MISSING",
            message: "CORS configuration not found in app.js — frontend on separate port may be blocked.",
            recommendation: "Add cors middleware with explicit origin configuration.",
            severity: "medium",
            type: "missing_cors",
            metadata: { file: "app.js" },
        });
        console.log("  ⚠️  [CORS_MISSING] CORS configuration: NOT DETECTED");
    }

    // Phase 23: Check for helmet (security headers)
    if (!appContent.includes("helmet")) {
        warnings.push({
            code: "HELMET_MISSING",
            message: "Helmet middleware not detected in app.js — security headers may be missing.",
            recommendation: "Install and configure helmet for HTTP security headers.",
            severity: "low",
            type: "missing_helmet",
            metadata: { file: "app.js" },
        });
        console.log("  ⚠️  [HELMET_MISSING] Helmet middleware: NOT DETECTED");
    } else {
        console.log("  ✅ Helmet middleware: PRESENT");
    }

    // Phase 23: Check for rate limiting
    if (!appContent.includes("rateLimit") && !appContent.includes("rate-limit") && !appContent.includes("rateLimiter")) {
        warnings.push({
            code: "RATE_LIMIT_MISSING",
            message: "Rate limiting middleware not detected in app.js.",
            recommendation: "Consider adding express-rate-limit to protect against brute force attacks.",
            severity: "low",
            type: "missing_rate_limit",
            metadata: { file: "app.js" },
        });
        console.log("  ⚠️  [RATE_LIMIT_MISSING] Rate limiting: NOT DETECTED");
    } else {
        console.log("  ✅ Rate limiting: PRESENT");
    }
}

// ── Check 4: No process.exit() in controllers ────────────────────────────────
console.log("");
console.log("  🔍 Scanning controllers for process.exit()...");

function scanForProcessExit(dir, relativeTo) {
    const violations = [];

    function walk(currentDir) {
        let entries;
        try {
            entries = fs.readdirSync(currentDir, { withFileTypes: true });
        } catch {
            return;
        }

        for (const entry of entries) {
            const fullPath = path.join(currentDir, entry.name);

            if (entry.isDirectory()) {
                // Skip node_modules, governance, scripts
                if (["node_modules", "governance", "scripts", "test", "__tests__"].includes(entry.name)) continue;
                walk(fullPath);
            } else if (entry.isFile() && entry.name.endsWith("Controller.js") || entry.name.endsWith("controller.js")) {
                try {
                    const content = fs.readFileSync(fullPath, "utf8");
                    const lines = content.split("\n");
                    for (let i = 0; i < lines.length; i++) {
                        const line = lines[i];
                        if (line.includes("process.exit") && !line.trim().startsWith("//") && !line.trim().startsWith("*")) {
                            violations.push({
                                file: path.relative(relativeTo, fullPath),
                                line: i + 1,
                                code: line.trim().substring(0, 80),
                            });
                        }
                    }
                } catch { /* skip unreadable files */ }
            }
        }
    }

    walk(dir);
    return violations;
}

const exitViolations = scanForProcessExit(CONTROLLERS_DIR, BACKEND_ROOT);

if (exitViolations.length === 0) {
    console.log("  ✅ No process.exit() in controllers");
} else {
    for (const v of exitViolations) {
        failures.push({
            type: "process_exit_in_controller",
            severity: "HIGH",
            message: `process.exit() found in controller: ${v.file}:${v.line}`,
            metadata: { file: v.file, line: v.line, code: v.code },
        });
        console.log(`  ❌ process.exit() at ${v.file}:${v.line}`);
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
    name: "validate:environment-config",
    status,
    durationMs,
    warnings,
    failures,
};
console.log("__GOVERNANCE_JSON_START__");
console.log(JSON.stringify(result));
console.log("__GOVERNANCE_JSON_END__");

process.exit(status === "PASSED" ? 0 : 1);
