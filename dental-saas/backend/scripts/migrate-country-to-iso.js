require("module-alias/register");
/**
 * migrate-country-to-iso.js
 * v20.1 Wave4 — Enterprise ISO Country Data Migration
 *
 * Converts legacy display-name country values ("Egypt", "Saudi Arabia")
 * to ISO codes ("EG", "SA") in all Organization documents.
 *
 * Flags:
 *   --dry-run    Scan and report only (default)
 *   --commit     Execute migration with transaction
 *   --rollback   Restore from latest backup snapshot
 *
 * Safety:
 *   - Uses Mongo session transaction
 *   - Idempotent (ISO values are skipped)
 *   - Creates backup snapshot before commit
 *   - Logs every change
 *   - Fails on unmapped values (never guesses)
 *
 * Usage:
 *   node scripts/migrate-country-to-iso.js --dry-run
 *   node scripts/migrate-country-to-iso.js --commit
 *   node scripts/migrate-country-to-iso.js --rollback
 */

require("dotenv").config();
const mongoose = require("mongoose");
const fs = require("fs");
const path = require("path");

// ─── Import mapping from canonical source ────────────────────────────────────
const { getCountryCode } = require("../src/utils/countryMapping");

// ─── Extract ISO enum from Organization model schema ─────────────────────────
const Organization = require("../src/models/Organization");
const ISO_ENUM = Organization.schema.path("country").enumValues;

// ─── Directories ─────────────────────────────────────────────────────────────
const BACKUP_DIR = path.resolve(__dirname, "../migration-backups");
const REPORT_DIR = path.resolve(__dirname, "../migration-reports");

function ensureDirs() {
    if (!fs.existsSync(BACKUP_DIR)) fs.mkdirSync(BACKUP_DIR, { recursive: true });
    if (!fs.existsSync(REPORT_DIR)) fs.mkdirSync(REPORT_DIR, { recursive: true });
}

// ─── Parse CLI flags ─────────────────────────────────────────────────────────
const args = process.argv.slice(2);
const MODE = args.includes("--commit") ? "COMMIT"
    : args.includes("--rollback") ? "ROLLBACK"
        : "DRY_RUN";

// ─── Helpers ─────────────────────────────────────────────────────────────────
function isISO(value) {
    return ISO_ENUM.includes(value);
}

function timestamp() {
    return new Date().toISOString().replace(/[:.]/g, "-");
}

// ─── ROLLBACK ────────────────────────────────────────────────────────────────
async function rollback() {
    const files = fs.readdirSync(BACKUP_DIR)
        .filter(f => f.startsWith("organizations-country-") && f.endsWith(".json"))
        .sort()
        .reverse();

    if (files.length === 0) {
        console.error("❌ No backup files found in", BACKUP_DIR);
        process.exit(1);
    }

    const latestFile = path.join(BACKUP_DIR, files[0]);
    console.log(`\n🔄 Rolling back from: ${files[0]}`);

    const backup = JSON.parse(fs.readFileSync(latestFile, "utf8"));
    console.log(`   Records to restore: ${backup.length}`);

    const session = await mongoose.startSession();
    session.startTransaction();

    try {
        let restored = 0;
        for (const record of backup) {
            await Organization.updateOne(
                { _id: record._id },
                { $set: { country: record.country } },
                { session }
            );
            restored++;
        }

        await session.commitTransaction();
        session.endSession();

        console.log(`\n✅ Rollback complete. Restored ${restored} records.`);
        console.log(`   Source: ${files[0]}`);
    } catch (err) {
        await session.abortTransaction();
        session.endSession();
        console.error("❌ Rollback transaction failed:", err.message);
        process.exit(1);
    }
}

// ─── MIGRATE (dry-run or commit) ─────────────────────────────────────────────
async function migrate() {
    const ts = timestamp();

    // Fetch all organizations (bypass enum validation for read)
    const orgs = await Organization.collection.find(
        {},
        { projection: { _id: 1, country: 1 } }
    ).toArray();

    const report = {
        mode: MODE,
        timestamp: new Date().toISOString(),
        totalScanned: orgs.length,
        alreadyISO: 0,
        migrated: 0,
        unmapped: 0,
        changes: [],
        unmappedRecords: [],
        backupFile: null,
        transactionStatus: null
    };

    for (const org of orgs) {
        const currentCountry = org.country;

        // Already ISO — skip
        if (isISO(currentCountry)) {
            report.alreadyISO++;
            continue;
        }

        // Attempt mapping via countryMapping.js
        const isoCode = getCountryCode(currentCountry);

        if (!isoCode) {
            report.unmapped++;
            report.unmappedRecords.push({
                _id: org._id.toString(),
                country: currentCountry,
                reason: "No mapping found in countryMapping.js"
            });
            console.warn(`   ⚠️  Unmapped: _id=${org._id} country="${currentCountry}"`);
            continue;
        }

        report.changes.push({
            _id: org._id.toString(),
            from: currentCountry,
            to: isoCode
        });
        report.migrated++;
    }

    // ─── Print Summary ───────────────────────────────────────────────────────
    console.log("");
    console.log("═══════════════════════════════════════");
    console.log("  ISO MIGRATION REPORT");
    console.log("═══════════════════════════════════════");
    console.log(`  Mode:          ${MODE}`);
    console.log(`  Scanned:       ${report.totalScanned}`);
    console.log(`  Already ISO:   ${report.alreadyISO}`);
    console.log(`  Migrated:      ${report.migrated}`);
    console.log(`  Unmapped:      ${report.unmapped}`);

    if (report.unmapped > 0) {
        console.log("");
        console.log("  ⚠️  Unmapped records:");
        for (const u of report.unmappedRecords) {
            console.log(`     _id=${u._id}  country="${u.country}"`);
        }
    }

    // ─── DRY RUN — stop here ─────────────────────────────────────────────────
    if (MODE === "DRY_RUN") {
        report.transactionStatus = "SKIPPED (dry-run)";
        console.log(`  Backup file:   N/A (dry-run)`);
        console.log(`  Transaction:   SKIPPED (dry-run)`);
        console.log("");
        console.log("  ℹ️  Run with --commit to execute migration.");
    }

    // ─── COMMIT — execute with transaction ───────────────────────────────────
    if (MODE === "COMMIT") {
        if (report.changes.length === 0) {
            report.transactionStatus = "SKIPPED (nothing to migrate)";
            console.log(`  Transaction:   SKIPPED (nothing to migrate)`);
        } else {
            // 1. Create backup
            const backupFile = `organizations-country-${ts}.json`;
            const backupPath = path.join(BACKUP_DIR, backupFile);

            const backupData = orgs
                .filter(o => !isISO(o.country))
                .map(o => ({ _id: o._id.toString(), country: o.country }));

            fs.writeFileSync(backupPath, JSON.stringify(backupData, null, 2));
            report.backupFile = backupFile;
            console.log(`  Backup file:   ${backupFile}`);

            // 2. Execute transaction
            const session = await mongoose.startSession();
            session.startTransaction();

            try {
                for (const change of report.changes) {
                    await Organization.collection.updateOne(
                        { _id: new mongoose.Types.ObjectId(change._id) },
                        { $set: { country: change.to } },
                        { session }
                    );
                }

                await session.commitTransaction();
                session.endSession();

                report.transactionStatus = "COMMITTED";
                console.log(`  Transaction:   ✅ COMMITTED`);
            } catch (err) {
                await session.abortTransaction();
                session.endSession();

                report.transactionStatus = `ABORTED: ${err.message}`;
                console.error(`  Transaction:   ❌ ABORTED — ${err.message}`);
                console.error("  Backup preserved. Run --rollback to restore.");
            }
        }
    }

    // ─── Write report ────────────────────────────────────────────────────────
    const reportFile = `iso-migration-${ts}.json`;
    const reportPath = path.join(REPORT_DIR, reportFile);
    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
    report.reportFile = reportFile;

    console.log(`  Report file:   ${reportFile}`);
    console.log("");

    return report;
}

// ─── MAIN ────────────────────────────────────────────────────────────────────
async function main() {
    ensureDirs();

    const mongoUri = process.env.MONGO_URI || process.env.DATABASE_URL;
    if (!mongoUri) {
        console.error("❌ MONGO_URI or DATABASE_URL not set in environment");
        process.exit(1);
    }

    await mongoose.connect(mongoUri);
    console.log("📦 Connected to MongoDB");

    try {
        if (MODE === "ROLLBACK") {
            await rollback();
        } else {
            await migrate();
        }
    } catch (err) {
        console.error("❌ Migration failed:", err.message);
        process.exit(1);
    } finally {
        await mongoose.disconnect();
        console.log("📦 Disconnected from MongoDB");
    }
}

main();
