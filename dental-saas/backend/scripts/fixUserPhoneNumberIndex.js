#!/usr/bin/env node
/**
 * fixUserPhoneNumberIndex.js
 * One-time migration: Fix phoneNumber index on ALL user collections.
 *
 * Problem:
 *   The User schema had `phoneNumber: { default: null }` combined with
 *   a unique index. This caused E11000 duplicate key errors when creating
 *   the second user without a phone number, because both stored `null`.
 *
 * Fix:
 *   1. Drop the old phoneNumber_1 index (unique: true, sparse: true on null values)
 *   2. Recreate it as { unique: true, sparse: true } — sparse excludes docs
 *      where the field is missing (not just null)
 *   3. Set all existing `phoneNumber: null` values to undefined ($unset)
 *      so that the sparse index skips them
 *
 * Scope:
 *   - Platform DB (saasdental.users) — for any legacy users
 *   - All per-org DBs (dental_org_*.users)
 *
 * Usage:
 *   node scripts/fixUserPhoneNumberIndex.js
 *
 * Safe to run multiple times (idempotent).
 */

"use strict";

require("module-alias/register");
const mongoose = require("mongoose");
const logger = require("@utils/logger");

const MONGODB_URI = process.env.MONGODB_URI || "mongodb://localhost:27017/saasdental";

async function fixCollection(db, dbName) {
    const usersCollection = db.collection("users");

    // Check if the collection exists
    const collections = await db.listCollections({ name: "users" }).toArray();
    if (collections.length === 0) {
        console.log(`  [${dbName}] No users collection — skipping`);
        return;
    }

    const count = await usersCollection.countDocuments();
    console.log(`  [${dbName}] Found ${count} user documents`);

    // Step 1: Unset all phoneNumber: null values
    const unsetResult = await usersCollection.updateMany(
        { phoneNumber: null },
        { $unset: { phoneNumber: "" } }
    );
    console.log(`  [${dbName}] Unset phoneNumber: null on ${unsetResult.modifiedCount} docs`);

    // Step 2: Drop old phoneNumber index (if exists)
    try {
        await usersCollection.dropIndex("phoneNumber_1");
        console.log(`  [${dbName}] Dropped old phoneNumber_1 index`);
    } catch (err) {
        if (err.codeName === "IndexNotFound" || err.code === 27) {
            console.log(`  [${dbName}] No phoneNumber_1 index to drop — OK`);
        } else {
            console.error(`  [${dbName}] Error dropping index:`, err.message);
        }
    }

    // Step 3: Recreate with sparse + unique
    try {
        await usersCollection.createIndex(
            { phoneNumber: 1 },
            { unique: true, sparse: true, name: "phoneNumber_1" }
        );
        console.log(`  [${dbName}] Created phoneNumber_1 index (unique + sparse)`);
    } catch (err) {
        console.error(`  [${dbName}] Error creating index:`, err.message);
    }
}

async function run() {
    console.log("═══ Fix User phoneNumber Index ═══");
    console.log(`Connecting to: ${MONGODB_URI}\n`);

    const conn = await mongoose.connect(MONGODB_URI);
    const adminDb = conn.connection.db.admin();

    // Get all databases
    const { databases } = await adminDb.listDatabases();

    // Fix platform DB
    console.log("▸ Platform DB:");
    await fixCollection(conn.connection.db, conn.connection.db.databaseName);

    // Fix all per-org DBs
    const orgDbs = databases.filter(d => d.name.startsWith("dental_org_"));
    console.log(`\n▸ Found ${orgDbs.length} per-org databases\n`);

    for (const dbInfo of orgDbs) {
        console.log(`▸ ${dbInfo.name}:`);
        const orgDb = conn.connection.useDb(dbInfo.name, { useCache: false, noListener: true }).db;
        await fixCollection(orgDb, dbInfo.name);
    }

    console.log("\n═══ Done ═══");
    await mongoose.disconnect();
    process.exit(0);
}

run().catch(err => {
    console.error("FATAL:", err);
    process.exit(1);
});
