/**
 * devObservabilityController.js — RBAC Observability & Debugging (Dev Only)
 *
 * PURPOSE
 * ───────
 * Read-only inspection endpoints for debugging the RBAC pipeline. All handlers
 * REUSE the existing permission resolvers — they never re-derive permissions.
 * This file does not introduce a second source of truth.
 *
 * PIPELINE REUSED
 * ───────────────
 *   1. Role.permissions (nested) — SSOT stored on the Role doc
 *   2. resolvePermissionSet({ rolePermissions, planModules })   (accessResolver)
 *   3. resolveAuthority({ orgPermissionSet, platformDesignation }) (authorityBridge)
 *   4. flattenPermissions(nested)                              (permissionRegistry)
 *
 * SAFETY
 * ──────
 *   - Mounted only when NODE_ENV !== "production"
 *   - Route layer requires platformProtect + superAdminOnly
 *   - No mutations. No writes. Reads only.
 *
 * PLANE: Platform (dev-only sub-plane under /api/platform/dev)
 */

"use strict";

const crypto = require("crypto");
const dbManager = require("@core/db/dbManager");
const getModel = require("@core/db/getModel");
const UserDef = require("@shared/models/User");
const RoleDef = require("@shared/models/Role");
const AuditLogDef = require("@shared/models/AuditLog");

const { resolvePermissionSet } = require("@rbac/accessResolver");
const { flattenPermissions, generatePermissionKeys } = require("@rbac/permissionRegistry");
const { resolveAuthority } = require("@core/security/authorityBridge");
const logger = require("@utils/logger");

// ─── Org connection resolution ──────────────────────────────────────────────

function getOrgModels(organizationId) {
    const conn = dbManager.getConnection(String(organizationId));
    if (conn.name === "saasdental") {
        throw new Error(
            `[devObservability] RLS VIOLATION: org connection resolved on platform DB ` +
            `for org=${organizationId}.`
        );
    }
    return {
        User: getModel(conn, UserDef),
        Role: getModel(conn, RoleDef),
        AuditLog: getModel(conn, AuditLogDef),
        conn,
    };
}

// ─── Payload caps ───────────────────────────────────────────────────────────
// Hard cap on any per-array field returned by diff/timeline endpoints so a
// pathological role doc (hundreds of perms) cannot blow up dev tooling.
const MAX_ITEMS = 200;

/**
 * Wrap an array with a truncation indicator. If the array exceeds MAX_ITEMS,
 * only the first MAX_ITEMS are returned along with truncated=true and the
 * full original count.
 */
function cap(arr) {
    const total = arr.length;
    if (total > MAX_ITEMS) {
        return { items: arr.slice(0, MAX_ITEMS), truncated: true, total };
    }
    return { items: arr, truncated: false, total };
}

/**
 * Stable SHA-1 hash of a permission set — order-independent, so two sets with
 * identical members always produce the same hash. Used by callers to detect
 * "did my effective permissions change" without comparing full arrays.
 */
function permissionSetHash(set) {
    const sorted = [...set].sort().join(",");
    return crypto.createHash("sha1").update(sorted).digest("hex");
}

// ─── Nested-vs-flat diff helpers ────────────────────────────────────────────

/**
 * Enumerate "module.action" keys from a nested Role.permissions object where
 * the leaf value is strictly true.
 */
function nestedToFlatKeys(nested) {
    const keys = new Set();
    if (!nested || typeof nested !== "object") return keys;
    const plain = typeof nested.toJSON === "function" ? nested.toJSON() : nested;
    for (const mod of Object.keys(plain)) {
        const sub = plain[mod];
        if (!sub || typeof sub !== "object") continue;
        for (const action of Object.keys(sub)) {
            if (sub[action] === true) keys.add(`${mod}.${action}`);
        }
    }
    return keys;
}

// ─── GET /api/platform/dev/permissions/diff/:userId ─────────────────────────
// Query: ?organizationId=<id>   (required — users live in per-org DBs)
//
// Response shape:
//   {
//     role, platformDesignation,
//     nested: <role.permissions object>,
//     resolved: [<flat permission keys granted by the full pipeline>],
//     diff: {
//       missing: [<role-doc grants that did NOT survive the pipeline>],
//       extra:   [<pipeline grants that are NOT present in role doc — e.g. ORG_ADMIN escalation>]
//     },
//     escalation: { active, source, designation }
//   }

exports.getPermissionDiff = async (req, res) => {
    try {
        const { userId } = req.params;
        const { organizationId } = req.query;

        if (!organizationId) {
            return res.status(400).json({
                success: false,
                error: {
                    code: "ORG_ID_REQUIRED",
                    message: "organizationId query parameter is required — users live in per-org DBs",
                },
            });
        }

        const { User, Role } = getOrgModels(organizationId);

        const user = await User.findById(userId).lean();
        if (!user) {
            return res.status(404).json({
                success: false,
                error: { code: "USER_NOT_FOUND", message: "User not found in organization DB" },
            });
        }

        const role = user.roleId
            ? await Role.findById(user.roleId).lean()
            : null;

        const nestedRolePermissions = role?.permissions || {};

        // Step 1: RBAC × Entitlement resolution (existing resolver).
        // planModules is optional — default to "entitled" when omitted.
        const orgPermissionSet = resolvePermissionSet({
            rolePermissions: nestedRolePermissions,
            planModules: undefined,
        });

        // Step 2: Platform authority escalation (existing resolver).
        const authority = resolveAuthority({
            orgPermissionSet,
            platformDesignation: user.platformDesignation,
            userId: String(user._id),
            organizationId: String(organizationId),
        });

        // Flatten nested role doc to Set of keys for comparison.
        const nestedFlat = nestedToFlatKeys(nestedRolePermissions);
        const resolvedFlat = authority.effectivePermissions;

        const missing = [...nestedFlat].filter((k) => !resolvedFlat.has(k)).sort();
        const extra = [...resolvedFlat].filter((k) => !nestedFlat.has(k)).sort();
        const resolvedSorted = [...resolvedFlat].sort();

        return res.json({
            success: true,
            data: {
                userId: String(user._id),
                organizationId: String(organizationId),
                role: role?.name || null,
                roleId: role?._id ? String(role._id) : null,
                permissionVersion: role?.permissionVersion ?? null,
                platformDesignation: user.platformDesignation || null,
                permissionHash: permissionSetHash(resolvedFlat),
                nested: nestedRolePermissions,
                resolved: cap(resolvedSorted),
                diff: {
                    missing: cap(missing),
                    extra: cap(extra),
                },
                escalation: {
                    active: !!authority.escalation,
                    source: authority.source,
                    designation: authority.designation,
                },
                counts: {
                    nested: nestedFlat.size,
                    resolved: resolvedFlat.size,
                    missing: missing.length,
                    extra: extra.length,
                    ssotKeys: generatePermissionKeys().length,
                },
            },
        });
    } catch (err) {
        logger.error({
            event: "DEV_PERMISSION_DIFF_FAILURE",
            err: err.message,
            stack: err.stack,
        }, "[devObservability] permission diff failed");
        return res.status(500).json({
            success: false,
            error: { code: "DIFF_FAILURE", message: err.message },
        });
    }
};

// ─── GET /api/platform/dev/audit/permissions ────────────────────────────────
// Query: organizationId (required), userId (optional), from (ISO), to (ISO)
//
// Reconstructs a permission-relevant timeline from the EXISTING AuditLog
// collection — NO new write path, NO per-request logging.
//
// The analyzer filters for events that can change a user's effective
// permission set:
//   - role CRUD    (entity=roles, action=CREATE|UPDATE|DELETE)
//   - user role reassignment (entity=users or entity=roles, action=ROLE_ASSIGNED)
// If userId is provided, the timeline is narrowed to events that touch that
// user or the role they are currently assigned to.

const PERMISSION_AFFECTING_ENTITIES = new Set(["roles", "users"]);
const PERMISSION_AFFECTING_ACTIONS = new Set([
    "CREATE",
    "UPDATE",
    "DELETE",
    "ROLE_ASSIGNED",
    "ROLE_UPDATED",
    "ROLE_DELETED",
    "ROLE_CREATED",
    "PERMISSIONS_CHANGED",
    "USER_ROLE_ASSIGNED",
    "TOKEN_VERSION_BUMP",
]);

exports.getPermissionAuditTimeline = async (req, res) => {
    try {
        const { organizationId, userId, from, to } = req.query;

        if (!organizationId) {
            return res.status(400).json({
                success: false,
                error: {
                    code: "ORG_ID_REQUIRED",
                    message: "organizationId query parameter is required",
                },
            });
        }

        const { AuditLog, User, Role } = getOrgModels(organizationId);

        // ── Build query ────────────────────────────────────────────────
        const q = {
            $or: [
                { entity: { $in: [...PERMISSION_AFFECTING_ENTITIES] } },
                { action: { $in: [...PERMISSION_AFFECTING_ACTIONS] } },
            ],
        };

        if (from || to) {
            q.createdAt = {};
            if (from) q.createdAt.$gte = new Date(from);
            if (to) q.createdAt.$lte = new Date(to);
        }

        // If scoped to a specific user, include events where the user is
        // the subject (entityId == userId), OR events touching their current
        // role.
        if (userId) {
            const user = await User.findById(userId).lean();
            if (!user) {
                return res.status(404).json({
                    success: false,
                    error: { code: "USER_NOT_FOUND", message: "User not found" },
                });
            }
            const roleId = user.roleId ? String(user.roleId) : null;
            q.$and = [
                {
                    $or: [
                        { entityId: user._id },
                        { userId: user._id },
                        { actorId: user._id },
                        ...(roleId ? [{ entityId: user.roleId }] : []),
                    ],
                },
            ];
        }

        const events = await AuditLog.find(q)
            .sort({ createdAt: 1 })
            .limit(500)
            .lean();

        // ── Reconstruct timeline snapshots ──────────────────────────────
        // For each event, compute the CURRENT role permission set when the
        // event fired. We don't have historical role state (AuditLog is the
        // event log, not a role version log) — so each snapshot reflects
        // "what resolvePermissionSet would return against the role doc THIS
        // event was about". This is a best-effort reconstruction and is
        // clearly labeled as such.
        const timeline = [];
        for (const ev of events) {
            let snapshot = null;
            try {
                // Attempt to resolve a meaningful snapshot per event.
                if (ev.entity === "roles" && ev.entityId) {
                    const role = await Role.findById(ev.entityId).lean();
                    if (role) {
                        const set = resolvePermissionSet({
                            rolePermissions: role.permissions,
                            planModules: undefined,
                        });
                        const sorted = [...set].sort();
                        snapshot = {
                            // Snapshots reconstruct against the CURRENT role
                            // doc, not a historical version — the AuditLog
                            // doesn't persist role shapes. Honesty flag for
                            // forensic analysts.
                            snapshotSource: "reconstructed",
                            confidence: "approximate",
                            roleId: String(role._id),
                            roleName: role.name,
                            permissionCount: set.size,
                            permissionHash: permissionSetHash(set),
                            permissions: cap(sorted),
                        };
                    }
                } else if (ev.entity === "users" && (ev.entityId || ev.userId)) {
                    const u = await User.findById(ev.entityId || ev.userId).lean();
                    if (u && u.roleId) {
                        const role = await Role.findById(u.roleId).lean();
                        if (role) {
                            const orgSet = resolvePermissionSet({
                                rolePermissions: role.permissions,
                                planModules: undefined,
                            });
                            const authority = resolveAuthority({
                                orgPermissionSet: orgSet,
                                platformDesignation: u.platformDesignation,
                            });
                            const sorted = [...authority.effectivePermissions].sort();
                            snapshot = {
                                snapshotSource: "reconstructed",
                                confidence: "approximate",
                                userId: String(u._id),
                                roleId: String(role._id),
                                roleName: role.name,
                                platformDesignation: u.platformDesignation || null,
                                permissionCount: authority.effectivePermissions.size,
                                permissionHash: permissionSetHash(authority.effectivePermissions),
                                permissions: cap(sorted),
                            };
                        }
                    }
                }
            } catch (_) {
                // Snapshot failures should not poison the whole timeline.
                snapshot = null;
            }

            timeline.push({
                timestamp: ev.createdAt,
                action: ev.action,
                entity: ev.entity,
                entityId: ev.entityId ? String(ev.entityId) : null,
                actorId: ev.actorId ? String(ev.actorId) : null,
                actorRole: ev.actorRole || null,
                actorName: [ev.actorFirstName, ev.actorLastName].filter(Boolean).join(" ") || null,
                requestId: ev.requestId || null,
                description: ev.description || null,
                snapshot, // best-effort: reflects CURRENT role state at query time
            });
        }

        // ── Compute per-event diffs against the previous snapshot ──────
        // snapshot.permissions is now cap()-wrapped — diff on .items. If a
        // snapshot is truncated, flag the diff as partial so downstream tools
        // don't mistake "missing from first 200" for "removed from role".
        for (let i = 1; i < timeline.length; i++) {
            const prev = timeline[i - 1].snapshot;
            const curr = timeline[i].snapshot;
            if (!prev?.permissions?.items || !curr?.permissions?.items) continue;
            const prevSet = new Set(prev.permissions.items);
            const currSet = new Set(curr.permissions.items);
            const added = [...currSet].filter((k) => !prevSet.has(k)).sort();
            const removed = [...prevSet].filter((k) => !currSet.has(k)).sort();
            timeline[i].diff = {
                added: cap(added),
                removed: cap(removed),
                partial: !!(prev.permissions.truncated || curr.permissions.truncated),
            };
        }

        return res.json({
            success: true,
            data: {
                organizationId: String(organizationId),
                userId: userId ? String(userId) : null,
                range: { from: from || null, to: to || null },
                eventCount: timeline.length,
                note:
                    "Snapshots reflect CURRENT role documents at query time — " +
                    "AuditLog does not persist historical role shapes. Use this " +
                    "as a chronological index of change-events, not a time-machine.",
                timeline,
            },
        });
    } catch (err) {
        logger.error({
            event: "DEV_PERMISSION_AUDIT_FAILURE",
            err: err.message,
            stack: err.stack,
        }, "[devObservability] audit timeline failed");
        return res.status(500).json({
            success: false,
            error: { code: "AUDIT_FAILURE", message: err.message },
        });
    }
};
