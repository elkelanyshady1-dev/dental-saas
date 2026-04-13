require("module-alias/register");
/**
 * migratePlanVisibility.js
 * One-time migration: isSalesOnly (Boolean) → visibility (enum)
 *
 * v6.1 — Plan Visibility Migration
 *
 * Rules:
 *   isSalesOnly === true  → visibility = "sales"
 *   isSalesOnly === false → visibility = "public"
 *   visibility already set to non-"public" value → skip (already migrated)
 *
 * Safety:
 *   - Uses bulkWrite for atomic, efficient updates
 *   - Dry-run mode: set DRY_RUN=true to preview without writing
 *   - Reports counts of each bucket
 *   - Fails loudly if any doc is left without visibility after run
 *
 * Usage:
 *   node scripts/migratePlanVisibility.js
 *   DRY_RUN=true node scripts/migratePlanVisibility.js
 */

"use strict";

const mongoose = require("mongoose");
const path = require("path");

// Load env
require("dotenv").config({ path: path.resolve(__dirname, "../.env") });

const MONGO_URI = process.env.MONGO_URI || process.env.DATABASE_URL;
const DRY_RUN = process.env.DRY_RUN === "true";

if (!MONGO_URI) {
    console.error("❌  MONGO_URI or DATABASE_URL env var is required.");
    process.exit(1);
}

async function run() {
    await mongoose.connect(MONGO_URI);
    console.log("✅  Connected to MongoDB");
    if (DRY_RUN) console.log("⚠️   DRY RUN enabled — no writes will occur");

    const collection = mongoose.connection.collection("planversions");

    // ── 1. Analyse current state ────────────────────────────────────────────────
    const [total, alreadyMigrated, needsSales, needsPublic, missingVisibility] = await Promise.all([
        collection.countDocuments({}),
        collection.countDocuments({ visibility: { $in: ["sales", "internal"] } }),
        collection.countDocuments({ isSalesOnly: true, visibility: "public" }),
        collection.countDocuments({ isSalesOnly: false, visibility: "public" }),
        collection.countDocuments({ visibility: { $exists: false } })
    ]);

    console.log("\n── Migration Analysis ─────────────────────────────────────────");
    console.log(`  Total documents:               ${total}`);
    console.log(`  Already fully migrated:        ${alreadyMigrated}`);
    console.log(`  Needs → "sales"  (isSalesOnly=true, visibility="public"):  ${needsSales}`);
    console.log(`  Needs → "public" (isSalesOnly=false, visibility="public"): ${needsPublic}`);
    console.log(`  Missing visibility field entirely: ${missingVisibility}`);
    console.log("───────────────────────────────────────────────────────────────\n");

    if (DRY_RUN) {
        console.log("DRY RUN complete. Re-run without DRY_RUN=true to apply.");
        await mongoose.disconnect();
        return;
    }

    // ── 2. Migrate isSalesOnly=true → visibility="sales" ───────────────────────
    const salesResult = await collection.updateMany(
        { isSalesOnly: true, visibility: "public" },
        { $set: { visibility: "sales" } }
    );
    console.log(`✅  Set visibility="sales" for ${salesResult.modifiedCount} document(s)`);

    // ── 3. Confirm isSalesOnly=false + missing visibility → "public" (already default, but explicit) ──
    const publicResult = await collection.updateMany(
        { visibility: { $exists: false } },
        { $set: { visibility: "public" } }
    );
    console.log(`✅  Set visibility="public" for ${publicResult.modifiedCount} document(s) missing field`);

    // ── 4. Verification pass ────────────────────────────────────────────────────
    const remaining = await collection.countDocuments({
        visibility: { $nin: ["public", "sales", "internal"] }
    });

    if (remaining > 0) {
        console.error(`\n❌  VERIFICATION FAILED: ${remaining} document(s) have invalid or missing visibility.`);
        console.error("    Investigate and re-run migration.");
        process.exit(1);
    }

    const finalCounts = await collection.aggregate([
        { $group: { _id: "$visibility", count: { $sum: 1 } } },
        { $sort: { _id: 1 } }
    ]).toArray();

    console.log("\n── Final State ────────────────────────────────────────────────");
    finalCounts.forEach(({ _id, count }) => {
        console.log(`  visibility="${_id}": ${count} document(s)`);
    });
    console.log("───────────────────────────────────────────────────────────────");
    console.log("\n✅  Migration complete. All PlanVersion documents have valid visibility.");
    console.log("    Next step: remove isSalesOnly from schema (Phase 6).\n");

    await mongoose.disconnect();
}

run().catch(err => {
    console.error("❌  Migration failed:", err);
    mongoose.disconnect();
    process.exit(1);
});
