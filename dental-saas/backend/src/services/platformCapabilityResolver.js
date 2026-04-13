/**
 * platformCapabilityResolver.js
 * v22.0 — Sovereign RBAC with DB-backed role resolution + cache invalidation
 *
 * Resolution strategy:
 *   1. Try DB lookup (PlatformRole collection) — sovereign truth
 *   2. Fall back to in-memory contract (platformContract.cjs.js) — deterministic fallback
 *
 * This ensures:
 *   - DB-seeded roles take priority (dynamic, governable)
 *   - System never fails if DB is unavailable during startup
 *   - Contract remains the absolute fallback
 *   - Cache invalidates immediately on role mutation (v22.0)
 *
 * SENTINEL: This is the ONLY file that may resolve capabilities.
 *           All authorization flows MUST go through here.
 */

const { PLATFORM_ROLES } = require('@contracts/platformContract.cjs.js');

let PlatformRole;
try {
    PlatformRole = require('../platform/models/PlatformRole');
} catch {
    // Model not loaded yet — will use contract fallback
    PlatformRole = null;
}

// ── In-memory cache (populated on first DB query, refreshed periodically) ────
let roleCache = null;
let cacheTimestamp = 0;
let cacheVersion = 1;
const CACHE_TTL_MS = 60 * 1000; // 1 minute


/**
 * invalidatePlatformRoleCache (v22.0)
 *
 * Immediately invalidates the in-memory role→capability cache.
 * Called after any PlatformRole create/update/delete mutation.
 * Forces next resolution to re-query DB or use contract fallback.
 */
function invalidatePlatformRoleCache() {
    cacheVersion++;
    roleCache = null;
    cacheTimestamp = 0;
    console.log(JSON.stringify({
        event: "RBAC_CACHE_INVALIDATED",
        cacheVersion,
        timestamp: Date.now()
    }));
    // Proactively repopulate cache in background
    refreshRoleCache().catch(() => { });
}

/**
 * resolvePlatformCapabilities (v22.0 Sovereign)
 *
 * Deterministic role-to-capability mapping.
 * Returns a deduped array of capability strings for the given role.
 *
 * @param {{ role: string }} params
 * @returns {string[]}
 */
function resolvePlatformCapabilities({ role }) {
    if (!role) return [];

    let source = "contract";
    let capabilities;

    // ── Try cached DB resolution first ───────────────────────────────────
    if (roleCache && (Date.now() - cacheTimestamp) < CACHE_TTL_MS) {
        const cached = roleCache[role];
        if (cached) {
            source = "cache";
            capabilities = [...cached];
        }
    }

    // ── Fallback: Contract-based resolution (always available) ───────────
    if (!capabilities) {
        // Direct lookup — contract role names now match model role names exactly
        const raw = PLATFORM_ROLES[role] || [];
        capabilities = [...new Set(raw)];
    }

    // ── Build O(1) Set for caller use ─────────────────────────────────────
    // Returned alongside the array so callers can use Set.has() for O(1) checks.
    // The array is kept for backwards compatibility (spread, iteration, JSON).
    const capabilitySet = new Set(capabilities);

    // ── Observability ────────────────────────────────────────────────────
    console.log(JSON.stringify({
        event: "CAPABILITY_RESOLUTION",
        role,
        source,
        capabilityCount: capabilities.length,
        cacheVersion,
        timestamp: Date.now()
    }));

    return { capabilities, capabilitySet };
}

/**
 * refreshRoleCache
 *
 * Loads all PlatformRole records from DB into memory cache.
 * Called periodically or on first request.
 * Non-blocking — failure just means contract fallback continues.
 */
async function refreshRoleCache() {
    if (!PlatformRole) {
        try {
            PlatformRole = require('../platform/models/PlatformRole');
        } catch {
            return; // Model still not available
        }
    }

    try {
        // @rls-platform-service — global RBAC role loading, no org-scoped req
        const roles = await PlatformRole.find({}).lean().maxTimeMS(3000);
        if (roles.length > 0) {
            const cache = {};
            for (const r of roles) {
                cache[r.name] = [...new Set(r.capabilities)];
            }
            roleCache = cache;
            cacheTimestamp = Date.now();
        }
    } catch {
        // DB unavailable — keep using contract fallback
    }
}

// Attempt initial cache population after a short delay (non-blocking)
setTimeout(() => {
    refreshRoleCache().catch(() => { });
}, 2000);

module.exports = {
    resolvePlatformCapabilities,
    refreshRoleCache,
    invalidatePlatformRoleCache,
};
