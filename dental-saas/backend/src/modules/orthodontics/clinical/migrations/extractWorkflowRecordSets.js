/**
 * extractWorkflowRecordSets.js
 * ══════════════════════════════════════════════════════════════════════════════
 * P1-1 MIGRATION: Extract WorkflowSnapshot.recordSets[] → WorkflowRecordSet
 *
 * WHAT IT DOES:
 *   1. Iterates every WorkflowSnapshot in the target org database
 *   2. For each snapshot, extracts its embedded recordSets[] array
 *   3. Inserts each record set as a standalone WorkflowRecordSet document,
 *      carrying snapshotId, caseId, organizationId, version, and legacyId
 *   4. Does NOT remove recordSets from WorkflowSnapshot yet — old field is
 *      preserved for backwards-compatibility until the service layer is fully
 *      migrated to read from the new collection (see ROLLBACK section below)
 *
 * IDEMPOTENT:
 *   Re-running is safe. Each insertion checks for an existing document keyed
 *   on (snapshotId + legacyId) before writing. Existing docs are skipped.
 *
 * HOW TO RUN (per-org DB — run once per organisation):
 *   DB_URI="mongodb://localhost:27017/org_<orgId>" node src/modules/orthodontics/clinical/migrations/extractWorkflowRecordSets.js
 *
 * DRY RUN (prints what would be inserted, writes nothing):
 *   DRY_RUN=true DB_URI="..." node extractWorkflowRecordSets.js
 *
 * ROLLBACK:
 *   The WorkflowSnapshot.recordSets[] field is NOT touched by this migration.
 *   To fully rollback: db.workflowrecordsets.drop()
 *   This is safe as long as the service layer still reads from WorkflowSnapshot.
 *
 * PHASE-2 CLEANUP (after service layer is migrated):
 *   Run the following to remove the now-redundant embedded field:
 *     db.workflowsnapshots.updateMany({}, { $unset: { recordSets: "" } })
 *
 * VERIFICATION QUERIES (run after migration):
 *   // Count snapshots with non-empty recordSets
 *   db.workflowsnapshots.countDocuments({ "recordSets.0": { $exists: true } })
 *   // Should equal total count of extracted WorkflowRecordSet documents
 *   db.workflowrecordsets.countDocuments({})
 * ══════════════════════════════════════════════════════════════════════════════
 */

"use strict";

require("dotenv").config();

const mongoose = require("mongoose");

// ─── CLI flags ────────────────────────────────────────────────────────────────

const DRY_RUN = process.env.DRY_RUN === "true";

// ─── Minimal inline schemas (no model imports needed for migration) ───────────

const snapshotSchema = new mongoose.Schema({}, { strict: false, timestamps: true });
const recordSetSchema = new mongoose.Schema({}, { strict: false, timestamps: true });

async function runMigration() {
    const uri = process.env.DB_URI;
    if (!uri) {
        console.error("❌  DB_URI env var not set.");
        console.error("    Usage: DB_URI=\"mongodb://...\" node extractWorkflowRecordSets.js");
        process.exit(1);
    }

    console.log(`🔌  Connecting to: ${uri.replace(/\/\/[^@]+@/, "//***@")}`);
    await mongoose.connect(uri, { serverSelectionTimeoutMS: 10_000 });
    console.log("✅  Connected.\n");

    const db = mongoose.connection.db;
    const snapshotsCol    = db.collection("workflowsnapshots");
    const recordSetsCol   = db.collection("workflowrecordsets");

    if (DRY_RUN) {
        console.log("⚠️   DRY_RUN=true — no writes will be made.\n");
    }

    // ── Stats ─────────────────────────────────────────────────────────────────

    let totalSnapshots = 0;
    let totalExtracted = 0;
    let totalSkipped   = 0;
    let totalErrors    = 0;

    // ── Iterate snapshots ─────────────────────────────────────────────────────

    const cursor = snapshotsCol.find(
        { "recordSets.0": { $exists: true } }, // only snapshots that have at least one record set
        { projection: { _id: 1, organizationId: 1, caseId: 1, version: 1, recordSets: 1 } }
    );

    for await (const snapshot of cursor) {
        totalSnapshots++;
        const { _id: snapshotId, organizationId, caseId, version, recordSets } = snapshot;

        if (!Array.isArray(recordSets) || recordSets.length === 0) continue;

        for (const rs of recordSets) {
            try {
                const legacyId = rs.id ?? null;

                // Idempotency guard: skip if already extracted
                const existing = await recordSetsCol.findOne({
                    snapshotId: new mongoose.Types.ObjectId(snapshotId),
                    legacyId,
                });

                if (existing) {
                    totalSkipped++;
                    continue;
                }

                const doc = {
                    organizationId: new mongoose.Types.ObjectId(organizationId),
                    caseId:         new mongoose.Types.ObjectId(caseId),
                    snapshotId:     new mongoose.Types.ObjectId(snapshotId),
                    legacyId,
                    name:           rs.name           ?? "Record Set",
                    type:           rs.type           ?? "CUSTOM",
                    version:        version           ?? null,
                    date:           rs.date           ?? null,
                    chiefComplaint: rs.chiefComplaint ?? "",
                    audioUrl:       rs.audioUrl       ?? null,
                    records:        Array.isArray(rs.records)  ? rs.records  : [],
                    stlFiles:       Array.isArray(rs.stlFiles) ? rs.stlFiles : [],
                    problemList:    rs.problemList    ?? null,
                    treatmentPlan:  rs.treatmentPlan  ?? null,
                    createdAt:      snapshot.createdAt ?? new Date(),
                    updatedAt:      snapshot.updatedAt ?? new Date(),
                };

                if (DRY_RUN) {
                    console.log(`  [DRY] Would insert: snapshotId=${snapshotId} legacyId=${legacyId} type=${doc.type}`);
                } else {
                    await recordSetsCol.insertOne(doc);
                }

                totalExtracted++;
            } catch (err) {
                totalErrors++;
                console.error(
                    `  ❌  Error on snapshot=${snapshotId} legacyId=${rs.id}:`,
                    err.message
                );
            }
        }

        if (totalSnapshots % 100 === 0) {
            console.log(`  ↳ Processed ${totalSnapshots} snapshots so far…`);
        }
    }

    // ── Summary ───────────────────────────────────────────────────────────────

    console.log("\n══════════════════════════════════════");
    console.log(`  Snapshots scanned : ${totalSnapshots}`);
    console.log(`  Record sets ${DRY_RUN ? "to insert" : "inserted"} : ${totalExtracted}`);
    console.log(`  Already existed (skipped) : ${totalSkipped}`);
    console.log(`  Errors           : ${totalErrors}`);
    console.log("══════════════════════════════════════");

    if (totalErrors > 0) {
        console.error("\n⚠️   Migration completed WITH ERRORS. Review logs above.");
        process.exitCode = 1;
    } else if (DRY_RUN) {
        console.log("\n✅  Dry run complete. Re-run without DRY_RUN=true to commit.");
    } else {
        console.log("\n✅  Migration complete.");
        console.log("\n   Post-migration verification:");
        console.log(`   db.workflowrecordsets.countDocuments({})  // expected ≥ ${totalExtracted}`);
        console.log("   db.workflowrecordsets.find({}).limit(3).pretty()");
    }

    await mongoose.disconnect();
}

runMigration().catch((err) => {
    console.error("💥  Unhandled migration error:", err);
    process.exit(1);
});
