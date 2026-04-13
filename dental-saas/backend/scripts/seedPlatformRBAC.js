require("module-alias/register");
/**
 * seedPlatformRBAC.js
 * Platform Plane — Sovereign RBAC Seeder
 *
 * Deterministic, idempotent seeding of:
 *   1. Platform capabilities → platformcapabilities collection
 *   2. Platform roles → platformroles collection
 *
 * Sources capability definitions from the platform contract
 * (packages/platform-contract/platformContract.cjs.js) to ensure
 * DB state is always synchronized with the contract.
 *
 * Rules:
 *   - Upserts only — never deletes
 *   - Fail-fast on model load errors
 *   - Uses process.env.MONGO_URI
 *   - Does NOT touch org-plane collections
 *   - Safe to re-run at any time
 *
 * Usage: node scripts/seedPlatformRBAC.js
 */

"use strict";

const mongoose = require("mongoose");
require("dotenv").config();

// ── 1. Deterministic model imports ───────────────────────────────────────────
const PlatformCapability = require("../src/platform/models/PlatformCapability");
const PlatformRole = require("../src/platform/models/PlatformRole");

// ── 2. Model existence guards ────────────────────────────────────────────────
if (!PlatformCapability || typeof PlatformCapability !== "function") {
    console.error("[RBAC_SEED] FATAL: PlatformCapability model failed to load.");
    process.exit(1);
}
if (!PlatformRole || typeof PlatformRole !== "function") {
    console.error("[RBAC_SEED] FATAL: PlatformRole model failed to load.");
    process.exit(1);
}

// ── 3. Load from platform contract (single source of truth) ─────────────────
const {
    PLATFORM_CAPABILITIES,
    PLATFORM_ROLES,
} = require("../../packages/platform-contract/platformContract.cjs.js");

// ── 4. Build capability definitions from contract ────────────────────────────
const CAPABILITY_DESCRIPTIONS = {
    VIEW_ORGANIZATIONS: "View organization list and details",
    MANAGE_ORGANIZATIONS: "Create, update, archive organizations",
    MANAGE_SUBSCRIPTIONS: "Manage subscription plans and billing",
    VIEW_AUDIT_LOGS: "Access audit log records",
    VIEW_PLATFORM_ANALYTICS: "Access analytics dashboard",
    MANAGE_PLATFORM_USERS: "Manage platform-level user accounts",
    MANAGE_PLATFORM_SETTINGS: "Modify platform configuration and settings",
};

const CAPABILITIES = Object.values(PLATFORM_CAPABILITIES).map((key) => ({
    key,
    description: CAPABILITY_DESCRIPTIONS[key] || `Platform capability: ${key}`,
}));

// ── 5. Build role definitions from contract ──────────────────────────────────
// Map contract role names to PlatformUser model role names
const ROLE_NAME_MAP = {
    superadmin: "superadmin",
    operations: "operations_admin",
    finance: "finance_admin",
};

const ROLES = Object.entries(PLATFORM_ROLES).map(([contractName, capabilities]) => ({
    name: ROLE_NAME_MAP[contractName] || contractName,
    capabilities: [...new Set(capabilities)],
}));

// Also ensure "analyst" role exists (from PlatformUser enum) with no capabilities
ROLES.push({
    name: "analyst",
    capabilities: [],
});

// ── 6. Seed function ─────────────────────────────────────────────────────────
async function seed() {
    console.log("╔══════════════════════════════════════════════╗");
    console.log("║  PLATFORM RBAC SEEDER — Sovereign Grade     ║");
    console.log("╚══════════════════════════════════════════════╝");
    console.log("");

    // ── Connect ──────────────────────────────────────────────────────────
    const uri = process.env.MONGO_URI;
    if (!uri) {
        console.error("[RBAC_SEED] FATAL: MONGO_URI not set in environment.");
        process.exit(1);
    }

    try {
        await mongoose.connect(uri);
        console.log(`[RBAC_SEED] Connected to ${mongoose.connection.name}`);
    } catch (err) {
        console.error(`[RBAC_SEED] FATAL: DB connection failed: ${err.message}`);
        process.exit(1);
    }

    // ── Seed Capabilities ────────────────────────────────────────────────
    console.log("\n  ── Seeding Platform Capabilities ──");

    let capUpserted = 0;
    let capUnchanged = 0;

    for (const cap of CAPABILITIES) {
        const result = await PlatformCapability.updateOne(
            { key: cap.key },
            {
                $set: {
                    key: cap.key,
                    description: cap.description,
                    plane: "platform",
                },
            },
            { upsert: true }
        );

        if (result.upsertedCount > 0) {
            console.log(`    ✅ Created: ${cap.key}`);
            capUpserted++;
        } else if (result.modifiedCount > 0) {
            console.log(`    🔄 Updated: ${cap.key}`);
            capUpserted++;
        } else {
            capUnchanged++;
        }
    }

    console.log(`  Summary: ${capUpserted} upserted, ${capUnchanged} unchanged`);
    console.log(`  Total capabilities: ${CAPABILITIES.length}`);

    // ── Seed Roles ───────────────────────────────────────────────────────
    console.log("\n  ── Seeding Platform Roles ──");

    let roleUpserted = 0;
    let roleUnchanged = 0;

    for (const role of ROLES) {
        const result = await PlatformRole.updateOne(
            { name: role.name },
            {
                $set: {
                    name: role.name,
                    capabilities: role.capabilities,
                    plane: "platform",
                },
            },
            { upsert: true }
        );

        if (result.upsertedCount > 0) {
            console.log(`    ✅ Created: ${role.name} (${role.capabilities.length} capabilities)`);
            roleUpserted++;
        } else if (result.modifiedCount > 0) {
            console.log(`    🔄 Updated: ${role.name} (${role.capabilities.length} capabilities)`);
            roleUpserted++;
        } else {
            roleUnchanged++;
        }
    }

    console.log(`  Summary: ${roleUpserted} upserted, ${roleUnchanged} unchanged`);
    console.log(`  Total roles: ${ROLES.length}`);

    // ── Validation ───────────────────────────────────────────────────────
    console.log("\n  ── Post-Seed Validation ──");

    const totalCaps = await PlatformCapability.countDocuments();
    const totalRoles = await PlatformRole.countDocuments();
    console.log(`    platformcapabilities: ${totalCaps} records`);
    console.log(`    platformroles: ${totalRoles} records`);

    // Verify superadmin has ALL capabilities
    const superadminRole = await PlatformRole.findOne({ name: "superadmin" });
    if (!superadminRole) {
        console.error("    ❌ CRITICAL: superadmin role not found after seeding!");
        process.exit(1);
    }

    const allCapKeys = CAPABILITIES.map((c) => c.key);
    const missing = allCapKeys.filter((k) => !superadminRole.capabilities.includes(k));
    if (missing.length > 0) {
        console.error(`    ❌ CRITICAL: superadmin missing capabilities: ${missing.join(", ")}`);
        process.exit(1);
    }

    console.log(`    ✅ superadmin has ALL ${allCapKeys.length} capabilities`);

    // Verify no orphan capability references
    for (const role of ROLES) {
        const dbRole = await PlatformRole.findOne({ name: role.name });
        if (dbRole) {
            const orphans = dbRole.capabilities.filter((c) => !allCapKeys.includes(c));
            if (orphans.length > 0) {
                console.log(`    ⚠️  ${role.name} has orphan capabilities: ${orphans.join(", ")}`);
            }
        }
    }

    console.log("\n  ✅ Platform RBAC seeding complete.");
    console.log("  Run `node seedPlatformUser.js` next to ensure superadmin user exists.\n");

    await mongoose.disconnect();
    process.exit(0);
}

seed().catch((err) => {
    console.error(`[RBAC_SEED] FATAL: ${err.message}`);
    process.exit(1);
});
