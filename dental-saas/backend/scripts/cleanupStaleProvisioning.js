/**
 * Minimal cleanup — no module-alias, no app bootstrap.
 * Run from backend dir: node scripts\cleanupStaleProvisioning.js
 */
require("dotenv").config();
const mongoose = require("mongoose");

const MONGO_URI = process.env.MONGO_URI || "mongodb://127.0.0.1:27017/saasdental";

(async () => {
    console.log("Connecting to:", MONGO_URI.replace(/\/\/.*@/, "//***@"));
    await mongoose.connect(MONGO_URI);
    console.log("Connected");

    const db = mongoose.connection.db;
    const invCol = db.collection("platforminvoices");

    // 1. Check + fix idempotencyKey index
    const indexes = await invCol.indexes();
    const idx = indexes.find(i => i.key && i.key.idempotencyKey !== undefined);
    console.log("idempotencyKey index:", idx ? JSON.stringify({ name: idx.name, sparse: idx.sparse, unique: idx.unique }) : "NONE");

    // 2. Delete stale invoices with null idempotencyKey
    const staleCount = await invCol.countDocuments({ idempotencyKey: null });
    console.log("Stale invoices (null idempotencyKey):", staleCount);
    if (staleCount > 0) {
        const r = await invCol.deleteMany({ idempotencyKey: null });
        console.log("  Deleted:", r.deletedCount);
    }

    // 3. Rebuild index if not sparse
    if (idx && !idx.sparse) {
        console.log("Dropping non-sparse index...");
        await invCol.dropIndex(idx.name);
        await invCol.createIndex({ idempotencyKey: 1 }, { unique: true, sparse: true });
        console.log("  Recreated with sparse:true");
    }

    // 4. Clean stale "Test clinic" orgs
    const orgCol = db.collection("organizations");
    const staleOrgs = await orgCol.find({ name: "Test clinic" }).project({ _id: 1 }).toArray();
    if (staleOrgs.length > 0) {
        const ids = staleOrgs.map(o => o._id);
        console.log(`Cleaning ${ids.length} stale 'Test clinic' org(s)...`);
        await db.collection("orgcontracts").deleteMany({ organizationId: { $in: ids } });
        await invCol.deleteMany({ organizationId: { $in: ids } });
        await orgCol.deleteMany({ _id: { $in: ids } });
        console.log("  Done");
    } else {
        console.log("No stale 'Test clinic' orgs");
    }

    console.log("\nCleanup complete!");
    await mongoose.disconnect();
    process.exit(0);
})().catch(e => { console.error("ERROR:", e.message); process.exit(1); });
