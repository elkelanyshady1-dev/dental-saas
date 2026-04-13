/**
 * generateUIEngine.js — Frontend UI Engine Artifact Generator (v2.0)
 *
 * STANDALONE — no module-alias, no mongoose, no DB connection.
 * Reads uiManifest.js directly via relative path (pure data, zero side-effects).
 *
 * Produces:
 *   frontend/src/generated/uiEngine.js   — ESM artifact consumed by the UI Engine
 *   frontend/src/generated/uiEngine.json — JSON snapshot for CI validation
 *
 * USAGE:
 *   node scripts/generateUIEngine.js
 *   npm run generate:ui          (alias in backend/package.json)
 *
 * PLANE: Cross-plane codegen — runs at build/dev time only.
 * SOURCE OF TRUTH: backend/src/platform/uiManifest.js
 */

"use strict";

const fs   = require("fs");
const path = require("path");

// ─── Direct SSOT load — pure data, zero side-effects ─────────────────────────
const { UI_MANIFEST } = require("../src/platform/uiManifest");

// ─── Resolve output paths ─────────────────────────────────────────────────────
const FRONTEND_GENERATED = path.resolve(__dirname, "../../frontend/src/generated");

if (!fs.existsSync(FRONTEND_GENERATED)) {
    fs.mkdirSync(FRONTEND_GENERATED, { recursive: true });
}

const OUT_JS   = path.join(FRONTEND_GENERATED, "uiEngine.js");
const OUT_JSON = path.join(FRONTEND_GENERATED, "uiEngine.json");

// ─── Validate manifest entries ────────────────────────────────────────────────
const errors = [];
UI_MANIFEST.forEach((entry, idx) => {
    if (!entry.key)    errors.push(`Entry[${idx}] missing key`);
    if (!entry.ui)     errors.push(`Entry[${idx}] (${entry.key}) missing ui block`);
    if (!entry.ui?.route) errors.push(`Entry[${idx}] (${entry.key}) ui missing route`);
    if (!entry.ui?.page)  errors.push(`Entry[${idx}] (${entry.key}) ui missing page`);
});
if (errors.length) {
    console.error("❌ UI Manifest validation failed:");
    errors.forEach(e => console.error("   " + e));
    process.exit(1);
}

// ─── Sort by order ────────────────────────────────────────────────────────────
const sorted = [...UI_MANIFEST].sort((a, b) => (a.ui.order ?? 99) - (b.ui.order ?? 99));

// ─── Build ROUTES, SIDEBAR, PAGES ────────────────────────────────────────────
/** @type {Array} */ const routes  = [];
/** @type {Array} */ const sidebar = [];
const pagesSet = new Set();

sorted.forEach((entry) => {
    const { ui } = entry;

    // ── Sidebar item ──────────────────────────────────────────────────────────
    if (!ui.hidden) {
        sidebar.push({
            label:       ui.label,
            icon:        ui.icon,
            route:       ui.route,
            permission:  ui.permission   ?? null,
            module:      ui.module       ?? null,
            category:    ui.category     ?? "other",
            order:       ui.order        ?? 99,
            isCore:      entry.isCore,
            plans:       entry.plans,
        });
    }

    // ── Top-level route ───────────────────────────────────────────────────────
    routes.push({
        path:         ui.route,
        page:         ui.page,
        permission:   ui.permission  ?? null,
        module:       ui.module      ?? null,
        featureGated: !entry.isCore && Boolean(ui.module),
    });
    pagesSet.add(ui.page);

    // ── Child routes ──────────────────────────────────────────────────────────
    (ui.children || []).forEach((child) => {
        routes.push({
            path:         child.route,
            page:         child.page,
            permission:   child.permission ?? null,
            module:       ui.module        ?? null,
            featureGated: !entry.isCore && Boolean(ui.module),
            hidden:       child.hidden     ?? false,
        });
        pagesSet.add(child.page);
    });
});

const pages = [...pagesSet];

// ─── Snapshot ─────────────────────────────────────────────────────────────────
const snapshot = {
    generatedAt: new Date().toISOString(),
    source:      "backend/src/platform/uiManifest.js",
    routes,
    sidebar,
    pages,
};

// ─── Write JSON ───────────────────────────────────────────────────────────────
fs.writeFileSync(OUT_JSON, JSON.stringify(snapshot, null, 2), "utf8");
console.log(`✅ uiEngine.json written  (${routes.length} routes, ${sidebar.length} sidebar items)`);

// ─── Write ESM JS ─────────────────────────────────────────────────────────────
const NOW = snapshot.generatedAt;
const jsContent = `// ⚠️  AUTO-GENERATED FILE — DO NOT MANUALLY EDIT
// Regenerate with: npm run generate:ui  (from backend/ directory)
// Source of truth: backend/src/platform/uiManifest.js
// Generated at: ${NOW}

/**
 * ROUTES — flat list of all org-plane routes derived from uiManifest.
 *
 * Each entry:
 *   path         — React Router path segment (relative to /org)
 *   page         — Page component name (registered in src/pages/org/index.js)
 *   permission   — RBAC permission key (null = no permission gate)
 *   module       — FeatureGate module key (null = always visible)
 *   featureGated — true if this route needs a <FeatureGate> wrapper
 *   hidden       — true if child route with no sidebar entry
 */
export const ROUTES = ${JSON.stringify(routes, null, 2)};

/**
 * SIDEBAR — ordered navigation items for AutoSidebar.
 *
 * Each entry:
 *   label      — Display label
 *   icon       — Heroicon component name (import from @heroicons/react/24/outline)
 *   route      — URL segment relative to /org
 *   permission — RBAC permission key (null = always visible when authenticated)
 *   module     — FeatureContext module key (null = always visible)
 *   category   — "core" | "clinical" | "financial" | "intelligence" | "admin" | "system"
 *   order      — Sort order (ascending)
 *   isCore     — true if module is always available regardless of plan
 *   plans      — plan tiers that include this entry
 */
export const SIDEBAR = ${JSON.stringify(sidebar, null, 2)};

/**
 * PAGES — deduplicated list of all page component names referenced in ROUTES.
 * Used by PageLoader.jsx for validation and dynamic import.
 */
export const PAGES = ${JSON.stringify(pages, null, 2)};
`;

fs.writeFileSync(OUT_JS, jsContent, "utf8");
console.log(`✅ uiEngine.js written    (${pages.length} unique pages)`);
console.log(`\n🏗  UI Engine manifest summary:`);
console.log(`   Routes  : ${routes.length}`);
console.log(`   Sidebar : ${sidebar.length}`);
console.log(`   Pages   : ${pages.length}`);
console.log(`   Output  : frontend/src/generated/`);
