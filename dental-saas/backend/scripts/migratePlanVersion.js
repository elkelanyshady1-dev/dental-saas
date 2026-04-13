require("module-alias/register");
#!/usr/bin/env node
/**
 * migratePlanVersion.js
 * v20.1 Phase 5 — Plan Version Snapshot Enforcement
 *
 * Backfills subscription.planVersion for existing organizations.
 *
 * For each org with a planId:
 *   Resolves the current plan → sets subscription.planVersion = plan.version
 *
 * Idempotent: Only processes orgs where planVersion is null/undefined.
 *
 * Usage:
 *   node scripts/migratePlanVersion.js --dry-run
 *   node scripts/migratePlanVersion.js --commit
 */

"use strict";

const mongoose = require("mongoose");
const path = require("path");
const fs = require("fs");

require("dotenv").config({ path: path.resolve(__dirname, "../.env") });

const Organization = require("../src/models/Organization");
const Plan = require("../src/platform/domain/models/plan.model");

const args = process.argv.slice(2);
const isDryRun = args.includes("--dry-run");
const isCommit = args.includes("--commit");

if (!isDryRun && !isCommit) {
    console.error("Usage: node migratePlanVersion.js [--dry-run | --commit]");
    process.exit(1);
}

const MODE = isDryRun ? "DRY-RUN" : "COMMIT";

async function main() {
    console.log(`\n[PlanVersion Migration] Mode: ${MODE}`);
    console.log(`[PlanVersion Migration] Connecting...\n`);

    await mongoose.connect(process.env.MONGODB_URI || process.env.MONGO_URI);
    console.log("[PlanVersion Migration] Connected.\n");

    // Find orgs that have a planId but no planVersion
    const orgs = await Organization.find({
        planId: { $exists: true, $ne: null },
        $or: [
            { "subscription.planVersion": { $exists: false } },
            { "subscription.planVersion": null }
        ]
    });

    console.log(`[PlanVersion Migration] Found ${orgs.length} organizations without planVersion.\n`);

    // Pre-load all plans for efficiency
    const plans = await Plan.find({});
    const planMap = {};
    for (const p of plans) {
        planMap[p._id.toString()] = p;
    }

    const report = {
        mode: MODE,
        total: orgs.length,
        migrated: 0,
        skipped: 0,
        errors: [],
        details: []
    };

    for (const org of orgs) {
        const plan = planMap[org.planId?.toString()];

        if (!plan) {
            report.skipped++;
            report.details.push({
                orgId: org._id.toString(),
                status: "SKIPPED",
                reason: `Plan ${org.planId} not found`
            });
            continue;
        }

        const version = plan.version || 0;

        if (isDryRun) {
            report.migrated++;
            report.details.push({
                orgId: org._id.toString(),
                status: "WOULD_SET",
                planId: org.planId.toString(),
                planCode: plan.code,
                planVersion: version
            });
        } else {
            try {
                org.subscription.planVersion = version;
                await org.save();
                report.migrated++;
                report.details.push({
                    orgId: org._id.toString(),
                    status: "SET",
                    planVersion: version
                });
            } catch (err) {
                report.errors.push({ orgId: org._id.toString(), error: err.message });
            }
        }
    }

    const reportDir = path.resolve(__dirname, "../migration-reports");
    if (!fs.existsSync(reportDir)) fs.mkdirSync(reportDir, { recursive: true });
    const reportPath = path.join(reportDir, `planversion-migration-${MODE}-${Date.now()}.json`);
    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));

    console.log("\n========================================");
    console.log(`  PLAN VERSION MIGRATION REPORT (${MODE})`);
    console.log("========================================");
    console.log(`  Total without planVersion: ${report.total}`);
    console.log(`  Set:                       ${report.migrated}`);
    console.log(`  Skipped (plan not found):  ${report.skipped}`);
    console.log(`  Errors:                    ${report.errors.length}`);
    console.log(`  Report:                    ${reportPath}`);
    console.log("========================================\n");

    await mongoose.disconnect();
    process.exit(report.errors.length > 0 ? 1 : 0);
}

main().catch(err => {
    console.error("[PlanVersion Migration] Fatal error:", err);
    process.exit(1);
});
