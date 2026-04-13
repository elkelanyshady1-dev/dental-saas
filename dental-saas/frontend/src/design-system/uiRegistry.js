/**
 * uiRegistry.js — UI Component Registry v2.0 (MCP Governance Authority)
 *
 * Lists every approved design-system component including layout primitives.
 * Used by UIGuard and the validateDesignTokens CI script.
 *
 * Adding a new component:
 *   1. Create it in /src/design-system/components/ or /layout/
 *   2. Register it here with status: "stable" | "beta" | "deprecated"
 *   3. Export it from index.js
 *   4. Update docs/ui-governance.md
 */

export const UI_REGISTRY = {

    // ── Surfaces ────────────────────────────────────────────────────────────
    Card: { path: "./components/Card", status: "stable", category: "surface" },
    Surface: { path: "./components/Surface", status: "stable", category: "surface" },
    StatCard: { path: "./components/StatCard", status: "stable", category: "surface" },

    // ── Typography / Labeling ────────────────────────────────────────────────
    SectionHeader: { path: "./components/SectionHeader", status: "stable", category: "typography" },
    Badge: { path: "./components/Badge", status: "stable", category: "typography" },

    // ── Interaction ──────────────────────────────────────────────────────────
    Button: { path: "./components/Button", status: "stable", category: "action" },

    // ── Data Display ─────────────────────────────────────────────────────────
    DataTable: { path: "./components/DataTable", status: "stable", category: "data" },

    // ── Layout Primitives (v2.0) ─────────────────────────────────────────────
    PageLayout: { path: "./layout/PageLayout", status: "stable", category: "layout" },
    Section: { path: "./layout/Section", status: "stable", category: "layout" },
    Stack: { path: "./layout/Stack", status: "stable", category: "layout" },
    Grid: { path: "./layout/Grid", status: "stable", category: "layout" },
};

/**
 * Checks if a component name is registered in the governance registry.
 *
 * @param {string} name - Component display name
 * @returns {boolean}
 */
export function isRegistered(name) {
    return Object.prototype.hasOwnProperty.call(UI_REGISTRY, name);
}

/**
 * Returns all registered component names.
 * @returns {string[]}
 */
export function registeredComponents() {
    return Object.keys(UI_REGISTRY);
}

/**
 * Returns all components belonging to a category.
 * @param {"surface"|"typography"|"action"|"data"|"layout"} category
 * @returns {string[]}
 */
export function componentsByCategory(category) {
    return Object.entries(UI_REGISTRY)
        .filter(([, meta]) => meta.category === category)
        .map(([name]) => name);
}
