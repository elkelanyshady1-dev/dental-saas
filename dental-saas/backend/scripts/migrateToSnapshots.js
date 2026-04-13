/**
 * migrateToSnapshots.js
 * =====================
 * ONE-TIME MIGRATION SCRIPT
 * 
 * Backfills ALL existing orthodontic cases that lack a currentSnapshotId
 * by creating a v1 MIGRATION snapshot from their workflowData.
 *
 * SAFE:
 *   ✅ Reads only — does NOT modify workflowData
 *   ✅ Skips cases that already have a snapshot
 *   ✅ Can be run repeatedly (idempotent)
 *   ✅ Logs every action
 *   ✅ Dry-run mode available
 *
 * Usage:
 *   node migrateToSnapshots.js              # Dry run (no writes)
 *   node migrateToSnapshots.js --commit     # Actually create snapshots
 */

"use strict";

require("module-alias/register");
const mongoose = require("mongoose");
const OrthodonticCase = require("../src/modules/orthodonticDomain/models/orthodonticCase.model");
const WorkflowSnapshot = require("../src/modules/orthodonticDomain/models/WorkflowSnapshot.model");

// ── Config ──────────────────────────────────────────────────────
const MONGO_URI = process.env.MONGO_URI || "mongodb://localhost:27017/dental-saas";
const DRY_RUN = !process.argv.includes("--commit");
const BATCH_SIZE = 50;

async function main() {
    console.log("═══════════════════════════════════════════════════════");
    console.log("  SNAPSHOT MIGRATION — Backfill Existing Cases");
    console.log("  Mode:", DRY_RUN ? "🔍 DRY RUN (no writes)" : "🔥 COMMIT (creating snapshots)");
    console.log("═══════════════════════════════════════════════════════\n");

    await mongoose.connect(MONGO_URI);
    console.log("✅ Connected to MongoDB\n");

    // Find all cases WITHOUT a snapshot pointer
    const casesToMigrate = await OrthodonticCase.find(
        { currentSnapshotId: null },
        { _id: 1, organizationId: 1, workflowData: 1, workflowVersion: 1, latestVersion: 1 }
    ).lean();

    const totalCases = await OrthodonticCase.countDocuments();
    const alreadyMigrated = totalCases - casesToMigrate.length;

    console.log(`📊 Total cases:         ${totalCases}`);
    console.log(`✅ Already migrated:    ${alreadyMigrated}`);
    console.log(`🔄 Cases to migrate:    ${casesToMigrate.length}\n`);

    if (casesToMigrate.length === 0) {
        console.log("✅ All cases already have snapshots. Nothing to do.");
        await mongoose.disconnect();
        return;
    }

    let migrated = 0;
    let skipped = 0;
    let errors = 0;

    for (let i = 0; i < casesToMigrate.length; i += BATCH_SIZE) {
        const batch = casesToMigrate.slice(i, i + BATCH_SIZE);

        for (const orthoCase of batch) {
            const caseId = orthoCase._id;
            const wd = orthoCase.workflowData || {};
            const allRecords = (wd.recordSets || []).flatMap((rs) => rs.records || []);

            // Check if there's any meaningful data to snapshot
            const hasData = (wd.recordSets || []).length > 0 
                || (wd.problemList || []).length > 0 
                || (wd.treatmentGoals || []).length > 0;

            if (!hasData) {
                console.log(`  ⏭  Case ${caseId}: empty workflowData — skipping`);
                skipped++;
                continue;
            }

            const version = (orthoCase.latestVersion || orthoCase.workflowVersion || 0) + 1;

            if (DRY_RUN) {
                console.log(`  📋 Case ${caseId}: would create snapshot v${version} (${(wd.recordSets || []).length} sets, ${allRecords.length} records, ${allRecords.filter(r => r.url).length} with URL)`);
                migrated++;
                continue;
            }

            try {
                // Check for existing snapshot (idempotent — skip if already done)
                const existing = await WorkflowSnapshot.findOne({ caseId, version: 1 });
                if (existing) {
                    console.log(`  ⏭  Case ${caseId}: snapshot v1 already exists — skipping`);
                    skipped++;
                    continue;
                }

                const snapshot = await WorkflowSnapshot.create({
                    organizationId: orthoCase.organizationId,
                    caseId,
                    version,
                    trigger: "IMPORT",  // IMPORT = data migrated from legacy system
                    label: "Migrated from legacy workflowData",
                    recordSets: wd.recordSets || [],
                    problemList: wd.problemList || [],
                    treatmentGoals: wd.treatmentGoals || [],
                    treatmentOptions: wd.treatmentOptions || [],
                    selectedOptionId: wd.selectedOptionId || null,
                    finalPlan: wd.finalPlan || null,
                    currentStep: wd.currentStep || 0,
                    savedBy: wd.lastSavedBy || orthoCase.organizationId, // Fallback to org
                    summary: {
                        totalRecordSets: (wd.recordSets || []).length,
                        totalPhotos: allRecords.length,
                        photosWithUrl: allRecords.filter((r) => r.url).length,
                        totalStlFiles: (wd.recordSets || []).reduce((sum, rs) => sum + (rs.stlFiles || []).length, 0),
                        totalProblems: (wd.problemList || []).length,
                        totalGoals: (wd.treatmentGoals || []).length,
                    },
                });

                // Update case pointer
                await OrthodonticCase.updateOne(
                    { _id: caseId },
                    { $set: { currentSnapshotId: snapshot._id, latestVersion: version } }
                );

                console.log(`  ✅ Case ${caseId}: snapshot v${version} created (${snapshot._id})`);
                migrated++;
            } catch (err) {
                console.error(`  ❌ Case ${caseId}: FAILED — ${err.message}`);
                errors++;
            }
        }

        console.log(`  --- Batch ${Math.floor(i / BATCH_SIZE) + 1} complete (${Math.min(i + BATCH_SIZE, casesToMigrate.length)}/${casesToMigrate.length})\n`);
    }

    console.log("\n═══════════════════════════════════════════════════════");
    console.log("  MIGRATION SUMMARY");
    console.log("═══════════════════════════════════════════════════════");
    console.log(`  Mode:      ${DRY_RUN ? "DRY RUN" : "COMMITTED"}`);
    console.log(`  Migrated:  ${migrated}`);
    console.log(`  Skipped:   ${skipped} (empty or already migrated)`);
    console.log(`  Errors:    ${errors}`);
    console.log("═══════════════════════════════════════════════════════\n");

    if (DRY_RUN && migrated > 0) {
        console.log("💡 To actually create snapshots, run:");
        console.log("   node migrateToSnapshots.js --commit\n");
    }

    // ── Verification ────────────────────────────────────────────
    if (!DRY_RUN) {
        const unmigrated = await OrthodonticCase.countDocuments({ currentSnapshotId: null });
        const totalSnapshots = await WorkflowSnapshot.countDocuments();
        console.log("📊 POST-MIGRATION VERIFICATION:");
        console.log(`  Cases without snapshot: ${unmigrated} (should be 0 or only empty cases)`);
        console.log(`  Total snapshots:        ${totalSnapshots}`);
    }

    await mongoose.disconnect();
    console.log("✅ Disconnected from MongoDB");
}

main().catch((err) => {
    console.error("💀 MIGRATION FAILED:", err);
    process.exit(1);
});
