/**
 * routeChecksum.js
 * v19.2 — Startup Route Topology Fingerprinting
 *
 * Generates a deterministic SHA-256 checksum of the full registered
 * route surface. Used at boot to detect topology drift between
 * environments (different build, partial deploy, etc.)
 *
 * Usage:
 *   const { generateRouteChecksum } = require('./routeChecksum');
 *   const checksum = generateRouteChecksum(routes);
 *   console.log('[PLATFORM_ROUTE_CHECKSUM]', checksum);
 */
const crypto = require("crypto");

/**
 * generateRouteChecksum
 * @param {Array<{ method: string, path: string }>} routes
 * @returns {string} 64-char hex SHA-256 digest
 */
function generateRouteChecksum(routes) {
    const sorted = routes
        .map(r => `${r.method.toUpperCase()}:${r.path}`)
        .sort()
        .join("|");

    return crypto.createHash("sha256").update(sorted).digest("hex");
}

module.exports = { generateRouteChecksum };
