require("module-alias/register");
/**
 * validate-iso-data.js
 * v20.1 Wave4 — ISO Country Data Validator
 *
 * Scans all Organization documents and validates that every
 * country field contains a valid ISO code from the model enum.
 *
 * Exit code 1 if any invalid records found.
 *
 * Usage:
 *   node scripts/validate-iso-data.js
 */

require("dotenv").config();
const mongoose = require("mongoose");

const Organization = require("../src/models/Organization");
const ISO_ENUM = Organization.schema.path("country").enumValues;

async function validate() {
    const mongoUri = process.env.MONGO_URI || process.env.DATABASE_URL;
    if (!mongoUri) {
        console.error("❌ MONGO_URI or DATABASE_URL not set in environment");
        process.exit(1);
    }

    await mongoose.connect(mongoUri);
    console.log("📦 Connected to MongoDB");

    try {
        // Use collection directly to bypass enum validation on read
        const orgs = await Organization.collection.find(
            {},
            { projection: { _id: 1, country: 1, name: 1 } }
        ).toArray();

        const invalid = [];
        let valid = 0;

        for (const org of orgs) {
            if (ISO_ENUM.includes(org.country)) {
                valid++;
            } else {
                invalid.push({
                    _id: org._id.toString(),
                    name: org.name,
                    country: org.country
                });
            }
        }

        console.log("");
        console.log("═══════════════════════════════════════");
        console.log("  ISO DATA VALIDATION REPORT");
        console.log("═══════════════════════════════════════");
        console.log(`  Total records:     ${orgs.length}`);
        console.log(`  Valid ISO:         ${valid}`);
        console.log(`  Invalid:           ${invalid.length}`);
        console.log(`  Allowed codes:     ${ISO_ENUM.join(", ")}`);
        console.log("");

        if (invalid.length > 0) {
            console.error("  ❌ INVALID RECORDS:");
            console.error("");
            for (const rec of invalid) {
                console.error(`     _id=${rec._id}  name="${rec.name}"  country="${rec.country}"`);
            }
            console.error("");
            console.error("  RESULT: FAILED — Non-ISO country values detected.");
            console.error("  Run: npm run migrate:iso:commit to fix.");

            await mongoose.disconnect();
            process.exit(1);
        }

        console.log("  ✅ All records have valid ISO country codes.");
        console.log("");
        console.log("  RESULT: PASSED");
    } catch (err) {
        console.error("❌ Validation failed:", err.message);
        process.exit(1);
    } finally {
        await mongoose.disconnect();
        console.log("📦 Disconnected from MongoDB");
    }
}

validate();
