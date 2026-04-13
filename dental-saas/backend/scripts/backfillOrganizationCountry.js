require("module-alias/register");
/**
 * backfillOrganizationCountry.js
 * ─────────────────────────────────────────────────────────────────────────────
 * One-shot migration: sets `country = "EG"` on any Organization document that
 * has country missing or null.
 *
 * Background
 * ──────────
 * Prior to v20.1 Wave4 the provisioning service was correctly writing `country`
 * to the DB, but `getOrganizationDetails` omitted it from its API response, so
 * the UI showed blank. Any organizations created before the schema field was
 * added (or before the ISO invariant was enforced) may have no country stored.
 *
 * Sentinel §4 compliance
 * ──────────────────────
 * Only ISO-3166-1 alpha-2 codes are stored. Display names are NEVER persisted.
 *
 * Usage
 * ─────
 *   node scripts/backfillOrganizationCountry.js           # dry-run (safe)
 *   node scripts/backfillOrganizationCountry.js --apply   # write to DB
 *   node scripts/backfillOrganizationCountry.js --apply --country=SA
 *
 * Options
 * ───────
 *   --apply            Actually write to the database (default: dry-run)
 *   --country=<ISO>    Default country code for orgs with no country (default: EG)
 *
 * ─────────────────────────────────────────────────────────────────────────────
 */

"use strict";

require("dotenv").config();
const mongoose = require("mongoose");
const Organization = require("../src/shared/models/Organization");

// ─── CLI args ─────────────────────────────────────────────────────────────────

const args = process.argv.slice(2);
const DRY_RUN = !args.includes("--apply");
const countryArg = args.find(a => a.startsWith("--country="));
const DEFAULT_COUNTRY = countryArg ? countryArg.split("=")[1].toUpperCase().trim() : "EG";

// Validate supplied country against allowed set (Sentinel §4)
const ALLOWED_ISO = ["EG", "SA", "AE", "KW", "QA", "BH", "OM", "GB", "US"];
if (!ALLOWED_ISO.includes(DEFAULT_COUNTRY)) {
    console.error(`[ABORT] --country must be one of: ${ALLOWED_ISO.join(", ")}. Got: "${DEFAULT_COUNTRY}"`);
    process.exit(1);
}

// ─── Main ─────────────────────────────────────────────────────────────────────

(async () => {
    await mongoose.connect(process.env.MONGO_URI || process.env.MONGODB_URI);
    console.log(`\n[BackfillCountry] Connected to MongoDB`);
    console.log(`[BackfillCountry] Mode: ${DRY_RUN ? "DRY-RUN (no writes)" : "APPLY (writing to DB)"}`);
    console.log(`[BackfillCountry] Default country: ${DEFAULT_COUNTRY}\n`);

    // Find orgs that have country missing, null, or empty string
    const TARGET_FILTER = {
        $or: [
            { country: { $exists: false } },
            { country: null },
            { country: "" },
        ],
    };

    const affected = await Organization.find(TARGET_FILTER)
        .select("_id name country regionCode createdAt")
        .lean();

    if (affected.length === 0) {
        console.log("[BackfillCountry] No organizations need backfilling. All orgs have country set.");
        await mongoose.disconnect();
        return;
    }

    console.log(`[BackfillCountry] Found ${affected.length} organization(s) missing country:\n`);

    for (const org of affected) {
        console.log(`  • ${org.name} (${org._id}) | region: ${org.regionCode || "none"} | created: ${org.createdAt?.toISOString().slice(0, 10) || "??"}`);
    }

    if (DRY_RUN) {
        console.log(`\n[BackfillCountry] DRY-RUN complete. No changes made.`);
        console.log(`[BackfillCountry] Re-run with --apply to commit changes.`);
        await mongoose.disconnect();
        return;
    }

    // Apply: bulk update all affected orgs with the default country
    const result = await Organization.updateMany(
        TARGET_FILTER,
        { $set: { country: DEFAULT_COUNTRY } }
    );

    console.log(`\n[BackfillCountry] Updated ${result.modifiedCount} / ${result.matchedCount} organization(s) → country="${DEFAULT_COUNTRY}"`);

    if (result.modifiedCount !== affected.length) {
        console.warn(`[BackfillCountry] WARNING: ${affected.length - result.modifiedCount} org(s) were not updated. This may indicate a concurrent modification.`);
    }

    console.log("[BackfillCountry] Done.\n");
    await mongoose.disconnect();
})().catch(err => {
    console.error("[BackfillCountry] FATAL:", err.message);
    process.exit(1);
});
