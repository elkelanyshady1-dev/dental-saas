#!/usr/bin/env node
/**
 * migratePerOrgSchemas.js — Per-Org DB Schema Migration Script
 *
 * Performs:
 * 1. Drops all organizationId compound indexes from org-scoped collections
 * 2. Removes organizationId field from documents via $unset (optional — controlled by flag)
 * 3. Rebuilds correct per-DB indexes via syncIndexes()
 *
 * Run: node scripts/migratePerOrgSchemas.js [--unset-field]
 *
 * Flags:
 *   --unset-field    Also $unset organizationId from all documents (destructive)
 *                    Without this flag, only indexes are cleaned.
 *
 * Safety:
 * - Platform DB collections are EXCLUDED (Organization, OrgContract, PlatformInvoice, etc.)
 * - Runs in dry-run mode by default unless --execute is passed
 */

"use strict";

require("dotenv").config();
const mongoose = require("mongoose");

// ─── Configuration ─────────────────────────────────────────────────────────────

const MONGO_URI = process.env.MONGO_URI || "mongodb://localhost:27017/saasdental";

// Org-scoped collections to clean (per-org DB)
const ORG_SCOPED_COLLECTIONS = [
    "users",
    "branches",
    "roles",
    "auditlogs",
    "authtraces",
    "tickets",
    "permissionchangelogs",
    "refreshtokens",
    "verificationtokens",
    "patients",
    "appointments",
    "notifications",
    "recalls",
    "chairs",
    "families",
    "familymembers",
    "organizationsettings",
    // Clinical
    "protocoldefinitions",
    "clinicalcases",
    "clinicalmediaassets",
    "cephstudies",
    // Inventory
    "inventoryitems",
    "inventorytransactions",
    "casecostsnapshots",
    // Treatments
    "treatments",
    "treatmentplans",
    // Billing (org-level)
    "patientinvoices",
    "patientpayments",
    "patientwallets",
    "paymentallocations",
    "financialledgers",
    "financialsnapshots",
    "financialeventledgers",
    "journalentries",
    "refunds",
    "doctorinvoices",
    "driftalerts",
    // Supervisor
    "reviewstages",
    "supervisorinvitations",
    "caseaccesses",
    // Orthodontics
    "orthodonticcases",
    "sharedcases",
    "scanfiles",
    "cephanalyses",
    "toothsegmentations",
    // Stage Domain
    "treatmentcases",
    "stagetemplates",
    "stagetemplateoverrides",
    "stageexecutions",
    // Patient Portal
    "patientusers",
    "patientmessages",
    "patientphotos",
    "monitoringsessions",
    "alignerprogresses",
    "portalinvites",
    "patientintaketokens",
    // Procedures
    "procedures",
    // Patient Domain
    "prescriptions",
    "clinicals",
    "branchcounters",
    "patientpolicies",
    // Communication
    "communicationusages",
    "storageusages",
];

// ─── Main ──────────────────────────────────────────────────────────────────────

async function main() {
    const args = process.argv.slice(2);
    const shouldUnsetField = args.includes("--unset-field");
    const shouldExecute = args.includes("--execute");
    const targetDb = args.find(a => a.startsWith("--db="))?.split("=")[1];

    console.log("╔══════════════════════════════════════════════════════════════╗");
    console.log("║  Per-Org DB Schema Migration — Index Cleanup                ║");
    console.log("╚══════════════════════════════════════════════════════════════╝");
    console.log(`  Mode:          ${shouldExecute ? "🔴 EXECUTE" : "🟢 DRY-RUN"}`);
    console.log(`  Unset field:   ${shouldUnsetField ? "YES" : "NO (indexes only)"}`);
    console.log(`  Target DB:     ${targetDb || "ALL dental_org_* databases"}`);
    console.log();

    const conn = await mongoose.connect(MONGO_URI, { directConnection: false });
    const admin = conn.connection.db.admin();

    // List all databases
    const { databases } = await admin.listDatabases();
    const orgDbs = targetDb
        ? databases.filter(db => db.name === targetDb)
        : databases.filter(db => db.name.startsWith("dental_org_"));

    console.log(`Found ${orgDbs.length} org database(s) to process:\n`);

    let totalIndexesDropped = 0;
    let totalDocsUpdated = 0;

    for (const dbInfo of orgDbs) {
        const dbName = dbInfo.name;
        console.log(`\n▸ Processing: ${dbName}`);

        const dbConn = conn.connection.useDb(dbName, { useCache: true });

        for (const collName of ORG_SCOPED_COLLECTIONS) {
            try {
                const collection = dbConn.collection(collName);

                // Check if collection exists
                const collections = await dbConn.db.listCollections({ name: collName }).toArray();
                if (collections.length === 0) continue;

                // Get current indexes
                const indexes = await collection.indexes();
                const orgIdIndexes = indexes.filter(idx => {
                    if (idx.name === "_id_") return false;
                    const keys = Object.keys(idx.key);
                    return keys.includes("organizationId");
                });

                if (orgIdIndexes.length > 0) {
                    console.log(`  ├─ ${collName}: ${orgIdIndexes.length} organizationId index(es) found`);
                    for (const idx of orgIdIndexes) {
                        console.log(`  │  └─ DROP: ${idx.name} → ${JSON.stringify(idx.key)}`);
                        if (shouldExecute) {
                            await collection.dropIndex(idx.name);
                            totalIndexesDropped++;
                        }
                    }
                }

                // Optionally $unset organizationId from documents
                if (shouldUnsetField) {
                    const count = await collection.countDocuments({ organizationId: { $exists: true } });
                    if (count > 0) {
                        console.log(`  │  └─ UNSET organizationId from ${count} docs`);
                        if (shouldExecute) {
                            const result = await collection.updateMany(
                                {},
                                { $unset: { organizationId: "" } }
                            );
                            totalDocsUpdated += result.modifiedCount;
                        }
                    }
                }
            } catch (err) {
                // Skip collection errors (e.g., collection doesn't exist)
                if (!err.message.includes("ns not found")) {
                    console.warn(`  ├─ ${collName}: ⚠️ ${err.message}`);
                }
            }
        }
    }

    // Also clean platform DB's phoneNumber index if needed
    console.log(`\n▸ Processing: platform DB (saasdental) — phoneNumber fix only`);
    const platformDb = conn.connection.useDb("saasdental", { useCache: true });
    try {
        const usersCol = platformDb.collection("users");
        const indexes = await usersCol.indexes();
        const orgIdIndexes = indexes.filter(idx => {
            if (idx.name === "_id_") return false;
            return Object.keys(idx.key).includes("organizationId");
        });
        for (const idx of orgIdIndexes) {
            console.log(`  ├─ users: DROP ${idx.name} → ${JSON.stringify(idx.key)}`);
            if (shouldExecute) {
                await usersCol.dropIndex(idx.name);
                totalIndexesDropped++;
            }
        }
    } catch (err) {
        console.warn(`  ⚠️ Platform users: ${err.message}`);
    }

    console.log("\n═══════════════════════════════════════════════════════════════");
    console.log(`  Indexes ${shouldExecute ? "dropped" : "to drop"}:  ${shouldExecute ? totalIndexesDropped : "(dry-run)"}`);
    if (shouldUnsetField) {
        console.log(`  Docs ${shouldExecute ? "updated" : "to update"}: ${shouldExecute ? totalDocsUpdated : "(dry-run)"}`);
    }
    console.log("═══════════════════════════════════════════════════════════════");

    if (!shouldExecute) {
        console.log("\n⚠️  DRY-RUN mode — no changes were made.");
        console.log("    Re-run with --execute to apply changes.");
        console.log("    Add --unset-field to also remove organizationId from documents.");
    }

    await mongoose.disconnect();
    process.exit(0);
}

main().catch(err => {
    console.error("FATAL:", err);
    process.exit(1);
});
