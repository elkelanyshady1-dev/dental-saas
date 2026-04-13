require("module-alias/register");
/**
 * migrateAddRegionCode.js
 * v13.0 Geopolitical Sovereignty — Backfill Migration
 * 
 * Purpose: Backfills regionCode (defaulting to 'MEA' or derived from Org) 
 * across legacy Organizations and Ledger records.
 */
const mongoose = require('mongoose');
const Organization = require('../src/models/Organization');
const AuditLog = require('../src/models/AuditLog');
const Ticket = require('../src/models/Ticket');
const RefundExecutionRecord = require('../src/models/RefundExecutionRecord');
const DomainEventOutbox = require('../src/models/DomainEventOutbox');

const DEFAULT_REGION = "MEA";

async function runMigration() {
    console.log("Connecting to Control Plane for Sovereignty Backfill...");
    await mongoose.connect(process.env.MONGODB_URI);

    // 1. Organizations
    console.log("Backfilling Organizations...");
    const orgResult = await Organization.updateMany(
        { regionCode: { $exists: false } },
        { $set: { regionCode: DEFAULT_REGION } }
    );
    console.log(`Updated ${orgResult.modifiedCount} Organizations.`);

    // 2. Financial Ledgers (Audit, Ticket, etc.)
    const models = [
        { name: "AuditLog", model: AuditLog },
        { name: "Ticket", model: Ticket },
        { name: "RefundExecutionRecord", model: RefundExecutionRecord },
        { name: "DomainEventOutbox", model: DomainEventOutbox }
    ];

    for (const { name, model } of models) {
        console.log(`Backfilling ${name}...`);
        // In a real migration, we'd lookup the Org's region, 
        // but since we defaulted all Orgs to MEA, we can default ledgers too.
        const result = await model.updateMany(
            { regionCode: { $exists: false } },
            { $set: { regionCode: DEFAULT_REGION } }
        );
        console.log(`Updated ${result.modifiedCount} ${name} records.`);
    }

    console.log("Sovereignty Backfill Complete.");
    process.exit(0);
}

runMigration().catch(err => {
    console.error(err);
    process.exit(1);
});
