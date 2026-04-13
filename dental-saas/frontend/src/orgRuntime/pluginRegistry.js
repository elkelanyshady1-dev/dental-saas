/**
 * pluginRegistry.js — Frontend Org Plugin Registry
 * v1.0 — Enterprise Architecture
 *
 * Maps registered module keys to their frontend contribution points:
 *   - sidebar items (icon, label, route)
 *   - action bar contributions (defined in actionRegistry.js — this is the bridge)
 *   - route declarations (for future dynamic routing)
 *
 * ── RULES ────────────────────────────────────────────────────────────────────
 * ✅ Static — no dynamic imports, no database-driven module loading
 * ✅ Keys match MODULE_REGISTRY in backend/src/orgRuntime/moduleRegistry.js
 * ✅ Platform layout is NEVER touched by this registry
 * ✅ Patient portal layout is NEVER touched by this registry
 * ✅ OrgLayout reads this to build its sidebar dynamically
 *
 * Usage:
 *   import { pluginRegistry, getEnabledPlugins } from "@/orgRuntime/pluginRegistry";
 *   const plugins = getEnabledPlugins(enabledModules); // enabledModules from useContextActions
 */

// ─── Sidebar icon references ──────────────────────────────────────────────────
// Using inline string names — OrgSidebar resolves these to heroicons components.
// This keeps pluginRegistry.js dependency-free.

/**
 * @typedef {Object} PluginDefinition
 * @property {string}   key               — matches MODULE_REGISTRY key
 * @property {string}   label             — display name
 * @property {Object[]} sidebarItems      — navigation items contributed to org sidebar
 * @property {string[]} actionContextKeys — which actionRegistry contexts this module contributes to
 * @property {string[]} routes            — route path prefixes owned by this module
 */

/** @type {Readonly<Object.<string, PluginDefinition>>} */
export const pluginRegistry = Object.freeze({

    /**
     * patients — Core patient management
     * Always visible — isCore module
     */
    patients: Object.freeze({
        key: "patients",
        label: "Patients",
        sidebarItems: [
            {
                key: "patients-list",
                label: "Patients",
                icon: "UsersIcon",
                href: "/org/patients",
                exact: false,
            },
        ],
        actionContextKeys: ["patients", "patient_profile"],
        routes: ["/org/patients"],
    }),

    /**
     * notifications — Notification center
     * Always visible — isCore module
     */
    notifications: Object.freeze({
        key: "notifications",
        label: "Notifications",
        sidebarItems: [],      // Notification bell is in OrgHeader, not sidebar
        actionContextKeys: [],
        routes: [],
    }),

    /**
     * booking — Patient self-scheduling
     * Pro/Enterprise tier
     */
    booking: Object.freeze({
        key: "booking",
        label: "Booking",
        sidebarItems: [
            {
                key: "booking-requests",
                label: "Booking Requests",
                icon: "CalendarDaysIcon",
                href: "/org/booking-requests",
                exact: false,
            },
        ],
        actionContextKeys: ["appointments"],
        routes: ["/org/booking-requests"],
    }),

    /**
     * analytics — Business intelligence dashboard
     * Pro/Enterprise tier
     */
    analytics: Object.freeze({
        key: "analytics",
        label: "Analytics",
        sidebarItems: [
            {
                key: "analytics",
                label: "Analytics",
                icon: "ChartBarIcon",
                href: "/org/analytics",
                exact: false,
            },
        ],
        actionContextKeys: ["analytics"],
        routes: ["/org/analytics"],
    }),

    /**
     * inventory — Stock and supply management
     * Enterprise tier
     */
    inventory: Object.freeze({
        key: "inventory",
        label: "Inventory",
        sidebarItems: [
            {
                key: "inventory",
                label: "Inventory",
                icon: "ArchiveBoxIcon",
                href: "/org/inventory",
                exact: false,
            },
        ],
        actionContextKeys: ["inventory"],
        routes: ["/org/inventory"],
    }),

});

/**
 * getEnabledPlugins(enabledModuleKeys)
 *
 * Filters pluginRegistry to only plugins whose key is in enabledModuleKeys.
 * Frontend components call this after fetching /org/context/modules.
 *
 * @param {string[]} enabledModuleKeys — from GET /org/context/modules response
 * @returns {PluginDefinition[]}
 */
export function getEnabledPlugins(enabledModuleKeys = []) {
    return Object.values(pluginRegistry).filter(
        (plugin) => enabledModuleKeys.includes(plugin.key)
    );
}

/**
 * getAllSidebarItems(enabledModuleKeys)
 *
 * Returns a flat, ordered list of all sidebar items from enabled plugins.
 * OrgSidebar/OrgLayout calls this to build navigation dynamically.
 *
 * @param {string[]} enabledModuleKeys
 * @returns {Object[]}
 */
export function getAllSidebarItems(enabledModuleKeys = []) {
    return getEnabledPlugins(enabledModuleKeys).flatMap(
        (plugin) => plugin.sidebarItems
    );
}

export default pluginRegistry;
