require("module-alias/register");
/**
 * seedCleanArchitecture.js
 * DEV ONLY — Clean Commercial Architecture Seed
 *
 * Drops legacy billing collections and seeds clean data:
 *   1. Drop:  organizations, orgcontracts, platforminvoices, billinginvoices,
 *             invoices, planversions (recreated below)
 *   2. Seed:  6 PlanTemplates + PlanVersions (EG / US / EU pricing)
 *   3. Seed:  3 Organizations (trial / active / expired) each with OrgContract
 *
 * Platform users are NEVER touched.
 *
 * SAFETY:
 *   - Defaults to --dry-run (no writes)
 *   - Requires explicit --commit to execute
 *   - Blocked in NODE_ENV=production
 *
 * Usage:
 *   node scripts/seedCleanArchitecture.js --dry-run    (default, preview only)
 *   node scripts/seedCleanArchitecture.js --commit     (executes all writes)
 *
 * Prerequisites:
 *   MONGO_URI in .env
 */

"use strict";

// ── Production guard ──────────────────────────────────────────────────────────
if (process.env.NODE_ENV === "production") {
    console.error("\n[SEED] ❌  BLOCKED: This script cannot run in production.\n");
    process.exit(1);
}

const mongoose = require("mongoose");
require("dotenv").config();

// ── Mode flag ─────────────────────────────────────────────────────────────────
const IS_COMMIT = process.argv.includes("--commit");
const IS_DRY = !IS_COMMIT;

// ── Model imports ─────────────────────────────────────────────────────────────
const PlatformUser = require("../src/platform/models/PlatformUser");
const PlanTemplate = require("../src/platform/billing/models/PlanTemplate.model");
const PlanVersion = require("../src/platform/billing/models/PlanVersion.model");
const OrgContract = require("../src/platform/billing/models/OrgContract.model");
const PlatformInvoice = require("../src/platform/billing/models/PlatformInvoice.model");
const Organization = require("../src/shared/models/Organization");
const Region = require("../src/platform/domain/models/Region.model");

// ── Config ────────────────────────────────────────────────────────────────────
const COLLECTIONS_TO_DROP = [
    "organizations",
    "orgcontracts",
    "platforminvoices",
    "billinginvoices",
    "invoices",            // legacy Invoice.js collection
    "plantemplates",
    "planversions",
];

// ── Pricing matrix helpers ────────────────────────────────────────────────────
// ISO country codes ONLY — no display names stored
function pricing(regions) {
    return {
        baseCurrency: "USD",
        regions
    };
}

function region(regionCode, countries, currency, monthly, yearly) {
    return {
        regionCode,
        countries,
        currency,
        monthly,
        yearly,
        biennial: Math.round(yearly * 1.9 * 100) / 100
    };
}

// ── Plan Definitions ──────────────────────────────────────────────────────────
// Pricing in decimal (e.g., 29.99 = $29.99). No display names.
const PLAN_DEFS = [
    {
        code: "starter",
        name: "Starter",
        description: "Single-branch clinic, up to 3 users",
        limits: { maxUsers: 3, maxBranches: 1 },
        modules: { patients: true, appointments: true, finance: true },
        pricing: pricing([
            region("MEA", ["EG", "SA", "AE", "MA", "JO", "KW", "QA", "BH"], "USD", 29, 299),
            region("US", ["US", "CA"], "USD", 49, 499),
            region("EU", ["DE", "FR", "GB", "IT", "ES", "NL", "PL"], "EUR", 39, 399),
        ]),
        trialDays: 14,
    },
    {
        code: "growth",
        name: "Growth",
        description: "Multi-branch clinic, up to 10 users",
        limits: { maxUsers: 10, maxBranches: 3 },
        modules: { patients: true, appointments: true, finance: true, inventory: true, analytics: true },
        pricing: pricing([
            region("MEA", ["EG", "SA", "AE", "MA", "JO", "KW", "QA", "BH"], "USD", 79, 799),
            region("US", ["US", "CA"], "USD", 129, 1299),
            region("EU", ["DE", "FR", "GB", "IT", "ES", "NL", "PL"], "EUR", 99, 999),
        ]),
        trialDays: 14,
    },
    {
        code: "pro",
        name: "Pro",
        description: "Unlimited users, full module access",
        limits: { maxUsers: 9999, maxBranches: 10 },
        modules: { patients: true, appointments: true, finance: true, inventory: true, analytics: true, lab: true, orthodonticsAdv: true, booking: true },
        pricing: pricing([
            region("MEA", ["EG", "SA", "AE", "MA", "JO", "KW", "QA", "BH"], "USD", 149, 1499),
            region("US", ["US", "CA"], "USD", 249, 2499),
            region("EU", ["DE", "FR", "GB", "IT", "ES", "NL", "PL"], "EUR", 199, 1999),
        ]),
        trialDays: 14,
    },
    {
        code: "enterprise",
        name: "Enterprise",
        description: "Unlimited branches, SLA, dedicated support",
        limits: { maxUsers: 9999, maxBranches: 9999 },
        modules: { patients: true, appointments: true, finance: true, inventory: true, analytics: true, lab: true, orthodonticsAdv: true, booking: true, communication: { enabled: true, smsQuota: 5000, whatsappQuota: 5000, emailQuota: 10000 } },
        pricing: pricing([
            region("MEA", ["EG", "SA", "AE", "MA", "JO", "KW", "QA", "BH"], "USD", 399, 3999),
            region("US", ["US", "CA"], "USD", 599, 5999),
            region("EU", ["DE", "FR", "GB", "IT", "ES", "NL", "PL"], "EUR", 499, 4999),
        ]),
        trialDays: 30,
    },
    {
        code: "academic",
        name: "Academic",
        description: "Dental schools and academic institutions",
        limits: { maxUsers: 9999, maxBranches: 5 },
        modules: { patients: true, appointments: true, finance: true, analytics: true, orthodonticsAdv: true },
        pricing: pricing([
            region("MEA", ["EG", "SA", "AE", "MA", "JO", "KW", "QA", "BH"], "USD", 99, 999),
            region("US", ["US", "CA"], "USD", 149, 1499),
            region("EU", ["DE", "FR", "GB", "IT", "ES", "NL", "PL"], "EUR", 119, 1199),
        ]),
        trialDays: 30,
    },
    {
        code: "beta",
        name: "Beta Access",
        description: "Free plan for beta testers — limited time",
        limits: { maxUsers: 5, maxBranches: 1 },
        modules: { patients: true, appointments: true, finance: true },
        pricing: pricing([
            region("MEA", ["EG", "SA", "AE"], "USD", 0, 0),
            region("US", ["US"], "USD", 0, 0),
            region("EU", ["DE", "GB"], "EUR", 0, 0),
        ]),
        trialDays: 90,
    },
];

// ── Org seed definitions ──────────────────────────────────────────────────────
const ORG_DEFS = [
    {
        key: "trial",
        name: "Cairo Dental Clinic (Trial)",
        slug: "cairo-dental-trial",
        country: "EG",           // ISO only
        regionCode: "MEA",
        planCode: "starter",
        contractStatus: "active",
        lockedPrice: 0,
        currency: "USD",
        trialDays: 14,
        orgStatus: "trial",
    },
    {
        key: "active",
        name: "Riyadh Smile Center",
        slug: "riyadh-smile-center",
        country: "SA",           // ISO only
        regionCode: "MEA",
        planCode: "growth",
        contractStatus: "active",
        lockedPrice: 79,
        currency: "USD",
        trialDays: 0,
        orgStatus: "active",
    },
    {
        key: "expired",
        name: "Dubai Orthodontics (Expired)",
        slug: "dubai-orthodontics-expired",
        country: "AE",           // ISO only
        regionCode: "MEA",
        planCode: "pro",
        contractStatus: "terminated",
        lockedPrice: 149,
        currency: "USD",
        trialDays: 0,
        orgStatus: "expired",
    },
];

// ── Logger ────────────────────────────────────────────────────────────────────
function log(msg) { console.log("  " + msg); }
function ok(msg) { console.log("  ✅ " + msg); }
function info(msg) { console.log("  ℹ️  " + msg); }
function warn(msg) { console.log("  ⚠️  " + msg); }

// ── Main ──────────────────────────────────────────────────────────────────────
async function seed() {
    console.log("");
    console.log("╔══════════════════════════════════════════════════════════╗");
    console.log("║  CLEAN ARCHITECTURE SEED — Hybrid Billing Domain        ║");
    console.log(`║  MODE: ${IS_DRY ? "DRY-RUN (no writes)                        " : "COMMIT  ⚡ LIVE WRITES ACTIVE             "}║`);
    console.log("╚══════════════════════════════════════════════════════════╝");
    console.log("");

    // ── Connect ────────────────────────────────────────────────────────────
    const uri = process.env.MONGO_URI || process.env.MONGODB_URI;
    if (!uri) {
        console.error("[SEED] ❌  MONGO_URI not set. Add to .env");
        process.exit(1);
    }
    await mongoose.connect(uri);
    info(`Connected to: ${mongoose.connection.host}/${mongoose.connection.name}`);

    // ── Resolve system actor (superadmin is createdBy reference) ───────────
    const sysUser = await PlatformUser.findOne({ role: "superadmin" }).select("_id email").lean();
    if (!sysUser) {
        console.error("[SEED] ❌  No superadmin PlatformUser found. Run seedPlatformRBAC.js + seedPlatformUser.js first.");
        process.exit(1);
    }
    const ACTOR_ID = sysUser._id;
    ok(`System actor: ${sysUser.email} (${ACTOR_ID})`);

    // ────────────────────────────────────────────────────────────────────────
    // STEP 0 — SEED REGION REGISTRY (v31.0)
    // ────────────────────────────────────────────────────────────────────────
    // The Region collection MUST exist before any org data is seeded,
    // because regionRouter.getRegionContext() does Region.findOne({ code })
    // and throws if not found. This step is idempotent (upsert).
    console.log("\n── STEP 0: Seed Region Registry ─────────────────────────────");

    const REGION_SEED = [
        { code: "MEA",  name: "Middle East & Africa",
          dbUri: process.env.MONGO_URI_MEA || process.env.MONGO_URI || uri,
          redisUrl: process.env.REDIS_URL_MEA || process.env.REDIS_URL || "redis://localhost:6379" },
        { code: "EU",   name: "European Union",
          dbUri: process.env.MONGO_URI_EU || process.env.MONGO_URI || uri,
          redisUrl: process.env.REDIS_URL_EU || process.env.REDIS_URL || "redis://localhost:6379" },
        { code: "US",   name: "North America",
          dbUri: process.env.MONGO_URI_US || process.env.MONGO_URI || uri,
          redisUrl: process.env.REDIS_URL_US || process.env.REDIS_URL || "redis://localhost:6379" },
        { code: "APAC", name: "Asia Pacific",
          dbUri: process.env.MONGO_URI_APAC || process.env.MONGO_URI || uri,
          redisUrl: process.env.REDIS_URL_APAC || process.env.REDIS_URL || "redis://localhost:6379" },
    ];

    for (const rDef of REGION_SEED) {
        if (IS_COMMIT) {
            await Region.findOneAndUpdate(
                { code: rDef.code },
                { $set: rDef },
                { upsert: true, new: true, setDefaultsOnInsert: true }
            );
            ok(`Region: ${rDef.code} (${rDef.name})`);
        } else {
            warn(`[DRY-RUN] Would upsert Region: ${rDef.code} (${rDef.name})`);
        }
    }

    // ────────────────────────────────────────────────────────────────────────
    // STEP 1 — DROP LEGACY COLLECTIONS
    // ────────────────────────────────────────────────────────────────────────
    console.log("\n── STEP 1: Drop legacy collections ─────────────────────────");

    const db = mongoose.connection.db;
    const existingCols = (await db.listCollections().toArray()).map(c => c.name);

    for (const col of COLLECTIONS_TO_DROP) {
        if (existingCols.includes(col)) {
            if (IS_COMMIT) {
                await db.collection(col).drop();
                ok(`Dropped: ${col}`);
            } else {
                warn(`[DRY-RUN] Would drop: ${col}`);
            }
        } else {
            info(`Skip (not found): ${col}`);
        }
    }

    if (IS_DRY) {
        warn("DRY-RUN: No collections dropped.");
    }

    // ────────────────────────────────────────────────────────────────────────
    // STEP 2 — SEED PLAN TEMPLATES
    // ────────────────────────────────────────────────────────────────────────
    console.log("\n── STEP 2: Seed PlanTemplates ───────────────────────────────");

    const templateIds = {};  // code → _id

    for (const def of PLAN_DEFS) {
        if (IS_COMMIT) {
            const tpl = await PlanTemplate.findOneAndUpdate(
                { code: def.code },
                {
                    $set: {
                        name: def.name,
                        description: def.description,
                        code: def.code,
                        status: "published",
                        limits: def.limits,
                        modules: def.modules,
                        pricing: def.pricing,
                        trialDays: def.trialDays,
                        createdBy: ACTOR_ID,
                        lastModifiedBy: ACTOR_ID,
                    }
                },
                { upsert: true, new: true, setDefaultsOnInsert: true }
            );
            templateIds[def.code] = tpl._id;
            ok(`PlanTemplate: ${def.code} (${tpl._id})`);
        } else {
            warn(`[DRY-RUN] Would create PlanTemplate: ${def.code}`);
            templateIds[def.code] = new mongoose.Types.ObjectId();
        }
    }

    // ────────────────────────────────────────────────────────────────────────
    // STEP 3 — SEED PLAN VERSIONS (v1 for each plan)
    // ────────────────────────────────────────────────────────────────────────
    console.log("\n── STEP 3: Seed PlanVersions (v1 per plan) ─────────────────");

    const versionIds = {};  // code → _id

    for (const def of PLAN_DEFS) {
        const versionData = {
            templateId: templateIds[def.code],
            templateCode: def.code,
            versionTag: "v1",
            versionNumber: 1,
            status: "active",
            activatedAt: new Date(),
            limits: def.limits,
            modules: def.modules,
            pricing: def.pricing,
            inflationPolicy: { defaultPercent: 0, applyAfterYears: 1 },
            changeNotes: "Initial version — clean architecture seed",
            createdBy: ACTOR_ID
        };

        if (IS_COMMIT) {
            const pv = await PlanVersion.findOneAndUpdate(
                { templateCode: def.code, versionTag: "v1" },
                { $set: versionData },
                { upsert: true, new: true, setDefaultsOnInsert: true }
            );
            versionIds[def.code] = pv._id;
            ok(`PlanVersion: ${def.code}@v1 (${pv._id})`);
        } else {
            warn(`[DRY-RUN] Would create PlanVersion: ${def.code}@v1`);
            versionIds[def.code] = new mongoose.Types.ObjectId();
        }
    }

    // ────────────────────────────────────────────────────────────────────────
    // STEP 4 — SEED TEST ORGANIZATIONS + OrgContracts
    // ────────────────────────────────────────────────────────────────────────
    console.log("\n── STEP 4: Seed Test Organizations + OrgContracts ──────────");

    const seededOrgs = [];

    const now = new Date();

    for (const def of ORG_DEFS) {
        const isTrial = def.orgStatus === "trial";
        const isExpired = def.orgStatus === "expired";

        // Subscription runtime block (status only — no commercial fields)
        const trialEndsAt = isTrial
            ? new Date(now.getTime() + def.trialDays * 86400000)
            : null;

        const subscription = {
            status: isTrial ? "trial" : isExpired ? "expired" : "active",
            trialEndsAt,
            currentPeriodStart: isExpired ? new Date(now.getTime() - 60 * 86400000) : now,
            currentPeriodEnd: isExpired
                ? new Date(now.getTime() - 30 * 86400000)
                : new Date(now.getTime() + 30 * 86400000),
            autoRenew: !isExpired,
            gracePeriodDays: 7,
            gracePeriodEnd: null,
            paymentProvider: "manual",
        };

        if (IS_COMMIT) {
            // Create Organization
            const org = await Organization.findOneAndUpdate(
                { slug: def.slug },
                {
                    $set: {
                        name: def.name,
                        slug: def.slug,
                        country: def.country,   // ISO code only
                        regionCode: def.regionCode,
                        isActive: !isExpired,
                        subscription,
                        trialStartDate: isTrial ? now : null,
                        trialEndDate: trialEndsAt,
                        trialConsumed: false,
                        planId: templateIds[def.planCode],
                    }
                },
                { upsert: true, new: true, setDefaultsOnInsert: true }
            );

            // Create OrgContract
            const effectiveFrom = new Date(now.getTime() - (isExpired ? 60 : 0) * 86400000);
            const effectiveTo = isExpired
                ? new Date(now.getTime() - 30 * 86400000)
                : null;

            const contract = await OrgContract.findOneAndUpdate(
                {
                    organizationId: org._id,
                    contractStatus: def.contractStatus
                },
                {
                    $setOnInsert: {
                        organizationId: org._id,
                        planVersionId: versionIds[def.planCode],
                        planCode: def.planCode,
                        planVersionTag: "v1",
                        contractStatus: def.contractStatus,
                        lockedPrice: def.lockedPrice,
                        currency: def.currency,
                        effectiveFrom,
                        effectiveTo,
                        trialDays: def.trialDays,
                        trialStartDate: isTrial ? now : null,
                        trialEndDate: trialEndsAt,
                        autoRenew: !isExpired,
                        gracePeriodDays: 7,
                        creditBalance: 0,
                        renewalTerms: {
                            inflationPercent: 0,
                            autoRenew: !isExpired,
                            interval: "monthly"
                        },
                        createdBy: ACTOR_ID,
                        activatedBy: isExpired ? ACTOR_ID : (isTrial ? null : ACTOR_ID),
                        terminatedBy: isExpired ? ACTOR_ID : null,
                        terminatedAt: isExpired ? effectiveTo : null,
                    }
                },
                { upsert: true, new: true }
            );

            // Link org.currentContractId
            if (def.contractStatus !== "terminated") {
                await Organization.findByIdAndUpdate(org._id, {
                    $set: { currentContractId: contract._id }
                });
            }

            // Generate initial invoice for active org
            let invoiceId = null;
            if (def.orgStatus === "active" && def.lockedPrice > 0) {
                const cycleEnd = new Date(now.getTime() + 30 * 86400000);
                const inv = await PlatformInvoice.create({
                    organizationId: org._id,
                    contractId: contract._id,
                    planVersionId: versionIds[def.planCode],
                    invoiceType: "initial",
                    invoiceNumber: `INV-SEED-${def.planCode.toUpperCase()}-001`,
                    billingCycleStart: now,
                    billingCycleEnd: cycleEnd,
                    dueDate: cycleEnd,
                    currency: def.currency,
                    basePlanAmount: def.lockedPrice,
                    basePlanAmountMinor: def.lockedPrice * 100,
                    subtotalAmount: def.lockedPrice,
                    subtotalAmountMinor: def.lockedPrice * 100,
                    taxAmount: 0,
                    taxAmountMinor: 0,
                    totalAmount: def.lockedPrice,
                    totalAmountMinor: def.lockedPrice * 100,
                    status: "paid",
                    paymentStatus: "captured",
                    paidAt: now,
                    paymentProvider: "manual",
                    regionCode: def.regionCode,
                    idempotencyKey: `seed:${def.slug}:initial`,
                    createdBy: ACTOR_ID,
                    lineItems: [{
                        description: `${def.planCode} — monthly plan (seed)`,
                        quantity: 1,
                        unitPrice: def.lockedPrice,
                        unitPriceMinor: def.lockedPrice * 100,
                        total: def.lockedPrice,
                        totalMinor: def.lockedPrice * 100,
                        type: "plan"
                    }],
                    metadata: new Map([["seeded", "true"], ["billingInterval", "monthly"]])
                });
                invoiceId = inv._id;
            }

            seededOrgs.push({
                key: def.key,
                orgId: org._id.toString(),
                contractId: contract._id.toString(),
                invoiceId: invoiceId?.toString() || null,
                planCode: def.planCode,
                status: def.orgStatus,
                country: def.country,
            });

            ok(`[${def.key.toUpperCase()}] Org: ${org._id}  Contract: ${contract._id}${invoiceId ? `  Invoice: ${invoiceId}` : ""}`);

        } else {
            warn(`[DRY-RUN] Would create org: ${def.name} (${def.country}) — plan: ${def.planCode} — status: ${def.orgStatus}`);
            seededOrgs.push({ key: def.key, dryRun: true, planCode: def.planCode, country: def.country });
        }
    }

    // ────────────────────────────────────────────────────────────────────────
    // STEP 5 — VALIDATE
    // ────────────────────────────────────────────────────────────────────────
    console.log("\n── STEP 5: Validation ───────────────────────────────────────");

    if (IS_COMMIT) {
        const tplCount = await PlanTemplate.countDocuments();
        const pvCount = await PlanVersion.countDocuments();
        const orgCount = await Organization.countDocuments();
        const ctxCount = await OrgContract.countDocuments();
        const invCount = await PlatformInvoice.countDocuments();
        const userCount = await PlatformUser.countDocuments();

        ok(`PlanTemplates   : ${tplCount}`);
        ok(`PlanVersions    : ${pvCount}`);
        ok(`Organizations   : ${orgCount}`);
        ok(`OrgContracts    : ${ctxCount}`);
        ok(`PlatformInvoices: ${invCount}`);
        ok(`PlatformUsers   : ${userCount} (untouched)`);

        // Verify each org has a valid contract reference
        for (const s of seededOrgs) {
            if (s.orgId) {
                const org = await Organization.findById(s.orgId).lean();
                if (s.status !== "expired" && !org.currentContractId) {
                    warn(`${s.key}: org.currentContractId missing!`);
                } else {
                    ok(`${s.key}: contract linkage verified (currentContractId: ${org.currentContractId || "null/expired"})`);
                }
            }
        }

        // Confirm no subscription.plan, subscription.customPricing reads remaining in orgs
        const legacyCheck = await Organization.findOne({
            $or: [
                { "subscription.plan": { $exists: true, $ne: null } },
                { "subscription.customPricing": { $exists: true } },
            ]
        }).lean();
        if (legacyCheck) {
            warn("Found org with legacy subscription.plan or customPricing! Check schema.");
        } else {
            ok("No legacy commercial fields on any Organization document.");
        }

    } else {
        warn("[DRY-RUN] Skipping live counts — no data written.");
    }

    // ────────────────────────────────────────────────────────────────────────
    // SUMMARY
    // ────────────────────────────────────────────────────────────────────────
    console.log("\n╔══════════════════════════════════════════════════════════╗");
    console.log(`║  SEED ${IS_COMMIT ? "COMPLETED ✅                                      " : "DRY-RUN COMPLETE (re-run with --commit)      "}║`);
    console.log("╠══════════════════════════════════════════════════════════╣");
    console.log("║  TEST ORG IDs                                           ║");
    for (const s of seededOrgs) {
        const idStr = s.orgId ? s.orgId.slice(-8) : "N/A (dry)";
        const line = `  [${s.key.padEnd(8)}] plan=${s.planCode.padEnd(10)} country=${s.country}  id=...${idStr}`;
        console.log(`║${line.padEnd(58)}║`);
    }
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
