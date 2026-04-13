/**
 * fixPractitioners.js — Migration: Normalize Practitioner Data
 *
 * PURPOSE
 *   1. Populate `isPractitioner` flag on all existing users based on:
 *      - role name === "doctor"
 *      - jobTitle containing "doctor" or "orthodont"
 *      - manual email-based override (e.g. platform admin acting as doctor)
 *   2. Normalize `profile.specialty` from root-level `speciality` or `jobTitle`.
 *   3. Allow admin with isPractitioner=true to appear in doctor lists.
 *
 * WHY NOT USE MONGOOSE?
 *   This script targets each org's isolated DB (dental_org_<slug>).
 *   It must enumerate ALL per-org databases and run the migration in each.
 *
 * RUN
 *   node scripts/migrations/fixPractitioners.js
 *
 * ENV
 *   PLATFORM_MONGO_URI — URI of the platform DB (saasdental) — for listing orgs
 *   MONGO_HOST         — mongo host (default: 127.0.0.1)
 *   MONGO_PORT         — mongo port (default: 27017)
 */

"use strict";

require("dotenv").config();
const { MongoClient } = require("mongodb");

// ── Config ────────────────────────────────────────────────────────────────────

const PLATFORM_URI =
    process.env.PLATFORM_MONGO_URI ||
    process.env.MONGO_URI ||
    "mongodb://127.0.0.1:27017/saasdental";

const MONGO_HOST = process.env.MONGO_HOST || "127.0.0.1";
const MONGO_PORT = process.env.MONGO_PORT || "27017";

// Manual overrides: email → { isPractitioner, specialty }
// Add entries here for admins who act as doctors.
const MANUAL_OVERRIDES = {
    // Example: "admin@smilecare.clinic" → { isPractitioner: true, specialty: "orthodontist" }
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function detectPractitioner(user, roleName) {
    if (roleName && roleName.toLowerCase() === "doctor") return true;
    if (user.isPractitioner === true) return true;

    const jt = (user.jobTitle || "").toLowerCase();
    if (jt.includes("doctor") || jt.includes("orthodont") || jt.includes("dentist")) {
        return true;
    }
    return false;
}

function normalizeSpecialty(user) {
    // Priority: profile.specialty → speciality (root) → jobTitle → "general"
    const fromProfile  = user?.profile?.specialty;
    const fromRoot     = user?.speciality;
    const fromJobTitle = user?.jobTitle;

    const raw = fromProfile || fromRoot || fromJobTitle || "general";
    return raw.toLowerCase().trim();
}

// ── Per-org migration ─────────────────────────────────────────────────────────

async function migrateOrgDb(orgDbName, orgSlug) {
    const uri = `mongodb://${MONGO_HOST}:${MONGO_PORT}/${orgDbName}`;
    const client = new MongoClient(uri);

    try {
        await client.connect();
        const db = client.db();

        // Fetch roles so we can resolve roleName by roleId
        const roles = await db.collection("roles").find({}).project({ _id: 1, name: 1 }).toArray();
        const roleMap = new Map(roles.map(r => [r._id.toString(), r.name.toLowerCase()]));

        const users = await db.collection("users").find({}).toArray();
        console.log(`  [${orgSlug}] ${users.length} users found`);

        let updated = 0;

        for (const user of users) {
            const update = {};

            // Resolve role name
            const roleName = user.roleId ? (roleMap.get(user.roleId.toString()) || "") : "";

            // Check manual override first
            const override = MANUAL_OVERRIDES[user.email];
            if (override) {
                update.isPractitioner = override.isPractitioner;
                update["profile.specialty"] = override.specialty;
                console.log(`  ✎ OVERRIDE applied: ${user.email} → isPractitioner=${override.isPractitioner}`);
            } else {
                const isDoc = detectPractitioner(user, roleName);

                if (isDoc) {
                    update.isPractitioner = true;
                    update["profile.specialty"] = normalizeSpecialty(user);
                } else if (user.isPractitioner === undefined || user.isPractitioner === null) {
                    // Set false explicitly so query `{ isPractitioner: true }` is clean
                    update.isPractitioner = false;
                }
            }

            if (Object.keys(update).length === 0) continue;

            await db.collection("users").updateOne(
                { _id: user._id },
                { $set: update }
            );

            updated++;
            if (update.isPractitioner) {
                console.log(`  ✔ ${user.email || user.name} → isPractitioner=true, specialty="${update["profile.specialty"]}"`);
            }
        }

        console.log(`  [${orgSlug}] ${updated} users updated`);
    } finally {
        await client.close();
    }
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function runMigration() {
    const platformClient = new MongoClient(PLATFORM_URI);

    try {
        await platformClient.connect();
        console.log("✅ Connected to platform DB");

        const platformDb = platformClient.db();
        const orgs = await platformDb.collection("organizations")
            .find({ status: { $ne: "archived" } })
            .project({ _id: 1, slug: 1, name: 1 })
            .toArray();

        console.log(`\nFound ${orgs.length} active organizations\n`);

        for (const org of orgs) {
            const dbName = `dental_org_${org.slug}`;
            console.log(`\n── Migrating org: ${org.name} (${dbName}) ──`);
            try {
                await migrateOrgDb(dbName, org.slug);
            } catch (err) {
                console.error(`  ❌ Failed for org ${org.slug}:`, err.message);
            }
        }

        console.log("\n✅ Migration completed for all organizations");
    } finally {
        await platformClient.close();
    }
}

runMigration().catch((err) => {
    console.error("❌ Migration failed:", err);
    process.exit(1);
});
