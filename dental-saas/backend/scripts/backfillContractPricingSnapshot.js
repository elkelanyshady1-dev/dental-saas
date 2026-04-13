require("module-alias/register");
/**
 * backfillContractPricingSnapshot.js
 * Commercial Hardening — One-time migration
 *
 * Backfills `pricingSnapshot` on historical OrgContract documents
 * that were created before pricingEngine.service.js was introduced.
 *
 * Safety guarantees:
 *   - DRY_RUN=true previews without writing anything
 *   - Uses updateOne($set) — bypasses OAV pre-save hook and immutability guards
 *   - Only touches documents where pricingSnapshot is null or absent
 *   - lockedPrice, currency, billingInterval — NEVER modified
 *   - Idempotent: re-running is always safe
 *   - Verification pass at the end: exits 1 if any docs still missing snapshot
 *
 * Backfilled snapshot shape (conforms to pricingSnapshotSchema):
 *   snapshotType    = "backfilled"   — analytics/BI grouping key
 *   basePrice       = lockedPrice    — frozen truth; pre-discount unknown for historical
 *   discountAmount, taxRate, taxAmount = 0  (unknown for historical contracts)
 *   _backfilledAt   = timestamp of the migration run
 *
 * Usage:
 *   node scripts/backfillContractPricingSnapshot.js
 *   DRY_RUN=true node scripts/backfillContractPricingSnapshot.js
 *
 * SENTINEL PRE-CHECK:
 *   Contract impact: ADDITIVE ONLY (pricingSnapshot field, never lockedPrice)
 *   Regression risk: LOW
 */

"use strict";

const mongoose = require("mongoose");
const path = require("path");

// ── Environment ───────────────────────────────────────────────────────────────
require("dotenv").config({ path: path.resolve(__dirname, "../.env") });

const MONGO_URI = process.env.MONGO_URI || process.env.DATABASE_URL;
const DRY_RUN = process.env.DRY_RUN === "true";
const BATCH_SIZE = 200; // process in batches to avoid memory pressure on large collections

if (!MONGO_URI) {
    console.error("❌  MONGO_URI or DATABASE_URL env var is required.");
    process.exit(1);
}

// ── Run ───────────────────────────────────────────────────────────────────────
async function run() {
    await mongoose.connect(MONGO_URI);
    console.log("✅  Connected to MongoDB");
    if (DRY_RUN) console.log("⚠️   DRY RUN enabled — no writes will occur\n");

    const collection = mongoose.connection.collection("orgcontracts");

    // ── 1. Analysis ───────────────────────────────────────────────────────────
    const [total, alreadyHaveSnapshot, missingSnapshot] = await Promise.all([
        collection.countDocuments({}),
        collection.countDocuments({ pricingSnapshot: { $exists: true, $ne: null } }),
        collection.countDocuments({
            $or: [
                { pricingSnapshot: { $exists: false } },
                { pricingSnapshot: null }
            ]
        })
    ]);

    console.log("── Contract Pricing Snapshot Backfill Analysis ─────────────────────");
    console.log(`  Total contracts:                   ${total}`);
    console.log(`  Already have pricingSnapshot:      ${alreadyHaveSnapshot}`);
    console.log(`  Missing pricingSnapshot:           ${missingSnapshot}`);
    console.log("────────────────────────────────────────────────────────────────────\n");

    if (missingSnapshot === 0) {
        console.log("✅  All contracts already have pricingSnapshot. Nothing to do.");
        await mongoose.disconnect();
        return;
    }

    if (DRY_RUN) {
        console.log("── DRY RUN — Sample of contracts to be backfilled ──────────────────");
        const sample = await collection.find({
            $or: [
                { pricingSnapshot: { $exists: false } },
                { pricingSnapshot: null }
            ]
        }, {
            projection: {
                _id: 1, organizationId: 1, contractStatus: 1,
                lockedPrice: 1, currency: 1, billingInterval: 1, source: 1, trialDays: 1
            }
        }).limit(5).toArray();

        sample.forEach(c => {
            console.log(`  _id=${c._id} | status=${c.contractStatus} | source=${c.source || "provisioning"} | ` +
                `lockedPrice=${c.lockedPrice} ${c.currency} | trial=${c.trialDays > 0}`);
        });
        if (missingSnapshot > 5) {
            console.log(`  ... and ${missingSnapshot - 5} more`);
        }
        console.log("\n⚠️   DRY RUN complete — no changes written.");
        console.log("    Re-run without DRY_RUN=true to apply.\n");
        await mongoose.disconnect();
        return;
    }

    // ── 2. Backfill in batches ────────────────────────────────────────────────
    console.log(`Processing ${missingSnapshot} contracts in batches of ${BATCH_SIZE}...`);
    let totalUpdated = 0;
    let totalFailed = 0;
    let cursor = null;

    do {
        const query = {
            $or: [
                { pricingSnapshot: { $exists: false } },
                { pricingSnapshot: null }
            ]
        };
        if (cursor) query._id = { $gt: cursor };

        const batch = await collection.find(query)
            .sort({ _id: 1 })
            .limit(BATCH_SIZE)
            .toArray();

        if (batch.length === 0) break;
        cursor = batch[batch.length - 1]._id;

        const bulkOps = batch.map(contract => {
            const isTrial = (contract.trialDays || 0) > 0;

            // Synthetic snapshot — best-effort reconstruction from frozen contract fields.
            // basePrice = lockedPrice (the actual charged amount; pre-discount unknown).
            // Historical contracts predating engine: coupon/tax breakdown not available.
            const snapshot = {
                regionCode: contract.regionCode || null,   // org-level region if available
                billingInterval: contract.billingInterval || null,
                basePrice: contract.lockedPrice,           // FROZEN — treat as canonical
                perSeatAddition: 0,                              // unknown for historical
                discountAmount: 0,                              // unknown for historical
                taxRate: 0,                              // unknown for historical
                taxAmount: 0,                              // unknown for historical
                couponApplied: contract.appliedCoupon != null, // infer from presence
                isOverride: contract.source === "sales",    // sales contracts used custom price
                // Analytics grouping key — BI dashboards use snapshotType to separate
                // exact engine-computed records from historical reconstructions.
                snapshotType: "backfilled",
                _backfilledAt: new Date()
            };

            return {
                updateOne: {
                    filter: { _id: contract._id, pricingSnapshot: { $in: [null, undefined] } }, // extra safety guard
                    update: { $set: { pricingSnapshot: snapshot } }
                }
            };
        });

        try {
            const result = await collection.bulkWrite(bulkOps, { ordered: false });
            totalUpdated += result.modifiedCount;
            process.stdout.write(`\r  Progress: ${totalUpdated}/${missingSnapshot} updated...`);
        } catch (err) {
            console.error(`\n❌  Batch write error: ${err.message}`);
            totalFailed += batch.length;
        }

    } while (true); // exits on empty batch

    console.log(`\n\n── Write Complete ───────────────────────────────────────────────────`);
    console.log(`  Updated:  ${totalUpdated}`);
    if (totalFailed > 0) {
        console.error(`  Failed:   ${totalFailed}`);
    }

    // ── 3. Verification pass ──────────────────────────────────────────────────
    const remaining = await collection.countDocuments({
        $or: [
            { pricingSnapshot: { $exists: false } },
            { pricingSnapshot: null }
        ]
    });

    console.log("────────────────────────────────────────────────────────────────────");

    if (remaining > 0) {
        console.error(`\n❌  VERIFICATION FAILED: ${remaining} contract(s) still missing pricingSnapshot.`);
        console.error("    Re-run the backfill — or investigate failed batch writes above.");
        await mongoose.disconnect();
        process.exit(1);
    }

    console.log(`\n✅  Verification passed — all contracts now have pricingSnapshot.`);
    console.log("    CONTRACT_PRICING_SNAPSHOT_PRESENT guardian is now a hard FAIL invariant.");
    console.log("    Re-start the server to confirm guardian passes.\n");

    await mongoose.disconnect();
}

run().catch(err => {
    console.error("❌  Backfill failed:", err);
    mongoose.disconnect().catch(() => { });
    process.exit(1);
});
