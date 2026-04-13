/**
 * validateAuthPipeline.js — Boot-time Auth Pipeline Validator
 * Phase 1 — Authorization Stabilization
 *
 * ── PURPOSE ──────────────────────────────────────────────────────────────────
 * Runs at server startup to log the expected authorization pipeline order
 * and validate that no conflicting middleware files exist.
 *
 * This is an informational + defensive check — it confirms the system
 * is configured for the single deterministic authorization path.
 *
 * ── MOUNT POINT ──────────────────────────────────────────────────────────────
 * Called in server.js after security mode validation, before DB connect.
 */

"use strict";

const fs = require("fs");
const path = require("path");
const logger = require("../utils/logger");

/**
 * Files that should have been removed in Phase 1.
 * If any still exist, the pipeline is not fully stabilized.
 */
const REMOVED_FILES = [
    { name: "requireModule.js", path: path.join(__dirname, "..", "orgRuntime", "requireModule.js") },
    { name: "moduleRegistry.js", path: path.join(__dirname, "..", "orgRuntime", "moduleRegistry.js") },
    { name: "orgRuntimeGate.js", path: path.join(__dirname, "..", "middleware", "orgRuntimeGate.js") },
    { name: "permissionMiddleware.js", path: path.join(__dirname, "..", "middleware", "permissionMiddleware.js") },
    { name: "moduleMiddleware.js", path: path.join(__dirname, "..", "middleware", "moduleMiddleware.js") },
    { name: "moduleGuard.js", path: path.join(__dirname, "..", "middleware", "moduleGuard.js") },
    { name: "roleMiddleware.js", path: path.join(__dirname, "..", "middleware", "roleMiddleware.js") },
    // Phase 4 — deleted: never mounted, pure dead code
    { name: "ssotEnforcer.js", path: path.join(__dirname, "..", "middleware", "ssotEnforcer.js") },
    { name: "assertCapabilities.js", path: path.join(__dirname, "..", "middleware", "assertCapabilities.js") },
    { name: "debugDb.js", path: path.join(__dirname, "..", "middleware", "debugDb.js") },
];

/**
 * Validates the auth pipeline at boot time.
 * Logs the expected middleware order and checks for leftover legacy files.
 *
 * @param {Object} [options]
 * @param {boolean} [options.strict=false] — If true, throws on violations (for CI/staging)
 */
function validateAuthPipeline(options = {}) {
    const { strict = false } = options;

    // ── Log expected pipeline order ──────────────────────────────────
    console.log("╔══════════════════════════════════════════════════════════════╗");
    console.log("║       AUTH PIPELINE — Phase 4 Simplified (v4.0)             ║");
    console.log("╠══════════════════════════════════════════════════════════════╣");
    console.log("║  Global (org routes via app.js):                            ║");
    console.log("║    1. authMiddleware (protect)     → JWT verify, user hydra ║");
    console.log("║    2. featureFlagMiddleware        → req.featureFlags        ║");
    console.log("║    3. branchContextMiddleware      → req.branchId            ║");
    console.log("║    4. rlsContext                   → req.rls (frozen)        ║");
    console.log("║                                                             ║");
    console.log("║  Global (per-org DB via orgV1Routes):                       ║");
    console.log("║    5. orgProtect                   → type guard + org auth  ║");
    console.log("║    6. organizationContext          → req.organization        ║");
    console.log("║    7. dbContext                    → req.dbConnection        ║");
    console.log("║                                                             ║");
    console.log("║  Per-route:                                                 ║");
    console.log("║    8. requireEntitlement(module)   → plan gate              ║");
    console.log("║    9. requireOrgPermission(perm)   → RBAC check             ║");
    console.log("║   10. policyMiddleware(resource)   → PBAC (optional)        ║");
    console.log("║                                                             ║");
    console.log("║  Deleted (Phase 4): ssotEnforcer, assertCapabilities,       ║");
    console.log("║    debugDb (were never mounted — dead code removed)         ║");
    console.log("╚══════════════════════════════════════════════════════════════╝");

    // ── Check for leftover legacy files ─────────────────────────────
    const violations = [];

    for (const { name, path: filePath } of REMOVED_FILES) {
        if (fs.existsSync(filePath)) {
            violations.push(name);
            logger.warn(
                { service: "authPipeline", file: name },
                `[AuthPipeline] ⚠️  Legacy file still exists: ${name} — should be deleted`
            );
        }
    }

    if (violations.length === 0) {
        logger.info(
            { service: "authPipeline" },
            "[AuthPipeline] ✅ Pipeline validation PASSED — no legacy guards detected"
        );
    } else {
        const msg = `[AuthPipeline] ❌ ${violations.length} legacy guard file(s) still exist: ${violations.join(", ")}`;
        logger.error({ service: "authPipeline", violations }, msg);

        if (strict) {
            throw new Error(msg);
        }
    }
}

module.exports = { validateAuthPipeline };
