require("module-alias/register");
/**
 * backfillOrgTrialContracts.js
 * One-time migration — ORG_WITHOUT_ACTIVE_CONTRACT guardian fix
 *
 * Creates a trial OrgContract for every active, non-archived organization
 * that currently has no contract (currentContractId === null).
 *
 * This resolves the ORG_WITHOUT_ACTIVE_CONTRACT guardian invariant which
 * fails when pre-TDS organizations exist without a currentContractId.
 *
 * Safety guarantees:
 *   - DRY_RUN=true previews without writing anything
 *   - Skips orgs that already have currentContractId set
 *   - Skips archived orgs
 *   - Does NOT modify orgs that already have contracts
 *   - Idempotent: re-running is always safe
 *   - Uses the active PlanVersion for the default plan code (required by OrgContract schema)
 *
 * Backfill strategy:
 *   Creates a minimal "provisioning" trial OrgContract with:
 *     - contractStatus: "active" (so the guardian check passes)
 *     - source: "migration"
 *     - lockedPrice: 0
 *     - trialDays: 14 (soft default — org is already live)
 *     - planCode: derived from the first active PlanVersion found
 *
 * Usage:
 *   node scripts/backfillOrgTrialContracts.js
 *   DRY_RUN=true node scripts/backfillOrgTrialContracts.js
 *
 * SENTINEL PRE-CHECK:
 *   Contract impact: ADDITIVE ONLY — new trial OrgContracts for orgs with none
 *   Regression risk: LOW — only writes where currentContractId is null
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

// Load models AFTER connection (Mongoose registers them on first require)
async function loadModels() {
    const Organization = require("../src/shared/models/Organization");
    const OrgContract = require("../src/platform/billing/models/OrgContract.model");
    const PlanVersion = require("../src/platform/billing/models/PlanVersion.model");
    // PlatformUser for createdBy (use system user or find first superadmin)
    const PlatformUser = require("../src/platform/auth/models/PlatformUser.model");
    return { Organization, OrgContract, PlanVersion, PlatformUser };
}

async function run() {
    await mongoose.connect(MONGO_URI);
    console.log("✅  Connected to MongoDB");
    if (DRY_RUN) console.log("⚠️   DRY RUN enabled — no writes will occur\n");

    const { Organization, OrgContract, PlanVersion, PlatformUser } = await loadModels();

    // ── 1. Find a system actor for createdBy ───────────────────────────────────
    const systemActor = await PlatformUser.findOne({ role: "superadmin" }).lean();
    if (!systemActor) {
        console.error("❌  No superadmin PlatformUser found. Cannot set createdBy. Aborting.");
        process.exit(1);
    }
    console.log(`ℹ️   Using system actor: ${systemActor.email} (${systemActor._id})`);

    // ── 2. Find the default active PlanVersion (for planCode + planVersionId) ──
    const defaultVersion = await PlanVersion.findOne({ status: "active" })
        .sort({ activatedAt: -1 })
        .lean();

    if (!defaultVersion) {
        console.error("❌  No active PlanVersion found. Cannot create trial contracts without a plan.");
        console.error("    Publish at least one PlanVersion first, then re-run this script.");
        process.exit(1);
    }
    console.log(`ℹ️   Default plan: ${defaultVersion.templateCode} — versionTag: ${defaultVersion.versionTag} (${defaultVersion._id})`);

    // ── 3. Find organizations without a contract ──────────────────────────────
    const orgs = await Organization.find({
        isArchived: { $ne: true },
        currentContractId: null
    }).lean();

    console.log(`\n── Analysis ───────────────────────────────────────────────────────`);
    console.log(`  Organizations missing a contract: ${orgs.length}`);
    console.log(`────────────────────────────────────────────────────────────────\n`);

    if (orgs.length === 0) {
        console.log("✅  No organizations require backfill. All orgs have a contract.");
        await mongoose.disconnect();
        return;
    }

    if (DRY_RUN) {
        console.log("DRY RUN — would have created contracts for orgs:");
        orgs.slice(0, 10).forEach(o => console.log(`  - ${o._id} (${o.name || "unnamed"})`));
        if (orgs.length > 10) console.log(`  ... and ${orgs.length - 10} more`);
        console.log("\nDRY RUN complete. Re-run without DRY_RUN=true to apply.");
        await mongoose.disconnect();
        return;
    }

    // ── 4. Create trial contracts ─────────────────────────────────────────────
    let created = 0;
    let failed = 0;

    for (const org of orgs) {
        try {
            const now = new Date();

            // Create minimal active trial contract
            const contract = await OrgContract.create({
                organizationId: org._id,
                planVersionId: defaultVersion._id,
                planCode: defaultVersion.templateCode,
                planVersionTag: defaultVersion.versionTag,
                contractStatus: "active",
                effectiveFrom: now,
                effectiveTo: null,  // open-ended
                lockedPrice: 0,
                currency: "USD",
                billingInterval: "monthly",
                trialDays: 14,
                autoRenew: false,
                source: "migration",
                createdBy: systemActor._id,
                pricingSnapshot: {
                    snapshotType: "backfilled",
                    basePrice: 0,
                    regionCode: "unknown",
                    billingInterval: "monthly",
                    taxRate: 0,
                    taxAmount: 0,
                    discountAmount: 0,
                    couponApplied: false,
                    perSeatAddition: 0,
                    isOverride: false,
                    _backfilledAt: now
                }
            });

            // Update org to point to the new contract
            await Organization.findByIdAndUpdate(org._id, {
                $set: { currentContractId: contract._id }
            });

            console.log(`✅  Created trial contract ${contract._id} for org ${org._id} (${org.name || "unnamed"})`);
            created++;
        } catch (err) {
            console.error(`❌  Failed for org ${org._id}: ${err.message}`);
            failed++;
        }
    }

    // ── 5. Summary ────────────────────────────────────────────────────────────
    console.log(`\n── Migration Complete ──────────────────────────────────────────────`);
    console.log(`  Created: ${created} trial contracts`);
    if (failed > 0) {
        console.log(`  Failed:  ${failed} (investigate above errors)`);
    }
    console.log(`────────────────────────────────────────────────────────────────`);

    // ── 6. Verification pass ──────────────────────────────────────────────────
    const stillMissing = await Organization.countDocuments({
        isArchived: { $ne: true },
        currentContractId: null
    });

    if (stillMissing > 0) {
        console.error(`\n❌  VERIFICATION FAILED: ${stillMissing} organization(s) still have no contract.`);
        console.error("    Investigate errors above and re-run migration.");
        process.exit(1);
    }

    console.log("\n✅  Verification passed. All active organizations now have a currentContractId.");
    console.log("    Restart the server — ORG_WITHOUT_ACTIVE_CONTRACT guardian should now pass.\n");

    await mongoose.disconnect();
}

run().catch(err => {
    console.error("❌  Migration failed:", err);
    mongoose.disconnect();
    process.exit(1);
});
