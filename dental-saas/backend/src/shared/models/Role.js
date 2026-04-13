/**
 * Role.js — Organization Role Model (Auto-Synced Schema)
 *
 * The `permissions` sub-schema is AUTO-GENERATED from orgPermissions.js
 * via permissionRegistry.generateSchemaDefinition().
 *
 * ┌───────────────────────────┐
 * │  orgPermissions.js (SSOT) │
 * │          ↓                │
 * │  permissionRegistry.js    │
 * │          ↓                │
 * │  Role.js (this file)      │  ← Schema derived at require() time
 * └───────────────────────────┘
 *
 * RULE: Do NOT manually edit the permissions block.
 *       Add new modules/actions to orgPermissions.js instead.
 *       The schema will auto-sync on next server restart.
 *
 * PLANE: Org only.
 */

const mongoose = require("mongoose");
const { generateSchemaDefinition, PERMISSION_VERSION } = require("../../rbac/permissionRegistry");

// ─── Auto-Generated Permission Schema ───────────────────────────────────────
// Derived from orgPermissions.js P enum at require() time.
// Every module.action pair becomes a Boolean field with default: false.
const permissionSchemaDefinition = generateSchemaDefinition();

const roleSchema = new mongoose.Schema(
    {
        name: {
            type: String,
            required: true,
        },

        // Per-org DB mode: kept for reference/audit but NOT required.
        // Database isolation (dental_org_<orgId>) is the tenant boundary.
        organizationId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Organization",
        },

        // Auto-synced from orgPermissions.js — DO NOT manually edit
        permissions: permissionSchemaDefinition,

        isSystemRole: {
            type: Boolean,
            default: false,
        },

        // Phase 17: Tracks which SSOT version this role was last synced to.
        // Auto-heal upgrades roles where permissionVersion < PERMISSION_VERSION.
        permissionVersion: {
            type: Number,
            default: PERMISSION_VERSION,
        },
    },
    { timestamps: true }
);

const modelName = "Role";

module.exports = {
    modelName,
    schema: roleSchema,
    default: mongoose.models[modelName] || mongoose.model(modelName, roleSchema),
};