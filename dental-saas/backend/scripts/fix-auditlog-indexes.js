/**
 * fix-auditlog-indexes.js
 * One-time migration — Drop stale compound audit index
 *
 * THE PROBLEM:
 *   MongoDB still has a unique compound index `organizationId_1_previousHash_1`
 *   left over from when auditlogs were in a shared DB. The schema was updated to
 *   use a simpler `{ previousHash: 1, unique: true }` (per-org DB isolation means
 *   organizationId is redundant), but Mongoose never drops old indexes automatically.
 *
 *   This stale index causes E11000 duplicate key errors when:
 *   - Two audit jobs race for the genesis record (prevHash: "0")
 *   - The self-heal retry reads the existing tail but the stale index still blocks
 *
 * WHAT THIS SCRIPT DOES:
 *   1. Connects to the org database (saasdental by default)
 *   2. Lists all indexes on auditlogs
 *   3. Drops `organizationId_1_previousHash_1` if it exists
 *   4. Ensures the correct `previousHash_1` unique index exists
 *
 * USAGE:
 *   node scripts/fix-auditlog-indexes.js
 *
 * Safe to re-run — idempotent.
 */

"use strict";

require("dotenv").config({ path: require("path").join(__dirname, "../.env") });

const STALE_INDEX  = "organizationId_1_previousHash_1";
const TARGET_INDEX = "previousHash_1";

async function fixDatabase(adminClient, dbName) {
    const db = adminClient.db(dbName);

    // Check if auditlogs exists in this database
    const colls = await db.listCollections({ name: "auditlogs" }).toArray();
    if (colls.length === 0) {
        console.log(`  [${dbName}] No auditlogs collection — skipping`);
        return;
    }

    const coll = db.collection("auditlogs");
    const indexes = await coll.indexes();
    console.log(`\n  [${dbName}] Current indexes:`);
    indexes.forEach(idx => console.log(`    - ${idx.name}  ${JSON.stringify(idx.key)}`));

    // Drop stale compound index
    const hasStale = indexes.some(idx => idx.name === STALE_INDEX);
    if (hasStale) {
        await coll.dropIndex(STALE_INDEX);
        console.log(`  [${dbName}] ✅ Dropped stale index: ${STALE_INDEX}`);
    } else {
        console.log(`  [${dbName}] Stale index not present — clean`);
    }

    // Ensure correct unique index
    const hasTarget = indexes.some(idx => idx.name === TARGET_INDEX);
    if (!hasTarget) {
        await coll.createIndex({ previousHash: 1 }, { unique: true, name: TARGET_INDEX });
        console.log(`  [${dbName}] ✅ Created correct index: { previousHash: 1, unique: true }`);
    } else {
        console.log(`  [${dbName}] Correct index already exists`);
    }
}

async function main() {
    const { MongoClient } = require("mongodb");

    // Use the native driver so we can list all databases without mongoose schema overhead
    const MONGO_URI = process.env.MONGO_URI || "mongodb://127.0.0.1:27017";
    const BASE_URI  = MONGO_URI.replace(/\/[^/?]+(\?|$)/, "$1") || "mongodb://127.0.0.1:27017";

    console.log("[migrate] Connecting to:", BASE_URI);
    const client = new MongoClient(BASE_URI);
    await client.connect();
    console.log("[migrate] Connected ✅");

    // List all databases matching the per-org naming convention (dental_org_*)
    // Also include saasdental in case any records were written to the shared DB
    const adminDb = client.db("admin");
    const { databases } = await adminDb.command({ listDatabases: 1 });
    const targetDbs = databases
        .map(d => d.name)
        .filter(n => n.startsWith("dental_org_") || n === "saasdental");

    console.log(`[migrate] Targeting ${targetDbs.length} database(s):`, targetDbs);

    for (const dbName of targetDbs) {
        await fixDatabase(client, dbName);
    }

    await client.close();
    console.log("\n[migrate] ✅ Done — safe to restart the server");
}

main().catch(err => {
    console.error("[migrate] ❌ FAILED:", err.message);
    process.exit(1);
});
