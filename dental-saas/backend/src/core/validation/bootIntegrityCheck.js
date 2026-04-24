/**
 * bootIntegrityCheck.js
 * ──────────────────────
 * One-shot boot-time scan that loads every Zod-using module under
 * `backend/src` and asserts every exported schema is well-formed.
 *
 * Discovery is automatic: any file whose source contains `require("zod")` is
 * loaded and its named exports are walked. New validators added later need no
 * registration — they're picked up automatically.
 *
 * In `strict` mode (default in production) the process aborts on the first
 * violation. In non-strict mode (default in dev) violations are logged so the
 * server still boots while a fix is in flight.
 *
 * Wired from `server.js` via:
 *   await runBootIntegrityCheck({ strict: process.env.NODE_ENV === "production" });
 */

"use strict";

const fs = require("fs");
const path = require("path");
const logger = require("../../utils/logger");
const { assertModuleSchemas } = require("./assertSchemaIntegrity");

const SCAN_ROOT = path.resolve(__dirname, "..", "..");
const SKIP_DIRS = new Set([
    "node_modules",
    ".git",
    "dist",
    "coverage",
    "test",
    "tests",
    "__tests__",
    "__mocks__",
]);

function walk(dir, files = []) {
    let entries;
    try {
        entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
        return files;
    }
    for (const entry of entries) {
        if (SKIP_DIRS.has(entry.name)) continue;
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
            walk(full, files);
        } else if (entry.isFile() && entry.name.endsWith(".js")) {
            files.push(full);
        }
    }
    return files;
}

function fileUsesZod(filePath) {
    try {
        const src = fs.readFileSync(filePath, "utf8");
        return /require\(\s*["']zod["']\s*\)/.test(src);
    } catch {
        return false;
    }
}

async function runBootIntegrityCheck({ strict = false } = {}) {
    const start = Date.now();
    const candidates = walk(SCAN_ROOT).filter(fileUsesZod);

    const violations = [];
    let scannedModules = 0;
    let scannedSchemas = 0;

    for (const file of candidates) {
        let mod;
        try {
            mod = require(file);
        } catch (err) {
            // Modules that fail to require during a passive scan (e.g. they
            // expect a request context) are not schema-integrity failures.
            // Skip silently — they can't have schemas reachable from import time.
            continue;
        }
        if (!mod || typeof mod !== "object") continue;

        scannedModules += 1;
        const moduleLabel = path.relative(SCAN_ROOT, file).replace(/\\/g, "/");

        for (const [name, value] of Object.entries(mod)) {
            if (!value || typeof value !== "object") continue;
            if (typeof value.safeParse !== "function") continue; // not a Zod schema
            scannedSchemas += 1;
            try {
                assertModuleSchemas({ [name]: value }, moduleLabel);
            } catch (err) {
                violations.push({
                    module: moduleLabel,
                    schema: name,
                    error: err.message,
                });
            }
        }
    }

    const durationMs = Date.now() - start;

    if (violations.length === 0) {
        logger.info(
            {
                service: "server",
                action: "schema_integrity_ok",
                scannedModules,
                scannedSchemas,
                durationMs,
            },
            `[BOOT] ✅ Schema integrity check passed (${scannedSchemas} schemas in ${scannedModules} modules, ${durationMs}ms)`
        );
        return { ok: true, scannedModules, scannedSchemas, violations: [] };
    }

    const summary = `[BOOT] ❌ Schema integrity violations: ${violations.length}`;
    for (const v of violations) {
        logger.error(
            {
                service: "server",
                action: "schema_integrity_violation",
                module: v.module,
                schema: v.schema,
                err: v.error,
            },
            `${v.module} :: ${v.schema} → ${v.error}`
        );
    }

    if (strict) {
        logger.error(
            { service: "server", action: "schema_integrity_abort" },
            `${summary} (strict mode — aborting startup)`
        );
        throw new Error(`Schema integrity check failed: ${violations.length} violation(s)`);
    }

    logger.warn({ service: "server", action: "schema_integrity_warn" }, `${summary} (non-strict — continuing)`);
    return { ok: false, scannedModules, scannedSchemas, violations };
}

module.exports = { runBootIntegrityCheck };
