/**
 * migrateCastAnalysis.js
 * ═══════════════════════════════════════════════════════════════════
 * ONE-SHOT MIGRATION: Standalone CastAnalysis → Embedded in RecordSet
 *
 * WHAT IT DOES:
 *   1. Reads all documents from the old CastAnalysis collection
 *   2. Finds the matching OrthodonticCase by caseId
 *   3. Injects castAnalysis into the matching recordSet inside workflowData
 *   4. Saves the OrthodonticCase
 *   (Does NOT drop the old collection — manual verification required)
 *
 * HOW TO RUN:
 *   node src/modules/clinical-snapshots/migrations/migrateCastAnalysis.js
 *   (with DB_URI env var set for the target org database)
 *
 * IDEMPOTENT: Re-running is safe — existing castAnalysis on a record set
 *   is overwritten only if the old document is newer (savedAt check).
 *
 * ROLLBACK: The old CastAnalysis collection is kept intact until you
 *   manually run: db.castanalyses.drop()
 * ═══════════════════════════════════════════════════════════════════
 */

"use strict";

const mongoose = require("mongoose");

async function migrate() {
  const uri = process.env.DB_URI;
  if (!uri) {
    console.error("❌ DB_URI env var not set");
    process.exit(1);
  }

  await mongoose.connect(uri);
  const db = mongoose.connection.db;

  const oldCollection = db.collection("castanalyses");
  const casesCollection = db.collection("orthodonticcases");

  const count = await oldCollection.countDocuments();
  console.log(`ℹ️  Found ${count} CastAnalysis documents to migrate`);

  if (count === 0) {
    console.log("✅ Nothing to migrate.");
    await mongoose.disconnect();
    return;
  }

  let migrated = 0;
  let skipped = 0;
  let errors = 0;

  const cursor = oldCollection.find({});

  for await (const doc of cursor) {
    try {
      const caseId = doc.caseId;
      if (!caseId) {
        console.warn(`⚠️  Skipping doc ${doc._id} — no caseId`);
        skipped++;
        continue;
      }

      const orthoCase = await casesCollection.findOne({
        _id: new mongoose.Types.ObjectId(caseId.toString()),
      });

      if (!orthoCase) {
        console.warn(`⚠️  Skipping doc ${doc._id} — OrthodonticCase ${caseId} not found`);
        skipped++;
        continue;
      }

      const workflowData = orthoCase.workflowData || {};
      const recordSets = workflowData.recordSets || [];

      // Find the record set matching the snapshot (first one if no snapshotId)
      const targetIdx = doc.snapshotId
        ? recordSets.findIndex((rs) => rs.id === doc.snapshotId?.toString())
        : 0;

      const idx = targetIdx >= 0 ? targetIdx : 0;

      if (!recordSets[idx]) {
        recordSets[idx] = { id: `migrated_${doc._id}` };
      }

      // Idempotency: only overwrite if old data is newer or doesn't exist
      const existing = recordSets[idx].castAnalysis;
      const existingDate = existing?.savedAt ? new Date(existing.savedAt) : null;
      const newDate = doc.createdAt ? new Date(doc.createdAt) : new Date(0);

      if (existingDate && existingDate >= newDate) {
        console.log(`↩️  Skipping ${doc._id} — record set already has newer castAnalysis`);
        skipped++;
        continue;
      }

      recordSets[idx].castAnalysis = {
        input:   doc.input   || {},
        result:  doc.result  || {},
        savedAt: doc.createdAt?.toISOString() || new Date().toISOString(),
      };

      await casesCollection.updateOne(
        { _id: orthoCase._id },
        { $set: { "workflowData.recordSets": recordSets } }
      );

      migrated++;
      console.log(`✅ Migrated cast analysis for case ${caseId} → recordSet[${idx}]`);
    } catch (err) {
      errors++;
      console.error(`❌ Error migrating doc ${doc._id}:`, err.message);
    }
  }

  console.log(`\n═══ MIGRATION COMPLETE ═══`);
  console.log(`  Migrated: ${migrated}`);
  console.log(`  Skipped:  ${skipped}`);
  console.log(`  Errors:   ${errors}`);
  console.log(`\n⚠️  Old collection 'castanalyses' kept intact.`);
  console.log(`   Run db.castanalyses.drop() after verifying data.`);

  await mongoose.disconnect();
}

migrate().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});
