require("module-alias/register");
#!/usr/bin/env node
/**
 * migrateTrialToSubscription.js
 * v20.1 Phase 3 — Trial System Unification
 *
 * Migrates legacy Organization.trial data into Organization.subscription.
 *
 * Features:
 *   --dry-run     Preview without writing
 *   --commit      Execute migration
 *
 * Idempotent: Skips orgs where trial subdocument is already absent.
 *
 * Usage:
 *   node scripts/migrateTrialToSubscription.js --dry-run
 *   node scripts/migrateTrialToSubscription.js --commit
 */

"use strict";

const mongoose = require("mongoose");
const path = require("path");
const fs = require("fs");

require("dotenv").config({ path: path.resolve(__dirname, "../.env") });

// CLI Flags
const args = process.argv.slice(2);
const isDryRun = args.includes("--dry-run");
const isCommit = args.includes("--commit");

if (!isDryRun && !isCommit) {
    console.error("Usage: node migrateTrialToSubscription.js [--dry-run | --commit]");
    process.exit(1);
}

const MODE = isDryRun ? "DRY-RUN" : "COMMIT";

async function main() {
    console.log(`\n[Trial Migration] Mode: ${MODE}`);
    console.log(`[Trial Migration] Connecting to MongoDB...\n`);

    await mongoose.connect(process.env.MONGODB_URI || process.env.MONGO_URI);
    console.log("[Trial Migration] Connected.\n");

    // Use raw collection to access legacy trial subdocument
    const db = mongoose.connection.db;
    const collection = db.collection("organizations");

    const orgsWithTrial = await collection.find({
        "trial": { $exists: true }
    }).toArray();

    console.log(`[Trial Migration] Found ${orgsWithTrial.length} organizations with legacy trial subdocument.\n`);

    const report = {
        mode: MODE,
        total: orgsWithTrial.length,
        migrated: 0,
        skipped: 0,
        errors: [],
        details: []
    };

    for (const org of orgsWithTrial) {
        const trial = org.trial;
        const sub = org.subscription || {};

        // Skip if trial object has no useful data
        if (!trial || (!trial.isTrial && !trial.trialEnd && !trial.trialStart)) {
            report.skipped++;
            report.details.push({
                orgId: org._id.toString(),
                status: "SKIPPED",
                reason: "Trial subdocument empty"
            });
            continue;
        }

        const updates = {};
        const unsets = { "trial": "" };

        // Copy trialEnd → subscription.trialEndsAt (if not already set)
        if (trial.trialEnd && !sub.trialEndsAt) {
            updates["subscription.trialEndsAt"] = trial.trialEnd;
        }

        // If trial is active, ensure subscription.status = "trial"
        if (trial.isTrial === true) {
            updates["subscription.status"] = "trial";
        }

        // Copy trialPlanId if it exists and org has no planId
        if (trial.trialPlanId && !org.planId) {
            updates["planId"] = trial.trialPlanId;
        }

        if (isDryRun) {
            report.migrated++;
            report.details.push({
                orgId: org._id.toString(),
                status: "WOULD_MIGRATE",
                updates,
                unsets: Object.keys(unsets)
            });
        } else {
            try {
                const updateOp = {};
                if (Object.keys(updates).length > 0) updateOp.$set = updates;
                updateOp.$unset = unsets;

                await collection.updateOne(
                    { _id: org._id },
                    updateOp
                );

                report.migrated++;
                report.details.push({
                    orgId: org._id.toString(),
                    status: "MIGRATED",
                    updates,
                    removedFields: Object.keys(unsets)
                });
            } catch (err) {
                report.errors.push({
                    orgId: org._id.toString(),
                    error: err.message
                });
            }
        }
    }

    // Write report
    const reportDir = path.resolve(__dirname, "../migration-reports");
    if (!fs.existsSync(reportDir)) fs.mkdirSync(reportDir, { recursive: true });
    const reportPath = path.join(reportDir, `trial-migration-${MODE}-${Date.now()}.json`);
    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));

    console.log("\n========================================");
    console.log(`  TRIAL MIGRATION REPORT (${MODE})`);
    console.log("========================================");
    console.log(`  Total with legacy trial:  ${report.total}`);
    console.log(`  Migrated:                 ${report.migrated}`);
    console.log(`  Skipped:                  ${report.skipped}`);
    console.log(`  Errors:                   ${report.errors.length}`);
    console.log(`  Report:                   ${reportPath}`);
    console.log("========================================\n");

    await mongoose.disconnect();
    process.exit(report.errors.length > 0 ? 1 : 0);
}

main().catch(err => {
    console.error("[Trial Migration] Fatal error:", err);
    process.exit(1);
});
