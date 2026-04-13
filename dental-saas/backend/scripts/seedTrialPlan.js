require("module-alias/register");
/**
 * seedTrialPlan.js
 * Entitlement System — Trial-Tier PlanVersion Seeder
 *
 * PURPOSE:
 * Seeds a PlanTemplate + PlanVersion with `templateCode: "trial-tier"` and
 * `status: "active"` so that `planResolver.js` can resolve a valid plan for
 * organizations that have no OrgContract yet (e.g. fresh trial orgs).
 *
 * Without this seed, `resolvePlan()` throws:
 *   "Plan Resolution Error: No active PlanVersion found for organization <id>"
 *
 * This restores the entitlement pipeline:
 *   planResolver → planCapabilityBuilder → normalizeModules → req.capabilities
 *   → requireEntitlement("orthodontics") → ALLOW
 *
 * Module Entitlements Seeded:
 *   - patients: true        (core)
 *   - appointments: true    (core)
 *   - finance: true         (core)
 *   - orthodonticsAdv: true (maps to "orthodontics" via normalizeModules)
 *   - analytics: true
 *   - inventory: true
 *   - booking: true
 *   - lab: true
 *   - communication.enabled: true
 *
 * Rules:
 *   - Idempotent — safe to re-run
 *   - Uses upsert pattern (templateCode is unique per active version)
 *   - Requires MONGO_URI in .env
 *   - Does NOT touch org-plane collections
 *
 * Usage: node scripts/seedTrialPlan.js
 */

"use strict";

const mongoose = require("mongoose");
require("dotenv").config();

const PlanTemplate = require("../src/platform/billing/models/PlanTemplate.model").default;
const PlanVersion = require("../src/platform/billing/models/PlanVersion.model").default;

async function seed() {
    console.log("╔══════════════════════════════════════════════╗");
    console.log("║  TRIAL-TIER PLAN SEEDER — Entitlement Fix   ║");
    console.log("╚══════════════════════════════════════════════╝");
    console.log("");

    // ── Connect ──────────────────────────────────────────────────────────
    const uri = process.env.MONGO_URI;
    if (!uri) {
        console.error("[PLAN_SEED] FATAL: MONGO_URI not set in environment.");
        process.exit(1);
    }

    try {
        await mongoose.connect(uri);
        console.log(`[PLAN_SEED] Connected to ${mongoose.connection.name}`);
    } catch (err) {
        console.error(`[PLAN_SEED] FATAL: DB connection failed: ${err.message}`);
        process.exit(1);
    }

    // ── Step 1: Ensure PlanTemplate exists ────────────────────────────────
    console.log("\n  ── Step 1: Seeding PlanTemplate ──");

    let template = await PlanTemplate.findOne({ code: "trial-tier" });

    if (!template) {
        // We need a createdBy. Use a placeholder ObjectId for seeding.
        // In production, this would be the superadmin's PlatformUser ID.
        const seederId = new mongoose.Types.ObjectId();

        template = await PlanTemplate.create({
            name: "Trial Tier",
            code: "trial-tier",
            description: "Default trial plan with all modules enabled for evaluation",
            status: "published",   // PlanTemplate enum: draft | published | archived
            visibility: { isPublic: true },
            limits: { maxUsers: 10, maxBranches: 3 },
            modules: {
                patients: true,
                appointments: true,
                finance: true,
                orthodonticsAdv: true,
                analytics: true,
                inventory: true,
                booking: true,
                lab: true,
                communication: { enabled: true, smsQuota: 100, whatsappQuota: 100, emailQuota: 500 },
            },
            trialDays: 14,
            createdBy: seederId,
        });
        console.log(`    ✅ Created PlanTemplate: ${template._id} (code: trial-tier)`);
    } else {
        console.log(`    ✔  PlanTemplate already exists: ${template._id}`);
    }

    // ── Step 2: Check for existing active PlanVersion ─────────────────────
    console.log("\n  ── Step 2: Seeding PlanVersion ──");

    const existingVersion = await PlanVersion.findOne({
        templateCode: "trial-tier",
        status: "active",
    });

    if (existingVersion) {
        console.log(`    ✔  Active PlanVersion already exists: ${existingVersion._id}`);
        console.log(`       versionTag: ${existingVersion.versionTag}`);
        console.log(`       modules.orthodonticsAdv: ${existingVersion.modules?.orthodonticsAdv}`);
        console.log("\n  ✅ No changes needed — trial-tier plan is already seeded.");
        await mongoose.disconnect();
        process.exit(0);
    }

    // ── Step 3: Create active PlanVersion ─────────────────────────────────
    const seederId = template.createdBy || new mongoose.Types.ObjectId();

    const planVersion = await PlanVersion.create({
        templateId: template._id,
        templateCode: "trial-tier",
        versionTag: "1.0.0",
        label: "Trial Tier v1.0.0",
        status: "active",
        activatedAt: new Date(),

        // ── Module Entitlements ──────────────────────────────────────────
        // Keys MUST match PlanVersion.model.js versionModulesSchema fields.
        // normalizeModules() in featureRegistry.js maps:
        //   orthodonticsAdv → orthodontics (canonical key)
        modules: {
            patients: true,
            appointments: true,
            finance: true,
            orthodonticsAdv: true,   // → "orthodontics" after normalization
            analytics: true,
            inventory: true,
            booking: true,
            lab: true,
            communication: {
                enabled: true,
                smsQuota: 100,
                whatsappQuota: 100,
                emailQuota: 500,
            },
        },

        // ── Limits ───────────────────────────────────────────────────────
        limits: {
            maxUsers: 10,
            maxBranches: 3,
            maxPatients: 500,
            maxStorageMB: 5120,   // 5 GB
        },

        // ── Quotas ───────────────────────────────────────────────────────
        quotas: {
            storageMB: 5120,
            imagesMB: 2048,
        },

        // ── Pricing (minimal — trial is free) ────────────────────────────
        pricing: {
            baseCurrency: "USD",
            regions: [{
                regionCode: "US",
                countries: ["US"],
                currency: "USD",
                monthly: 0,
                yearly: 0,
            }],
        },

        trialDays: 14,
        createdBy: seederId,
    });

    console.log(`    ✅ Created PlanVersion: ${planVersion._id}`);
    console.log(`       templateCode: ${planVersion.templateCode}`);
    console.log(`       versionTag:   ${planVersion.versionTag}`);
    console.log(`       status:       ${planVersion.status}`);

    // ── Validation ───────────────────────────────────────────────────────
    console.log("\n  ── Post-Seed Validation ──");

    const verify = await PlanVersion.findOne({
        templateCode: "trial-tier",
        status: "active",
    }).lean();

    if (!verify) {
        console.error("    ❌ CRITICAL: PlanVersion not found after seeding!");
        process.exit(1);
    }

    console.log(`    ✅ Verified: trial-tier plan version exists and is active`);
    console.log(`    ✅ modules.orthodonticsAdv: ${verify.modules?.orthodonticsAdv}`);
    console.log(`    ✅ modules.patients: ${verify.modules?.patients}`);
    console.log(`    ✅ modules.appointments: ${verify.modules?.appointments}`);

    // ── Test normalizeModules ────────────────────────────────────────────
    try {
        const { normalizeModules } = require("../src/platform/featureRegistry");
        const normalized = normalizeModules(verify.modules);
        console.log(`\n    ── normalizeModules() output ──`);
        console.log(`    orthodontics: ${normalized.orthodontics}`);
        console.log(`    patients:     ${normalized.patients}`);
        console.log(`    finance:      ${normalized.finance}`);

        if (normalized.orthodontics !== true) {
            console.error("    ❌ CRITICAL: orthodontics not resolved after normalization!");
            process.exit(1);
        }
        console.log(`    ✅ normalizeModules produces orthodontics: true`);
    } catch (err) {
        console.warn(`    ⚠️  Could not test normalizeModules: ${err.message}`);
    }

    console.log("\n  ✅ Trial-tier plan seeding complete.");
    console.log("  The entitlement pipeline will now resolve for all organizations.\n");

    await mongoose.disconnect();
    process.exit(0);
}

seed().catch((err) => {
    console.error(`[PLAN_SEED] FATAL: ${err.message}`);
    console.error(err.stack);
    process.exit(1);
});
