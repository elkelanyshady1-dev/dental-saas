/**
 * validate-settings-hub.js — Settings Hub Structural Validator
 * @bridge-layer (LOCKED)
 *
 * CI-friendly validation script that checks:
 *   1. All bridge files have @bridge-layer (LOCKED) annotation
 *   2. All bridge responses use enforceDTO()
 *   3. No raw model access in bridge layer
 *   4. All routes have authorize() guard
 *   5. All routes include SETTINGS_DTO_VERSION
 *   6. ObjectId validation on parameterized routes
 *   7. Rate limiters on write endpoints
 *
 * Output is ALWAYS written to validation-settings-hub.log
 *
 * USAGE:
 *   node scripts/validate-settings-hub.js
 *
 * @module scripts/validate-settings-hub
 */

"use strict";

const fs = require("fs");
const path = require("path");

const LOG_FILE = path.join(__dirname, "..", "validation-settings-hub.log");
const lines = [];

function log(msg) {
    const line = `[${new Date().toISOString()}] ${msg}`;
    console.log(line);
    lines.push(line);
}

function check(label, file, pattern, shouldExist = true) {
    const content = fs.readFileSync(file, "utf-8");
    const found = content.includes(pattern);
    const pass = shouldExist ? found : !found;
    const status = pass ? "✅ PASS" : "❌ FAIL";
    log(`  ${status} — ${label}`);
    return pass;
}

// ─── Main ────────────────────────────────────────────────────────────────────
let failures = 0;

const BRIDGE_DIR = path.join(__dirname, "..", "src", "services", "bridges");
const ROUTES_DIR = path.join(__dirname, "..", "src", "routes", "org");
const UTILS_DIR = path.join(BRIDGE_DIR, "utils");

log("═══════════════════════════════════════════════════════════════");
log("SETTINGS HUB — STRUCTURAL VALIDATION");
log("═══════════════════════════════════════════════════════════════");
log("");

// ── Check 1: @bridge-layer (LOCKED) annotations ─────────────────────────────
log("CHECK 1: Bridge Layer Lock Annotations");
const bridgeFiles = [
    path.join(BRIDGE_DIR, "orgBillingBridge.service.js"),
    path.join(BRIDGE_DIR, "orgSupportBridge.service.js"),
    path.join(UTILS_DIR, "transformers.js"),
    path.join(UTILS_DIR, "enforceDTO.js"),
];

for (const file of bridgeFiles) {
    if (!check(`@bridge-layer (LOCKED) in ${path.basename(file)}`, file, "@bridge-layer (LOCKED)")) {
        failures++;
    }
}
log("");

// ── Check 2: enforceDTO usage ────────────────────────────────────────────────
log("CHECK 2: enforceDTO() Usage");
if (!check("enforceDTO in orgBillingBridge", path.join(BRIDGE_DIR, "orgBillingBridge.service.js"), "enforceDTO(")) failures++;
if (!check("enforceDTO in orgSupportBridge", path.join(BRIDGE_DIR, "orgSupportBridge.service.js"), "enforceDTO(")) failures++;
log("");

// ── Check 3: No raw model access ────────────────────────────────────────────
log("CHECK 3: No Raw Model Access in Bridge Layer");
const rawPatterns = ["Model.find(", "Model.findOne(", "Model.update(", "Model.delete(", "Ticket.find(", "Ticket.findOne("];
for (const file of bridgeFiles) {
    for (const pat of rawPatterns) {
        if (!check(`No "${pat}" in ${path.basename(file)}`, file, pat, false)) {
            failures++;
        }
    }
}
log("");

// ── Check 4: Route guards ───────────────────────────────────────────────────
log("CHECK 4: Route Guards (authorize)");
const routeFiles = [
    path.join(ROUTES_DIR, "settingsBilling.routes.js"),
    path.join(ROUTES_DIR, "settingsSupport.routes.js"),
];
for (const file of routeFiles) {
    if (!check(`authorize() in ${path.basename(file)}`, file, "authorize(")) failures++;
}
log("");

// ── Check 5: DTO Version Envelope ───────────────────────────────────────────
log("CHECK 5: SETTINGS_DTO_VERSION in Responses");
for (const file of routeFiles) {
    if (!check(`SETTINGS_DTO_VERSION in ${path.basename(file)}`, file, "SETTINGS_DTO_VERSION")) failures++;
}
log("");

// ── Check 6: ObjectId Validation ────────────────────────────────────────────
log("CHECK 6: ObjectId Validation on Parameterized Routes");
if (!check("validateObjectId in settingsSupport.routes", path.join(ROUTES_DIR, "settingsSupport.routes.js"), "validateObjectId")) failures++;
log("");

// ── Check 7: Rate Limiters ──────────────────────────────────────────────────
log("CHECK 7: Rate Limiters on Write Endpoints");
const supportRoutes = path.join(ROUTES_DIR, "settingsSupport.routes.js");
if (!check("supportCreateLimiter in support routes", supportRoutes, "supportCreateLimiter")) failures++;
if (!check("supportCommentLimiter in support routes", supportRoutes, "supportCommentLimiter")) failures++;
const billingRoutes = path.join(ROUTES_DIR, "settingsBilling.routes.js");
if (!check("billingReadLimiter in billing routes", billingRoutes, "billingReadLimiter")) failures++;
log("");

// ── Summary ─────────────────────────────────────────────────────────────────
log("═══════════════════════════════════════════════════════════════");
if (failures === 0) {
    log("RESULT: ✅ ALL CHECKS PASSED — Settings Hub is production-locked");
} else {
    log(`RESULT: ❌ ${failures} CHECK(S) FAILED — Fix before deployment`);
}
log("═══════════════════════════════════════════════════════════════");

// Write to file
fs.writeFileSync(LOG_FILE, lines.join("\n") + "\n", "utf-8");
log(`\nLog written to: ${LOG_FILE}`);

process.exit(failures > 0 ? 1 : 0);
