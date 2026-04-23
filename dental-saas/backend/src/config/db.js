const mongoose = require("mongoose");
const platformConnection = require("@core/db/platformConnection");
const sharedConnection = require("@core/db/sharedConnection");
const clusterRegistry = require("@core/db/clusterRegistry");
const clusterConnections = require("@core/db/clusterConnections");

/**
 * connectDB — Step 5d boot sequence.
 *
 * The global mongoose.connect() root has been removed; every connection is
 * a sibling opened explicitly:
 *   1. platformConnection  — control plane
 *   2. sharedConnection    — cross-org infra
 *   3. cluster connections — per tenant cluster key (pre-warmed so
 *                            clusterConnections.getSync(key) is safe
 *                            synchronously from the hot path)
 */
const connectDB = async () => {
    try {
        // v13.2 Index Governance — Disable auto-index creation in production
        mongoose.set("autoIndex", process.env.NODE_ENV !== "production");

        // Phase 3.4 — Query Performance Plugin (global)
        // Applies maxTimeMS enforcement + slow query detection to ALL schemas.
        // Registered BEFORE any connection is opened so every sibling inherits it.
        const { queryPerformancePlugin } = require("@core/db/queryPerformance");
        mongoose.plugin(queryPerformancePlugin);

        // Step 5d: no more mongoose.connect(). Open the siblings directly.
        await platformConnection.init();
        await sharedConnection.init();

        // Pre-warm every ENV-declared tenant cluster. clusterConnections.getSync
        // is called from the request hot path and requires an already-open root.
        const entries = clusterRegistry.all();
        console.log(`[BOOT] Pre-warming ${entries.length} cluster connection(s): ${entries.map(e => e.key).join(", ")}`);
        for (const entry of entries) {
            await clusterConnections.ensureCluster(entry.key);
        }

        console.log("[BOOT] 3-layer DB ready (platform + shared + clusters)");

        // Startup Index Validation (non-blocking) — now against the platform
        // sibling, not the removed global root.
        setImmediate(async () => {
            try {
                const { validateIndexes } = require("@core/db/indexValidator");
                await validateIndexes(platformConnection.get(), "platform");
            } catch (err) {
                console.warn("[IndexValidator] Startup check error (non-fatal):", err.message);
            }
        });
    } catch (error) {
        console.error(error.message);
        process.exit(1);
    }
};

module.exports = connectDB;
