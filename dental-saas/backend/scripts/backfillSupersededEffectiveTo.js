require("module-alias/register");
/**
 * backfillSupersededEffectiveTo.js
 * Contract Timeline Hardening — One-time idempotent migration
 *
 * Problem:
 *   contractActivation.service.js supersedes contracts but never sets effectiveTo
 *   on the outgoing contract. This leaves historical billing periods open-ended,
 *   preventing the CONTRACT_TIMELINE_INTEGRITY guardian from doing accurate
 *   overlap detection.
 *
 * Fix:
 *   For every superseded contract where effectiveTo is null:
 *     effectiveTo ← supersededAt  (closest known closing boundary)
 *
 * Safety guarantees:
 *   - DRY_RUN=true previews counts without writing anything
 *   - Atomic aggregation pipeline updateMany — no documents loaded into memory
 *   - Idempotent: filter { effectiveTo: null } ensures already-backfilled docs
 *     are never touched again
 *   - NEVER modifies: lockedPrice, contractStatus, pricingSnapshot, or any
 *     other billing field
 *   - Only touches: superseded contracts missing effectiveTo
 *
 * Usage:
 *   node scripts/backfillSupersededEffectiveTo.js
 *   DRY_RUN=true node scripts/backfillSupersededEffectiveTo.js
 *
 * SENTINEL PRE-CHECK:
 *   Contract impact: ADDITIVE ONLY (effectiveTo field, closed period stamping)
 *   Regression risk: LOW
 */

"use strict";

const mongoose = require("mongoose");
const path = require("path");

// ── Environment ────────────────────────────────────────────────────────────────
require("dotenv").config({ path: path.resolve(__dirname, "../.env") });

const MONGO_URI = process.env.MONGO_URI || process.env.DATABASE_URL;
const DRY_RUN = process.env.DRY_RUN === "true";

if (!MONGO_URI) {
    console.error("❌  MONGO_URI or DATABASE_URL env var is required.");
    process.exit(1);
}

// ── Run ────────────────────────────────────────────────────────────────────────
async function run() {
    await mongoose.connect(MONGO_URI);
    console.log("✅  Connected to MongoDB");
    if (DRY_RUN) console.log("⚠️   DRY RUN enabled — no writes will occur\n");

    const collection = mongoose.connection.collection("orgcontracts");

    // ── 1. Analysis ───────────────────────────────────────────────────────────
    //
    // Target documents: contractStatus=superseded AND effectiveTo=null AND supersededAt exists.
    //
    // NOTE: We query effectiveTo: null (not $exists: false) because Mongoose creates
    // all OrgContract fields with null defaults — the field exists on every document,
    // it just holds null when never set.
    const [totalSuperseded, alreadyHaveEffectiveTo, targetCount] = await Promise.all([
        collection.countDocuments({ contractStatus: "superseded" }),
        collection.countDocuments({ contractStatus: "superseded", effectiveTo: { $ne: null } }),
        collection.countDocuments({
            contractStatus: "superseded",
            effectiveTo: null,
            supersededAt: { $exists: true, $ne: null }
        })
    ]);

    const missingSupersededAt = await collection.countDocuments({
        contractStatus: "superseded",
        effectiveTo: null,
        supersededAt: { $in: [null, undefined] }
    });

    console.log("── Pre-Migration Analysis ────────────────────────────────────");
    console.log(`   Total superseded contracts:          ${totalSuperseded}`);
    console.log(`   Already have effectiveTo:            ${alreadyHaveEffectiveTo}`);
    console.log(`   Missing effectiveTo (have supersededAt): ${targetCount}  ← will be backfilled`);
    console.log(`   Missing effectiveTo (no supersededAt):   ${missingSupersededAt}  ← cannot backfill (no date source)`);
    console.log("─────────────────────────────────────────────────────────────\n");

    if (targetCount === 0) {
        console.log("✅  Nothing to backfill. All superseded contracts already have effectiveTo.");
        await mongoose.disconnect();
        return;
    }

    if (DRY_RUN) {
        console.log(`[DRY RUN] Would backfill effectiveTo on ${targetCount} contract(s) using supersededAt.`);
        console.log("[DRY RUN] No writes performed. Remove DRY_RUN=true to apply.");
        await mongoose.disconnect();
        return;
    }

    // ── 2. Backfill ───────────────────────────────────────────────────────────
    // Aggregation pipeline updateMany:
    //   effectiveTo ← supersededAt
    //
    // This is a single atomic operation — no documents are loaded into application memory.
    // The aggregation pipeline form of $set reads fields from the document itself.
    console.log(`🔄  Backfilling effectiveTo on ${targetCount} superseded contract(s)...`);

    const result = await collection.updateMany(
        {
            contractStatus: "superseded",
            effectiveTo: null,
            supersededAt: { $exists: true, $ne: null }
        },
        [
            {
                $set: {
                    effectiveTo: "$supersededAt"   // closes the period at the moment of supersession
                }
            }
        ]
    );

    console.log(`✅  Backfilled: ${result.modifiedCount} contract(s) updated.\n`);

    // ── 3. Verification ───────────────────────────────────────────────────────
    const stillMissing = await collection.countDocuments({
        contractStatus: "superseded",
        effectiveTo: null,
        supersededAt: { $exists: true, $ne: null }
    });

    if (stillMissing > 0) {
        console.error(`❌  Verification FAILED: ${stillMissing} superseded contracts still missing effectiveTo after backfill.`);
        console.error("    This should not happen. Investigate MongoDB write concern or query filter.");
        await mongoose.disconnect();
        process.exit(1);
    }

    console.log("── Post-Migration State ──────────────────────────────────────");
    const [newlyHaveEffectiveTo, remainingNull] = await Promise.all([
        collection.countDocuments({ contractStatus: "superseded", effectiveTo: { $ne: null } }),
        collection.countDocuments({ contractStatus: "superseded", effectiveTo: null })
    ]);
    console.log(`   Superseded with effectiveTo set:    ${newlyHaveEffectiveTo}`);
    console.log(`   Superseded still missing (no supersededAt): ${remainingNull}  ← cannot be auto-resolved`);
    console.log("─────────────────────────────────────────────────────────────");
    console.log("✅  Backfill complete.\n");
    console.log("📋  Next steps:");
    console.log("   1. Run: npm run dev");
    console.log("   2. Guardian should now show: ✅ CONTRACT_TIMELINE_INTEGRITY");
    console.log("   3. WARN about missing effectiveTo should be gone for newly processed contracts.");

    await mongoose.disconnect();
}

// ── Entry Point ────────────────────────────────────────────────────────────────
run().catch((err) => {
    console.error("❌  Backfill script failed:", err.message);
    console.error(err.stack);
    mongoose.disconnect().finally(() => process.exit(1));
});
