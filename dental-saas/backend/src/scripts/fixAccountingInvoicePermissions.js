/**
 * fixAccountingInvoicePermissions.js — One-shot Permission Re-Sync Migration
 *
 * PROBLEM:
 *   autoFixPermissions() (boot-time auto-heal) adds missing permission fields
 *   with `default: false` (conservative — never auto-grants access).
 *   For existing orgs created BEFORE accounting/invoices were added to
 *   orgPermissions.js, the Role documents now have:
 *     org_admin.permissions.accounting.read = false   ← should be true
 *     org_admin.permissions.invoices.read   = false   ← should be true
 *
 * FIX:
 *   Re-apply the FULL SSOT-derived permission seed for every system role
 *   across all org databases. Uses generateRoleSeed() as the single source
 *   of truth — never hardcodes permission values.
 *
 *   For each module.action, checks if the SSOT says the role should have
 *   `true` but the DB has `false`. Flips only those fields. Leaves
 *   custom/false entries for non-system roles untouched.
 *
 * SAFETY:
 *   - Only touches isSystemRole === true documents (org_admin, doctor, etc.)
 *   - Only promotes false → true (never demotes true → false)
 *   - Fully idempotent
 *   - Logs every change with before/after state
 *   - Bumps permissionVersion for auto-heal tracking (no longer in JWT since Phase 5)
 *
 * USAGE:
 *   node src/scripts/fixAccountingInvoicePermissions.js
 *
 * PLANE: Org only.
 */

"use strict";

// ── Bootstrap module aliases (mirrors server.js) ─────────────────────────────
const path = require("path");
const moduleAlias = require("module-alias");

moduleAlias.addAliases({
    "@core":        path.join(__dirname, "../../src/core"),
    "@middleware":  path.join(__dirname, "../../src/middleware"),
    "@rbac":        path.join(__dirname, "../../src/rbac"),
    "@services":    path.join(__dirname, "../../src/services"),
    "@utils":       path.join(__dirname, "../../src/utils"),
    "@shared":      path.join(__dirname, "../../src/shared"),
    "@infra":       path.join(__dirname, "../../src/infrastructure"),
});

// ── Deps ─────────────────────────────────────────────────────────────────────
require("dotenv").config({ path: path.join(__dirname, "../../.env") });

const mongoose = require("mongoose");
const dbManager = require("@core/db/dbManager");
const getModel  = require("@core/db/getModel");
const RoleDef   = require("../shared/models/Role");
const Organization = require("../shared/models/Organization").default;
const { ORG_ROLES }           = require("../rbac/orgPermissions");
const { generateRoleSeed, PERMISSION_VERSION } = require("../rbac/permissionRegistry");

// ── Connect ──────────────────────────────────────────────────────────────────
async function connect() {
    const uri = process.env.MONGODB_URI;
    if (!uri) throw new Error("MONGODB_URI is not set in .env");
    await mongoose.connect(uri);
    console.log("[Migration] Connected to platform DB");
}

// ── Core migration ────────────────────────────────────────────────────────────
async function run() {
    await connect();

    // Build SSOT seeds for all system roles once
    const seeds = {};
    for (const roleName of ORG_ROLES) {
        seeds[roleName] = generateRoleSeed(roleName);
    }

    const stats = {
        orgsProcessed: 0,
        rolesScanned: 0,
        rolesPatched: 0,
        fieldsPromoted: 0,
        errors: 0,
    };

    // Fetch all active orgs from platform DB
    const orgs = await Organization.find({ isActive: true }).select("_id name").lean();
    console.log(`[Migration] Found ${orgs.length} active organization(s)`);

    for (const org of orgs) {
        let orgConn;
        try {
            orgConn = dbManager.getConnection(String(org._id));
        } catch (err) {
            console.error(`[Migration] ❌ Could not get connection for org "${org.name}": ${err.message}`);
            stats.errors++;
            continue;
        }

        const Role = getModel(orgConn, RoleDef);
        let roles;

        try {
            roles = await Role.find({ isSystemRole: true });
        } catch (err) {
            console.error(`[Migration] ❌ Could not query roles for org "${org.name}": ${err.message}`);
            stats.errors++;
            continue;
        }

        stats.orgsProcessed++;
        stats.rolesScanned += roles.length;

        for (const role of roles) {
            const seed = seeds[role.name];
            if (!seed) {
                // Custom or unknown role — skip entirely
                continue;
            }

            const promoted = [];

            // Ensure permissions object exists
            if (!role.permissions) {
                role.permissions = {};
            }

            // Check every module.action in the SSOT seed
            for (const [mod, actions] of Object.entries(seed)) {
                if (!role.permissions[mod] || typeof role.permissions[mod] !== "object") {
                    role.permissions[mod] = {};
                }

                for (const [action, shouldBeTrue] of Object.entries(actions)) {
                    // Only promote false → true (never demote)
                    if (shouldBeTrue === true && role.permissions[mod][action] !== true) {
                        const before = role.permissions[mod][action];
                        role.permissions[mod][action] = true;
                        promoted.push(`${mod}.${action} (was ${before})`);
                    }
                }
            }

            if (promoted.length > 0) {
                // Bump permissionVersion to invalidate stale tokens
                const prevVersion = role.permissionVersion || 0;
                role.permissionVersion = Math.max(prevVersion + 1, PERMISSION_VERSION);

                role.markModified("permissions");

                try {
                    await role.save();
                    stats.rolesPatched++;
                    stats.fieldsPromoted += promoted.length;

                    console.log(
                        `[Migration] ✅ Patched role "${role.name}" in org "${org.name}"\n` +
                        `             Promoted: ${promoted.join(", ")}\n` +
                        `             permissionVersion: ${prevVersion} → ${role.permissionVersion}`
                    );
                } catch (saveErr) {
                    console.error(`[Migration] ❌ Save failed for role "${role.name}" in org "${org.name}": ${saveErr.message}`);
                    stats.errors++;
                }
            } else {
                console.log(`[Migration] ✓  Role "${role.name}" in org "${org.name}" — already correct, no changes`);
            }
        }
    }

    console.log("\n[Migration] ══════════════════════════════════════");
    console.log(`[Migration] Complete`);
    console.log(`[Migration]   Orgs processed : ${stats.orgsProcessed}`);
    console.log(`[Migration]   Roles scanned  : ${stats.rolesScanned}`);
    console.log(`[Migration]   Roles patched  : ${stats.rolesPatched}`);
    console.log(`[Migration]   Fields promoted: ${stats.fieldsPromoted}`);
    console.log(`[Migration]   Errors         : ${stats.errors}`);
    console.log("[Migration] ══════════════════════════════════════");

    if (stats.rolesPatched > 0) {
        console.log("\nℹ️  Role documents updated. Changes take effect on next token refresh (≤15 min).");
        console.log("   Phase 5: permissionVersion no longer in JWT — no forced re-login required.");
    }

    await mongoose.disconnect();
    process.exit(stats.errors > 0 ? 1 : 0);
}

run().catch((err) => {
    console.error("[Migration] Fatal error:", err);
    process.exit(1);
});
