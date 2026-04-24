require("module-alias/register");
/**
 * seedRegions.js
 * v31.0 — Control Plane Region Registry Bootstrap
 *
 * Ensures the Region collection contains the four required platform regions.
 * Uses upsert logic — safe to run multiple times (idempotent).
 *
 * In development: uses local MongoDB + Redis URIs.
 * In production:  uses environment variables for regional infrastructure.
 *
 * SAFETY:
 *   - Reads env vars for connection URIs (falls back to local dev defaults)
 *   - Never drops existing data
 *   - Upserts only — existing regions are updated, not replaced
 *
 * Usage:
 *   node scripts/seedRegions.js              (auto-seeds with dev defaults)
 *   node scripts/seedRegions.js --dry-run    (preview only, no writes)
 *
 * Prerequisites:
 *   MONGO_URI in .env (Control Plane DB)
 */

"use strict";

const mongoose = require("mongoose");
require("dotenv").config();

const IS_DRY = process.argv.includes("--dry-run");

// ── Region Definitions ────────────────────────────────────────────────────────
// Each region requires: code, name, dbUri, redisUrl
// Provider keys are optional and typically configured per-environment.

const REGION_DEFS = [
    {
        code: "MEA",
        name: "Middle East & Africa",
        dbUri: process.env.MONGO_URI_MEA || process.env.MONGO_URI || "mongodb://localhost:27017/dental_mea",
        redisUrl: process.env.REDIS_URL_MEA || process.env.REDIS_URL || "redis://localhost:6379",
        providerKeys: {
            stripe: {
                secretKey: process.env.STRIPE_SECRET_KEY_MEA || process.env.STRIPE_SECRET_KEY || "",
                webhookSecret: process.env.STRIPE_WEBHOOK_SECRET_MEA || process.env.STRIPE_WEBHOOK_SECRET || ""
            },
            paymob: {
                apiKey: process.env.PAYMOB_API_KEY_MEA || "",
                webhookHmacKey: process.env.PAYMOB_HMAC_KEY_MEA || ""
            }
        },
        status: "ACTIVE"
    },
    {
        code: "EU",
        name: "European Union",
        dbUri: process.env.MONGO_URI_EU || process.env.MONGO_URI || "mongodb://localhost:27017/dental_eu",
        redisUrl: process.env.REDIS_URL_EU || process.env.REDIS_URL || "redis://localhost:6379",
        providerKeys: {
            stripe: {
                secretKey: process.env.STRIPE_SECRET_KEY_EU || process.env.STRIPE_SECRET_KEY || "",
                webhookSecret: process.env.STRIPE_WEBHOOK_SECRET_EU || process.env.STRIPE_WEBHOOK_SECRET || ""
            },
            paymob: {
                apiKey: "",
                webhookHmacKey: ""
            }
        },
        status: "ACTIVE"
    },
    {
        code: "US",
        name: "North America",
        dbUri: process.env.MONGO_URI_US || process.env.MONGO_URI || "mongodb://localhost:27017/dental_us",
        redisUrl: process.env.REDIS_URL_US || process.env.REDIS_URL || "redis://localhost:6379",
        providerKeys: {
            stripe: {
                secretKey: process.env.STRIPE_SECRET_KEY_US || process.env.STRIPE_SECRET_KEY || "",
                webhookSecret: process.env.STRIPE_WEBHOOK_SECRET_US || process.env.STRIPE_WEBHOOK_SECRET || ""
            },
            paymob: {
                apiKey: "",
                webhookHmacKey: ""
            }
        },
        status: "ACTIVE"
    },
    {
        code: "APAC",
        name: "Asia Pacific",
        dbUri: process.env.MONGO_URI_APAC || process.env.MONGO_URI || "mongodb://localhost:27017/dental_apac",
        redisUrl: process.env.REDIS_URL_APAC || process.env.REDIS_URL || "redis://localhost:6379",
        providerKeys: {
            stripe: {
                secretKey: process.env.STRIPE_SECRET_KEY_APAC || process.env.STRIPE_SECRET_KEY || "",
                webhookSecret: process.env.STRIPE_WEBHOOK_SECRET_APAC || process.env.STRIPE_WEBHOOK_SECRET || ""
            },
            paymob: {
                apiKey: "",
                webhookHmacKey: ""
            }
        },
        status: "ACTIVE"
    }
];

// ── Main ──────────────────────────────────────────────────────────────────────
async function seed() {
    console.log("");
    console.log("╔══════════════════════════════════════════════════════════╗");
    console.log("║  REGION REGISTRY SEED — Control Plane Bootstrap         ║");
    console.log(`║  MODE: ${IS_DRY ? "DRY-RUN (no writes)                        " : "COMMIT  ⚡ LIVE WRITES                     "}║`);
    console.log("╚══════════════════════════════════════════════════════════╝");
    console.log("");

    const uri = process.env.MONGO_URI_PLATFORM || process.env.MONGO_URI_DEV_SINGLE;
    if (!uri) {
        console.error("[SEED] ❌  MONGO_URI_PLATFORM (or MONGO_URI_DEV_SINGLE) not set. Add to .env");
        process.exit(1);
    }

    await mongoose.connect(uri);
    console.log(`  ℹ️  Connected to: ${mongoose.connection.host}/${mongoose.connection.name}`);

    // Region.model.js exports a lazy proxy in v9.4.2; pull the def + bind on
    // this CLI's own mongoose connection (NOT platformConnection — the
    // sibling isn't initialised in this standalone script).
    const RegionDef = require("../src/platform/domain/models/Region.model");
    const RegionSchema = RegionDef.__def?.schema || RegionDef.schema;
    if (!RegionSchema) {
        console.error("[SEED] ❌  Could not resolve Region schema from def");
        process.exit(1);
    }
    const Region = mongoose.connection.models["Region"] || mongoose.connection.model("Region", RegionSchema);

    let created = 0;
    let updated = 0;

    for (const def of REGION_DEFS) {
        if (IS_DRY) {
            const exists = await Region.findOne({ code: def.code });
            console.log(`  ⚠️  [DRY-RUN] Would ${exists ? "update" : "create"}: ${def.code} (${def.name})`);
            continue;
        }

        const result = await Region.findOneAndUpdate(
            { code: def.code },
            { $set: def },
            { upsert: true, new: true, setDefaultsOnInsert: true }
        );

        // Check if this was an insert or update
        const wasNew = result.__v === 0;
        if (wasNew) {
            created++;
            console.log(`  ✅ Created: ${def.code} — ${def.name} (${result._id})`);
        } else {
            updated++;
            console.log(`  ✅ Updated: ${def.code} — ${def.name} (${result._id})`);
        }
    }

    // Validate
    const allRegions = await Region.find({}).select("code name status").lean();
    console.log("");
    console.log("── Registry State ──────────────────────────────────────────");
    for (const r of allRegions) {
        const statusIcon = r.status === "ACTIVE" ? "🟢" : r.status === "MAINTENANCE" ? "🟡" : "🔴";
        console.log(`  ${statusIcon} ${r.code.padEnd(6)} ${r.name.padEnd(25)} ${r.status}`);
    }

    const requiredCodes = ["EU", "US", "MEA", "APAC"];
    const foundCodes = allRegions.map(r => r.code);
    const missing = requiredCodes.filter(c => !foundCodes.includes(c));
    if (missing.length > 0) {
        console.error(`\n  ❌ MISSING REGIONS: ${missing.join(", ")}`);
    } else {
        console.log(`\n  ✅ All ${requiredCodes.length} required regions present.`);
    }

    console.log("");
    console.log("╔══════════════════════════════════════════════════════════╗");
    console.log(`║  SEED ${IS_DRY ? "DRY-RUN COMPLETE                                " : `DONE — Created: ${created}, Updated: ${updated}                  `.slice(0, 49)}║`);
    console.log("╚══════════════════════════════════════════════════════════╝");
    console.log("");

    await mongoose.disconnect();
    process.exit(0);
}

seed().catch(err => {
    console.error("[SEED] ❌  Fatal:", err.message);
    console.error(err.stack);
    process.exit(1);
});
