const mongoose = require("mongoose");
const platformConnection = require("@core/db/platformConnection");
const sharedConnection = require("@core/db/sharedConnection");

const connectDB = async () => {
    try {
        // v13.2 Index Governance — Disable auto-index creation in production
        mongoose.set("autoIndex", process.env.NODE_ENV !== "production");

        // Phase 3.4 — Query Performance Plugin (global)
        // Applies maxTimeMS enforcement + slow query detection to ALL schemas.
        // Must be registered BEFORE any model compilation.
        const { queryPerformancePlugin } = require("@core/db/queryPerformance");
        mongoose.plugin(queryPerformancePlugin);

        await mongoose.connect(process.env.MONGO_URI);
        console.log("MongoDB Connected");

        // ── 3-Layer DB Rollout, Step 1 — Dual-root siblings ───────────────────
        // Open dedicated platform and shared-infra connections alongside the
        // existing global mongoose.connection. Day-1 they may resolve to the
        // same URI (dev-single mode or default fallback) — no behavior change.
        // Step 5 flips call sites off the global root onto these siblings.
        await platformConnection.init();
        await sharedConnection.init();

        // ── 3-Layer DB Rollout, Step 3 — Pre-warm cluster connections ────────
        // When DB_USE_CLUSTER_LAYER=true, authMiddleware + dbContext resolve
        // tenant DBs via `clusterConnections.getSync(key).useDb(dbName)`. That
        // accessor requires the cluster root connection to be already open —
        // pre-warm every declared cluster at boot so the first request never
        // blocks on cluster-connection establishment.
        if (process.env.DB_USE_CLUSTER_LAYER === "true") {
            const clusterRegistry = require("@core/db/clusterRegistry");
            const clusterConnections = require("@core/db/clusterConnections");

            const entries = clusterRegistry.all();
            console.log(`[BOOT] DB_USE_CLUSTER_LAYER=true — pre-warming ${entries.length} cluster connection(s)`);
            for (const entry of entries) {
                await clusterConnections.ensureCluster(entry.key);
            }
        }

        // Phase 3.4 — Startup Index Validation (non-blocking)
        // Checks critical indexes on the platform DB.
        // Runs after connection is established, does NOT block boot.
        setImmediate(async () => {
            try {
                const { validateIndexes } = require("@core/db/indexValidator");
                await validateIndexes(mongoose.connection, "platform");
            } catch (err) {
                // Never fail boot due to index validation
                console.warn("[IndexValidator] Startup check error (non-fatal):", err.message);
            }
        });
    } catch (error) {
        console.error(error.message);
        process.exit(1);
    }
};

module.exports = connectDB;