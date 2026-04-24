#!/usr/bin/env node
require("module-alias/register");
/**
 * auditLegacyPricing.js
 * Phase 10 — read-only audit. Reports remaining legacy-pricing debt so
 * Phase 11 (full purge) can run when the counts hit zero.
 *
 * Reports:
 *   1. PlanVersion docs WITHOUT pricing.global.amountMonthly populated.
 *   2. PlanVersion docs that still carry pricing.regions[] entries.
 *   3. PlanVersion docs that still carry a pricingV3 subdoc.
 *   4. OrgContract docs whose pricingSnapshot.regionCode is set
 *      (legacy pricing applied at activation time).
 *   5. Organization docs with subscription.paymentProvider === "paymob".
 *   6. PlatformInvoice docs with paymentProvider === "paymob".
 *
 * Usage:
 *   node backend/scripts/auditLegacyPricing.js
 *
 * Exit code:
 *   0 — read-only, always succeeds (errors print to stderr).
 *
 * Notes:
 *   - Read-only: never mutates anything.
 *   - Does not touch regional databases — only the platform/control DB,
 *     which holds plan templates, contracts, organizations, and invoices.
 */

"use strict";

const mongoose = require("mongoose");
const path = require("path");

require("dotenv").config({ path: path.resolve(__dirname, "../.env") });

const PlanVersion = require("@billing/models/PlanVersion.model").default;
const OrgContract = require("@billing/models/OrgContract.model").default;
const Organization = require("@shared/models/Organization").default;
const PlatformInvoice = require("@billing/models/PlatformInvoice.model").default;

async function countAndSample(label, Model, query, sampleFields, sampleSize = 5) {
    const count = await Model.countDocuments(query);
    if (count === 0) {
        console.log(`  ✅ ${label}: 0`);
        return 0;
    }
    console.log(`  ⚠️  ${label}: ${count}`);
    const samples = await Model.find(query).select(sampleFields).limit(sampleSize).lean();
    for (const doc of samples) {
        console.log(`     - ${JSON.stringify(doc)}`);
    }
    if (count > sampleSize) {
        console.log(`     … (${count - sampleSize} more)`);
    }
    return count;
}

async function main() {
    console.log("\n[auditLegacyPricing] Phase 10 — read-only legacy debt report\n");

    if (!process.env.MONGO_URI) {
        console.error("FATAL: MONGO_URI env var not set.");
        process.exit(1);
    }
    await mongoose.connect(process.env.MONGO_URI, { serverSelectionTimeoutMS: 5000 });
    console.log("[auditLegacyPricing] Connected to platform MongoDB\n");

    let total = 0;
    try {
        // ── PlanVersion debt ────────────────────────────────────────────────
        console.log("── PlanVersion ──────────────────────────────────────────");
        total += await countAndSample(
            "without pricing.global.amountMonthly",
            PlanVersion,
            {
                $or: [
                    { "pricing.global": null },
                    { "pricing.global.amountMonthly": { $exists: false } }
                ]
            },
            "_id templateCode versionTag status"
        );
        total += await countAndSample(
            "still carrying pricing.regions[]",
            PlanVersion,
            { "pricing.regions.0": { $exists: true } },
            "_id templateCode versionTag status"
        );
        total += await countAndSample(
            "still carrying pricingV3 subdoc",
            PlanVersion,
            { pricingV3: { $ne: null, $exists: true } },
            "_id templateCode versionTag status"
        );

        // ── OrgContract debt ────────────────────────────────────────────────
        console.log("\n── OrgContract ──────────────────────────────────────────");
        total += await countAndSample(
            "with pricingSnapshot.regionCode set (legacy snapshot)",
            OrgContract,
            { "pricingSnapshot.regionCode": { $ne: null, $exists: true } },
            "_id organizationId planCode contractStatus"
        );

        // ── Paymob debt ────────────────────────────────────────────────────
        console.log("\n── Paymob (PaymobProvider removed in Phase 10) ─────────");
        total += await countAndSample(
            "Organization.subscription.paymentProvider === 'paymob'",
            Organization,
            { "subscription.paymentProvider": "paymob" },
            "_id name slug"
        );
        total += await countAndSample(
            "PlatformInvoice.paymentProvider === 'paymob'",
            PlatformInvoice,
            { paymentProvider: "paymob" },
            "_id organizationId status"
        );
    } finally {
        await mongoose.disconnect();
    }

    console.log("\n────────────────────────────────────────────────────────────");
    if (total === 0) {
        console.log("[auditLegacyPricing] ✅ ZERO legacy debt — safe to enable BILLING_STRICT_MODE and proceed to Phase 11.");
    } else {
        console.log(`[auditLegacyPricing] ⚠️  ${total} legacy-pricing offenders found. Migrate before STRICT_MODE / Phase 11.`);
    }
    console.log("[auditLegacyPricing] Done.\n");
}

main().catch((err) => {
    console.error("[auditLegacyPricing] FATAL:", err);
    process.exit(1);
});
