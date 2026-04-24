/**
 * seedPlatformAdmin.js
 * Platform Plane — Default Superadmin Seed
 *
 * Creates the initial platform superadmin account for local dev and staging.
 * Safe to run multiple times — fully idempotent (never overwrites existing user).
 *
 * SECURITY:
 *   - Password hashed via bcryptjs (cost 12)
 *   - Validates hash format matches PlatformUser schema regex
 *   - Blocked automatically in production (NODE_ENV guard)
 *   - Can be force-run in production with --force flag (requires explicit intent)
 *
 * IDEMPOTENCY:
 *   - Checks for existing admin by email before any write
 *   - Uses PlatformUser.findOne — safe, no race conditions in seed context
 *   - Running twice produces exactly 1 admin, never 2
 *
 * USAGE:
 *   node scripts/seedPlatformAdmin.js
 *   MONGO_URI=mongodb://... node scripts/seedPlatformAdmin.js
 *   node scripts/seedPlatformAdmin.js --force    (bypass NODE_ENV production guard)
 *
 * PLANE: Platform (uses real PlatformUser model)
 */

"use strict";

require("module-alias/register");
require("dotenv").config();

const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");

// ─── Config ───────────────────────────────────────────────────────────────────

const MONGO_URI = process.env.MONGO_URI || "mongodb://127.0.0.1:27017/saasdental";
const FORCE = process.argv.includes("--force");

// Seed defaults — override via environment variables for custom environments
const ADMIN_EMAIL     = process.env.SEED_ADMIN_EMAIL    || "admin@dental.com";
const ADMIN_PASSWORD  = process.env.SEED_ADMIN_PASSWORD || "Admin123!";
const ADMIN_FIRST     = process.env.SEED_ADMIN_FIRST    || "Platform";
const ADMIN_LAST      = process.env.SEED_ADMIN_LAST     || "Admin";
const BCRYPT_ROUNDS   = 12;

// ─── Production Guard ─────────────────────────────────────────────────────────

if (process.env.NODE_ENV === "production" && !FORCE) {
    console.error("");
    console.error("❌  BLOCKED: seedPlatformAdmin.js refuses to run in production.");
    console.error("    This script creates a predictable admin account.");
    console.error("    In production, create admins via the invite system.");
    console.error("");
    console.error("    To override (use with extreme caution):");
    console.error("    node scripts/seedPlatformAdmin.js --force");
    console.error("");
    process.exit(1);
}

// ─── Main Seed ────────────────────────────────────────────────────────────────

async function seed() {
    if (process.env.NODE_ENV === "production" && FORCE) {
        console.warn("");
        console.warn("⚠️  WARNING: Running platform admin seed in PRODUCTION with --force.");
        console.warn("    Ensure this is intentional. Proceeding in 3 seconds...");
        console.warn("");
        // Brief pause to allow Ctrl-C intervention
        await new Promise((r) => setTimeout(r, 3000));
    }

    console.log("╔══════════════════════════════════════════════════╗");
    console.log("║       DentalSaaS — Platform Admin Seed           ║");
    console.log("╚══════════════════════════════════════════════════╝");
    console.log("");
    console.log(`  MONGO_URI  : ${MONGO_URI}`);
    console.log(`  Email      : ${ADMIN_EMAIL}`);
    console.log(`  Role       : superadmin`);
    console.log(`  NODE_ENV   : ${process.env.NODE_ENV || "not set"}`);
    console.log("");

    // 1. Connect to MongoDB
    await mongoose.connect(MONGO_URI);
    console.log("✅  MongoDB connected");

    // 2. Load real PlatformUser model (uses the authoritative schema with bcrypt validator)
    const { default: PlatformUser } = require("../src/platform/models/PlatformUser");

    if (!PlatformUser || typeof PlatformUser.findOne !== "function") {
        throw new Error("PlatformUser model failed to load — cannot seed.");
    }

    // 3. Idempotency check — exit early if admin already exists
    const existing = await PlatformUser.findOne({ email: ADMIN_EMAIL }).lean();

    if (existing) {
        console.log("⚠️   Platform admin already exists — skipping (idempotent).");
        console.log(`    Email  : ${existing.email}`);
        console.log(`    Role   : ${existing.role}`);
        console.log(`    Active : ${existing.isActive}`);
        console.log("");
        console.log("    To reset: delete the user from MongoDB, then re-run.");
        await mongoose.disconnect();
        process.exit(0);
    }

    // 4. Hash password (cost 12 — secure but fast enough for seeding)
    console.log("  Hashing password...");
    const hashedPassword = await bcrypt.hash(ADMIN_PASSWORD, BCRYPT_ROUNDS);

    // Sanity-check the hash matches PlatformUser schema validator regex
    const BCRYPT_REGEX = /^\$2[aby]\$\d{2}\$.{53}$/;
    if (!BCRYPT_REGEX.test(hashedPassword)) {
        throw new Error(`bcryptjs produced an unexpected hash format: ${hashedPassword.substring(0, 10)}...`);
    }

    // 5. Create the superadmin
    const admin = await PlatformUser.create({
        firstName:         ADMIN_FIRST,
        lastName:          ADMIN_LAST,
        name:              `${ADMIN_FIRST} ${ADMIN_LAST}`,
        email:             ADMIN_EMAIL,
        password:          hashedPassword,
        role:              "superadmin",    // must match enum: superadmin | finance_admin | operations_admin | analyst
        isActive:          true,
        tokenVersion:      0,
        mustChangePassword: false,
    });

    console.log("");
    console.log("╔══════════════════════════════════════════════════╗");
    console.log("║   ✅  Platform admin created successfully         ║");
    console.log("╚══════════════════════════════════════════════════╝");
    console.log("");
    console.log(`  ID         : ${admin._id}`);
    console.log(`  Email      : ${ADMIN_EMAIL}`);
    console.log(`  Password   : ${ADMIN_PASSWORD}`);
    console.log(`  Role       : superadmin`);
    console.log("");
    console.log("  ⚠️  Change the password after first login.");
    console.log("");

    await mongoose.disconnect();
    process.exit(0);
}

// ─── Error handling ───────────────────────────────────────────────────────────

seed().catch((err) => {
    console.error("");
    console.error("❌  Seed failed:", err.message);
    if (err.code === 11000) {
        console.error("    Duplicate key: a user with this email already exists.");
        console.error("    This should not happen — idempotency check should have caught it.");
        console.error("    Check for a race condition or stale connection.");
    }
    console.error("");
    mongoose.disconnect().finally(() => process.exit(1));
});
