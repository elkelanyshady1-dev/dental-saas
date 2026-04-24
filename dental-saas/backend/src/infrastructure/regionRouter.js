const mongoose = require("mongoose");
// v31.1 — Region config now comes from in-memory regionRegistry (no DB lookup).
// The Region model import has been removed. See regionRegistry.js for details.
const { getRegionConfig } = require("./regions/regionRegistry");
const logger = require("../utils/logger");

/**
 * RegionRouter.js
 * v31.1 Geopolitical Sovereignty — Connection Switchboard
 *
 * Purpose: Dynamically route requests to the regional data plane (Mongo).
 * Prohibits use of global/default connections in sovereign flows.
 *
 * v31.1 — Registry Cache:
 * Region config is now resolved from the in-memory regionRegistry (O(1))
 * instead of Region.findOne() (O(n) + DB round-trip).
 *
 * v13.1 — Platform Plane Fence:
 * Throws immediately if called from a platform-type context.
 * Platform tokens must never route through the regional data plane.
 * Use the Control Plane DB (mongoose.connection) directly instead.
 */

const connectionCache = {
    mongoose: {}
};

async function getRegionContext(regionCode, actor) {
    // ── v13.1 Platform Plane Sovereignty Fence ────────────────────────────────
    // If a platform actor ever reaches this function, something is architecturally
    // wrong. Throw loudly — never silently route platform data to a regional DB.
    if (actor?.type === "platform" || actor?.actorType === "platform_user") {
        throw new Error(
            "[RegionRouter] SOVEREIGNTY VIOLATION: Platform tokens must not use regionRouter. " +
            "Use the platform sibling connection directly (see @core/db/platformConnection)."
        );
    }

    if (!regionCode) {
        throw new Error("Region context missing. Operation aborted for sovereign safety.");
    }

    const code = regionCode.toUpperCase();

    // Return cached connection if available
    if (connectionCache.mongoose[code]) {
        return {
            mongooseConnection: connectionCache.mongoose[code]
            // stripeClient removed: use paymentProviderFactory.getProvider() instead
        };
    }

    // v31.1 — O(1) in-memory lookup (replaces Region.findOne)
    const region = getRegionConfig(code);

    if (region.status !== "ACTIVE") {
        throw new Error(`Region ${code} is currently ${region.status}. Transactions suspended.`);
    }

    // Initialize Regional Mongoose Connection
    // Note: v13.2 Index Governance still applies to regional connections
    const mongooseConnection = mongoose.createConnection(region.dbUri, {
        autoIndex: process.env.NODE_ENV !== "production"
    });

    // Store in connection cache
    connectionCache.mongoose[code] = mongooseConnection;

    logger.info({
        service: "regionRouter",
        action: "REGION_CONNECTION_ESTABLISHED",
        regionCode: code
    }, `[RegionRouter] Established connections for region ${code}`);

    return {
        mongooseConnection
        // Stripe client deliberately removed: use paymentProviderFactory.getProvider('stripe') instead.
        // Do NOT add stripeClient back here. See StripeProvider.js.
        // Redis client removed v9.1: Phase 6 Redis-eradication (Mongo-backed primitives replace it).
    };
}

module.exports = { getRegionContext };

