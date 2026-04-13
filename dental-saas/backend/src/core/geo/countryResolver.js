/**
 * countryResolver.js
 * Phase v5.7 — Country-Based Geo Pricing
 */

"use strict";

/**
 * resolveCountry
 * Detects the ISO country code from the request.
 * Prioritizes Cloudflare headers, then falls back to IP geolocation.
 * 
 * @param {Object} req - Express request object
 * @returns {string} ISO Country Code (e.g. "EG", "US")
 */
function resolveCountry(req) {
    // 1. Check Cloudflare header
    const cfCountry = req.headers["cf-ipcountry"];
    if (cfCountry && cfCountry !== "XX") {
        return cfCountry.toUpperCase();
    }

    // 2. Fallback to generic IP detection (Simulated for this environment)
    // In production, use a library like 'geoip-lite' or a dedicated service.
    const ip = req.ip || req.connection.remoteAddress;

    // Simulation logic for testing
    if (ip === "127.0.0.1" || ip === "::1") return "US";

    return "US"; // Default fallback
}

module.exports = {
    resolveCountry
};
