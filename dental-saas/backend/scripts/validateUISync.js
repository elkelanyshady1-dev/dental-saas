/**
 * validateUISync.js — UI Engine Drift Guard (CI)
 *
 * Validates that the generated frontend/src/generated/uiEngine.json is
 * synchronized with the current backend/src/platform/uiManifest.js.
 *
 * Exits 1 if drift is detected → blocks CI deploy.
 *
 * USAGE:
 *   node scripts/validateUISync.js
 *   npm run validate:ui-drift        (alias)
 *
 * STANDALONE — no module-alias, no mongoose, no DB connection.
 * PLANE: Cross-plane codegen validation.
 */

"use strict";

const fs   = require("fs");
const path = require("path");

// ─── Load pure-data source ────────────────────────────────────────────────────
const { UI_MANIFEST } = require("../src/platform/uiManifest");

// ─── Load generated snapshot ──────────────────────────────────────────────────
const GENERATED_JSON = path.resolve(__dirname, "../../frontend/src/generated/uiEngine.json");

if (!fs.existsSync(GENERATED_JSON)) {
    console.error("❌ uiEngine.json not found.");
    console.error("   Run: npm run generate:ui  (from backend/)");
    process.exit(1);
}

const snapshot = JSON.parse(fs.readFileSync(GENERATED_JSON, "utf8"));

// ─── Compare route counts ─────────────────────────────────────────────────────
// Build expected route set from current manifest
const expectedRoutes = new Set();
const expectedPages  = new Set();

UI_MANIFEST.forEach((entry) => {
    const { ui } = entry;
    expectedRoutes.add(ui.route);
    expectedPages.add(ui.page);
    (ui.children || []).forEach((child) => {
        expectedRoutes.add(child.route);
        expectedPages.add(child.page);
    });
});

const generatedRoutes = new Set(snapshot.routes.map(r => r.path));
const generatedPages  = new Set(snapshot.pages);

// ─── Detect drift ─────────────────────────────────────────────────────────────
const missingRoutes = [...expectedRoutes].filter(r => !generatedRoutes.has(r));
const extraRoutes   = [...generatedRoutes].filter(r => !expectedRoutes.has(r));
const missingPages  = [...expectedPages].filter(p => !generatedPages.has(p));
const extraPages    = [...generatedPages].filter(p => !expectedPages.has(p));

const hasDrift = missingRoutes.length || extraRoutes.length || missingPages.length || extraPages.length;

if (hasDrift) {
    console.error("❌ UI ENGINE DRIFT DETECTED");
    console.error("   The generated uiEngine.json is out of sync with uiManifest.js.");
    console.error("   Run: npm run generate:ui  (from backend/)");
    if (missingRoutes.length) console.error(`   Missing routes : ${missingRoutes.join(", ")}`);
    if (extraRoutes.length)   console.error(`   Extra routes   : ${extraRoutes.join(", ")}`);
    if (missingPages.length)  console.error(`   Missing pages  : ${missingPages.join(", ")}`);
    if (extraPages.length)    console.error(`   Extra pages    : ${extraPages.join(", ")}`);
    process.exit(1);
}

console.log("✅ UI Engine sync validated — no drift detected.");
console.log(`   Routes : ${generatedRoutes.size}`);
console.log(`   Pages  : ${generatedPages.size}`);
console.log(`   Source : uiManifest.js ↔ uiEngine.json`);
