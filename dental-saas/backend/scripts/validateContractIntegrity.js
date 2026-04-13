require("module-alias/register");
/**
 * validateContractIntegrity.js
 * Sprint 3 — Integrity Validation
 *
 * READ-ONLY audit script. Zero mutations.
 *
 * Checks:
 *   1. No active/trial org without an OrgContract
 *   2. No PlatformInvoice without a contractId
 *   3. No OrgContract with null planVersionId (means backfill ran but no PlanVersion matched)
 *   4. No org where Organization.currentContractId points to non-existent contract
 *   5. No org with multiple active contracts (violated partial unique index)
 *
 * Usage:
 *   node scripts/validateContractIntegrity.js
 *   node scripts/validateContractIntegrity.js --fix-pointers   (repairs stale currentContractId only)
 *
 * Exit code 0 = clean, 1 = violations found
 */

"use strict";

require("dotenv").config();
const mongoose = require("mongoose");
const Organization = require("../src/shared/models/Organization");
const OrgContract = require("../src/platform/billing/models/OrgContract.model");
const PlatformInvoice = require("../src/platform/billing/models/PlatformInvoice.model");

// ─── CLI ──────────────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
const FIX_PTRS = args.includes("--fix-pointers");

// ─── Results ──────────────────────────────────────────────────────────────────
const violations = {
    orgsWithoutContract: [],
    invoicesWithoutContract: [],
    contractsWithoutPlanVersion: [],
    stalePtrs: [],
    duplicateActiveContracts: []
};

// ─── Check 1: Active orgs without any OrgContract ─────────────────────────────
async function check1_OrgsWithoutContract() {
    console.log("  ⏳ Check 1: Active organizations without OrgContract...");
    const activeOrgs = await Organization.find({
        isArchived: { $ne: true },
        "subscription.status": { $in: ["active", "trial", "past_due"] }
    }).select("_id name subscription.status currentContractId").lean();

    let missing = 0;
    for (const org of activeOrgs) {
        const hasContract = await OrgContract.exists({ organizationId: org._id });
        if (!hasContract) {
            violations.orgsWithoutContract.push({
                orgId: org._id,
                name: org.name,
                status: org.subscription?.status
            });
            missing++;
        }
    }

    if (missing === 0) {
        console.log(`  ✅ Check 1 PASSED — all ${activeOrgs.length} active orgs have a contract`);
    } else {
        console.log(`  ❌ Check 1 FAILED — ${missing} of ${activeOrgs.length} active orgs missing a contract`);
    }
}

// ─── Check 2: PlatformInvoices without contractId ─────────────────────────────
async function check2_InvoicesWithoutContract() {
    console.log("  ⏳ Check 2: PlatformInvoices without contractId...");
    const count = await PlatformInvoice.countDocuments({ contractId: { $in: [null, undefined] } });

    if (count === 0) {
        console.log("  ✅ Check 2 PASSED — all PlatformInvoices have contractId");
    } else {
        const samples = await PlatformInvoice.find({ contractId: { $in: [null, undefined] } })
            .select("_id organizationId status createdAt").limit(20).lean();
        violations.invoicesWithoutContract = samples.map(i => ({
            invoiceId: i._id,
            organizationId: i.organizationId,
            status: i.status,
            createdAt: i.createdAt
        }));
        console.log(`  ❌ Check 2 FAILED — ${count} PlatformInvoice(s) missing contractId`);
    }
}

// ─── Check 3: Contracts with null planVersionId ────────────────────────────────
async function check3_ContractsWithoutPlanVersion() {
    console.log("  ⏳ Check 3: OrgContracts with null planVersionId...");
    const count = await OrgContract.countDocuments({
        planVersionId: { $in: [null, undefined] },
        contractStatus: "active"
    });

    if (count === 0) {
        console.log("  ✅ Check 3 PASSED — all active contracts have planVersionId");
    } else {
        const samples = await OrgContract.find({
            planVersionId: { $in: [null, undefined] },
            contractStatus: "active"
        }).select("_id organizationId planCode").limit(20).lean();
        violations.contractsWithoutPlanVersion = samples.map(c => ({
            contractId: c._id,
            organizationId: c.organizationId,
            planCode: c.planCode
        }));
        console.log(`  ⚠️  Check 3 WARNING — ${count} active contracts have null planVersionId`);
        console.log("       (Expected if no PlanVersion exists for legacy plan codes — sprint 3 known issue)");
    }
}

// ─── Check 4: Stale currentContractId pointers ────────────────────────────────
async function check4_StalePointers(fixPointers) {
    console.log("  ⏳ Check 4: Stale Organization.currentContractId pointers...");

    const orgsWithPtr = await Organization.find({
        currentContractId: { $ne: null }
    }).select("_id name currentContractId").lean();

    let stale = 0;
    for (const org of orgsWithPtr) {
        const contract = await OrgContract.exists({ _id: org.currentContractId });
        if (!contract) {
            stale++;
            violations.stalePtrs.push({ orgId: org._id, name: org.name, staleId: org.currentContractId });

            if (fixPointers) {
                // Find the latest active contract for this org
                const latestContract = await OrgContract.findOne({
                    organizationId: org._id,
                    contractStatus: "active"
                }).sort({ createdAt: -1 }).select("_id").lean();

                await Organization.findByIdAndUpdate(org._id, {
                    $set: { currentContractId: latestContract?._id || null }
                });
                console.log(`    🔧 Fixed stale pointer for org ${org._id} → ${latestContract?._id || null}`);
            }
        }
    }

    if (stale === 0) {
        console.log(`  ✅ Check 4 PASSED — all ${orgsWithPtr.length} currentContractId pointers are valid`);
    } else {
        console.log(`  ❌ Check 4 FAILED — ${stale} stale currentContractId pointer(s)${fixPointers ? " (auto-fixed)" : ""}`);
    }
}

// ─── Check 5: Multiple active contracts per org ────────────────────────────────
async function check5_DuplicateActiveContracts() {
    console.log("  ⏳ Check 5: Organizations with multiple active contracts...");

    const pipeline = [
        { $match: { contractStatus: "active" } },
        { $group: { _id: "$organizationId", count: { $sum: 1 } } },
        { $match: { count: { $gt: 1 } } }
    ];

    const duplicates = await OrgContract.aggregate(pipeline);

    if (duplicates.length === 0) {
        console.log("  ✅ Check 5 PASSED — no duplicate active contracts");
    } else {
        violations.duplicateActiveContracts = duplicates.map(d => ({
            organizationId: d._id,
            count: d.count
        }));
        console.log(`  ❌ Check 5 FAILED — ${duplicates.length} org(s) have multiple active contracts (partial unique index may have been bypassed)`);
    }
}

// ─── Main ─────────────────────────────────────────────────────────────────────
async function main() {
    console.log("═════════════════════════════════════════════════════════");
    console.log("  CONTRACT INTEGRITY VALIDATOR — Sprint 3");
    console.log(`  Mode: ${FIX_PTRS ? "FIX POINTERS ENABLED" : "READ-ONLY"}`);
    console.log("═════════════════════════════════════════════════════════");
    console.log("");

    await mongoose.connect(process.env.MONGO_URI);
    console.log("  ✅ Connected to MongoDB\n");

    await check1_OrgsWithoutContract();
    await check2_InvoicesWithoutContract();
    await check3_ContractsWithoutPlanVersion();
    await check4_StalePointers(FIX_PTRS);
    await check5_DuplicateActiveContracts();

    await mongoose.disconnect();

    // ─── Summary ──────────────────────────────────────────────────────────────
    const hardFailures = [
        violations.orgsWithoutContract.length,
        violations.invoicesWithoutContract.length,
        violations.stalePtrs.length,
        violations.duplicateActiveContracts.length
    ].reduce((a, b) => a + b, 0);

    const warnings = violations.contractsWithoutPlanVersion.length;

    console.log("");
    console.log("─────────────────────────────────────────────────────────");
    console.log("  INTEGRITY SUMMARY");
    console.log("─────────────────────────────────────────────────────────");
    console.log(`  Active orgs without contract:         ${violations.orgsWithoutContract.length}`);
    console.log(`  Invoices without contractId:          ${violations.invoicesWithoutContract.length}`);
    console.log(`  Active contracts without planVersion: ${violations.contractsWithoutPlanVersion.length} (warnings)`);
    console.log(`  Stale currentContractId pointers:     ${violations.stalePtrs.length}`);
    console.log(`  Orgs with duplicate active contracts: ${violations.duplicateActiveContracts.length}`);
    console.log("");

    if (hardFailures === 0 && warnings === 0) {
        console.log("  ✅ ALL CHECKS PASSED — contract integrity is clean");
    } else if (hardFailures === 0 && warnings > 0) {
        console.log("  ⚠️  PASSED WITH WARNINGS — run backfillOrgContracts.js to create missing PlanVersions");
    } else {
        console.log("  ❌ INTEGRITY VIOLATIONS DETECTED");
        console.log("     Run: node scripts/backfillOrgContracts.js to fix orgsWithoutContract");
        if (!FIX_PTRS && violations.stalePtrs.length > 0) {
            console.log("     Run: node scripts/validateContractIntegrity.js --fix-pointers to repair stale pointers");
        }
    }

    console.log("═════════════════════════════════════════════════════════");
    process.exit(hardFailures > 0 ? 1 : 0);
}

main().catch(err => {
    console.error("FATAL:", err.message);
    process.exit(1);
});
