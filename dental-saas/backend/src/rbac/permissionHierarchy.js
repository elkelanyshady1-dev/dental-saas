/**
 * permissionHierarchy.js — Permission Inheritance Hierarchy
 *
 * Defines which permissions are IMPLICITLY GRANTED by higher-level permissions.
 *
 * ARCHITECTURE (Phase 30 FINAL):
 *   The orthodontics domain now uses a flat two-permission model.
 *   Controllers call authorize(req, "orthodontics.full") or authorize(req, "orthodontics.read")
 *   directly. There is NO engine-level resolution at runtime.
 *
 *   Removed entries (Phase 30 FINAL):
 *     - orthodontics.full → [bonding.manage, tads.manage, sequence.manage, ...]
 *     - orthodontics.manage → [create, update, read, delete]
 *     - orthodontics.write / orthodontics.settings
 *     - bonding.manage/read/settings, tads.manage/read/settings, sequence.manage/read
 *
 *   These were required when controllers used granular engine permissions.
 *   They are no longer needed — ZERO hierarchy lookup needed for orthodontics.
 *
 * PLANE: Org only. Do NOT import in platform-plane contexts.
 */

"use strict";

const { P } = require("./orgPermissions");

/**
 * PERMISSION_HIERARCHY — Parent-to-children mapping.
 *
 * Key:   A high-level permission that IMPLIES all values.
 * Value: Array of permissions automatically granted by the key.
 *
 * Example: accounting.manage → [accounting.read]
 */
const PERMISSION_HIERARCHY = {

    // ── Accounting ────────────────────────────────────────────────────────────
    [P.ACCOUNTING_MANAGE]: [
        P.ACCOUNTING_READ,
    ],
    [P.ACCOUNTING_REPORTS]: [
        P.ACCOUNTING_READ,
    ],

    // ── Staff / Users ─────────────────────────────────────────────────────────
    [P.STAFF_MANAGE]: [
        P.USERS_READ,
    ],

    // ── Security ──────────────────────────────────────────────────────────────
    [P.SECURITY_MANAGE]: [
        P.SECURITY_READ,
    ],

    // ── Communication ─────────────────────────────────────────────────────────
    [P.COMMUNICATION_MANAGE]: [
        P.COMMUNICATION_READ,
        P.COMMUNICATION_SEND,
    ],

    // ── Dashboard ─────────────────────────────────────────────────────────────
    [P.DASHBOARD_MANAGE]: [
        P.DASHBOARD_READ,
    ],

    // ── Documents ─────────────────────────────────────────────────────────────
    [P.DOCUMENTS_MANAGE]: [
        P.DOCUMENTS_READ,
        P.DOCUMENTS_CREATE,
    ],
};

/**
 * buildInheritanceMap — Flattens the parent→children hierarchy into
 * a child→parent lookup table compatible with authorize.js can().
 *
 * For each parent in PERMISSION_HIERARCHY, each child gets an entry:
 *   child → [parents]
 *
 * @param {Object} existingMap — Existing PERMISSION_INHERITANCE map from authorize.js
 * @returns {Map<string, string[]>} child → [parent, ...] lookup
 */
function buildInheritanceMap(existingMap = {}) {
    const map = new Map();

    for (const [child, parent] of Object.entries(existingMap)) {
        const parents = map.get(child) || [];
        parents.push(parent);
        map.set(child, parents);
    }

    for (const [parent, children] of Object.entries(PERMISSION_HIERARCHY)) {
        for (const child of children) {
            const parents = map.get(child) || [];
            if (!parents.includes(parent)) {
                parents.push(parent);
            }
            map.set(child, parents);
        }
    }

    return map;
}

module.exports = { PERMISSION_HIERARCHY, buildInheritanceMap };
