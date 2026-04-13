/**
 * seed-treatment-catalog.js
 * Domain: treatment-catalog
 *
 * Seeds ONE category (Orthodontics) and 5 procedures for a given org database.
 *
 * USAGE:
 *   node backend/scripts/seed-treatment-catalog.js --orgId=<organizationId>
 *   node backend/scripts/seed-treatment-catalog.js --all        (seeds ALL org databases)
 *
 * SAFE: Uses upsert — running multiple times will not create duplicates.
 *
 * FLAGS:
 *   --dry-run   Print what would be seeded without writing to DB.
 *   --orgId=X   Seed only the database for org X (dental_org_X)
 *   --all       Seed all dental_org_* databases
 */

"use strict";

const mongoose = require("mongoose");
const { MongoClient, ObjectId } = require("mongodb");

const MONGO_URI = process.env.MONGO_URI || "mongodb://127.0.0.1:27017";
const DRY_RUN   = process.argv.includes("--dry-run");
const SEED_ALL  = process.argv.includes("--all");

const orgArg = process.argv.find(a => a.startsWith("--orgId="));
const ORG_ID  = orgArg ? orgArg.split("=")[1] : null;

if (!SEED_ALL && !ORG_ID) {
    console.error("[seed-treatment-catalog] ERROR: Provide --orgId=<id> or --all");
    process.exit(1);
}

// ── Seed Data ─────────────────────────────────────────────────────────────────

const ORTHODONTICS_CODE = "ORTHO";

const CATEGORY_SEED = {
    name: "Orthodontics",
    code: ORTHODONTICS_CODE,
    icon: "orthopedics",
    description: "Orthodontic treatment procedures — alignment, bonding, wire management",
    isActive: true,
    sortOrder: 0,
};

const PROCEDURE_SEEDS = [
    {
        name: "Bonding",
        code: "ORTHO-BOND",
        duration: 60,
        color: "#4f46e5",
        description: "Bracket bonding — initial placement of orthodontic brackets",
        sortOrder: 0,
    },
    {
        name: "Debonding",
        code: "ORTHO-DEBOND",
        duration: 45,
        color: "#7c3aed",
        description: "Bracket removal at end of orthodontic treatment",
        sortOrder: 1,
    },
    {
        name: "Wire Change",
        code: "ORTHO-WIRE",
        duration: 15,
        color: "#2563eb",
        description: "Archwire replacement or progression",
        sortOrder: 2,
    },
    {
        name: "Elastic Change",
        code: "ORTHO-ELAST",
        duration: 10,
        color: "#059669",
        description: "Elastic ligature replacement",
        sortOrder: 3,
    },
    {
        name: "Adjustment Visit",
        code: "ORTHO-ADJ",
        duration: 20,
        color: "#d97706",
        description: "Routine orthodontic adjustment visit",
        sortOrder: 4,
    },
];

// ── Main ──────────────────────────────────────────────────────────────────────

async function seedDatabase(db, orgId) {
    const dbName = db.databaseName;
    const categories = db.collection("treatmentcategories");
    const procedures  = db.collection("treatmentprocedures");

    console.log(`\n  [${dbName}] Seeding treatment catalog...`);

    if (DRY_RUN) {
        console.log(`  [${dbName}] DRY RUN — would create: 1 category + ${PROCEDURE_SEEDS.length} procedures`);
        return;
    }

    // Upsert category
    const categoryResult = await categories.findOneAndUpdate(
        { organizationId: new ObjectId(orgId), code: ORTHODONTICS_CODE },
        {
            $setOnInsert: {
                ...CATEGORY_SEED,
                organizationId: new ObjectId(orgId),
                createdAt: new Date(),
            },
            $set: {
                updatedAt: new Date(),
            },
        },
        { upsert: true, returnDocument: "after" }
    );

    const categoryId = categoryResult._id ?? categoryResult.value?._id;
    console.log(`  [${dbName}] Category: ${CATEGORY_SEED.name} (${categoryId})`);

    // Upsert procedures
    for (const proc of PROCEDURE_SEEDS) {
        await procedures.findOneAndUpdate(
            { organizationId: new ObjectId(orgId), code: proc.code },
            {
                $setOnInsert: {
                    ...proc,
                    organizationId: new ObjectId(orgId),
                    categoryId,
                    isActive: true,
                    createdAt: new Date(),
                },
                $set: { updatedAt: new Date() },
            },
            { upsert: true }
        );
        console.log(`  [${dbName}]   ✓ ${proc.name} (${proc.duration} min, ${proc.color})`);
    }
}

async function run() {
    console.log(`[seed-treatment-catalog] DRY_RUN=${DRY_RUN}, SEED_ALL=${SEED_ALL}`);
    const client = new MongoClient(MONGO_URI);
    await client.connect();

    let targets = [];

    if (SEED_ALL) {
        const { databases } = await client.db("admin").command({ listDatabases: 1, nameOnly: true });
        targets = databases
            .map(d => d.name)
            .filter(n => n.startsWith("dental_org_"))
            .map(dbName => ({
                db: client.db(dbName),
                orgId: dbName.replace("dental_org_", ""),
            }));
    } else {
        targets = [{ db: client.db(`dental_org_${ORG_ID}`), orgId: ORG_ID }];
    }

    console.log(`[seed-treatment-catalog] Targeting ${targets.length} database(s)`);

    for (const { db, orgId } of targets) {
        await seedDatabase(db, orgId);
    }

    await client.close();
    console.log("\n[seed-treatment-catalog] Done.\n");
}

run().catch(err => {
    console.error("[seed-treatment-catalog] FATAL:", err.message);
    process.exit(1);
});
