require("module-alias/register");
/**
 * seedPlatformUser.js
 * Phase 24 — Seed Integrity Hardened
 *
 * Deterministic superadmin seeding:
 *   - Guard model import
 *   - Normalize email
 *   - Idempotent (delete all superadmins first)
 *   - Deterministic bcrypt hash
 *   - Fail-fast on any error
 *
 * Usage: node seedPlatformUser.js
 */

const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");
require("dotenv").config();

// ── 1. Deterministic model import ────────────────────────────────────────────
const PlatformUser = require("./src/platform/models/PlatformUser");

// ── 2. Model existence guard ─────────────────────────────────────────────────
if (!PlatformUser || typeof PlatformUser !== "function") {
    console.error("[SEED] FATAL: PlatformUser model failed to load. Check import path.");
    process.exit(1);
}

// ── 3. Constants ─────────────────────────────────────────────────────────────
const DEV_EMAIL = "superadmin@dentalsaas.com";
const NORMALIZED_EMAIL = DEV_EMAIL.toLowerCase().trim();
const DEV_PASSWORD = "SuperAdmin123!";

async function seed() {
    try {
        // ── 4. Connect to DB ─────────────────────────────────────────────
        await mongoose.connect(process.env.MONGO_URI);
        console.log("[SEED] Connected to database");

        // ── 5. Delete ALL stale superadmin records (idempotent) ───────────
        const deleted = await PlatformUser.deleteMany({ role: "superadmin" });
        if (deleted.deletedCount > 0) {
            console.log(`[SEED] Removed ${deleted.deletedCount} stale superadmin record(s)`);
        }

        // ── 6. Hash deterministic dev password ───────────────────────────
        const hashed = await bcrypt.hash(DEV_PASSWORD, 10);

        // ── 7. Create fresh superadmin ───────────────────────────────────
        await PlatformUser.create({
            name: "Super Admin",
            email: NORMALIZED_EMAIL,
            password: hashed,
            role: "superadmin",
            isActive: true,
            tokenVersion: 0,
        });

        console.log("[SEED] ✅ Superadmin seeded successfully");
        console.log(`[SEED]    Email: ${NORMALIZED_EMAIL}`);
        // Note: Password NOT logged for security (Phase 24 safety rule)
        console.log("[SEED]    Password: [set — use known dev credential]");

        process.exit(0);
    } catch (err) {
        console.error("[SEED] ❌ FATAL: Seed failed:", err.message);
        process.exit(1);
    }
}

seed();