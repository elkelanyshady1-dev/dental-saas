const mongoose = require("mongoose");

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