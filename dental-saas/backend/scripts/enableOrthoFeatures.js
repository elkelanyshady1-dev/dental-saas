/**
 * enableOrthoFeatures.js — Dev Seed Script
 *
 * Enables orthodontics (orthodonticsAdv) for a dev org by creating/updating
 * an OrganizationEntitlement override record.
 *
 * This is Option B from the entitlement fix spec.
 * Use BYPASS_ENTITLEMENTS=true in .env for the fastest dev bypass (Option A).
 *
 * Usage:
 *   node scripts/enableOrthoFeatures.js
 *   node scripts/enableOrthoFeatures.js --org=<orgId>
 *   node scripts/enableOrthoFeatures.js --dry-run
 *
 * The org ID defaults to the value of ORG_ID env var, then falls back
 * to the first argument after --org=.
 */

"use strict";

require("module-alias/register");
require("dotenv").config();

const mongoose = require("mongoose");
const logger   = require("../src/utils/logger");

// ─── CLI Args ─────────────────────────────────────────────────────────────────
const args   = process.argv.slice(2);
const DRY_RUN = args.includes("--dry-run");
const orgArg  = (args.find(a => a.startsWith("--org=")) || "").split("=")[1] || "";
const TARGET_ORG_ID = orgArg || process.env.ORG_ID || "69c7537ba6ddf0a9ee567ce2";

// ─── Models — loaded after DB connection ─────────────────────────────────────
let Organization;
let OrganizationEntitlement;

async function run() {
    // Connect
    const MONGO_URI = process.env.MONGO_URI || process.env.MONGODB_URI;
    if (!MONGO_URI) {
        console.error("❌ MONGO_URI is not set. Add it to .env.");
        process.exit(1);
    }

    await mongoose.connect(MONGO_URI);
    console.log("✅ Connected to MongoDB");

    Organization           = require("../src/shared/models/Organization").default;
    OrganizationEntitlement = require("../src/platform/billing/models/OrganizationEntitlement.model").default;

    // Verify org exists
    const org = await Organization.findById(TARGET_ORG_ID).lean();
    if (!org) {
        console.error(`❌ Organization ${TARGET_ORG_ID} not found`);
        process.exit(1);
    }
    console.log(`🏥 Target org: ${org.name} (${TARGET_ORG_ID})`);

    if (DRY_RUN) {
        console.log("🔍 DRY RUN — no changes written");
        await mongoose.disconnect();
        process.exit(0);
    }

    // Upsert an active OrganizationEntitlement with orthodonticsAdv: true
    const now = new Date();
    const existing = await OrganizationEntitlement.findOne({
        organizationId: TARGET_ORG_ID,
        effectiveUntil: null,   // the "active" record
    }).lean();

    if (existing) {
        // Update the existing record to enable orthodonticsAdv
        await OrganizationEntitlement.updateOne(
            { _id: existing._id },
            {
                $set: {
                    "overrides.modules.orthodonticsAdv": true,
                    updatedAt: now,
                }
            }
        );
        console.log(`✅ Updated existing entitlement (${existing._id}) — orthodonticsAdv: true`);
    } else {
        // Create a new entitlement record with the override
        await OrganizationEntitlement.create({
            organizationId: TARGET_ORG_ID,
            overrides: {
                modules: {
                    orthodonticsAdv: true,
                },
            },
            effectiveFrom:  now,
            effectiveUntil: null,   // null = currently active
            createdBy:      "seed-script",
            reason:         "Dev enablement — orthodontics visit system",
        });
        console.log(`✅ Created new entitlement override — orthodonticsAdv: true`);
    }

    console.log("");
    console.log("✅ Done. Restart the backend server for changes to take effect.");
    console.log("   (The entitlement cache has a 60s TTL.)");
    console.log("");
    console.log("📋 Tip: For instant dev bypass, add to .env:");
    console.log("   BYPASS_ENTITLEMENTS=true");

    await mongoose.disconnect();
    process.exit(0);
}

run().catch(err => {
    console.error("❌ Seed failed:", err.message);
    console.error(err.stack);
    process.exit(1);
});
