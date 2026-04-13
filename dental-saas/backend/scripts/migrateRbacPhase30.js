/**
 * migrateRbacPhase30.js — Phase 30: RBAC Simplification Migration
 *
 * Migrates existing org Role documents from per-engine permissions
 * to the new domain-level simplification:
 *   orthodontics.full → doctor, org_admin
 *   orthodontics.read → assistant, lab_technician
 *
 * WHAT IT DOES:
 *   1. Connects to ALL per-org databases (dental_org_<orgId>)
 *   2. For each org, updates each system role's permissions object
 *   3. Removes all granular engine perms from doctor/org_admin
 *   4. Adds orthodontics.full = true to doctor/org_admin
 *   5. Removes ORTHO_MANAGE + engine perms from assistant/lab_technician
 *   6. Adds orthodontics.read = true to assistant/lab_technician
 *   7. Bumps permissionVersion to 8 on every updated role
 *
 * SAFE: Idempotent — re-running has no harmful effect.
 * ROLLBACK: See step 8 prefix — no data is deleted, only permission flags changed.
 *
 * RUN: node backend/scripts/migrateRbacPhase30.js
 */

"use strict";

const mongoose = require("mongoose");
require("dotenv").config({ path: require("path").resolve(__dirname, "../.env") });

const PLATFORM_URI = process.env.MONGODB_URI;
const ORG_DB_PREFIX = process.env.ORG_DB_PREFIX || "dental_org_";

// ─── Permission changes ───────────────────────────────────────────────────────

// Fields to REMOVE from full-access roles (doctor, org_admin)
const FULL_ACCESS_REMOVALS = {
    "orthodontics.create":   { mod: "orthodontics", action: "create" },
    "orthodontics.update":   { mod: "orthodontics", action: "update" },
    "orthodontics.delete":   { mod: "orthodontics", action: "delete" },
    "orthodontics.manage":   { mod: "orthodontics", action: "manage" },
    "orthodontics.settings": { mod: "orthodontics", action: "settings" },
    "bonding.read":          { mod: "bonding",       action: "read" },
    "bonding.manage":        { mod: "bonding",       action: "manage" },
    "bonding.settings":      { mod: "bonding",       action: "settings" },
    "tads.read":             { mod: "tads",          action: "read" },
    "tads.manage":           { mod: "tads",          action: "manage" },
    "tads.settings":         { mod: "tads",          action: "settings" },
    "sequence.read":         { mod: "sequence",      action: "read" },
    "sequence.manage":       { mod: "sequence",      action: "manage" },
};

// Field to ADD to full-access roles
const FULL_ACCESS_ADD = { mod: "orthodontics", action: "full", value: true };

// Fields to REMOVE from read-only roles (assistant, lab_technician)
const READ_ACCESS_REMOVALS = {
    "orthodontics.read":     { mod: "orthodontics", action: "read" },
    "orthodontics.update":   { mod: "orthodontics", action: "update" },
    "orthodontics.manage":   { mod: "orthodontics", action: "manage" },
    "bonding.read":          { mod: "bonding",       action: "read" },
    "tads.read":             { mod: "tads",          action: "read" },
    "sequence.read":         { mod: "sequence",      action: "read" },
    "sequence.manage":       { mod: "sequence",      action: "manage" },
};

// Field to ADD to read-only roles
const READ_ACCESS_ADD = { mod: "orthodontics", action: "full", value: false }; // orthodontics.full = false
// orthodontics.read = true via ORTHO_READ
const READ_ACCESS_ADD_READ = { mod: "orthodontics", action: "read", value: true };

const FULL_ACCESS_ROLES = ["org_admin", "doctor"];
const READ_ACCESS_ROLES = ["assistant", "lab_technician"];

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
    console.log("[migrateRbacPhase30] Connecting to platform DB...");
    const platformConn = await mongoose.createConnection(PLATFORM_URI).asPromise();

    // Get all org IDs from the platform Organization collection
    const Organization = platformConn.model(
        "Organization",
        new mongoose.Schema({ _id: mongoose.Schema.Types.ObjectId }),
        "organizations"
    );

    const orgs = await Organization.find({}, "_id").lean();
    console.log(`[migrateRbacPhase30] Found ${orgs.length} organizations.`);

    let totalUpdated = 0;
    let totalErrors  = 0;

    for (const org of orgs) {
        const orgId  = org._id.toString();
        const dbName = `${ORG_DB_PREFIX}${orgId}`;
        let orgConn;

        try {
            orgConn = await mongoose.createConnection(
                PLATFORM_URI.replace(/\/[^/?]+(\?|$)/, `/${dbName}$1`)
            ).asPromise();

            const Role = orgConn.model(
                "Role",
                new mongoose.Schema({}, { strict: false }),
                "roles"
            );

            const roles = await Role.find({ name: { $in: [...FULL_ACCESS_ROLES, ...READ_ACCESS_ROLES] } }).lean();

            for (const role of roles) {
                const isFullAccess = FULL_ACCESS_ROLES.includes(role.name);
                const isReadAccess = READ_ACCESS_ROLES.includes(role.name);
                const $set   = {};
                const $unset = {};

                if (isFullAccess) {
                    // Remove granular engine permissions
                    for (const { mod, action } of Object.values(FULL_ACCESS_REMOVALS)) {
                        if (role.permissions?.[mod]?.[action] !== undefined) {
                            $unset[`permissions.${mod}.${action}`] = "";
                        }
                    }
                    // Add orthodontics.full = true
                    $set[`permissions.${FULL_ACCESS_ADD.mod}.${FULL_ACCESS_ADD.action}`] = FULL_ACCESS_ADD.value;
                }

                if (isReadAccess) {
                    // Remove granular engine permissions
                    for (const { mod, action } of Object.values(READ_ACCESS_REMOVALS)) {
                        if (role.permissions?.[mod]?.[action] !== undefined) {
                            $unset[`permissions.${mod}.${action}`] = "";
                        }
                    }
                    // Set orthodontics.full = false  +  orthodontics.read = true
                    $set[`permissions.${READ_ACCESS_ADD.mod}.${READ_ACCESS_ADD.action}`] = READ_ACCESS_ADD.value;
                    $set[`permissions.${READ_ACCESS_ADD_READ.mod}.${READ_ACCESS_ADD_READ.action}`] = READ_ACCESS_ADD_READ.value;
                }

                // Always bump version
                $set.permissionVersion = 8;

                const update = {};
                if (Object.keys($set).length)   update.$set   = $set;
                if (Object.keys($unset).length)  update.$unset = $unset;

                if (Object.keys(update).length) {
                    await Role.updateOne({ _id: role._id }, update);
                    totalUpdated++;
                    console.log(`  ✅ ${dbName} — ${role.name} → v8`);
                } else {
                    console.log(`  ⏭  ${dbName} — ${role.name} already migrated`);
                }
            }
        } catch (err) {
            console.error(`  ❌ ${dbName} — ${err.message}`);
            totalErrors++;
        } finally {
            if (orgConn) await orgConn.close();
        }
    }

    await platformConn.close();

    console.log(`\n[migrateRbacPhase30] Done.`);
    console.log(`  Updated: ${totalUpdated} role documents`);
    console.log(`  Errors:  ${totalErrors}`);

    if (totalErrors > 0) process.exit(1);
}

main().catch(err => {
    console.error("[migrateRbacPhase30] Fatal:", err);
    process.exit(1);
});
