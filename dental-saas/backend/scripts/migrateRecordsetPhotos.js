/**
 * migrateRecordsetPhotos.js — Legacy Photo → File Model Migration
 * Phase v27 — Storage + Infra Hardening (Part 8.3)
 *
 * Scans WorkflowRecordSet records with legacy inline URLs,
 * creates File model documents for each, and writes the photoFileId
 * back to the record.
 *
 * SAFETY:
 *   - Dry-run by default (no writes)
 *   - Requires --commit to execute
 *   - Blocked in production without --force
 *   - Does NOT re-upload binaries (R2 migration is separate)
 *   - Creates File metadata pointing to existing storageKey/URL
 *   - Idempotent: skips records that already have photoFileId
 *
 * USAGE:
 *   node scripts/migrateRecordsetPhotos.js --dry-run     (default)
 *   node scripts/migrateRecordsetPhotos.js --commit      (execute writes)
 *   node scripts/migrateRecordsetPhotos.js --commit --force  (allow in prod)
 *
 * PLANE: Infrastructure (migration tooling)
 */

"use strict";

require("module-alias/register");
require("dotenv").config();

const mongoose = require("mongoose");

const MONGO_URI = process.env.MONGO_URI || "mongodb://127.0.0.1:27017/saasdental";
const COMMIT = process.argv.includes("--commit");
const FORCE  = process.argv.includes("--force");

// ─── Safety gates ────────────────────────────────────────────────────────────

if (process.env.NODE_ENV === "production" && !FORCE) {
    console.error("❌  BLOCKED in production. Use --force to override.");
    process.exit(1);
}

async function migrate() {
    console.log("");
    console.log("╔══════════════════════════════════════════════════╗");
    console.log("║   RecordSet Photo → File Model Migration          ║");
    console.log("╚══════════════════════════════════════════════════╝");
    console.log(`  Mode: ${COMMIT ? "COMMIT (writes enabled)" : "DRY-RUN (no writes)"}`);
    console.log(`  URI:  ${MONGO_URI}`);
    console.log("");

    await mongoose.connect(MONGO_URI);

    // Load models
    const WorkflowRecordSetDef = require("../src/modules/orthodontics/models/WorkflowRecordSet.model");
    const FileDef = require("../src/modules/files/models/File.model");

    const WorkflowRecordSet = mongoose.models[WorkflowRecordSetDef.modelName] ||
        mongoose.model(WorkflowRecordSetDef.modelName, WorkflowRecordSetDef.schema);
    const FileModel = mongoose.models[FileDef.modelName] ||
        mongoose.model(FileDef.modelName, FileDef.schema);

    // Find all record sets with photos
    const recordSets = await WorkflowRecordSet.find({
        "records.url": { $exists: true, $ne: null },
    }).lean();

    console.log(`  Found ${recordSets.length} WorkflowRecordSet(s) with photo records`);

    let created = 0;
    let skipped = 0;
    let errors = 0;

    for (const rs of recordSets) {
        if (!rs.records || rs.records.length === 0) continue;

        for (const record of rs.records) {
            // Skip if already migrated
            if (record.photoFileId) {
                skipped++;
                continue;
            }

            // Skip if no URL
            if (!record.url) {
                skipped++;
                continue;
            }

            if (!COMMIT) {
                console.log(`  [DRY-RUN] Would create File for: ${record.url}`);
                created++;
                continue;
            }

            try {
                // Create File metadata document
                const fileDoc = await FileModel.create({
                    organizationId: rs.organizationId,
                    caseId:         rs.caseId,
                    storageKey:     record.url, // Legacy URL becomes the storageKey
                    fileName:       record.originalName || record.url.split("/").pop() || "unknown",
                    originalName:   record.originalName || null,
                    mimeType:       record.mimeType || "image/jpeg",
                    size:           record.sizeBytes || 0,
                    category:       "recordset_photo",
                    createdBy:      rs.createdBy || rs.organizationId, // fallback
                });

                // Write photoFileId back to the record
                await WorkflowRecordSet.updateOne(
                    { _id: rs._id, "records.id": record.id },
                    { $set: { "records.$.photoFileId": fileDoc._id } }
                );

                created++;
            } catch (err) {
                // Duplicate key (storageKey already exists) — skip gracefully
                if (err.code === 11000) {
                    skipped++;
                    continue;
                }
                console.error(`  ❌  Error migrating record ${record.id}: ${err.message}`);
                errors++;
            }
        }
    }

    console.log("");
    console.log("  ────────────────────────────────────────");
    console.log(`  Created : ${created}`);
    console.log(`  Skipped : ${skipped}`);
    console.log(`  Errors  : ${errors}`);
    console.log("  ────────────────────────────────────────");
    console.log("");

    await mongoose.disconnect();
    process.exit(errors > 0 ? 1 : 0);
}

migrate().catch((err) => {
    console.error("❌  Migration failed:", err.message);
    mongoose.disconnect().finally(() => process.exit(1));
});
