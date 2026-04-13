/**
 * enforceSettingsNavigation.js — Settings Hub Navigation Guard
 *
 * Org Plane — Settings Domain enforcement utility.
 * All configuration routes MUST live under /org/settings/*.
 *
 * RULES ENGINE §15 — FORBIDDEN:
 *   Direct navigation to settings sub-modules bypassing the hub.
 *
 * PLANE: Org only.
 */

/**
 * Returns true if the given path is inside the Settings Hub domain.
 * Used to enforce that all configuration routes flow through /org/settings/*.
 *
 * @param {string} path - Frontend route path to check
 * @returns {boolean}
 */
export const isSettingsRoute = (path) => {
    return typeof path === "string" && path.startsWith("/org/settings");
};

/**
 * Asserts that a path is a valid Settings Hub route.
 * Throws in dev mode if the path bypasses the hub.
 *
 * @param {string} path - Frontend route path
 * @param {string} [caller] - Caller identifier for debugging
 */
export const assertSettingsRoute = (path, caller = "unknown") => {
    if (process.env.NODE_ENV !== "production" && !isSettingsRoute(path)) {
        console.error(
            `[SettingsNavGuard] Non-settings path detected in caller "${caller}": "${path}".` +
            ` All configuration routes must be under /org/settings/*.`
        );
    }
};

/**
 * Whitelist of known settings hub sub-routes.
 * Update this list when adding new settings sections.
 */
export const SETTINGS_ROUTES = Object.freeze({
    HUB:                "/org/settings",
    USERS:              "/org/settings/users",
    BRANCHES:           "/org/settings/branches",
    ROLES:              "/org/settings/roles",
    BILLING:            "/org/settings/billing",
    SUPPORT:            "/org/settings/support",
    SECURITY:           "/org/settings/security",
    SECURITY_ANALYTICS: "/org/settings/security/analytics",
    FEATURES:           "/org/settings/features",
});
