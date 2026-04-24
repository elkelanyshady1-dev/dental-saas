require("module-alias/register");
/**
 * validate-auth-model-alignment.js
 * Auth Architecture Reset — Model Alignment Governance Validator
 *
 * Ensures platform auth controller ONLY imports PlatformUser,
 * never the generic User model. Also checks if a legacy "users"
 * collection exists in the database.
 *
 * Checks:
 *   1. platformAuthController.js imports PlatformUser (not User)
 *   2. No generic User model import in platformAuthController
 *   3. Seed script uses PlatformUser
 *   4. (If DB available) No legacy "users" collection
 *   5. (If DB available) "platformusers" collection exists
 *
 * Never modifies any files. Static + runtime analysis.
 * Never crashes governance engine.
 */

require("dotenv").config();

const fs = require("fs");
const path = require("path");
const mongoose = require("mongoose");

const failures = [];
const warnings = [];
const startTime = Date.now();

const BACKEND_ROOT = path.resolve(__dirname, "../../../");
const AUTH_CONTROLLER = path.resolve(
    BACKEND_ROOT,
    "src/platform/controllers/platformAuthController.js"
);
const SEED_SCRIPT = path.resolve(BACKEND_ROOT, "seedPlatformUser.js");

console.log("╔══════════════════════════════════════════════╗");
console.log("║  AUTH MODEL ALIGNMENT — Architecture Reset   ║");
console.log("╚══════════════════════════════════════════════╝");
console.log("");

// ── STATIC ANALYSIS ──────────────────────────────────────────────────────────

try {
    // ── 1. Auth Controller Imports ───────────────────────────────────
    if (!fs.existsSync(AUTH_CONTROLLER)) {
        failures.push({
            type: "CONTROLLER_MISSING",
            severity: "high",
            message: "platformAuthController.js not found",
            code: "ALIGN_CONTROLLER_MISSING",
            recommendation: "Restore platformAuthController.js",
            classification: "FAILED_FUNCTIONAL",
        });
    } else {
        const controllerSource = fs.readFileSync(AUTH_CONTROLLER, "utf8");

        // Check for correct PlatformUser import
        if (/require\(.*PlatformUser.*\)/.test(controllerSource)) {
            console.log("  ✅ Auth controller imports PlatformUser");
        } else {
            failures.push({
                type: "NO_PLATFORM_USER_IMPORT",
                severity: "high",
                message: "platformAuthController.js does not import PlatformUser",
                code: "ALIGN_NO_PLATFORM_IMPORT",
                recommendation: 'Add: const PlatformUser = require("../models/PlatformUser");',
                classification: "FAILED_FUNCTIONAL",
            });
            console.log("  ❌ Auth controller does NOT import PlatformUser");
        }

        // Check for forbidden generic User import
        // Match: require("...models/User") or require("...shared/models/User")
        // But exclude PlatformUser references
        const genericUserImport = controllerSource
            .split("\n")
            .filter(line => {
                // Look for require() calls that reference a User model
                if (!/require\(/.test(line)) return false;
                if (/PlatformUser/.test(line)) return false;
                // Match generic User model paths
                return /require\([^)]*models\/User[^A-Za-z]/.test(line) ||
                    /require\([^)]*\/User"\)/.test(line);
            });

        if (genericUserImport.length > 0) {
            failures.push({
                type: "GENERIC_USER_IMPORT",
                severity: "high",
                message: `platformAuthController.js imports generic User model: ${genericUserImport[0].trim()}`,
                code: "ALIGN_GENERIC_USER_IN_AUTH",
                recommendation: "Replace generic User import with PlatformUser",
                classification: "FAILED_FUNCTIONAL",
            });
            console.log("  ❌ Auth controller imports GENERIC User model");
        } else {
            console.log("  ✅ No generic User import in auth controller");
        }

        // Check for generic User references in queries (e.g., User.findOne)
        const genericUserUsage = controllerSource
            .split("\n")
            .filter(line => {
                // Skip comments and strings
                if (/^\s*\/\//.test(line)) return false;
                if (/^\s*\*/.test(line)) return false;
                // Match standalone User. calls (not PlatformUser.)
                return /(?<![A-Za-z])User\.(?:find|create|update|delete|count|aggregate)/.test(line);
            });

        if (genericUserUsage.length > 0) {
            failures.push({
                type: "GENERIC_USER_QUERY",
                severity: "high",
                message: `Auth controller uses generic User model in queries`,
                code: "ALIGN_GENERIC_QUERY",
                recommendation: "Replace User.findOne/etc with PlatformUser.findOne/etc",
                classification: "FAILED_FUNCTIONAL",
            });
            console.log("  ❌ Auth controller uses generic User queries");
        } else {
            console.log("  ✅ No generic User queries in auth controller");
        }
    }

    // ── 2. Seed Script Alignment ─────────────────────────────────────
    if (!fs.existsSync(SEED_SCRIPT)) {
        warnings.push({
            type: "SEED_MISSING",
            severity: "medium",
            message: "seedPlatformUser.js not found",
            code: "ALIGN_SEED_MISSING",
            recommendation: "Restore seedPlatformUser.js",
        });
        console.log("  ⚠️  Seed script not found");
    } else {
        const seedSource = fs.readFileSync(SEED_SCRIPT, "utf8");

        if (/require\(.*PlatformUser.*\)/.test(seedSource)) {
            console.log("  ✅ Seed script imports PlatformUser");
        } else {
            failures.push({
                type: "SEED_WRONG_MODEL",
                severity: "high",
                message: "seedPlatformUser.js does not import PlatformUser model",
                code: "ALIGN_SEED_WRONG_MODEL",
                recommendation: 'Add: const PlatformUser = require("./src/platform/models/PlatformUser");',
                classification: "FAILED_FUNCTIONAL",
            });
            console.log("  ❌ Seed script does NOT import PlatformUser");
        }

        // Check for generic User in seed
        const seedGenericUser = seedSource
            .split("\n")
            .filter(line => {
                if (/PlatformUser/.test(line)) return false;
                return /require\([^)]*models\/User[^A-Za-z]/.test(line);
            });

        if (seedGenericUser.length > 0) {
            failures.push({
                type: "SEED_GENERIC_USER",
                severity: "high",
                message: "seedPlatformUser.js imports generic User model",
                code: "ALIGN_SEED_GENERIC",
                recommendation: "Replace generic User import with PlatformUser",
                classification: "FAILED_FUNCTIONAL",
            });
            console.log("  ❌ Seed imports GENERIC User model");
        } else {
            console.log("  ✅ No generic User import in seed script");
        }
    }

} catch (err) {
    failures.push({
        type: "STATIC_ANALYSIS_ERROR",
        severity: "high",
        message: `Static analysis error: ${err.message}`,
        code: "ALIGN_STATIC_ERROR",
        recommendation: "Check validator script and file paths",
        classification: "FAILED_FUNCTIONAL",
    });
}

// ── DATABASE ANALYSIS ────────────────────────────────────────────────────────

async function checkDatabase() {
    let connection;
    try {
        const mongoUri = process.env.MONGO_URI_PLATFORM;
        if (!mongoUri) {
            warnings.push({
                type: "NO_DB_URI",
                severity: "low",
                message: "MONGO_URI_PLATFORM not set — skipping database checks",
                code: "ALIGN_NO_DB",
                recommendation: "Set MONGO_URI_PLATFORM for full validation",
            });
            console.log("  ℹ️  MONGO_URI_PLATFORM not set — skipping DB checks");
            return;
        }

        connection = await mongoose.createConnection(mongoUri).asPromise();
        const db = connection.db;
        const collections = await db.listCollections().toArray();
        const collectionNames = collections.map(c => c.name);

        // Check 1: "users" collection — legitimate org-plane collection
        // Flag only if it contains platform-role users (contamination)
        if (collectionNames.includes("users")) {
            const platformContamination = await db.collection("users").countDocuments({
                $or: [
                    { platformRole: { $in: ["superadmin", "platform_admin"] } },
                    { role: "superadmin" },
                ]
            });
            if (platformContamination > 0) {
                warnings.push({
                    type: "LEGACY_USERS_EXISTS",
                    severity: "high",
                    message: `"users" collection contains ${platformContamination} platform-role user(s) — plane contamination`,
                    code: "ALIGN_LEGACY_COLLECTION",
                    recommendation: "Migrate platform users to platformusers collection",
                });
                console.log(`  ⚠️  [ALIGN_LEGACY_COLLECTION] "users" has ${platformContamination} platform-role user(s)`);
            } else {
                console.log('  ✅ "users" collection clean — no platform-role contamination');
            }
        } else {
            console.log('  ✅ No "users" collection');
        }

        // Check 2: "platformusers" collection should exist
        if (collectionNames.includes("platformusers")) {
            const count = await db.collection("platformusers").countDocuments();
            console.log(`  ✅ "platformusers" collection exists (${count} docs)`);
        } else {
            warnings.push({
                type: "NO_PLATFORMUSERS",
                severity: "medium",
                message: '"platformusers" collection not found',
                code: "ALIGN_NO_PLATFORMUSERS",
                recommendation: "Run: node seedPlatformUser.js to create the collection",
            });
            console.log('  ⚠️  "platformusers" collection not found');
        }

        // Check 3: Multiple user-like collections
        const userCollections = collectionNames.filter(
            n => n.toLowerCase().includes("user")
        );
        if (userCollections.length > 1) {
            // This is fine if it's just "users" (org) + "platformusers" (platform)
            const expected = ["users", "platformusers", "patientusers"];
            const unexpected = userCollections.filter(n => !expected.includes(n));
            if (unexpected.length > 0) {
                warnings.push({
                    type: "EXTRA_USER_COLLECTIONS",
                    severity: "medium",
                    message: `Unexpected user collection(s): ${unexpected.join(", ")}`,
                    code: "ALIGN_EXTRA_COLLECTIONS",
                    recommendation: "Verify these collections are intentional",
                });
                console.log(`  ⚠️  [ALIGN_EXTRA_COLLECTIONS] Unexpected: ${unexpected.join(", ")}`);
            }
        }

    } catch (err) {
        warnings.push({
            type: "DB_CHECK_ERROR",
            severity: "low",
            message: `Database check error: ${err.message}`,
            code: "ALIGN_DB_ERROR",
            recommendation: "Ensure MongoDB is running",
        });
        console.log(`  ⚠️  Database check error: ${err.message}`);
    } finally {
        try { if (connection) await connection.close(); } catch { /* ignore */ }
    }
}

checkDatabase().then(() => finish()).catch(() => finish());

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
        name: "validate:auth-model-alignment",
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
