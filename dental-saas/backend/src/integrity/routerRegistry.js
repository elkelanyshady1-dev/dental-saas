/**
 * routerRegistry.js
 * v19.3 — Centralized Router Mount Registry
 *
 * Call registerRouter() immediately before every app.use() router mount.
 * The registry is queried at startup by routerTopologyAudit to surface
 * mount paths and detect dangerous nesting.
 *
 * Startup-only — zero runtime overhead after boot.
 */

const registry = [];

/**
 * registerRouter
 * @param {string} name      Human-readable router name for log clarity
 * @param {string} mountPath Express mount path (e.g. "/api/platform")
 */
function registerRouter(name, mountPath) {
    registry.push({ name, mountPath });
}

function getRegisteredRouters() {
    return [...registry]; // Return a copy — registry should not be mutated externally
}

module.exports = { registerRouter, getRegisteredRouters };
