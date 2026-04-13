/**
 * checkPermissionDrift.js — Live Database Drift Detector
 *
 * Connects to MongoDB and checks ALL existing Role documents
 * for missing modules/actions compared to the SSOT.
 *
 * This catches:
 *   - Existing organizations with stale Role documents
 *   - Documents that were never migrated
 *   - Partial writes from failed operations
 *
 * USAGE:
 *   node scripts/checkPermissionDrift.js
 *   node scripts/checkPermissionDrift.js --fix   (auto-repair mode)
 *
 * PLANE: Org only.
 * REQUIRES: MongoDB connection (MONGO_URI or MONGODB_URI env var)
 */

"use strict";

require("module-alias/register");
require("dotenv").config();

const mongoose = require("mongoose");
const Role = require("../src/shared/models/Role");
const { ORG_ROLE_PERMISSIONS } = require("../src/rbac/orgPermissions");
const { deriveModuleMap, generateRoleSeed } = require("../src/rbac/permissionRegistry");

const FIX_MODE = process.argv.includes("--fix");

async function main() {
    const uri = process.env.MONGO_URI || process.env.MONGODB_URI;
    if (!uri) {
        console.error("❌ No MONGO_URI or MONGODB_URI in environment");
        process.exit(1);
    }

    console.log("🔗 Connecting to MongoDB...");
    await mongoose.connect(uri);
    console.log("✅ Connected\n");

    const moduleMap = deriveModuleMap();
    const roles = await Role.find({});

    console.log(`📊 Found ${roles.length} Role document(s) in database\n`);
    console.log("═".repeat(70));

    let totalMissing = 0;
    let totalFixed = 0;

    for (const role of roles) {
        const roleName = role.name;
        const perms = role.permissions || {};
        let roleMissing = 0;

        for (const [mod, actions] of Object.entries(moduleMap)) {
            for (const action of actions) {
                // Check if the field exists in the document
                const hasField = perms[mod] && (action in perms[mod]);
                if (!hasField) {
                    roleMissing++;

                    if (roleMissing === 1) {
                        console.log(`\n🔍 Role: "${roleName}" (org: ${role.organizationId})`);
                    }

                    console.log(`   ❌ Missing: ${mod}.${action}`);
                }
            }
        }

        if (roleMissing > 0) {
            totalMissing += roleMissing;

            if (FIX_MODE) {
                // Compute expected seed values
                const knownRole = ORG_ROLE_PERMISSIONS[roleName];
                if (knownRole) {
                    const seed = generateRoleSeed(roleName);
                    const update = {};

                    for (const [mod, actions] of Object.entries(moduleMap)) {
                        for (const action of actions) {
                            const hasField = perms[mod] && (action in perms[mod]);
                            if (!hasField) {
                                update[`permissions.${mod}.${action}`] = seed[mod][action];
                            }
                        }
                    }

                    if (Object.keys(update).length > 0) {
                        await Role.updateOne({ _id: role._id }, { $set: update });
                        console.log(`   ✅ Fixed ${Object.keys(update).length} field(s)`);
                        totalFixed += Object.keys(update).length;
                    }
                } else {
                    console.log(`   ⚠️  Custom role "${roleName}" — skipped (no SSOT seed)`);
                }
            }
        }
    }

    console.log("\n" + "═".repeat(70));

    if (totalMissing === 0) {
        console.log("\n✅ No drift detected — all Role documents are in sync\n");
    } else if (FIX_MODE) {
        console.log(`\n🔧 Fixed ${totalFixed} field(s) across ${roles.length} role(s)`);
        console.log(`⚠️  ${totalMissing - totalFixed} field(s) could not be auto-fixed (custom roles)\n`);
    } else {
        console.log(`\n🚨 ${totalMissing} missing field(s) detected`);
        console.log(`💡 Run with --fix to auto-repair: node scripts/checkPermissionDrift.js --fix\n`);
    }

    await mongoose.disconnect();
}

main().catch(err => {
    console.error("❌ Fatal error:", err.message);
    process.exit(1);
});
