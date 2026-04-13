/**
 * Migration: add-branch-type.js
 * v32.0 — Academic vs Private Branch Model
 *
 * WHAT THIS DOES:
 *   1. Adds clinicType: "PRIVATE" to all Branch documents missing it
 *   2. Adds careType: "PRIVATE" to all Patient documents missing it
 *
 * SAFE TO RE-RUN: uses $exists: false filters — idempotent.
 *
 * HOW TO RUN:
 *   node scripts/migrations/add-branch-type.js
 *
 * AFTER RUNNING:
 *   - Verify: db.branches.countDocuments({ clinicType: { $exists: false } }) === 0
 *   - Verify: db.patients.countDocuments({ careType: { $exists: false } }) === 0
 *   - To mark a branch as ACADEMIC: db.branches.updateOne({ _id: ... }, { $set: { clinicType: "ACADEMIC" } })
 *   - Then update patients in that branch: db.patients.updateMany({ primaryBranchId: ... }, { $set: { careType: "ACADEMIC" } })
 */

"use strict";

require("dotenv").config();

const mongoose = require("mongoose");

// ─── Simple inline schemas for migration (no model deps) ─────────────────────

const branchSchema = new mongoose.Schema({}, { strict: false });
const patientSchema = new mongoose.Schema({}, { strict: false });

async function runMigration() {
    const uri = process.env.MONGO_URI;
    if (!uri) {
        console.error("❌  MONGO_URI not set in .env");
        process.exit(1);
    }

    console.log("🔌  Connecting to MongoDB...");
    await mongoose.connect(uri);
    console.log("✅  Connected\n");

    const db = mongoose.connection.db;

    // ── Step 1: Branches ──────────────────────────────────────────────────────
    console.log("📦  Step 1 — Backfilling Branch.clinicType → PRIVATE...");
    const branchResult = await db.collection("branches").updateMany(
        { clinicType: { $exists: false } },
        { $set: { clinicType: "PRIVATE" } }
    );
    console.log(`   Modified: ${branchResult.modifiedCount} branch(es)\n`);

    // ── Step 2: Patients ──────────────────────────────────────────────────────
    console.log("👤  Step 2 — Backfilling Patient.careType → PRIVATE...");
    const patientResult = await db.collection("patients").updateMany(
        { careType: { $exists: false } },
        { $set: { careType: "PRIVATE" } }
    );
    console.log(`   Modified: ${patientResult.modifiedCount} patient(s)\n`);

    // ── Step 3: Verification ──────────────────────────────────────────────────
    console.log("🔍  Step 3 — Verification checks...");

    const branchMissing  = await db.collection("branches").countDocuments({ clinicType: { $exists: false } });
    const patientMissing = await db.collection("patients").countDocuments({ careType: { $exists: false } });

    const academicBranches = await db.collection("branches").countDocuments({ clinicType: "ACADEMIC" });
    const academicPatients = await db.collection("patients").countDocuments({ careType: "ACADEMIC" });

    console.log(`   Branches missing clinicType : ${branchMissing}  (should be 0)`);
    console.log(`   Patients missing careType   : ${patientMissing}  (should be 0)`);
    console.log(`   ACADEMIC branches           : ${academicBranches}`);
    console.log(`   ACADEMIC patients           : ${academicPatients}`);

    if (branchMissing > 0 || patientMissing > 0) {
        console.error("\n❌  Migration incomplete — some records were not updated.");
        process.exit(1);
    }

    console.log("\n✅  Migration completed successfully.");

    if (academicBranches > 0 || academicPatients > 0) {
        console.log("\n⚠️   You have existing ACADEMIC records. Please verify they are correct:");
        console.log("     db.branches.find({ clinicType: 'ACADEMIC' })");
        console.log("     db.patients.find({ careType: 'ACADEMIC' })");
    }

    await mongoose.disconnect();
    console.log("🔌  Disconnected.\n");
}

runMigration().catch(err => {
    console.error("❌  Migration failed:", err.message);
    process.exit(1);
});
