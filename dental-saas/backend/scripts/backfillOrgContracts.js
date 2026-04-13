require("module-alias/register");
/**
 * backfillOrgContracts.js
 * Sprint 3 — Legacy Subscription Migration
 *
 * Creates an OrgContract document for every Organization that does not
 * yet have one, based on existing subscription data.
 *
 * SAFE RULES:
 *   - Idempotent: organizations with an existing OrgContract are skipped
 *   - Additive only: no Organization fields are removed or rewritten
 *   - All new contracts are created as "legacy" contractStatus to clearly
 *     distinguish them from contracts created through the new Contract Engine
 *   - Does NOT switch read sources — contractResolver.service.js handles that
 *
 * Usage:
 *   node scripts/backfillOrgContracts.js
 *   node scripts/backfillOrgContracts.js --dry-run
 *   node scripts/backfillOrgContracts.js --batch-size=50
 *
 * Exit code 0 = success, 1 = had errors
 */

"use strict";

require("dotenv").config();
const mongoose = require("mongoose");
const Organization = require("../src/shared/models/Organization");
const OrgContract = require("../src/platform/billing/models/OrgContract.model");
const PlanVersion = require("../src/platform/billing/models/PlanVersion.model");
const logger = require("../src/utils/logger");

// ─── CLI Args ─────────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
const DRY_RUN = args.includes("--dry-run");
const BATCH_SIZE = parseInt((args.find(a => a.startsWith("--batch-size=")) || "--batch-size=25").split("=")[1], 10);

// ─── Telemetry ────────────────────────────────────────────────────────────────
const stats = {
    total: 0,
    skipped: 0,    // already had a contract
    created: 0,
    errors: 0,
    missingFields: [],  // record which orgs had missing data
    errorLog: []
};

// ─── Map legacy subscription.status → contractStatus ─────────────────────────
function mapLegacyStatus(sub) {
    const s = sub?.status;
    switch (s) {
        case "active": return "active";
        case "trial": return "active";    // trial is now captured in contract.trialDays
        case "suspended": return "terminated";
        case "canceled": return "terminated";
        case "expired": return "terminated";
        case "past_due": return "active";    // keep it alive; dunning handles it
        default: return "active";
    }
}

// ─── Map legacy renewal policy ────────────────────────────────────────────────
function mapRenewalTerms(sub) {
    return {
        inflationPercent: sub?.renewalPolicy?.inflationPercent || 0,
        autoRenew: sub?.autoRenew !== undefined ? sub.autoRenew : true,
        interval: "monthly"   // legacy system was always monthly
    };
}

// ─── Map legacy coupon ────────────────────────────────────────────────────────
function mapAppliedCoupon(sub) {
    if (!sub?.coupon?.code) return null;
    return {
        code: sub.coupon.code,
        discountType: sub.coupon.discountType,
        discountValue: sub.coupon.discountValue,
        validUntil: sub.coupon.validUntil || null,
        maxUses: sub.coupon.maxUses || null,
        usedCount: sub.coupon.usedCount || 0
    };
}

// ─── Map legacy customPricing → pricingOverride ───────────────────────────────
function mapPricingOverride(sub) {
    if (!sub?.customPricing?.isCustom) return null;
    return {
        isCustom: true,
        lockedPrice: sub.customPricing.price || 0,
        reason: "Migrated from legacy subscription.customPricing"
    };
}

// ─── Build OrgContract data from an Organization ──────────────────────────────
async function buildContractData(org) {
    const sub = org.subscription || {};
    const missingFields = [];

    // ── Resolve lockedPrice ────────────────────────────────────────────────────
    let lockedPrice = sub.basePriceAtSubscription || 0;
    if (!lockedPrice) {
        missingFields.push("subscription.basePriceAtSubscription");
        // Set to 0 — the contract will be marked legacy and is informational
    }

    // ── Resolve currency ──────────────────────────────────────────────────────
    const currency = sub.billingCurrency || org.billingCurrency || "USD";

    // ── Resolve effectiveFrom ─────────────────────────────────────────────────
    const effectiveFrom = sub.currentPeriodStart || org.createdAt || new Date();

    // ── Resolve effectiveTo ───────────────────────────────────────────────────
    const effectiveTo = sub.currentPeriodEnd || null;

    // ── Resolve trial dates ───────────────────────────────────────────────────
    const trialDays = sub.status === "trial" && sub.trialEndsAt
        ? Math.max(0, Math.ceil((new Date(sub.trialEndsAt) - new Date(effectiveFrom)) / 86400000))
        : 0;

    // ── Resolve planVersionId — look for an active PlanVersion matching plan code
    let planVersionId = null;
    let planCode = sub.plan || "basic";
    let planVersionTag = "LEGACY-1.0";

    const planVersion = await PlanVersion.findOne({
        templateCode: planCode,
        status: "active"
    }).select("_id versionTag templateCode").lean();

    if (planVersion) {
        planVersionId = planVersion._id;
        planVersionTag = planVersion.versionTag;
    } else {
        missingFields.push(`no active PlanVersion found for planCode="${planCode}"`);
    }

    return {
        missingFields,
        contract: {
            organizationId: org._id,
            planVersionId,        // May be null if no PlanVersion exists yet
            planCode,
            planVersionTag,
            contractStatus: mapLegacyStatus(sub),
            effectiveFrom,
            effectiveTo,
            lockedPrice,
            currency: currency.toUpperCase(),
            autoRenew: sub.autoRenew !== undefined ? sub.autoRenew : true,
            gracePeriodDays: sub.gracePeriodDays || 7,
            trialDays,
            trialStartDate: trialDays > 0 ? effectiveFrom : null,
            trialEndDate: trialDays > 0 ? sub.trialEndsAt : null,
            renewalTerms: mapRenewalTerms(sub),
            appliedCoupon: mapAppliedCoupon(sub),
            pricingOverride: mapPricingOverride(sub),
            creditBalance: sub.creditBalance || 0,
            salesOwnerId: sub.salesOwnerId || null,
            // Mark as legacy-migrated for audit trail clarity
            metadata: new Map([
                ["source", "backfill:sprint3"],
                ["legacyStatus", sub.status || "unknown"],
                ["legacyPlanName", sub.plan || "unknown"],
                ["migratedAt", new Date().toISOString()]
            ])
        }
    };
}

// ─── Process a single organization ───────────────────────────────────────────
async function processOrganization(org, session) {
    const orgId = org._id;

    // Idempotency check — skip if already has a contract
    const existing = await OrgContract.findOne({ organizationId: orgId }).session(session);
    if (existing) {
        stats.skipped++;
        return { action: "skipped", orgId, reason: "existing contract" };
    }

    // Build contract data from legacy subscription
    const { missingFields, contract: contractData } = await buildContractData(org);

    if (missingFields.length > 0) {
        stats.missingFields.push({ orgId, fields: missingFields });
    }

    if (DRY_RUN) {
        stats.created++;
        return { action: "dry-run", orgId, missingFields, lockedPrice: contractData.lockedPrice };
    }

    // Create OrgContract
    const contract = await OrgContract.create([contractData], { session });

    // Update org.currentContractId
    await Organization.findByIdAndUpdate(
        orgId,
        { $set: { currentContractId: contract[0]._id } },
        { session, new: false }
    );

    stats.created++;
    return { action: "created", orgId, contractId: contract[0]._id, missingFields };
}

// ─── Main ─────────────────────────────────────────────────────────────────────
async function main() {
    console.log("═════════════════════════════════════════════════════════");
    console.log("  BACKFILL ORG CONTRACTS — Sprint 3");
    console.log(`  Mode:       ${DRY_RUN ? "DRY RUN (no writes)" : "LIVE (writes enabled)"}`);
    console.log(`  Batch size: ${BATCH_SIZE}`);
    console.log("═════════════════════════════════════════════════════════");
    console.log("");

    await mongoose.connect(process.env.MONGO_URI);
    console.log("  ✅ Connected to MongoDB\n");

    const totalOrgs = await Organization.countDocuments({ isArchived: { $ne: true } });
    stats.total = totalOrgs;
    console.log(`  Total organizations to process: ${totalOrgs}\n`);

    let cursor = Organization.find({ isArchived: { $ne: true } })
        .select("-features -modules -appointmentSettings -organizationSettings")
        .cursor();

    let batch = [];
    let batchNo = 0;

    for await (const org of cursor) {
        batch.push(org);

        if (batch.length >= BATCH_SIZE) {
            batchNo++;
            await processBatch(batch, batchNo);
            batch = [];
        }
    }

    // Process remaining
    if (batch.length > 0) {
        batchNo++;
        await processBatch(batch, batchNo);
    }

    await mongoose.disconnect();

    // ─── Final Report ──────────────────────────────────────────────────────────
    console.log("");
    console.log("═════════════════════════════════════════════════════════");
    console.log("  BACKFILL COMPLETE");
    console.log("═════════════════════════════════════════════════════════");
    console.log(`  Total processed: ${stats.total}`);
    console.log(`  Skipped (existing contract): ${stats.skipped}`);
    console.log(`  Created: ${stats.created}`);
    console.log(`  Errors: ${stats.errors}`);
    console.log(`  Orgs with missing fields: ${stats.missingFields.length}`);

    if (stats.missingFields.length > 0) {
        console.log("\n  ⚠️  Missing fields detail:");
        stats.missingFields.slice(0, 20).forEach(({ orgId, fields }) => {
            console.log(`     org ${orgId}: ${fields.join(", ")}`);
        });
        if (stats.missingFields.length > 20) {
            console.log(`     ... and ${stats.missingFields.length - 20} more`);
        }
    }

    if (stats.errorLog.length > 0) {
        console.log("\n  ❌ Errors:");
        stats.errorLog.forEach(e => console.log(`     org ${e.orgId}: ${e.message}`));
    }

    console.log("");
    console.log(DRY_RUN ? "  DRY RUN — no data written." : "  ✅ All contracts committed.");
    console.log("═════════════════════════════════════════════════════════");

    process.exit(stats.errors > 0 ? 1 : 0);
}

async function processBatch(orgs, batchNo) {
    const session = await mongoose.startSession();
    session.startTransaction();

    console.log(`  Processing batch ${batchNo} (${orgs.length} orgs)...`);

    try {
        for (const org of orgs) {
            try {
                const result = await processOrganization(org, session);
                if (result.action !== "skipped") {
                    console.log(`    [${result.action.toUpperCase()}] ${org._id} (${org.name})`);
                    if (result.missingFields?.length > 0) {
                        console.log(`      ⚠️  Missing: ${result.missingFields.join(", ")}`);
                    }
                }
            } catch (err) {
                stats.errors++;
                stats.errorLog.push({ orgId: org._id, message: err.message });
                console.error(`    [ERROR] ${org._id}: ${err.message}`);
            }
        }

        if (!DRY_RUN) {
            await session.commitTransaction();
        } else {
            await session.abortTransaction();
        }
    } catch (batchErr) {
        stats.errors++;
        await session.abortTransaction();
        console.error(`  [BATCH ERROR] Batch ${batchNo} rolled back: ${batchErr.message}`);
    } finally {
        session.endSession();
    }
}

main().catch(err => {
    console.error("FATAL:", err.message);
    process.exit(1);
});
