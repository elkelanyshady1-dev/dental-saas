require("module-alias/register");
/**
 * fixContractOverlap.js
 * One-time migration — Fix timeline overlaps in OrgContract supersession chain
 *
 * Problem:
 *   contractActivation.service.js sets previousContract.effectiveTo = new Date()
 *   at the moment of supersession, but the new contract's effectiveFrom may be
 *   earlier (e.g., set at draft creation). This creates overlapping windows
 *   where both contracts cover the same time period.
 *
 *   Detected overlap:
 *     Org: 69a9f380b90d57cce3168c0e
 *     Contract A (superseded): 69a9f381b90d57cce3168c24
 *       2026-03-05 → 2026-03-07T02:39:48
 *     Contract B (active): 69ab8d8e7e36b999bb79b671
 *       Start: 2026-03-07T02:29:34
 *     Overlap ≈ 10 minutes.
 *
 * Fix:
 *   For every superseded contract that has a successor (supersededById):
 *     previousContract.effectiveTo = newContract.effectiveFrom
 *   This aligns the timeline boundary exactly.
 *
 * Safety guarantees:
 *   - DRY_RUN=true previews without writing
 *   - Idempotent: only fixes contracts where effectiveTo > successor.effectiveFrom
 *   - Atomic per-document (no partial writes)
 *   - NEVER modifies: lockedPrice, contractStatus, pricingSnapshot
 *   - Only touches: effectiveTo on superseded contracts with successors
 *
 * Usage:
 *   node scripts/fixContractOverlap.js
 *   DRY_RUN=true node scripts/fixContractOverlap.js
 *
 * SENTINEL PRE-CHECK:
 *   Contract impact: CORRECTIVE ONLY (effectiveTo alignment)
 *   Regression risk: LOW
 */

"use strict";

const mongoose = require("mongoose");
const path = require("path");

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
    if (DRY_RUN) console.log("⚠️   DRY RUN enabled — no writes will occur\n");

    const collection = mongoose.connection.collection("orgcontracts");

    // ── 1. Find all superseded contracts that have a successor ─────────────────
    const superseded = await collection.find({
        contractStatus: "superseded",
        supersededById: { $ne: null },
        effectiveTo: { $ne: null }
    }).project({
        _id: 1,
        organizationId: 1,
        effectiveFrom: 1,
        effectiveTo: 1,
        supersededById: 1
    }).toArray();

    console.log(`── Analysis ──────────────────────────────────────────────────`);
    console.log(`   Total superseded contracts with successors: ${superseded.length}`);

    // ── 2. For each, look up the successor's effectiveFrom ─────────────────────
    const overlaps = [];

    for (const prev of superseded) {
        const successor = await collection.findOne(
            { _id: prev.supersededById },
            { projection: { _id: 1, effectiveFrom: 1, contractStatus: 1 } }
        );

        if (!successor || !successor.effectiveFrom) continue;

        // Check for overlap: previous ends AFTER successor starts
        if (prev.effectiveTo > successor.effectiveFrom) {
            const overlapMs = prev.effectiveTo - successor.effectiveFrom;
            overlaps.push({
                orgId: prev.organizationId,
                prevContractId: prev._id,
                successorContractId: successor._id,
                prevEffectiveTo: prev.effectiveTo,
                successorEffectiveFrom: successor.effectiveFrom,
                overlapMinutes: Math.round(overlapMs / 60000),
                correctEffectiveTo: successor.effectiveFrom
            });
        }
    }

    console.log(`   Overlapping contracts found:             ${overlaps.length}`);
    console.log(`──────────────────────────────────────────────────────────────\n`);

    if (overlaps.length === 0) {
        console.log("✅  No overlaps detected. Timeline is clean.");
        await mongoose.disconnect();
        return;
    }

    // ── 3. Display overlaps ────────────────────────────────────────────────────
    for (const o of overlaps) {
        console.log(`  Org: ${o.orgId}`);
        console.log(`    Contract A (superseded): ${o.prevContractId}`);
        console.log(`      effectiveTo:  ${o.prevEffectiveTo.toISOString()}`);
        console.log(`    Contract B (successor):  ${o.successorContractId}`);
        console.log(`      effectiveFrom: ${o.successorEffectiveFrom.toISOString()}`);
        console.log(`    Overlap: ~${o.overlapMinutes} minutes`);
        console.log(`    Fix: set A.effectiveTo → ${o.correctEffectiveTo.toISOString()}`);
        console.log();
    }

    if (DRY_RUN) {
        console.log(`[DRY RUN] Would fix ${overlaps.length} overlap(s). Remove DRY_RUN=true to apply.`);
        await mongoose.disconnect();
        return;
    }

    // ── 4. Apply fixes ─────────────────────────────────────────────────────────
    console.log(`🔄  Fixing ${overlaps.length} overlap(s)...\n`);

    let fixed = 0;
    for (const o of overlaps) {
        const result = await collection.updateOne(
            { _id: o.prevContractId },
            { $set: { effectiveTo: o.correctEffectiveTo } }
        );
        if (result.modifiedCount === 1) {
            console.log(`  ✅ Fixed: Contract ${o.prevContractId} → effectiveTo = ${o.correctEffectiveTo.toISOString()}`);
            fixed++;
        } else {
            console.log(`  ⚠️  No update for Contract ${o.prevContractId} (already correct or not found)`);
        }
    }

    console.log(`\n✅  Fixed ${fixed}/${overlaps.length} overlap(s).\n`);

    // ── 5. Verification ────────────────────────────────────────────────────────
    // Re-check for remaining overlaps
    const COVERAGE_STATUSES = ["active", "pending_activation", "superseded", "expired"];
    const contracts = await collection
        .find(
            { contractStatus: { $in: COVERAGE_STATUSES }, effectiveFrom: { $ne: null } },
            { projection: { _id: 1, organizationId: 1, effectiveFrom: 1, effectiveTo: 1, contractStatus: 1 } }
        )
        .sort({ organizationId: 1, effectiveFrom: 1 })
        .toArray();

    let remainingViolations = 0;
    let prev = null, prevOrgId = null;

    for (const c of contracts) {
        const orgId = c.organizationId.toString();
        if (orgId !== prevOrgId) { prev = null; prevOrgId = orgId; }
        if (prev && prev.effectiveTo && c.effectiveFrom < prev.effectiveTo) {
            remainingViolations++;
        }
        prev = c;
    }

    if (remainingViolations > 0) {
        console.log(`❌  ${remainingViolations} overlap(s) remain after fix. Manual investigation required.`);
    } else {
        console.log("✅  Post-fix verification: ZERO overlaps. CONTRACT_TIMELINE_INTEGRITY clean.");
    }

    await mongoose.disconnect();
}

run().catch((err) => {
    console.error("❌  Fix script failed:", err.message);
    console.error(err.stack);
    mongoose.disconnect().finally(() => process.exit(1));
});
