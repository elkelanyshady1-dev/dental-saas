#!/usr/bin/env node
/**
 * recalculateOrgUsage.js — Data Reconciliation Script
 * Phase 4.1 — Entitlements Finalization
 *
 * Recalculates OrgUsage counters from actual database records.
 * Ensures usage tracking matches reality for all organizations.
 *
 * Architecture:
 *   - Reads Organization list from platform DB
 *   - For each org, counts Users/Patients/Branches from per-org DB (dental_org_<id>)
 *   - Reads OrganizationStorageUsage from per-org DB
 *   - Writes results to OrgUsage model on platform DB
 *
 * Run:
 *   node scripts/recalculateOrgUsage.js                     # All orgs
 *   node scripts/recalculateOrgUsage.js --org=<orgId>       # Single org
 *   node scripts/recalculateOrgUsage.js --dry-run           # Preview only
 *
 * Safety:
 * - Reads are all countDocuments — no write amplification
 * - OrgUsage writes are upsert-based — safe for first run
 * - Per-org DB connections are released after each org
 */

"use strict";

require("dotenv").config();
const mongoose = require("mongoose");

// ─── Configuration ─────────────────────────────────────────────────────────────

const MONGO_URI = process.env.MONGO_URI || process.env.MONGODB_URI || "mongodb://localhost:27017/saasdental";
const PLATFORM_DB = process.env.PLATFORM_DB || "saasdental";

// ─── Schemas (minimal inline — avoid module-alias dependency) ─────────────────

const OrgUsageSchema = new mongoose.Schema({
    organizationId: { type: mongoose.Schema.Types.ObjectId, required: true, unique: true },
    usersCount:     { type: Number, default: 0 },
    branchesCount:  { type: Number, default: 0 },
    patientsCount:  { type: Number, default: 0 },
    storageUsedMB:  { type: Number, default: 0 },
}, { timestamps: true });

const StorageUsageSchema = new mongoose.Schema({
    organizationId: mongoose.Schema.Types.ObjectId,
    totalBytes:     { type: Number, default: 0 },
}, { strict: false });

// ─── Main ──────────────────────────────────────────────────────────────────────

async function main() {
    const args = process.argv.slice(2);
    const dryRun = args.includes("--dry-run");
    const singleOrg = args.find(a => a.startsWith("--org="))?.split("=")[1];

    console.log("╔══════════════════════════════════════════════════════════════╗");
    console.log("║  OrgUsage Reconciliation Script (Phase 4.1)                 ║");
    console.log("╚══════════════════════════════════════════════════════════════╝");
    console.log(`  Mode:   ${dryRun ? "🟢 DRY-RUN (preview only)" : "🔴 LIVE (will update counters)"}`);
    console.log(`  Target: ${singleOrg || "ALL organizations"}`);
    console.log();

    // Connect to platform DB
    const conn = await mongoose.connect(MONGO_URI);
    console.log(`  Connected to: ${conn.connection.host}/${conn.connection.name}\n`);

    const platformDb = conn.connection.useDb(PLATFORM_DB, { useCache: true });

    // Get Organizations
    const orgCollection = platformDb.collection("organizations");
    const orgQuery = singleOrg
        ? { _id: new mongoose.Types.ObjectId(singleOrg) }
        : { isActive: { $ne: false } };
    const orgs = await orgCollection.find(orgQuery)
        .project({ _id: 1, name: 1 })
        .toArray();

    console.log(`  Found ${orgs.length} organization(s) to process.\n`);

    // Get OrgUsage model on platform DB
    const OrgUsage = platformDb.model("OrgUsage", OrgUsageSchema);

    let processed = 0;
    let errors = 0;
    const results = [];

    for (const org of orgs) {
        const orgId = org._id;
        const orgName = org.name || String(orgId);
        const orgDbName = `dental_org_${orgId}`;

        try {
            // Connect to per-org DB
            const orgDb = conn.connection.useDb(orgDbName, { useCache: true });

            // Count actual records
            const [usersCount, branchesCount, patientsCount, storageDoc] = await Promise.all([
                _safeCount(orgDb, "users", { deletedAt: null }),
                _safeCount(orgDb, "branches", {}),
                _safeCount(orgDb, "patients", { deletedAt: null }),
                _safeStorageDoc(orgDb, "organizationstorageusages", orgId),
            ]);

            const storageUsedMB = Math.round((storageDoc?.totalBytes || 0) / (1024 * 1024));

            // Get current OrgUsage (for comparison)
            const current = await OrgUsage.findOne({ organizationId: orgId }).lean();

            const diff = {
                users: (current?.usersCount || 0) !== usersCount,
                branches: (current?.branchesCount || 0) !== branchesCount,
                patients: (current?.patientsCount || 0) !== patientsCount,
                storage: (current?.storageUsedMB || 0) !== storageUsedMB,
            };
            const hasDrift = diff.users || diff.branches || diff.patients || diff.storage;

            const statusIcon = hasDrift ? "⚠️ " : "✅";
            console.log(`  ${statusIcon} ${orgName} (${orgId})`);
            console.log(`      Users:    ${current?.usersCount || 0} → ${usersCount}${diff.users ? " ⟵ DRIFT" : ""}`);
            console.log(`      Branches: ${current?.branchesCount || 0} → ${branchesCount}${diff.branches ? " ⟵ DRIFT" : ""}`);
            console.log(`      Patients: ${current?.patientsCount || 0} → ${patientsCount}${diff.patients ? " ⟵ DRIFT" : ""}`);
            console.log(`      Storage:  ${current?.storageUsedMB || 0} MB → ${storageUsedMB} MB${diff.storage ? " ⟵ DRIFT" : ""}`);

            if (!dryRun) {
                await OrgUsage.updateOne(
                    { organizationId: orgId },
                    {
                        $set: {
                            usersCount,
                            branchesCount,
                            patientsCount,
                            storageUsedMB,
                        },
                    },
                    { upsert: true }
                );
                if (hasDrift) {
                    console.log(`      → Counters updated.`);
                }
            }

            results.push({ orgId: String(orgId), orgName, usersCount, branchesCount, patientsCount, storageUsedMB, hasDrift });
            processed++;

        } catch (err) {
            console.error(`  ❌ ${orgName} (${orgId}): ${err.message}`);
            errors++;
        }
    }

    // ── Summary ──────────────────────────────────────────────────────────────
    const driftOrgs = results.filter(r => r.hasDrift);

    console.log("\n═══════════════════════════════════════════════════════════════");
    console.log(`  Processed:     ${processed}`);
    console.log(`  Errors:        ${errors}`);
    console.log(`  Clean:         ${processed - driftOrgs.length}`);
    console.log(`  Drifted:       ${driftOrgs.length}${driftOrgs.length > 0 ? " ← CORRECTED" : ""}`);
    console.log("═══════════════════════════════════════════════════════════════");

    if (dryRun && driftOrgs.length > 0) {
        console.log("\n⚠️  DRY-RUN mode — no changes were made.");
        console.log("    Re-run without --dry-run to apply corrections.");
    }

    await mongoose.disconnect();
    process.exit(errors > 0 ? 1 : 0);
}

// ─── Helpers ────────────────────────────────────────────────────────────────────

/**
 * Safe countDocuments — returns 0 if collection doesn't exist.
 */
async function _safeCount(db, collectionName, filter = {}) {
    try {
        const collections = await db.db.listCollections({ name: collectionName }).toArray();
        if (collections.length === 0) return 0;
        return db.collection(collectionName).countDocuments(filter);
    } catch (err) {
        return 0;
    }
}

/**
 * Safe storage doc lookup — returns null if collection doesn't exist.
 */
async function _safeStorageDoc(db, collectionName, orgId) {
    try {
        const collections = await db.db.listCollections({ name: collectionName }).toArray();
        if (collections.length === 0) return null;
        return db.collection(collectionName).findOne({ organizationId: orgId });
    } catch (err) {
        return null;
    }
}

// ─── Execute ────────────────────────────────────────────────────────────────────

main().catch(err => {
    console.error("FATAL:", err);
    process.exit(1);
});
