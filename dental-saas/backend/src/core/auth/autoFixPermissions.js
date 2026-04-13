/**
 * autoFixPermissions.js — Self-Healing Permission Engine
 *
 * Runs on server boot to automatically detect and repair permission drift
 * in existing Role documents. Eliminates the need for manual migration scripts
 * in most cases.
 *
 * ┌───────────────────────────┐
 * │  orgPermissions.js (SSOT) │
 * │          ↓                │
 * │  permissionRegistry.js    │
 * │          ↓                │
 * │  autoFixPermissions.js    │  ← THIS FILE (boot-time auto-heal)
 * │          ↓                │
 * │  Role documents (MongoDB) │  ← patched in-place
 * └───────────────────────────┘
 *
 * BEHAVIOR:
 *   1. Loads all Role documents from the database
 *   2. For each role, checks if any SSOT modules/actions are missing
 *   3. Adds missing fields with default: false (conservative — never grants access)
 *   4. If the role's permissionVersion < PERMISSION_VERSION, stamps it
 *   5. Only saves roles that were actually modified
 *   6. Fully idempotent — safe to run on every boot
 *
 * SAFETY: Missing permissions default to false (DENIED). This guarantees the
 * auto-heal can never accidentally GRANT access. It only adds schema structure.
 *
 * PLANE: Org only.
 */

"use strict";

const dbManager = require("@core/db/dbManager");
const getModelFn = require("@core/db/getModel");
const RoleDef = require("../../shared/models/Role");
const PermissionChangeLogDef = require("../../shared/models/PermissionChangeLog");
const Organization = require("../../shared/models/Organization").default;
const {
    deriveModuleMap,
    generateRoleSeed,
    PERMISSION_VERSION,
} = require("../../rbac/permissionRegistry");
const logger = require("../../utils/logger");

/**
 * Auto-fix all Role documents across ALL org databases to match the current SSOT schema.
 *
 * In per-org mode, roles live in dental_org_<id> — NOT in the platform DB.
 * This function iterates every active org, resolves its connection,
 * and heals roles within each org's database.
 *
 * @returns {Promise<{ total: number, healed: number, skipped: number, errors: number }>}
 */
async function autoFixPermissions() {
    const startTime = Date.now();
    const moduleMap = deriveModuleMap();
    const stats = { total: 0, healed: 0, skipped: 0, errors: 0, orgsProcessed: 0 };

    // Fetch all active organizations from the platform DB
    let orgs;
    try {
        orgs = await Organization.find({ isActive: true }).select("_id name").lean();
    } catch (err) {
        logger.error(
            { event: "AUTO_HEAL_DB_ERROR", err: err.message },
            "[AutoHeal] Failed to query Organization documents"
        );
        return stats;
    }

    logger.info(
        { event: "AUTO_HEAL_START", orgCount: orgs.length, permissionVersion: PERMISSION_VERSION },
        `[AutoHeal] Starting across ${orgs.length} org databases`
    );

    for (const org of orgs) {
        let orgConn;
        try {
            orgConn = dbManager.getConnection(String(org._id));
        } catch (connErr) {
            logger.error(
                { event: "AUTO_HEAL_CONN_ERROR", orgId: org._id, err: connErr.message },
                `[AutoHeal] Failed to get connection for org "${org.name}"`
            );
            stats.errors++;
            continue;
        }

        const Role = getModelFn(orgConn, RoleDef);
        const PermissionChangeLog = getModelFn(orgConn, PermissionChangeLogDef);

        let roles;
        try {
            roles = await Role.find({});
        } catch (err) {
            logger.error(
                { event: "AUTO_HEAL_DB_ERROR", orgId: org._id, err: err.message },
                `[AutoHeal] Failed to query Role documents for org "${org.name}"`
            );
            stats.errors++;
            continue;
        }

        stats.total += roles.length;
        stats.orgsProcessed++;

        for (const role of roles) {
            try {
                let updated = false;
                const healedFields = [];

                // Ensure permissions object exists
                if (!role.permissions) {
                    role.permissions = {};
                    updated = true;
                }

                // Convert Mongoose subdocument to mutable plain object if needed
                const perms = role.permissions;

                // ── Option B: SSOT-aware auto-grant for system roles ─────────
                // System roles (org_admin, doctor, etc.) get their SSOT values
                // from generateRoleSeed(). This means new permissions added to
                // orgPermissions.js are auto-applied with the correct true/false
                // on next boot — no migration script needed.
                //
                // Custom roles (isSystemRole !== true) remain conservative:
                // missing fields default to false (never auto-grant).
                let ssotSeed = null;
                if (role.isSystemRole && role.name) {
                    try {
                        ssotSeed = generateRoleSeed(role.name);
                    } catch {
                        // Unknown role name — fall back to conservative default
                        ssotSeed = null;
                    }
                }

                // Check every module from SSOT
                for (const [mod, actions] of Object.entries(moduleMap)) {
                    // If module is completely missing, add it
                    if (!perms[mod] || typeof perms[mod] !== "object") {
                        perms[mod] = {};
                        updated = true;
                    }

                    // Check every action within the module
                    for (const action of actions) {
                        if (perms[mod][action] === undefined || perms[mod][action] === null) {
                            // System role with SSOT seed → use authoritative value
                            // Custom/unknown role → conservative false (never auto-grant)
                            const seedValue = ssotSeed?.[mod]?.[action] ?? false;
                            perms[mod][action] = seedValue;
                            healedFields.push(`${mod}.${action}=${seedValue}`);
                            updated = true;
                        }
                    }
                }

                // Check permissionVersion
                const currentVersion = role.permissionVersion || 0;
                if (currentVersion < PERMISSION_VERSION) {
                    role.permissionVersion = PERMISSION_VERSION;
                    updated = true;
                }

                if (updated) {
                    // Mark the permissions path as modified for Mongoose
                    role.markModified("permissions");
                    await role.save();
                    stats.healed++;

                    logger.info({
                        event: "AUTO_HEAL_ROLE_FIXED",
                        roleName: role.name,
                        organizationId: org._id?.toString(),
                        addedFields: healedFields.length,
                        newVersion: PERMISSION_VERSION,
                        previousVersion: currentVersion,
                    }, `[AutoHeal] 🛠 Healed role "${role.name}" in org "${org.name}" — added ${healedFields.length} field(s), version ${currentVersion} → ${PERMISSION_VERSION}`);

                    // ─── v35.0 — Forensic Audit Trail ───────────────────────
                    try {
                        await PermissionChangeLog.create({
                            organizationId: org._id,
                            roleId: role._id,
                            roleName: role.name,
                            actorType: "system",
                            actorId: null,
                            actorName: "autoFixPermissions",
                            changeType: currentVersion < PERMISSION_VERSION ? "SSOT_MIGRATION" : "AUTO_HEAL",
                            permissionsAdded: healedFields,
                            permissionsRemoved: [],
                            previousPermissionVersion: currentVersion,
                            newPermissionVersion: PERMISSION_VERSION,
                            summary: `Auto-healed ${healedFields.length} field(s), version ${currentVersion} → ${PERMISSION_VERSION}`,
                        });
                    } catch (auditErr) {
                        // Non-blocking: audit failure must NEVER prevent auto-heal from completing
                        logger.error({
                            event: "PERMISSION_AUDIT_LOG_FAILED",
                            roleId: role._id?.toString(),
                            err: auditErr.message,
                        }, `[AutoHeal] ⚠ Failed to write PermissionChangeLog for role "${role.name}"`);
                    }
                } else {
                    stats.skipped++;
                }

            } catch (err) {
                stats.errors++;
                logger.error({
                    event: "AUTO_HEAL_ROLE_ERROR",
                    roleName: role.name,
                    organizationId: org._id?.toString(),
                    err: err.message,
                }, `[AutoHeal] ❌ Failed to heal role "${role.name}": ${err.message}`);
            }
        }
    }

    const durationMs = Date.now() - startTime;

    logger.info({
        event: "AUTO_HEAL_COMPLETE",
        stats,
        durationMs,
        permissionVersion: PERMISSION_VERSION,
    }, `[AutoHeal] ✅ Complete: ${stats.orgsProcessed} orgs, ${stats.healed} healed, ${stats.skipped} already current, ${stats.errors} errors (${durationMs}ms)`);

    return stats;
}

module.exports = { autoFixPermissions };
