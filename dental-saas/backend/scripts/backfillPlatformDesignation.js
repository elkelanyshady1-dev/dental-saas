/**
 * backfillPlatformDesignation.js — One-Time Migration Script
 * Phase F.6 — Authority Bridge Backfill
 *
 * PURPOSE:
 * Sets `platformDesignation: "ORG_ADMIN"` on all existing organization admin
 * users who were provisioned before the Authority Bridge was implemented.
 *
 * SAFETY:
 *   - DRY_RUN mode by default (set DRY_RUN=false to commit)
 *   - Only targets users whose roleId references a system org_admin Role
 *   - Never overwrites existing designations
 *   - Logs every change for audit
 *
 * USAGE:
 *   # Dry run (preview):
 *   node scripts/backfillPlatformDesignation.js
 *
 *   # Commit:
 *   cross-env DRY_RUN=false node scripts/backfillPlatformDesignation.js
 *
 * PLANE: Platform (migration tool — not an API endpoint)
 */

"use strict";

require("module-alias/register");
require("dotenv").config();

const mongoose = require("mongoose");
const logger = require("@utils/logger");

// Models
const User = require("@shared/models/User");
const Role = require("@shared/models/Role");
const Organization = require("@shared/models/Organization");

const DRY_RUN = process.env.DRY_RUN !== "false";

async function run() {
    const mongoUri = process.env.MONGO_URI || process.env.MONGODB_URI;
    if (!mongoUri) {
        console.error("FATAL: MONGO_URI not set");
        process.exit(1);
    }

    await mongoose.connect(mongoUri);
    console.log("✅ Connected to MongoDB");
    console.log(`🔧 Mode: ${DRY_RUN ? "DRY RUN (preview only)" : "COMMIT (will modify data)"}\n`);

    // ── Step 1: Find all system org_admin roles across all orgs ──────────
    const adminRoles = await Role.find({
        name: "org_admin",
        isSystemRole: true,
    }).lean();

    console.log(`📋 Found ${adminRoles.length} org_admin system roles across organizations\n`);

    if (adminRoles.length === 0) {
        console.log("⚠️  No org_admin roles found. Nothing to backfill.");
        await mongoose.disconnect();
        process.exit(0);
    }

    const adminRoleIds = adminRoles.map(r => r._id);

    // ── Step 2: Find users with org_admin role who lack designation ──────
    const targetUsers = await User.find({
        roleId: { $in: adminRoleIds },
        $or: [
            { platformDesignation: null },
            { platformDesignation: { $exists: false } },
        ],
    }).populate("roleId", "name organizationId").lean();

    console.log(`👤 Found ${targetUsers.length} admin users needing platformDesignation backfill\n`);

    if (targetUsers.length === 0) {
        console.log("✅ All admin users already have platformDesignation set. Nothing to do.");
        await mongoose.disconnect();
        process.exit(0);
    }

    // ── Step 3: Preview or commit changes ────────────────────────────────
    let updated = 0;
    let skipped = 0;
    let errors = 0;

    for (const user of targetUsers) {
        const orgId = user.organizationId?.toString() || "unknown";
        const userId = user._id.toString();
        const email = user.email || "no-email";
        const roleName = user.roleId?.name || "unknown";

        // Sanity check: only backfill org_admin users
        if (roleName !== "org_admin") {
            console.log(`  ⏭  SKIP ${email} (${userId}) — role is "${roleName}", not org_admin`);
            skipped++;
            continue;
        }

        if (DRY_RUN) {
            console.log(`  📝 WOULD SET platformDesignation=ORG_ADMIN for ${email} (${userId}) org=${orgId}`);
            updated++;
        } else {
            try {
                // @rls-platform-service — migration script, no org-scoped req context
                await User.updateOne(
                    { _id: user._id },
                    { $set: { platformDesignation: "ORG_ADMIN" } }
                );
                console.log(`  ✅ SET platformDesignation=ORG_ADMIN for ${email} (${userId}) org=${orgId}`);
                updated++;
            } catch (err) {
                console.error(`  ❌ FAILED for ${email} (${userId}): ${err.message}`);
                errors++;
            }
        }
    }

    // ── Summary ──────────────────────────────────────────────────────────
    console.log("\n══════════════════════════════════════════");
    console.log("  BACKFILL SUMMARY");
    console.log("══════════════════════════════════════════");
    console.log(`  Mode:     ${DRY_RUN ? "DRY RUN" : "COMMIT"}`);
    console.log(`  Total:    ${targetUsers.length}`);
    console.log(`  Updated:  ${updated}`);
    console.log(`  Skipped:  ${skipped}`);
    console.log(`  Errors:   ${errors}`);
    console.log("══════════════════════════════════════════");

    if (DRY_RUN && updated > 0) {
        console.log("\n💡 To commit changes, run:");
        console.log("   cross-env DRY_RUN=false node scripts/backfillPlatformDesignation.js\n");
    }

    await mongoose.disconnect();
    process.exit(errors > 0 ? 1 : 0);
}

run().catch(err => {
    console.error("FATAL:", err.message);
    process.exit(1);
});
