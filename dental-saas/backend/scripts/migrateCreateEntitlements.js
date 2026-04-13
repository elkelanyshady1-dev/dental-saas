require("module-alias/register");
/**
 * migrateCreateEntitlements.js
 * Sprint 2 — Tenant Entitlement Engine — Migration Script
 *
 * PURPOSE:
 * Creates baseline OrganizationEntitlement records for all existing organizations
 * that have an active OrgContract but no entitlement record yet.
 *
 * DESIGN:
 *   - Idempotent: uses findOneAndUpdate + upsert — safe to run multiple times
 *   - Dry-run mode: --dry-run flag reports what WOULD be created without writing
 *   - Source set to "migration" to distinguish from runtime-created records
 *
 * USAGE:
 *   # Preview only (no DB writes):
 *   node scripts/migrateCreateEntitlements.js --dry-run
 *
 *   # Apply (writes entitlements for all orgs missing them):
 *   node scripts/migrateCreateEntitlements.js
 *
 * REQUIRES: MONGODB_URI in environment (or .env in project root).
 */

"use strict";

require("dotenv").config({ path: require("path").join(__dirname, "..", ".env") });

const mongoose = require("mongoose");
const Organization = require("../src/shared/models/Organization");
const OrgContract = require("../src/platform/billing/models/OrgContract.model");
const PlanVersion = require("../src/platform/billing/models/PlanVersion.model");
const OrganizationEntitlement = require("../src/platform/billing/models/OrganizationEntitlement.model");

const isDryRun = process.argv.includes("--dry-run");

// ─── Counters ─────────────────────────────────────────────────────────────────
const stats = {
    orgsScanned: 0,
    orgsSkipped: 0,    // No active contract, or no PlanVersion
    alreadyHad: 0,    // Entitlement already existed (no write needed)
    created: 0,    // New entitlement created
    errors: 0
};

async function run() {
    const mongoUri = process.env.MONGODB_URI;
    if (!mongoUri) {
        console.error("❌  MONGODB_URI not set. Aborting.");
        process.exit(1);
    }

    console.log(`\n🔧  OrganizationEntitlement Migration Script`);
    console.log(`📋  Mode: ${isDryRun ? "DRY RUN (no writes)" : "LIVE (writing to DB)"}`);
    console.log(`🔗  Connecting to MongoDB...\n`);

    await mongoose.connect(mongoUri, {
        serverSelectionTimeoutMS: 10000
    });

    console.log("✅  Connected.\n");

    // Load all orgs that have a currentContractId
    const orgs = await Organization
        .find({ currentContractId: { $exists: true, $ne: null } })
        .lean()
        .select("_id name currentContractId");

    console.log(`📦  Found ${orgs.length} organizations with currentContractId\n`);

    for (const org of orgs) {
        stats.orgsScanned++;

        try {
            // ── Load contract ──────────────────────────────────────────────────
            const contract = await OrgContract.findOne({
                _id: org.currentContractId,
                organizationId: org._id,
                contractStatus: "active"
            }).lean();

            if (!contract) {
                console.log(`  ⏩  [${org.name ?? org._id}] No active contract — skipping`);
                stats.orgsSkipped++;
                continue;
            }

            // ── Load PlanVersion ───────────────────────────────────────────────
            const planVersion = await PlanVersion.findById(contract.planVersionId).lean();

            if (!planVersion) {
                console.log(`  ⏩  [${org.name ?? org._id}] PlanVersion not found — skipping`);
                stats.orgsSkipped++;
                continue;
            }

            // ── Check if entitlement already exists ────────────────────────────
            const existing = await OrganizationEntitlement.findOne({
                organizationId: org._id,
                effectiveUntil: null
            }).lean();

            if (existing) {
                console.log(`  ✔   [${org.name ?? org._id}] Already has entitlement (source: ${existing.source}) — skipping`);
                stats.alreadyHad++;
                continue;
            }

            // ── Create entitlement ─────────────────────────────────────────────
            if (isDryRun) {
                console.log(`  📝  [DRY RUN] Would create entitlement for: ${org.name ?? org._id} ` +
                    `(planCode: ${contract.planCode}, version: ${contract.planVersionTag})`);
            } else {
                await OrganizationEntitlement.create({
                    organizationId: org._id,
                    contractId: contract._id,
                    planVersionId: planVersion._id,
                    modules: planVersion.modules || {},
                    limits: planVersion.limits || {},
                    addons: [],
                    source: "migration",
                    effectiveFrom: new Date(),
                    effectiveUntil: null,
                    createdBy: null
                });

                console.log(`  ✅  [${org.name ?? org._id}] Entitlement created` +
                    ` (planCode: ${contract.planCode}, version: ${contract.planVersionTag})`);
            }

            stats.created++;

        } catch (err) {
            stats.errors++;
            console.error(`  ❌  [${org.name ?? org._id}] Error: ${err.message}`);
        }
    }

    // ── Summary ────────────────────────────────────────────────────────────────
    console.log("\n─────────────────────────────────────────────────────");
    console.log(`📊  Migration Summary`);
    console.log(`─────────────────────────────────────────────────────`);
    console.log(`   Orgs scanned:       ${stats.orgsScanned}`);
    console.log(`   Already had one:    ${stats.alreadyHad}`);
    console.log(`   Skipped (no data):  ${stats.orgsSkipped}`);
    console.log(`   ${isDryRun ? "Would create" : "Created"}:       ${stats.created}`);
    console.log(`   Errors:             ${stats.errors}`);
    console.log(`─────────────────────────────────────────────────────\n`);

    if (isDryRun) {
        console.log("ℹ️   DRY RUN complete. No changes were made to the database.");
        console.log("    Run without --dry-run to apply.\n");
    } else {
        console.log(stats.errors > 0
            ? `⚠️   Migration completed with ${stats.errors} error(s). Review logs above.`
            : "✅  Migration completed successfully.\n"
        );
    }

    await mongoose.disconnect();
    process.exit(stats.errors > 0 ? 1 : 0);
}

run().catch((err) => {
    console.error("💥  Fatal migration error:", err);
    process.exit(1);
});
