#!/usr/bin/env node
require("module-alias/register");
/**
 * migratePricingToGlobal.js
 * Phase 1 — Pricing Decoupling (Region → Global)
 *
 * Backfills `pricing.global` on PlanVersion and AddOn documents from the
 * legacy `pricing.regions[]` or `pricingV3.default` trees. Non-destructive:
 * `pricing.regions[]` stays intact.
 *
 * Output shape (matches Phase 1 schema on PlanTemplate / PlanVersion):
 *   pricing.global = {
 *     currency: "USD",
 *     amountMonthly: Number,
 *     amountYearly:  Number,
 *     providerPriceIds: { stripe: { monthly, yearly }, kashier: { monthly, yearly } }
 *   }
 *
 * Source priority (first match wins):
 *   1) pricing.regions[] — region with currency === "USD"
 *   2) pricingV3.default — root USD price (currency === "USD")
 *
 * Idempotency:
 *   Rows where `pricing.global` is already populated (either new shape
 *   `amountMonthly` OR legacy shape `monthly` from earlier dry-runs) are
 *   skipped. Existing `pricing.global` values are NEVER overwritten.
 *
 * A row that cannot be resolved is flagged NEEDS_MANUAL_REVIEW and left
 * untouched.
 *
 * Usage:
 *   node backend/scripts/migratePricingToGlobal.js --dry-run
 *   node backend/scripts/migratePricingToGlobal.js --commit
 *
 * Notes:
 *   - Per-doc transactions (session.withTransaction) — single-doc writes
 *     are atomic anyway, but the wrapper keeps the code symmetric with
 *     the rest of the platform's migration scripts.
 *   - OrgContract / OrgAddOn snapshots are NEVER touched. Historical
 *     immutability is preserved per §9 CLAUDE.md.
 */

"use strict";

const mongoose = require("mongoose");
const path = require("path");

require("dotenv").config({ path: path.resolve(__dirname, "../.env") });

const PlanVersion = require("@billing/models/PlanVersion.model").default;
const AddOn = require("@platform/domain/models/addOn.model").default;

// ─── CLI ──────────────────────────────────────────────────────────────────────

const args = process.argv.slice(2);
const isDryRun = args.includes("--dry-run");
const isCommit = args.includes("--commit");

if (!isDryRun && !isCommit) {
    console.error("Usage: node migratePricingToGlobal.js [--dry-run | --commit]");
    process.exit(1);
}

const MODE = isDryRun ? "DRY-RUN" : "COMMIT";

// ─── Extraction ───────────────────────────────────────────────────────────────

/**
 * Resolve a { monthly, yearly } USD pair from a legacy pricing tree.
 * Returns null if nothing USD-priced can be found.
 */
function extractUsdPair(pricing) {
    if (!pricing) return null;

    // 1) pricing.regions[] — pick the USD region (if any)
    const regions = Array.isArray(pricing.regions) ? pricing.regions : [];
    const usdRegion = regions.find(
        (r) => (r.currency || "").toUpperCase() === "USD"
    );
    if (usdRegion && typeof usdRegion.monthly === "number") {
        return {
            monthly: usdRegion.monthly,
            yearly: typeof usdRegion.yearly === "number" ? usdRegion.yearly : null,
            source: "regions[USD]"
        };
    }

    // 2) pricingV3.default — root USD price
    const v3 = pricing.pricingV3 || pricing.v3;
    if (v3 && v3.default) {
        const d = v3.default;
        if ((d.currency || "").toUpperCase() === "USD" && typeof d.monthly === "number") {
            return {
                monthly: d.monthly,
                yearly: typeof d.yearly === "number" ? d.yearly : null,
                source: "pricingV3.default"
            };
        }
    }

    return null;
}

// ─── Migration core ───────────────────────────────────────────────────────────

async function migrateCollection({ label, Model }) {
    console.log(`\n── ${label} ─────────────────────────────────────────────`);

    const cursor = Model.find({}).cursor();
    let scanned = 0;
    let skippedAlreadyMigrated = 0;
    let migrated = 0;
    let manualReview = 0;
    const reviewList = [];

    for await (const doc of cursor) {
        scanned++;

        // Idempotency: skip any doc that already has pricing.global populated,
        // regardless of whether it uses the new (amountMonthly) or legacy
        // dry-run (monthly) field. We never overwrite.
        const currentGlobal = doc.pricing?.global;
        if (
            currentGlobal &&
            (typeof currentGlobal.amountMonthly === "number" ||
             typeof currentGlobal.monthly === "number")
        ) {
            skippedAlreadyMigrated++;
            continue;
        }

        const usd = extractUsdPair({
            ...(doc.pricing || {}),
            pricingV3: doc.pricingV3 // PlanVersion holds pricingV3 as sibling field
        });

        if (!usd || typeof usd.monthly !== "number" || typeof usd.yearly !== "number") {
            manualReview++;
            reviewList.push({
                id: String(doc._id),
                code: doc.templateCode || doc.code || "(unknown)",
                reason: !usd
                    ? "No USD region or pricingV3.default found"
                    : "Missing monthly or yearly"
            });
            continue;
        }

        // Carry provider price IDs forward where possible. Kashier is new —
        // no legacy provider IDs exist for it; those will be populated later
        // when the Kashier catalog is created (Phase 2).
        const regions = Array.isArray(doc.pricing?.regions) ? doc.pricing.regions : [];
        const usdRegion = regions.find(
            (r) => (r.currency || "").toUpperCase() === "USD"
        );
        const legacyStripeIds = usdRegion?.providerPriceIds?.stripe || {};

        const nextGlobal = {
            currency: "USD",
            amountMonthly: usd.monthly,
            amountYearly: usd.yearly,
            providerPriceIds: {
                stripe: {
                    monthly: legacyStripeIds.monthly || "",
                    yearly: legacyStripeIds.yearly || ""
                },
                kashier: {
                    monthly: "",
                    yearly: ""
                }
            }
        };

        console.log(
            `  ${MODE} → ${doc.templateCode || doc.code} ` +
            `amountMonthly=$${usd.monthly} amountYearly=$${usd.yearly} (source=${usd.source})`
        );

        if (isCommit) {
            const session = await mongoose.connection.startSession();
            try {
                await session.withTransaction(async () => {
                    await Model.updateOne(
                        { _id: doc._id },
                        { $set: { "pricing.global": nextGlobal } },
                        { session }
                    );
                });
            } finally {
                await session.endSession();
            }
        }

        migrated++;
    }

    console.log(`\n  Scanned:             ${scanned}`);
    console.log(`  Skipped (migrated):  ${skippedAlreadyMigrated}`);
    console.log(`  ${isCommit ? "Migrated" : "Would migrate"}: ${migrated}`);
    console.log(`  NEEDS_MANUAL_REVIEW: ${manualReview}`);
    if (reviewList.length > 0) {
        console.log("\n  Manual review rows:");
        for (const r of reviewList) {
            console.log(`    - ${r.code} (${r.id}): ${r.reason}`);
        }
    }
}

// ─── Entrypoint ───────────────────────────────────────────────────────────────

async function main() {
    console.log(`\n[migratePricingToGlobal] Mode: ${MODE}`);

    await mongoose.connect(process.env.MONGO_URI, { serverSelectionTimeoutMS: 5000 });
    console.log("[migratePricingToGlobal] Connected to MongoDB");

    try {
        await migrateCollection({
            label: "PlanVersion",
            Model: PlanVersion
        });

        await migrateCollection({
            label: "AddOn",
            Model: AddOn
        });
    } finally {
        await mongoose.disconnect();
        console.log("\n[migratePricingToGlobal] Disconnected. Done.");
    }
}

main().catch((err) => {
    console.error("[migratePricingToGlobal] FATAL:", err);
    process.exit(1);
});
