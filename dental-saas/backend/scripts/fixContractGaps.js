require("module-alias/register");
/**
 * fixContractGaps.js
 * Contract Timeline Hardening — One-time idempotent migration
 *
 * Problem:
 *   The supersession chain may contain gaps where successor.effectiveFrom
 *   is later than prev.effectiveTo, leaving uncovered billing periods.
 *   This can happen when:
 *     - effectiveFrom was set at draft creation (before activation)
 *     - Migrations adjusted effectiveTo but not the successor's effectiveFrom
 *     - Manual DB edits created inconsistencies
 *
 * Fix:
 *   For every superseded contract linked to a successor via supersededById:
 *     If successor.effectiveFrom > prev.effectiveTo:
 *       successor.effectiveFrom ← prev.effectiveTo
 *
 * Repair direction: adjusts the SUCCESSOR's start, not the previous's end.
 * Rationale: prev.effectiveTo was stamped by the activation service at the
 * moment of supersession — it is the authoritative transition boundary.
 *
 * Safety guarantees:
 *   - DRY_RUN=true previews counts without writing anything
 *   - Idempotent: only touches successor contracts where effectiveFrom > prev.effectiveTo
 *   - Atomic per-document update (no partial writes)
 *   - NEVER modifies: lockedPrice, contractStatus, pricingSnapshot, effectiveTo
 *   - Only touches: effectiveFrom on successor contracts with gaps
 *
 * Usage:
 *   node scripts/fixContractGaps.js
 *   DRY_RUN=true node scripts/fixContractGaps.js
 *
 * SENTINEL PRE-CHECK:
 *   Contract impact: CORRECTIVE ONLY (effectiveFrom alignment)
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

    // ── 1. Find all superseded contracts with successors ──────────────────────
    const superseded = await collection.find({
        contractStatus: "superseded",
        supersededById: { $ne: null },
        effectiveTo: { $ne: null }
    }).project({
        _id: 1,
        organizationId: 1,
        effectiveTo: 1,
        supersededById: 1
    }).toArray();

    console.log(`── Analysis ──────────────────────────────────────────────────`);
    console.log(`   Total superseded contracts with successors: ${superseded.length}`);

    // ── 2. Detect gaps ──────────────────────────────────────────────────────────
    const gaps = [];

    for (const prev of superseded) {
        const successor = await collection.findOne(
            { _id: prev.supersededById },
            { projection: { _id: 1, effectiveFrom: 1, contractStatus: 1 } }
        );

        if (!successor || !successor.effectiveFrom) continue;

        const gapMs = successor.effectiveFrom - prev.effectiveTo;
        if (gapMs > 0) {
            gaps.push({
                orgId: prev.organizationId,
                prevContractId: prev._id,
                prevEffectiveTo: prev.effectiveTo,
                successorContractId: successor._id,
                successorEffectiveFrom: successor.effectiveFrom,
                successorStatus: successor.contractStatus,
                gapMinutes: Math.round(gapMs / 60000),
                gapHours: +(gapMs / 3600000).toFixed(2),
                correctEffectiveFrom: prev.effectiveTo
            });
        }
    }

    console.log(`   Gaps detected:                            ${gaps.length}`);
    console.log(`──────────────────────────────────────────────────────────────\n`);

    if (gaps.length === 0) {
        console.log("✅  No gaps detected. Supersession chain is continuous.");
        await mongoose.disconnect();
        return;
    }

    // ── 3. Display gaps ────────────────────────────────────────────────────────
    for (const g of gaps) {
        console.log(`  Org: ${g.orgId}`);
        console.log(`    Contract A (superseded): ${g.prevContractId}`);
        console.log(`      effectiveTo:    ${g.prevEffectiveTo.toISOString()}`);
        console.log(`    Contract B (successor):  ${g.successorContractId} [${g.successorStatus}]`);
        console.log(`      effectiveFrom:  ${g.successorEffectiveFrom.toISOString()}`);
        console.log(`    Gap: ~${g.gapMinutes} minutes (~${g.gapHours} hours)`);
        console.log(`    Fix: set B.effectiveFrom → ${g.correctEffectiveFrom.toISOString()}`);
        console.log();
    }

    if (DRY_RUN) {
        console.log(`[DRY RUN] Would fix ${gaps.length} gap(s). Remove DRY_RUN=true to apply.`);
        await mongoose.disconnect();
        return;
    }

    // ── 4. Apply fixes ─────────────────────────────────────────────────────────
    console.log(`🔄  Fixing ${gaps.length} gap(s)...\n`);

    let fixed = 0;
    for (const g of gaps) {
        const result = await collection.updateOne(
            { _id: g.successorContractId },
            { $set: { effectiveFrom: g.correctEffectiveFrom } }
        );
        if (result.modifiedCount === 1) {
            console.log(`  ✅ Fixed: Contract ${g.successorContractId} → effectiveFrom = ${g.correctEffectiveFrom.toISOString()}`);
            fixed++;
        } else {
            console.log(`  ⚠️  No update for Contract ${g.successorContractId} (already correct or not found)`);
        }
    }

    console.log(`\n✅  Fixed ${fixed}/${gaps.length} gap(s).\n`);

    // ── 5. Verification ────────────────────────────────────────────────────────
    // Re-scan for remaining gaps
    const remainingSuperseded = await collection.find({
        contractStatus: "superseded",
        supersededById: { $ne: null },
        effectiveTo: { $ne: null }
    }).project({
        _id: 1, effectiveTo: 1, supersededById: 1
    }).toArray();

    let remainingGaps = 0;
    for (const prev of remainingSuperseded) {
        const succ = await collection.findOne(
            { _id: prev.supersededById },
            { projection: { effectiveFrom: 1 } }
        );
        if (succ && succ.effectiveFrom && succ.effectiveFrom > prev.effectiveTo) {
            remainingGaps++;
        }
    }

    if (remainingGaps > 0) {
        console.log(`❌  ${remainingGaps} gap(s) remain after fix. Manual investigation required.`);
    } else {
        console.log("✅  Post-fix verification: ZERO gaps. CONTRACT_GAP_INTEGRITY clean.");
    }

    await mongoose.disconnect();
}

run().catch((err) => {
    console.error("❌  Fix script failed:", err.message);
    console.error(err.stack);
    mongoose.disconnect().finally(() => process.exit(1));
});
