require("module-alias/register");
#!/usr/bin/env node
/**
 * migrateGraceField.js
 * v20.1 Phase 4 — Grace Field Alignment
 *
 * Migrates legacy subscription.graceEndsAt → subscription.gracePeriodEnd.
 *
 * Features:
 *   --dry-run     Preview without writing
 *   --commit      Execute migration
 *
 * Idempotent: Only processes orgs with graceEndsAt present.
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
    console.log(`\n[Grace Field Migration] Mode: ${MODE}`);
    console.log(`[Grace Field Migration] Connecting...\n`);

    await mongoose.connect(process.env.MONGODB_URI || process.env.MONGO_URI);
    console.log("[Grace Field Migration] Connected.\n");

    const db = mongoose.connection.db;
    const collection = db.collection("organizations");

    const orgs = await collection.find({
        "subscription.graceEndsAt": { $exists: true }
    }).toArray();

    console.log(`[Grace Field Migration] Found ${orgs.length} organizations with legacy graceEndsAt.\n`);

    const report = {
        mode: MODE,
        total: orgs.length,
        migrated: 0,
        skipped: 0,
        errors: [],
        details: []
    };

    for (const org of orgs) {
        const graceValue = org.subscription?.graceEndsAt;

        if (isDryRun) {
            report.migrated++;
            report.details.push({
                orgId: org._id.toString(),
                status: "WOULD_MIGRATE",
                graceEndsAt: graceValue
            });
        } else {
            try {
                const updateOp = {
                    $unset: { "subscription.graceEndsAt": "" }
                };

                // Only set gracePeriodEnd if graceEndsAt has a value and gracePeriodEnd is not already set
                if (graceValue && !org.subscription?.gracePeriodEnd) {
                    updateOp.$set = { "subscription.gracePeriodEnd": graceValue };
                }

                await collection.updateOne({ _id: org._id }, updateOp);

                report.migrated++;
                report.details.push({
                    orgId: org._id.toString(),
                    status: "MIGRATED",
                    graceEndsAt: graceValue,
                    copiedToGracePeriodEnd: !!graceValue && !org.subscription?.gracePeriodEnd
                });
            } catch (err) {
                report.errors.push({ orgId: org._id.toString(), error: err.message });
            }
        }
    }

    const reportDir = path.resolve(__dirname, "../migration-reports");
    if (!fs.existsSync(reportDir)) fs.mkdirSync(reportDir, { recursive: true });
    const reportPath = path.join(reportDir, `grace-field-migration-${MODE}-${Date.now()}.json`);
    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));

    console.log("\n========================================");
    console.log(`  GRACE FIELD MIGRATION REPORT (${MODE})`);
    console.log("========================================");
    console.log(`  Total with legacy field: ${report.total}`);
    console.log(`  Migrated:               ${report.migrated}`);
    console.log(`  Errors:                 ${report.errors.length}`);
    console.log(`  Report:                 ${reportPath}`);
    console.log("========================================\n");

    await mongoose.disconnect();
    process.exit(report.errors.length > 0 ? 1 : 0);
}

main().catch(err => {
    console.error("[Grace Field Migration] Fatal error:", err);
    process.exit(1);
});
