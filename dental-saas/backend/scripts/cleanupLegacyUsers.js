require("module-alias/register");
/**
 * cleanupLegacyUsers.js
 * Auth Architecture Reset — Legacy Users Collection Cleanup
 *
 * Checks if a "users" collection exists that was created by
 * a legacy generic "User" model, and drops it if safe.
 *
 * SAFETY:
 * - NEVER auto-runs in production
 * - Requires --confirm flag to actually drop
 * - Dry-run by default (only reports)
 * - Does NOT touch platformusers or any other collection
 *
 * Usage:
 *   node scripts/cleanupLegacyUsers.js              (dry run)
 *   node scripts/cleanupLegacyUsers.js --confirm     (actually drop)
 */

require("dotenv").config();

const mongoose = require("mongoose");

const LEGACY_COLLECTION = "users";
const PROTECTED_COLLECTIONS = ["platformusers"];

async function cleanup() {
    const isProduction = process.env.NODE_ENV === "production";
    const isConfirm = process.argv.includes("--confirm");

    console.log("╔══════════════════════════════════════════════╗");
    console.log("║  LEGACY USERS COLLECTION CLEANUP             ║");
    console.log("╚══════════════════════════════════════════════╝");
    console.log("");

    if (isProduction) {
        console.log("  ❌ ABORT: This script cannot run in production.");
        console.log("  Set NODE_ENV to 'development' to proceed.");
        process.exit(1);
    }

    try {
        await mongoose.connect(process.env.MONGO_URI);
        console.log("  ✅ Connected to database");

        const db = mongoose.connection.db;
        const collections = await db.listCollections().toArray();
        const collectionNames = collections.map(c => c.name);

        console.log(`  🔍 Total collections in database: ${collectionNames.length}`);
        console.log("");

        // List all user-related collections
        const userCollections = collectionNames.filter(
            n => n.toLowerCase().includes("user")
        );
        console.log("  📋 User-related collections found:");
        for (const name of userCollections) {
            const count = await db.collection(name).countDocuments();
            const isLegacy = name === LEGACY_COLLECTION;
            const isProtected = PROTECTED_COLLECTIONS.includes(name);
            const label = isLegacy ? " ← LEGACY" : isProtected ? " ← PROTECTED" : "";
            console.log(`     ${isLegacy ? "⚠️" : "✅"}  ${name} (${count} documents)${label}`);
        }
        console.log("");

        // Check if legacy "users" collection exists
        if (!collectionNames.includes(LEGACY_COLLECTION)) {
            console.log("  ✅ No legacy 'users' collection found. Nothing to clean up.");
            await mongoose.connection.close();
            process.exit(0);
        }

        const legacyCount = await db.collection(LEGACY_COLLECTION).countDocuments();
        console.log(`  ⚠️  Legacy '${LEGACY_COLLECTION}' collection exists with ${legacyCount} document(s).`);

        if (!isConfirm) {
            console.log("");
            console.log("  ℹ️  DRY RUN — no changes made.");
            console.log("  To actually drop the legacy collection, run:");
            console.log("     node scripts/cleanupLegacyUsers.js --confirm");
            await mongoose.connection.close();
            process.exit(0);
        }

        // Confirm drop
        console.log("");
        console.log(`  🗑️  Dropping legacy '${LEGACY_COLLECTION}' collection...`);
        await db.collection(LEGACY_COLLECTION).drop();
        console.log(`  ✅ Legacy '${LEGACY_COLLECTION}' collection dropped successfully.`);

    } catch (err) {
        console.error(`  ❌ Error: ${err.message}`);
        process.exit(1);
    } finally {
        try { await mongoose.connection.close(); } catch { /* ignore */ }
    }

    process.exit(0);
}

cleanup();
