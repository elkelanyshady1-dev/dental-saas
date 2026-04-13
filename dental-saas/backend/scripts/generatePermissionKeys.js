/**
 * generatePermissionKeys.js — Frontend Permission Type/Key Export (v2)
 *
 * Generates frontend/src/generated/permissionKeys.json from the SSOT.
 * Also generates frontend/src/generated/permissionKeys.js (ESM typed constants).
 *
 * STANDALONE — no module-alias, no mongoose, no DB connection required.
 * Reads orgPermissions.js directly via relative path.
 *
 * USAGE:
 *   node scripts/generatePermissionKeys.js
 *   npm run generate:permission-keys   (alias)
 *   npm run sync:permissions           (alias)
 *
 * PLANE: Cross-plane codegen — runs at build/dev time only.
 */

"use strict";

const fs   = require("fs");
const path = require("path");

// ─── Direct SSOT load (no module-alias needed) ────────────────────────────────
const orgPerms = require("../src/rbac/orgPermissions");
const { P } = orgPerms;

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Derive module→actions map directly from P enum.
 * Deduplicates alias values (e.g. FINANCE_MANAGE → "accounting.update").
 */
function deriveModuleMap() {
    const map = {};
    const seen = new Set();

    for (const permString of Object.values(P)) {
        if (seen.has(permString)) continue;
        seen.add(permString);

        const dotIdx = permString.indexOf(".");
        if (dotIdx === -1) continue;

        const mod    = permString.substring(0, dotIdx);
        const action = permString.substring(dotIdx + 1);

        if (!map[mod]) map[mod] = [];
        if (!map[mod].includes(action)) map[mod].push(action);
    }

    return map;
}

/**
 * Build flat permission key array: ["patients.read", "patients.create", ...]
 */
function generatePermissionKeys(moduleMap) {
    const keys = [];
    for (const [mod, actions] of Object.entries(moduleMap)) {
        for (const action of actions) {
            keys.push(`${mod}.${action}`);
        }
    }
    return keys;
}

// ─── Output paths ─────────────────────────────────────────────────────────────

const FRONTEND_GENERATED_DIR = path.resolve(__dirname, "../../frontend/src/generated");

if (!fs.existsSync(FRONTEND_GENERATED_DIR)) {
    fs.mkdirSync(FRONTEND_GENERATED_DIR, { recursive: true });
}

// ─── Build payload ────────────────────────────────────────────────────────────

const moduleMap    = deriveModuleMap();
const permKeys     = generatePermissionKeys(moduleMap);

// Build role permissions map if ORG_ROLE_PERMISSIONS & ORG_ROLES are available
let rolePermissions = {};
let roles = [];

if (orgPerms.ORG_ROLES && orgPerms.ORG_ROLE_PERMISSIONS) {
    roles = orgPerms.ORG_ROLES;
    const allPermSet = new Set(permKeys);

    for (const roleName of roles) {
        const rolePerms = orgPerms.ORG_ROLE_PERMISSIONS[roleName] || [];
        const flat = {};
        for (const perm of (Array.isArray(rolePerms) ? rolePerms : [])) {
            if (allPermSet.has(perm)) flat[perm] = true;
        }
        // Also check if it's an array of P constants
        if (Array.isArray(rolePerms)) {
            for (const p of rolePerms) {
                if (typeof p === "string" && allPermSet.has(p)) flat[p] = true;
            }
        }
        rolePermissions[roleName] = flat;
    }
}

// ─── 1. Generate permissionKeys.json (existing format, now up to date) ────────

const jsonPayload = {
    _generatedAt:  new Date().toISOString(),
    _generatedBy:  "scripts/generatePermissionKeys.js (v2 — standalone)",
    _ssot:         "backend/src/rbac/orgPermissions.js",
    _warning:      "DO NOT MANUALLY EDIT — regenerate with: npm run generate:permission-keys",
    modules:       moduleMap,
    permissionKeys: permKeys,
    constants:     P,
    roles,
    rolePermissions,
};

const jsonOutputPath = path.join(FRONTEND_GENERATED_DIR, "permissionKeys.json");
fs.writeFileSync(jsonOutputPath, JSON.stringify(jsonPayload, null, 2), "utf-8");

// ─── 2. Generate permissionKeys.js (ESM typed P constant for frontend) ────────
//
// This is the TYPE-SAFE constant map the prompt calls for.
// Frontend components import P from here instead of raw strings.
//
// Usage:
//   import { P } from "@/generated/permissionKeys";
//   useCapability(P.INVENTORY_READ);      // ✅ zero string bugs

const constEntries = Object.entries(P)
    .map(([k, v]) => `  ${k}: ${JSON.stringify(v)},`)
    .join("\n");

const permSetEntries = permKeys
    .map(k => `  ${JSON.stringify(k)},`)
    .join("\n");

const esmContent = `// ⚠️  AUTO-GENERATED FILE — DO NOT MANUALLY EDIT
// Regenerate with: npm run generate:permission-keys (from backend/)
// Source of truth: backend/src/rbac/orgPermissions.js
// Generated at: ${new Date().toISOString()}

/**
 * P — Typed permission constant map (mirrors backend P enum)
 *
 * Use this instead of raw strings in all useCapability() calls:
 *   ✅  useCapability(P.INVENTORY_READ)
 *   ❌  useCapability("inventory.read")
 */
export const P = Object.freeze({
${constEntries}
});

/**
 * ALL_PERMISSIONS — flat array of every registered permission string.
 * Used by permissionValidator.js and debug panels.
 */
export const ALL_PERMISSIONS = Object.freeze([
${permSetEntries}
]);

/**
 * PermissionSet — O(1) membership check set.
 * Used by permissionValidator at runtime.
 */
export const PermissionSet = new Set(ALL_PERMISSIONS);
`;

const jsOutputPath = path.join(FRONTEND_GENERATED_DIR, "permissionKeys.js");
fs.writeFileSync(jsOutputPath, esmContent, "utf-8");

// ─── 3. Summary ───────────────────────────────────────────────────────────────

console.log("✅ Permission sync complete");
console.log(`   📁 JSON : ${jsonOutputPath}`);
console.log(`   📁 JS   : ${jsOutputPath}`);
console.log(`   📊 Modules         : ${Object.keys(moduleMap).length}`);
console.log(`   📊 Permission keys : ${permKeys.length}`);
console.log(`   📊 P constants     : ${Object.keys(P).length}`);
console.log(`   📊 Roles           : ${roles.length}`);
