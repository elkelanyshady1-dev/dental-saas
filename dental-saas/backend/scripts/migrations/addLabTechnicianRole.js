/**
 * addLabTechnicianRole.js
 * Migration: Add lab_technician system role to all existing organizations
 *
 * RUN ONCE — idempotent (skips orgs that already have the role).
 *
 * Usage:
 *   node scripts/migrations/addLabTechnicianRole.js
 *
 * Prerequisites:
 *   MONGO_URI environment variable (or .env file at project root)
 */

"use strict";

require("dotenv").config();
const mongoose = require("mongoose");
const Organization = require("../../src/shared/models/Organization");
const Role = require("../../src/shared/models/Role");

const LAB_TECH_PERMISSIONS = {
    patients: { read: true, create: false, update: false, delete: false },
    appointments: { read: false, create: false, update: false, delete: false },
    recalls: { read: false, create: false, update: false, delete: false },
    families: { read: false, create: false, update: false, delete: false },
    accounting: { read: false, create: false, update: false, delete: false },
    orthodontics: { read: true, create: false, update: true, delete: false },
    calendar: { read: true, multiBranchView: false },
};

async function run() {
    await mongoose.connect(process.env.MONGO_URI);
    console.log("Connected to MongoDB");

    const orgs = await Organization.find({}).select("_id name").lean();
    console.log(`Found ${orgs.length} organizations to process`);

    let created = 0;
    let skipped = 0;
    let errors = 0;

    for (const org of orgs) {
        try {
            const existing = await Role.findOne({
                organizationId: org._id,
                name: "lab_technician"
            }).lean();

            if (existing) {
                console.log(`  SKIP  ${org.name || org._id} — lab_technician already exists`);
                skipped++;
                continue;
            }

            await Role.create({
                name: "lab_technician",
                organizationId: org._id,
                isSystemRole: true,
                permissions: LAB_TECH_PERMISSIONS,
            });

            console.log(`  CREATE ${org.name || org._id} — lab_technician role created`);
            created++;

        } catch (err) {
            console.error(`  ERROR  ${org.name || org._id} — ${err.message}`);
            errors++;
        }
    }

    console.log("\n════════════════════════════════════════");
    console.log(`  Migration complete`);
    console.log(`  Created:  ${created}`);
    console.log(`  Skipped:  ${skipped}`);
    console.log(`  Errors:   ${errors}`);
    console.log("════════════════════════════════════════");

    await mongoose.disconnect();
    process.exit(errors > 0 ? 1 : 0);
}

run().catch(err => {
    console.error("Fatal migration error:", err);
    process.exit(1);
});
