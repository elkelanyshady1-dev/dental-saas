/**
 * fixExpiredContracts.js
 * Platform — One-Time Data Correction Script
 *
 * INVARIANT: Contracts where autoRenew=false AND effectiveTo < now AND
 *            contractStatus="active" are invalid — they must be "expired".
 *
 * SAFE: Pure DB correction, no side effects on entitlements or invoices.
 *       Idempotent — safe to run multiple times.
 *
 * RUN: node scripts/fixExpiredContracts.js
 *      node scripts/fixExpiredContracts.js --dry-run   (preview only)
 *
 * PLANE: Platform (shared DB, OrgContract collection)
 */

"use strict";

const mongoose = require("mongoose");
require("module-alias/register");

const logger = require("@utils/logger");

// CJS-compatible require — contractStatus is the schema field name (not "status")
const OrgContractModule = require("../src/platform/billing/models/OrgContract.model");
const OrgContract = OrgContractModule.default || OrgContractModule;

const isDryRun = process.argv.includes("--dry-run");

async function fixExpiredContracts() {
    const mongoUri = process.env.MONGO_PLATFORM_URI || process.env.MONGO_URI;
    if (!mongoUri) {
        console.error("[fixExpiredContracts] MONGO_PLATFORM_URI or MONGO_URI env var required");
        process.exit(1);
    }

    await mongoose.connect(mongoUri, { dbName: process.env.PLATFORM_DB_NAME || "saas_platform" });
    console.log("[fixExpiredContracts] Connected to MongoDB");

    // 3-day grace window — contracts expired more than 3 days ago are definitively stuck
    const staleThreshold = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000);

    const query = {
        autoRenew: false,
        contractStatus: "active",
        effectiveTo: { $lt: staleThreshold },
    };

    if (isDryRun) {
        const count = await OrgContract.countDocuments(query);
        console.log(`[fixExpiredContracts] DRY RUN — would fix ${count} stuck contract(s)`);

        if (count > 0) {
            const samples = await OrgContract.find(query)
                .select("_id organizationId effectiveTo autoRenew contractStatus")
                .limit(5)
                .lean();
            console.log("[fixExpiredContracts] Sample contracts:", JSON.stringify(samples, null, 2));
        }

        await mongoose.disconnect();
        process.exit(0);
    }

    const result = await OrgContract.updateMany(
        query,
        {
            $set: {
                contractStatus: "expired",
                updatedAt: new Date(),
            },
        }
    );

    console.log(`[fixExpiredContracts] ✅ Fixed ${result.modifiedCount} stuck contract(s)`);
    logger.info(
        { modifiedCount: result.modifiedCount, staleThreshold },
        "[fixExpiredContracts] STUCK_EXPIRED_CONTRACTS bulk fix complete"
    );

    await mongoose.disconnect();
    process.exit(0);
}

fixExpiredContracts().catch(err => {
    console.error("[fixExpiredContracts] FATAL:", err);
    process.exit(1);
});
