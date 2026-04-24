/**
 * testPersistence.js — MongoDB Volume Persistence Verifier
 *
 * Writes a timestamped test document to the `persistence_test` collection,
 * then reads it back to confirm the write succeeded. After running:
 *
 *   1. Restart the Docker Mongo container:  docker restart dental-mongo
 *   2. Run this script again to confirm the record survived.
 *
 * If the record disappears after restart → named volume is NOT working.
 * If the record persists → volume is correctly mounted.
 *
 * USAGE:
 *   node scripts/testPersistence.js
 *   node scripts/testPersistence.js --read    (read-only, prints existing records)
 *   node scripts/testPersistence.js --clear   (delete all test records)
 *
 * PLANE: Dev tooling (never imported by backend code)
 */

"use strict";

require("dotenv").config();
const mongoose = require("mongoose");

const MONGO_URI = process.env.MONGO_URI || "mongodb://127.0.0.1:27017/saasdental";
const MODE = process.argv.includes("--read")  ? "read"
           : process.argv.includes("--clear") ? "clear"
           : "write";

async function run() {
    console.log("");
    console.log("╔══════════════════════════════════════════════════╗");
    console.log("║   DentalSaaS — MongoDB Persistence Test          ║");
    console.log("╚══════════════════════════════════════════════════╝");
    console.log("");
    console.log(`  MONGO_URI : ${MONGO_URI}`);
    console.log(`  Mode      : ${MODE}`);
    console.log("");

    await mongoose.connect(MONGO_URI);
    console.log(`  ✅  Connected — db=${mongoose.connection.name} host=${mongoose.connection.host}:${mongoose.connection.port}`);
    console.log("");

    const col = mongoose.connection.db.collection("persistence_test");

    // ── WRITE mode ────────────────────────────────────────────────────────────
    if (MODE === "write") {
        const doc = {
            test:      true,
            ts:        new Date(),
            pid:       process.pid,
            nodeEnv:   process.env.NODE_ENV || "not set",
            runNumber: await col.countDocuments() + 1,
        };

        const result = await col.insertOne(doc);

        console.log("  ✅  Test record inserted:");
        console.log(`      _id       : ${result.insertedId}`);
        console.log(`      timestamp : ${doc.ts.toISOString()}`);
        console.log(`      runNumber : ${doc.runNumber}`);
        console.log("");
        console.log("  ─────────────────────────────────────────────");
        console.log("  HOW TO VERIFY PERSISTENCE:");
        console.log("");
        console.log("  1. Restart Mongo container:");
        console.log("       docker restart dental-mongo");
        console.log("");
        console.log("  2. Run this script again in read mode:");
        console.log("       node scripts/testPersistence.js --read");
        console.log("");
        console.log("  Expected: the record above is still there.");
        console.log("  If missing: check docker-compose.yml volumes config.");
        console.log("  ─────────────────────────────────────────────");
    }

    // ── READ mode ─────────────────────────────────────────────────────────────
    if (MODE === "read") {
        const records = await col.find({}).sort({ ts: -1 }).toArray();

        if (records.length === 0) {
            console.log("  ⚠️   No persistence_test records found.");
            console.log("      Run in write mode first:");
            console.log("      node scripts/testPersistence.js");
        } else {
            console.log(`  ✅  Found ${records.length} persistence_test record(s):\n`);
            records.forEach((r, i) => {
                console.log(`  [${i + 1}] _id       : ${r._id}`);
                console.log(`      timestamp : ${new Date(r.ts).toISOString()}`);
                console.log(`      runNumber : ${r.runNumber}`);
                console.log(`      nodeEnv   : ${r.nodeEnv}`);
                console.log("");
            });
            console.log("  ✅  Persistence verified — data survived container restart.");
        }
    }

    // ── CLEAR mode ────────────────────────────────────────────────────────────
    if (MODE === "clear") {
        const { deletedCount } = await col.deleteMany({});
        console.log(`  🗑   Cleared ${deletedCount} persistence_test record(s).`);
    }

    console.log("");
    await mongoose.disconnect();
    process.exit(0);
}

run().catch((err) => {
    console.error("");
    console.error("  ❌  Error:", err.message);
    console.error("");
    mongoose.disconnect().finally(() => process.exit(1));
});
