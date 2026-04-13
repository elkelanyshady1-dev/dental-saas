/**
 * migrate-chair-ids.js
 * One-time migration: repair branch chair subdocuments.
 *
 * PROBLEM: Old schema stored chairs with `id: "chair_timestamp_N"` (String).
 *          The appointment validator expects a 24-char hex ObjectId.
 *          New schema uses Mongoose auto-generated `_id` (ObjectId) on each chair.
 *
 * This script iterates over all per-org databases (dental_org_*),
 * finds branch documents whose chairs have a legacy string `id` field
 * but no valid ObjectId `_id`, and replaces those chairs in-place
 * with proper ObjectId-keyed versions.
 *
 * Usage:
 *   node backend/scripts/migrate-chair-ids.js
 *
 * Flags:
 *   --dry-run   Print what would change without writing to DB.
 */

"use strict";

require("module-alias/register");

const mongoose   = require("mongoose");
const { MongoClient, ObjectId } = require("mongodb");

const MONGO_URI  = process.env.MONGO_URI || "mongodb://127.0.0.1:27017";
const DRY_RUN    = process.argv.includes("--dry-run");
const HEX24      = /^[a-f\d]{24}$/i;

async function run() {
    console.log(`[migrate-chair-ids] DRY_RUN=${DRY_RUN}`);
    const client = new MongoClient(MONGO_URI);
    await client.connect();

    // Discover all per-org databases
    const adminDb = client.db("admin");
    const { databases } = await adminDb.command({ listDatabases: 1, nameOnly: true });
    const orgDbs = databases
        .map(d => d.name)
        .filter(name => name.startsWith("dental_org_"));

    console.log(`[migrate-chair-ids] Found ${orgDbs.length} org database(s)`);

    let totalBranches = 0;
    let totalChairsFixed = 0;

    for (const dbName of orgDbs) {
        const db = client.db(dbName);
        const branches = db.collection("branches");

        // Find branches with at least one chair that has a non-ObjectId string _id
        const cursor = branches.find({ "chairs.0": { $exists: true } });

        while (await cursor.hasNext()) {
            const branch = await cursor.next();
            if (!Array.isArray(branch.chairs) || branch.chairs.length === 0) continue;

            let needsUpdate = false;
            const fixedChairs = branch.chairs.map(chair => {
                const idStr = (chair._id || "").toString();
                if (HEX24.test(idStr)) {
                    // Already a valid ObjectId — no change needed
                    return chair;
                }
                // Legacy string id — replace with a proper ObjectId
                needsUpdate = true;
                totalChairsFixed++;
                return {
                    _id:      new ObjectId(),
                    name:     chair.name || "Treatment Chair",
                    isActive: chair.isActive !== false,
                };
            });

            if (needsUpdate) {
                totalBranches++;
                console.log(`  [${dbName}] Branch "${branch.name}" (${branch._id}) — fixing ${fixedChairs.filter((_,i) => !HEX24.test((branch.chairs[i]?._id||"").toString())).length} chair(s)`);
                if (!DRY_RUN) {
                    await branches.updateOne(
                        { _id: branch._id },
                        { $set: { chairs: fixedChairs } }
                    );
                }
            }
        }
    }

    await client.close();
    console.log(`\n[migrate-chair-ids] Done.`);
    console.log(`  Branches updated : ${totalBranches}`);
    console.log(`  Chairs fixed     : ${totalChairsFixed}`);
    if (DRY_RUN) console.log("  (DRY RUN — no writes performed)");
}

run().catch(err => {
    console.error("[migrate-chair-ids] FATAL:", err.message);
    process.exit(1);
});
