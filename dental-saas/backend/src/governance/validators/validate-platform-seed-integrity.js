require("module-alias/register");
/**
 * validate-platform-seed-integrity.js
 * Phase 24 — Platform Seed Integrity Validator
 *
 * Governance validator that checks:
 *   1. Superadmin record exists in database
 *   2. Email is lowercase-normalized
 *   3. Password is a valid bcrypt hash
 *   4. (Dev only) bcrypt.compare against known dev password
 *   5. Structured warnings for edge cases
 *
 * Requires MONGO_URI in environment.
 * Never logs plaintext passwords or secrets.
 * Never crashes governance engine — safe timeout.
 */

require("dotenv").config();

const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");
const path = require("path");

const EXPECTED_EMAIL = "superadmin@dentalsaas.com";
const DEV_PASSWORD = "SuperAdmin123!";
const BCRYPT_REGEX = /^\$2[aby]\$\d{2}\$.{53}$/;
const TIMEOUT_MS = 10000;

const failures = [];
const warnings = [];
const startTime = Date.now();

console.log("╔══════════════════════════════════════════════╗");
console.log("║  PLATFORM SEED INTEGRITY — Phase 24          ║");
console.log("╚══════════════════════════════════════════════╝");
console.log("");

async function validate() {
    // ── 1. Connect to MongoDB ────────────────────────────────────────────
    let connection;
    try {
        const mongoUri = process.env.MONGO_URI;
        if (!mongoUri) {
            failures.push({
                type: "MISSING_MONGO_URI",
                severity: "high",
                message: "MONGO_URI not set — cannot validate seed integrity",
                code: "SEED_NO_DB_URI",
                recommendation: "Set MONGO_URI in .env",
            });
            return finish();
        }

        connection = await mongoose.createConnection(mongoUri).asPromise();
    } catch (err) {
        failures.push({
            type: "DB_CONNECTION_FAILED",
            severity: "high",
            message: `Cannot connect to database: ${err.message}`,
            code: "SEED_DB_UNREACHABLE",
            recommendation: "Ensure MongoDB is running and MONGO_URI is correct",
        });
        return finish();
    }

    try {
        // ── 2. Load PlatformUser model ───────────────────────────────────
        const modelPath = path.resolve(__dirname, "../../platform/models/PlatformUser");
        let PlatformUserSchema;
        try {
            const modelModule = require(modelPath);
            // Re-register schema on our connection to avoid cross-connection issues
            PlatformUserSchema = connection.model(
                "PlatformUser",
                modelModule.schema || mongoose.model("PlatformUser").schema
            );
        } catch (err) {
            failures.push({
                type: "MODEL_LOAD_FAILED",
                severity: "high",
                message: `PlatformUser model failed to load: ${err.message}`,
                code: "SEED_MODEL_BROKEN",
                recommendation: "Verify model exists at src/platform/models/PlatformUser.js",
            });
            return finish();
        }

        // ── 3. Query superadmin records ──────────────────────────────────
        const superadmins = await PlatformUserSchema.find({ role: "superadmin" })
            .select("+password")
            .lean()
            .maxTimeMS(5000);

        console.log(`  🔍 Superadmin records found: ${superadmins.length}`);

        if (superadmins.length === 0) {
            failures.push({
                type: "NO_SUPERADMIN",
                severity: "high",
                message: "No superadmin user found in database",
                code: "SEED_NO_SUPERADMIN",
                recommendation: "Run: node seedPlatformUser.js",
                classification: "FAILED_FUNCTIONAL",
            });
            console.log("  ❌ No superadmin found");
            return finish();
        }

        // ── 4. Warn on multiple superadmins ──────────────────────────────
        if (superadmins.length > 1) {
            warnings.push({
                type: "MULTIPLE_SUPERADMINS",
                severity: "medium",
                message: `${superadmins.length} superadmin records found — expected exactly 1`,
                code: "SEED_MULTIPLE_SUPERADMINS",
                recommendation: "Run seedPlatformUser.js to reset to a single superadmin",
            });
            console.log(`  ⚠️  [SEED_MULTIPLE_SUPERADMINS] ${superadmins.length} superadmin records found`);
        }

        // ── 5. Validate primary superadmin ───────────────────────────────
        const user = superadmins[0];

        // 5a. Email normalization check
        if (user.email !== user.email.toLowerCase().trim()) {
            warnings.push({
                type: "EMAIL_NOT_NORMALIZED",
                severity: "medium",
                message: `Superadmin email not lowercase-normalized: "${user.email}"`,
                code: "SEED_EMAIL_CASE",
                recommendation: "Re-run seedPlatformUser.js to normalize email",
            });
            console.log(`  ⚠️  [SEED_EMAIL_CASE] Email not normalized: ${user.email}`);
        }

        // 5b. Email pattern match
        if (user.email.toLowerCase().trim() !== EXPECTED_EMAIL) {
            warnings.push({
                type: "EMAIL_MISMATCH",
                severity: "medium",
                message: `Superadmin email "${user.email}" does not match expected "${EXPECTED_EMAIL}"`,
                code: "SEED_EMAIL_MISMATCH",
                recommendation: "Re-run seedPlatformUser.js to set correct email",
            });
            console.log(`  ⚠️  [SEED_EMAIL_MISMATCH] Email mismatch: ${user.email}`);
        } else {
            console.log(`  ✅ Email: ${user.email}`);
        }

        // 5c. isActive check
        if (user.isActive === false) {
            warnings.push({
                type: "SUPERADMIN_INACTIVE",
                severity: "high",
                message: "Superadmin account is deactivated",
                code: "SEED_INACTIVE",
                recommendation: "Activate the superadmin account or re-run seedPlatformUser.js",
            });
            console.log("  ⚠️  [SEED_INACTIVE] Superadmin is deactivated");
        } else {
            console.log("  ✅ isActive: true");
        }

        // 5d. Password hash format
        if (!user.password) {
            failures.push({
                type: "NO_PASSWORD_HASH",
                severity: "high",
                message: "Superadmin has no password hash stored",
                code: "SEED_NO_HASH",
                recommendation: "Re-run seedPlatformUser.js",
                classification: "FAILED_FUNCTIONAL",
            });
            console.log("  ❌ No password hash found");
        } else if (!BCRYPT_REGEX.test(user.password)) {
            failures.push({
                type: "INVALID_HASH_FORMAT",
                severity: "high",
                message: "Password hash does not match bcrypt format",
                code: "SEED_INVALID_HASH",
                recommendation: "Re-run seedPlatformUser.js to regenerate bcrypt hash",
                classification: "FAILED_FUNCTIONAL",
            });
            console.log("  ❌ Invalid bcrypt hash format");
        } else {
            console.log("  ✅ Password hash: valid bcrypt format");

            // 5e. Dev-only: verify bcrypt.compare
            if (process.env.NODE_ENV === "development") {
                try {
                    const match = await bcrypt.compare(DEV_PASSWORD, user.password);
                    if (match) {
                        console.log("  ✅ bcrypt.compare: password reachable (dev only)");
                    } else {
                        failures.push({
                            type: "BCRYPT_COMPARE_FAILED",
                            severity: "high",
                            message: "bcrypt.compare failed — password hash is unreachable with known dev credential",
                            code: "SEED_HASH_UNREACHABLE",
                            recommendation: "Re-run seedPlatformUser.js to reset password hash",
                            classification: "FAILED_FUNCTIONAL",
                        });
                        console.log("  ❌ bcrypt.compare FAILED — hash unreachable");
                    }
                } catch (err) {
                    failures.push({
                        type: "BCRYPT_COMPARE_ERROR",
                        severity: "high",
                        message: `bcrypt.compare threw: ${err.message}`,
                        code: "SEED_BCRYPT_ERROR",
                        recommendation: "Check bcryptjs installation and password hash integrity",
                        classification: "FAILED_FUNCTIONAL",
                    });
                    console.log(`  ❌ bcrypt.compare error: ${err.message}`);
                }
            } else {
                console.log("  ℹ️  bcrypt.compare skipped (production safety)");
            }
        }

        // ── 6. RBAC Integrity Checks ─────────────────────────────────────
        console.log("");
        console.log("  ── RBAC Integrity ──");

        const db = connection.db;
        const collections = await db.listCollections().toArray();
        const collNames = collections.map(c => c.name);

        // 6a. platformcapabilities must exist and not be empty
        if (collNames.includes("platformcapabilities")) {
            const capCount = await db.collection("platformcapabilities").countDocuments();
            if (capCount === 0) {
                warnings.push({
                    type: "SEED_NO_CAPABILITIES",
                    severity: "high",
                    message: "platformcapabilities collection is empty — run seed:platform-rbac",
                    code: "SEED_NO_CAPABILITIES",
                    recommendation: "Run: npm run seed:platform-rbac",
                });
                console.log("  ⚠️  [SEED_NO_CAPABILITIES] platformcapabilities is empty");
            } else {
                console.log(`  ✅ platformcapabilities: ${capCount} records`);
            }
        } else {
            warnings.push({
                type: "SEED_NO_CAPABILITIES",
                severity: "high",
                message: "platformcapabilities collection not found — run seed:platform-rbac",
                code: "SEED_NO_CAPABILITIES",
                recommendation: "Run: npm run seed:platform-rbac",
            });
            console.log("  ⚠️  [SEED_NO_CAPABILITIES] platformcapabilities collection missing");
        }

        // 6b. platformroles must have superadmin role
        if (collNames.includes("platformroles")) {
            const superadminRole = await db.collection("platformroles").findOne({ name: "superadmin" });
            if (!superadminRole) {
                warnings.push({
                    type: "SEED_ROLE_INVALID_MAPPING",
                    severity: "high",
                    message: "superadmin role not found in platformroles — run seed:platform-rbac",
                    code: "SEED_ROLE_INVALID_MAPPING",
                    recommendation: "Run: npm run seed:platform-rbac",
                });
                console.log("  ⚠️  [SEED_ROLE_INVALID_MAPPING] superadmin role missing");
            } else {
                console.log(`  ✅ superadmin role exists (${superadminRole.capabilities?.length || 0} capabilities)`);

                // 6c. superadmin role must have at least 1 capability
                if (!superadminRole.capabilities || superadminRole.capabilities.length === 0) {
                    warnings.push({
                        type: "SEED_EMPTY_ROLE",
                        severity: "high",
                        message: "superadmin role has 0 capabilities — run seed:platform-rbac",
                        code: "SEED_EMPTY_ROLE",
                        recommendation: "Run: npm run seed:platform-rbac",
                    });
                    console.log("  ⚠️  [SEED_EMPTY_ROLE] superadmin has 0 capabilities");
                }

                // 6d. Validate capability references
                if (collNames.includes("platformcapabilities") && superadminRole.capabilities?.length > 0) {
                    const validKeys = await db.collection("platformcapabilities")
                        .find({}, { projection: { key: 1, _id: 0 } })
                        .toArray();
                    const validKeySet = new Set(validKeys.map(k => k.key));
                    const orphans = superadminRole.capabilities.filter(c => !validKeySet.has(c));

                    if (orphans.length > 0) {
                        warnings.push({
                            type: "SEED_ORPHAN_CAPABILITY",
                            severity: "medium",
                            message: `superadmin role references ${orphans.length} invalid capability key(s): ${orphans.join(", ")}`,
                            code: "SEED_ORPHAN_CAPABILITY",
                            recommendation: "Re-run seed:platform-rbac to synchronize",
                        });
                        console.log(`  ⚠️  [SEED_ORPHAN_CAPABILITY] Invalid refs: ${orphans.join(", ")}`);
                    } else {
                        console.log("  ✅ All superadmin capability refs valid");
                    }
                }
            }
        } else {
            warnings.push({
                type: "SEED_ROLE_INVALID_MAPPING",
                severity: "high",
                message: "platformroles collection not found — run seed:platform-rbac",
                code: "SEED_ROLE_INVALID_MAPPING",
                recommendation: "Run: npm run seed:platform-rbac",
            });
            console.log("  ⚠️  [SEED_ROLE_INVALID_MAPPING] platformroles collection missing");
        }
    } finally {
        // Always close the dedicated connection
        try {
            await connection.close();
        } catch { /* ignore close errors */ }
    }

    return finish();
}

function finish() {
    const durationMs = Date.now() - startTime;
    const status = failures.length === 0 ? "PASSED" : "FAILED";
    const classification = failures.some(f => f.classification === "FAILED_FUNCTIONAL")
        ? "FAILED_FUNCTIONAL"
        : status === "PASSED" ? "PASSED" : "FAILED";

    console.log("");
    if (warnings.length > 0) {
        for (const w of warnings) console.log(`  ⚠️  [${w.code}] ${w.message}`);
    }
    if (failures.length > 0) {
        for (const f of failures) console.log(`  ❌ [${f.code}] ${f.message}`);
    }
    console.log(`  RESULT: ${status} (${durationMs}ms, ${failures.length} failures, ${warnings.length} warnings)`);

    const result = {
        name: "validate:platform-seed-integrity",
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

// ── Execute with timeout ─────────────────────────────────────────────────────
const timeoutId = setTimeout(() => {
    console.log("  ❌ Validator timed out");
    failures.push({
        type: "TIMEOUT",
        severity: "high",
        message: `Validator exceeded ${TIMEOUT_MS}ms timeout`,
        code: "SEED_TIMEOUT",
        recommendation: "Check database connectivity",
    });
    finish();
}, TIMEOUT_MS);

validate().then(() => {
    clearTimeout(timeoutId);
}).catch((err) => {
    clearTimeout(timeoutId);
    console.error(`  ❌ Unexpected error: ${err.message}`);
    failures.push({
        type: "UNEXPECTED_ERROR",
        severity: "high",
        message: `Unexpected validator error: ${err.message}`,
        code: "SEED_UNEXPECTED",
        recommendation: "Check validator script and dependencies",
    });
    finish();
});
