/**
 * fix-appointment-externalRequestId-index.js
 *
 * Drops the stale `organizationId_1_externalRequestId_1` sparse unique index
 * from every per-org `appointments` collection and lets Mongoose recreate the
 * correct partialFilterExpression variant on next server boot.
 *
 * WHY:
 *   MongoDB 3.2+ sparse indexes still include explicit null values.
 *   Staff-created appointments (no externalRequestId provided) are stored with
 *   null or absent externalRequestId, so a second staff appointment hits E11000.
 *   The fix (partialFilterExpression: { externalRequestId: { $type: "string" } })
 *   only indexes real string values and skips null/absent entries entirely.
 *
 * RUN ONCE:
 *   node backend/scripts/fix-appointment-externalRequestId-index.js
 *
 * Flags:
 *   --dry-run   Print what would change without writing to DB.
 */

"use strict";

const { MongoClient } = require("mongodb");

const MONGO_URI = process.env.MONGO_URI || "mongodb://127.0.0.1:27017";
const DRY_RUN   = process.argv.includes("--dry-run");
const STALE_INDEX_NAME = "organizationId_1_externalRequestId_1";

async function run() {
    console.log(`[fix-appointment-index] DRY_RUN=${DRY_RUN}`);
    const client = new MongoClient(MONGO_URI);
    await client.connect();

    const { databases } = await client.db("admin").command({ listDatabases: 1, nameOnly: true });
    const orgDbs = databases.map(d => d.name).filter(n => n.startsWith("dental_org_"));
    console.log(`[fix-appointment-index] Found ${orgDbs.length} org database(s)`);

    let dropped = 0;
    let skipped = 0;

    for (const dbName of orgDbs) {
        const col = client.db(dbName).collection("appointments");

        // List current indexes
        const indexes = await col.indexes();
        const stale = indexes.find(ix => ix.name === STALE_INDEX_NAME);

        if (!stale) {
            console.log(`  [${dbName}] Index not found — skipping`);
            skipped++;
            continue;
        }

        const hasSparse = !!stale.sparse;
        const hasPartial = !!stale.partialFilterExpression;

        if (!hasSparse && hasPartial) {
            console.log(`  [${dbName}] Index already uses partialFilterExpression — skipping`);
            skipped++;
            continue;
        }

        console.log(`  [${dbName}] Dropping stale ${hasSparse ? "sparse" : ""}${!hasPartial ? "" : "+partial"} index "${STALE_INDEX_NAME}"`);
        if (!DRY_RUN) {
            await col.dropIndex(STALE_INDEX_NAME);
            dropped++;
        } else {
            dropped++;
        }
    }

    await client.close();
    console.log(`\n[fix-appointment-index] Done.`);
    console.log(`  Indexes dropped : ${dropped}`);
    console.log(`  Databases skipped: ${skipped}`);
    if (DRY_RUN) console.log("  (DRY RUN — no writes performed)");
    console.log("\n  Restart the backend server to let Mongoose recreate the correct index.\n");
}

run().catch(err => {
    console.error("[fix-appointment-index] FATAL:", err.message);
    process.exit(1);
});
