/**
 * migrateOrthoDomainRbac.js — Phase 30 FINAL RBAC Migration
 *
 * Removes all legacy granular orthodontics engine permissions from every
 * Role document across all organization databases and replaces them with
 * the two domain-level permissions:
 *
 *   orthodontics.full  (was: orthodontics.manage + bonding.manage + tads.manage + sequence.manage + ...)
 *   orthodontics.read  (was: orthodontics.read + bonding.read + tads.read + sequence.read)
 *
 * IDEMPOTENT: safe to run multiple times. Roles already on the new model are unchanged.
 *
 * USAGE:
 *   # Dry run (default — no writes)
 *   DRY_RUN=true PLATFORM_DB_URI="mongodb://..." node migrateOrthoDomainRbac.js
 *
 *   # Live run
 *   DRY_RUN=false PLATFORM_DB_URI="mongodb://..." node migrateOrthoDomainRbac.js
 *
 * ENVIRONMENT:
 *   PLATFORM_DB_URI   — MongoDB URI for the platform DB (contains Organization collection)
 *   DRY_RUN           — "true" (default) to preview, "false" to write
 */

"use strict";

const mongoose = require("mongoose");

// ─── Legacy Permissions to Remove ────────────────────────────────────────────
// ALL of these are being purged from Role.permissions[] across all org DBs.
const LEGACY_ORTHO_PERMISSIONS = new Set([
    // Domain-level granular (replaced by orthodontics.full)
    "orthodontics.manage",
    "orthodontics.create",
    "orthodontics.update",
    "orthodontics.delete",
    "orthodontics.settings",
    "orthodontics.write",

    // Engine-level (replaced by orthodontics.full or orthodontics.read)
    "bonding.manage",
    "bonding.read",
    "bonding.settings",
    "tads.manage",
    "tads.read",
    "tads.settings",
    "sequence.manage",
    "sequence.read",

    // Other legacy clinical perms that no longer belong to roles
    "clinical.read",
    "portal.monitoring",
    "ai.ortho_analysis",
    "patients.write",
]);

// ─── Write-permission legacy strings: roles having ANY of these get orthodontics.full
const WRITE_TIER = new Set([
    "orthodontics.manage",
    "orthodontics.create",
    "orthodontics.update",
    "orthodontics.delete",
    "orthodontics.settings",
    "orthodontics.write",
    "bonding.manage",
    "bonding.settings",
    "tads.manage",
    "tads.settings",
    "sequence.manage",
]);

// ─── Read-permission legacy strings: roles ONLY having read-tier perms get orthodontics.read
const READ_TIER = new Set([
    "bonding.read",
    "tads.read",
    "sequence.read",
    "clinical.read",
    "orthodontics.read",
]);

const DRY_RUN = process.env.DRY_RUN !== "false";
const PLATFORM_DB_URI = process.env.PLATFORM_DB_URI || "mongodb://localhost:27017/dental_platform";

// ─── Minimal Schemas ─────────────────────────────────────────────────────────
const OrgSchema = new mongoose.Schema({ dbUri: String, subdomain: String }, { strict: false });
const RoleSchema = new mongoose.Schema({ permissions: [String], roleName: String }, { strict: false });

async function migrateOrgDb(orgId, dbUri) {
    const conn = await mongoose.createConnection(dbUri).asPromise();
    const Role = conn.model("Role", RoleSchema);

    const roles = await Role.find({}).lean();
    let updated = 0;
    let skipped = 0;

    for (const role of roles) {
        const perms = new Set(role.permissions || []);

        const hasWriteTier = [...perms].some(p => WRITE_TIER.has(p));
        const hasReadTier  = [...perms].some(p => READ_TIER.has(p));
        const hasAnyLegacy = [...perms].some(p => LEGACY_ORTHO_PERMISSIONS.has(p));

        if (!hasAnyLegacy) {
            skipped++;
            continue;
        }

        // Remove all legacy perms
        for (const legacy of LEGACY_ORTHO_PERMISSIONS) {
            perms.delete(legacy);
        }

        // Assign domain-level permission based on write/read tier
        if (hasWriteTier) {
            perms.add("orthodontics.full");
        } else if (hasReadTier) {
            perms.add("orthodontics.read");
        }
        // If neither tier was present, no ortho perm added (role had no ortho access)

        const newPerms = [...perms];

        if (DRY_RUN) {
            console.log(`  [DRY_RUN] org=${orgId} role=${role.roleName || role._id}: ${role.permissions.length} → ${newPerms.length} perms`);
            console.log(`    added: ${hasWriteTier ? "orthodontics.full" : hasReadTier ? "orthodontics.read" : "none"}`);
        } else {
            await Role.updateOne({ _id: role._id }, { $set: { permissions: newPerms } });
        }

        updated++;
    }

    await conn.close();
    return { updated, skipped, total: roles.length };
}

async function main() {
    console.log(`\n${"=".repeat(60)}`);
    console.log(`Phase 30 FINAL — Orthodontics RBAC Domain Migration`);
    console.log(`Mode: ${DRY_RUN ? "DRY RUN (no writes)" : "⚠️  LIVE RUN (writes to DB)"}`);
    console.log(`${"=".repeat(60)}\n`);

    const platformConn = await mongoose.createConnection(PLATFORM_DB_URI).asPromise();
    const Org = platformConn.model("Organization", OrgSchema);
    const orgs = await Org.find({ dbUri: { $exists: true } }).lean();

    console.log(`Found ${orgs.length} organizations to process\n`);

    let totalUpdated = 0;
    let totalSkipped = 0;

    for (const org of orgs) {
        if (!org.dbUri) continue;
        process.stdout.write(`Processing org ${org._id} (${org.subdomain || "unknown"})... `);
        try {
            const result = await migrateOrgDb(org._id, org.dbUri);
            totalUpdated += result.updated;
            totalSkipped += result.skipped;
            console.log(`✅ updated=${result.updated} skipped=${result.skipped} total=${result.total}`);
        } catch (err) {
            console.error(`❌ FAILED: ${err.message}`);
        }
    }

    await platformConn.close();

    console.log(`\n${"=".repeat(60)}`);
    console.log(`Migration ${DRY_RUN ? "preview" : "complete"}`);
    console.log(`Roles updated: ${totalUpdated}`);
    console.log(`Roles skipped (already migrated): ${totalSkipped}`);
    if (DRY_RUN) {
        console.log(`\nRe-run with DRY_RUN=false to apply changes.`);
    }
    console.log(`${"=".repeat(60)}\n`);
}

main().catch(err => {
    console.error("Migration failed:", err);
    process.exit(1);
});
