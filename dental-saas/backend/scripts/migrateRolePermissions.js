/**
 * migrateRolePermissions.js — SSOT-Driven Permission Migration (v2.0)
 *
 * PURPOSE:
 *   Patches existing Role documents in MongoDB to include ALL permission
 *   modules/actions defined in orgPermissions.js.
 *
 *   Unlike v1 which hardcoded a list of "new modules", v2 derives missing
 *   fields dynamically from the SSOT via permissionRegistry. This means:
 *   - Add a module to orgPermissions.js
 *   - Run this script
 *   - All existing Role documents are patched automatically
 *
 * SAFETY:
 *   - Idempotent: only adds fields that are missing, never overwrites existing
 *   - Uses generateRoleSeed() for correct permission values per system role
 *   - Falls back to all-false for custom (non-system) role names
 *   - Uses $set with dotted paths to avoid overwriting existing data
 *
 * USAGE:
 *   node scripts/migrateRolePermissions.js
 *   node scripts/migrateRolePermissions.js --dry-run   (preview only)
 *
 * PLANE: Org only.
 */

"use strict";

require("module-alias/register");
require("dotenv").config();

const mongoose = require("mongoose");
const Role = require("../src/shared/models/Role");
const { ORG_ROLE_PERMISSIONS } = require("../src/rbac/orgPermissions");
const { deriveModuleMap, generateRoleSeed } = require("../src/rbac/permissionRegistry");

const DRY_RUN = process.argv.includes("--dry-run");

async function migrate() {
    const MONGO_URI = process.env.MONGO_URI || process.env.MONGODB_URI;
    if (!MONGO_URI) {
        console.error("❌ MONGO_URI not set in environment");
        process.exit(1);
    }

    if (DRY_RUN) {
        console.log("🔍 DRY RUN MODE — no database changes will be made\n");
    }

    console.log("🔗 Connecting to MongoDB...");
    await mongoose.connect(MONGO_URI);
    console.log("✅ Connected\n");

    const moduleMap = deriveModuleMap();
    const roles = await Role.find({});

    console.log(`📋 Found ${roles.length} Role document(s)`);
    console.log(`📦 SSOT defines ${Object.keys(moduleMap).length} modules\n`);
    console.log("═".repeat(70));

    let updatedCount = 0;
    let skippedCount = 0;

    for (const role of roles) {
        const updates = {};
        const perms = role.permissions || {};

        // Derive expected seed for this role (if it's a system role)
        let expectedSeed = null;
        if (ORG_ROLE_PERMISSIONS[role.name]) {
            expectedSeed = generateRoleSeed(role.name);
        }

        // Check every module.action pair from SSOT
        for (const [mod, actions] of Object.entries(moduleMap)) {
            for (const action of actions) {
                const hasField = perms[mod] && (action in perms[mod]);
                if (!hasField) {
                    // Missing field → add with correct value from seed (or false for custom roles)
                    const value = expectedSeed ? expectedSeed[mod][action] : false;
                    updates[`permissions.${mod}.${action}`] = value;
                }
            }
        }

        if (Object.keys(updates).length > 0) {
            if (!DRY_RUN) {
                await Role.updateOne({ _id: role._id }, { $set: updates });
            }

            const prefix = DRY_RUN ? "🔍" : "✅";
            const fieldsPreview = Object.entries(updates)
                .map(([k, v]) => `${k.replace("permissions.", "")}=${v}`)
                .slice(0, 5)
                .join(", ");
            const more = Object.keys(updates).length > 5 ? ` (+${Object.keys(updates).length - 5} more)` : "";

            console.log(`  ${prefix} ${role.name} (org: ${role.organizationId}) — ${Object.keys(updates).length} field(s): ${fieldsPreview}${more}`);
            updatedCount++;
        } else {
            skippedCount++;
        }
    }

    console.log("\n" + "═".repeat(70));
    console.log(`\n🎯 Migration ${DRY_RUN ? "preview" : "complete"}:`);
    console.log(`   ${DRY_RUN ? "Would update" : "Updated"}: ${updatedCount}`);
    console.log(`   Skipped (already up to date): ${skippedCount}`);
    console.log(`   Total: ${roles.length}\n`);

    await mongoose.disconnect();
    console.log("🔌 Disconnected from MongoDB");
}

migrate().catch((err) => {
    console.error("❌ Migration failed:", err);
    process.exit(1);
});
