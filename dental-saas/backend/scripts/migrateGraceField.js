#!/usr/bin/env node
require("module-alias/register");
/**
 * migrateGraceField.js
 * v24.0 — Promo Field Backfill
 *
 * Backfills promoDays, promoStartDate, promoEndDate on existing promo contracts
 * that were created before v24.0 (when these were stored only in metadata.graceDays).
 *
 * Also sets effectiveTo = promoEndDate where it is currently null.
 *
 * Features:
 *   --dry-run     Preview without writing
 *   --commit      Execute migration
 *
 * Idempotent: Only processes promo contracts where promoDays === 0.
 *
 * Usage:
 *   node scripts/migrateGraceField.js --dry-run
 *   node scripts/migrateGraceField.js --commit
 */

"use strict";

const mongoose = require("mongoose");
const path = require("path");
const fs = require("fs");

require("dotenv").config({ path: path.resolve(__dirname, "../.env") });

const args = process.argv.slice(2);
const isDryRun = args.includes("--dry-run");
const isCommit = args.includes("--commit");

if (!isDryRun && !isCommit) {
    console.error("Usage: node migrateGraceField.js [--dry-run | --commit]");
    process.exit(1);
}

const MODE = isDryRun ? "DRY-RUN" : "COMMIT";

async function main() {
    console.log(`\n[Promo Field Migration] Mode: ${MODE}`);
    console.log(`[Promo Field Migration] Connecting...\n`);

    await mongoose.connect(process.env.MONGODB_URI || process.env.MONGO_URI);
    console.log("[Promo Field Migration] Connected.\n");

    const db = mongoose.connection.db;
    const collection = db.collection("orgcontracts");

    // Find promo contracts that have not yet been backfilled (promoDays still 0)
    const contracts = await collection.find({
        accessType: "promo",
        $or: [
            { promoDays: { $exists: false } },
            { promoDays: 0 },
            { promoEndDate: null },
            { promoEndDate: { $exists: false } }
        ]
    }).toArray();

    console.log(`[Promo Field Migration] Found ${contracts.length} promo contracts to backfill.\n`);

    const report = {
        mode: MODE,
        total: contracts.length,
        migrated: 0,
        skipped: 0,
        errors: [],
        details: []
    };

    for (const contract of contracts) {
        // Read graceDays from metadata (stored as string by previous orchestrator version)
        const metadataGraceDays = contract.metadata instanceof Map
            ? contract.metadata.get("graceDays")
            : contract.metadata?.graceDays;

        const graceDays = metadataGraceDays ? parseInt(metadataGraceDays, 10) : null;

        if (!graceDays || isNaN(graceDays) || graceDays <= 0) {
            report.skipped++;
            report.details.push({
                contractId: contract._id.toString(),
                status: "SKIPPED",
                reason: "No graceDays in metadata"
            });
            continue;
        }

        const promoStartDate = contract.effectiveFrom || contract.createdAt || new Date();
        const promoEndDate = new Date(promoStartDate);
        promoEndDate.setDate(promoEndDate.getDate() + graceDays);

        if (isDryRun) {
            report.migrated++;
            report.details.push({
                contractId: contract._id.toString(),
                status: "WOULD_MIGRATE",
                promoDays: graceDays,
                promoStartDate,
                promoEndDate
            });
        } else {
            try {
                await collection.updateOne(
                    { _id: contract._id },
                    {
                        $set: {
                            promoDays: graceDays,
                            promoStartDate,
                            promoEndDate,
                            // Also set effectiveTo if it was null
                            ...(contract.effectiveTo == null ? { effectiveTo: promoEndDate } : {})
                        }
                    }
                );

                report.migrated++;
                report.details.push({
                    contractId: contract._id.toString(),
                    organizationId: contract.organizationId?.toString(),
                    status: "MIGRATED",
                    promoDays: graceDays,
                    promoStartDate,
                    promoEndDate,
                    effectiveToUpdated: contract.effectiveTo == null
                });
            } catch (err) {
                report.errors.push({ contractId: contract._id.toString(), error: err.message });
            }
        }
    }

    const reportDir = path.resolve(__dirname, "../migration-reports");
    if (!fs.existsSync(reportDir)) fs.mkdirSync(reportDir, { recursive: true });
    const reportPath = path.join(reportDir, `promo-field-migration-${MODE}-${Date.now()}.json`);
    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));

    console.log("\n========================================");
    console.log(`  PROMO FIELD MIGRATION REPORT (${MODE})`);
    console.log("========================================");
    console.log(`  Total promo contracts: ${report.total}`);
    console.log(`  Migrated:             ${report.migrated}`);
    console.log(`  Skipped (no data):    ${report.skipped}`);
    console.log(`  Errors:               ${report.errors.length}`);
    console.log(`  Report:               ${reportPath}`);
    console.log("========================================\n");

    if (report.errors.length > 0) {
        console.error("[Promo Field Migration] Errors:");
        report.errors.forEach(e => console.error(`  - ${e.contractId}: ${e.error}`));
    }

    await mongoose.disconnect();
    process.exit(report.errors.length > 0 ? 1 : 0);
}

main().catch(err => {
    console.error("[Promo Field Migration] Fatal error:", err);
    process.exit(1);
});
