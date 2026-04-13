/**
 * backfillOrthodonticPermissions.js
 * Migration: Ensure all org_admin and doctor roles have orthodontic permissions
 *
 * PROBLEM: Clinical workflows (visit, snapshot, draft, assistant) were blocked
 * because existing Role documents in org databases were seeded before
 * orthodontics.manage, tads.read, sequence.read etc. were added to the SSOT.
 *
 * SOLUTION: For each org database, find the org_admin/doctor roles and
 * $set the orthodontic permissions from the canonical SSOT.
 *
 * RUN ONCE — idempotent (uses $set, overwrites nothing else).
 *
 * Usage:
 *   node scripts/migrations/backfillOrthodonticPermissions.js
 *
 * Prerequisites:
 *   MONGO_URI environment variable (or .env file at project root)
 *   Must be able to reach all org databases
 */

"use strict";

require("dotenv").config();
const mongoose = require("mongoose");
const { ORG_ROLE_PERMISSIONS, P } = require("../../src/rbac/orgPermissions");
const { flattenPermissionsToObject } = require("../../src/rbac/permissionRegistry");
const Organization = require("../../src/shared/models/Organization");
const dbManager = require("../../src/core/db/dbManager");

const ROLES_TO_FIX = ["org_admin", "doctor"];

// Extract only orthodontic-related permissions from the SSOT for targeted $set
const ORTHO_PERMISSIONS_FLAT = {
    "orthodontics.read": true,
    "orthodontics.create": true,
    "orthodontics.update": true,
    "orthodontics.delete": true,
    "orthodontics.manage": true,
    "orthodontics.settings": true,
    "bonding.read": true,
    "bonding.manage": true,
    "bonding.settings": true,
    "tads.read": true,
    "tads.manage": true,
    "tads.settings": true,
    "sequence.read": true,
    "sequence.manage": true,
};

// Build nested permissions object for $set: { "permissions.orthodontics": { read: true, ... } }
function buildNestedOrthoPerms(flatPerms) {
    const nested = {};
    for (const [key, val] of Object.entries(flatPerms)) {
        const [module, action] = key.split(".");
        if (!nested[module]) nested[module] = {};
        nested[module][action] = val;
    }
    return nested;
}

const NESTED_ORTHO_PERMS = buildNestedOrthoPerms(ORTHO_PERMISSIONS_FLAT);

async function run() {
    await mongoose.connect(process.env.MONGO_URI);
    console.log("Connected to platform DB");

    const orgs = await Organization.find({}).select("_id name slug").lean();
    console.log(`Found ${orgs.length} organizations to process`);

    let fixed = 0;
    let skipped = 0;
    let errors = 0;

    for (const org of orgs) {
        try {
            const orgConn = await dbManager.getConnectionAsync(org._id.toString());

            try {
                const Role = orgConn.model("Role", new mongoose.Schema({
                    name: String,
                    organizationId: mongoose.Schema.Types.ObjectId,
                    isSystemRole: Boolean,
                    permissions: mongoose.Schema.Types.Mixed,
                }, { collection: "roles" }));

                for (const roleName of ROLES_TO_FIX) {
                    const result = await Role.updateOne(
                        { name: roleName },
                        { $set: NESTED_ORTHO_PERMS }
                    );

                    if (result.modifiedCount > 0) {
                        console.log(`  FIXED ${org.name || org._id} — ${roleName}: ortho perms backfilled`);
                        fixed++;
                    } else {
                        console.log(`  SKIP  ${org.name || org._id} — ${roleName}: already up to date`);
                        skipped++;
                    }
                }
            } finally {
                dbManager.releaseConnection(org._id.toString());
            }
        } catch (err) {
            console.error(`  ERROR ${org.name || org._id}: ${err.message}`);
            errors++;
        }
    }

    console.log(`\nDone. Fixed: ${fixed}, Skipped: ${skipped}, Errors: ${errors}`);
    await mongoose.disconnect();
}

run().catch((err) => {
    console.error("Migration failed:", err);
    process.exit(1);
});