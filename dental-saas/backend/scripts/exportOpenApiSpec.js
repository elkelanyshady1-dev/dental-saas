/**
 * exportOpenApiSpec.js — Exports the contract-driven OpenAPI spec to disk
 * Phase 10 — API Contract Automation
 *
 * Usage:
 *   node scripts/exportOpenApiSpec.js
 *
 * Outputs:
 *   openapi/contracts.json — OpenAPI 3.0 spec
 *
 * This file is consumed by:
 *   - openapi-typescript (frontend type generation)
 *   - CI contract tests
 *   - External documentation tools
 */

"use strict";

// Minimal bootstrap for module-alias (required by the schemas)
require("module-alias/register");

const fs = require("fs");
const path = require("path");
const { contractOpenApiDoc } = require("../src/config/openapi");

const outputDir = path.join(__dirname, "..", "openapi");
const outputPath = path.join(outputDir, "contracts.json");

// Ensure output directory exists
if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
}

// Write the spec
const specJson = JSON.stringify(contractOpenApiDoc, null, 2);
fs.writeFileSync(outputPath, specJson, "utf-8");

const schemaCount = Object.keys(contractOpenApiDoc.components?.schemas || {}).length;
const pathCount = Object.keys(contractOpenApiDoc.paths || {}).length;

console.log(`✅ OpenAPI Contract Spec exported`);
console.log(`   📄 ${outputPath}`);
console.log(`   📊 ${schemaCount} schemas, ${pathCount} paths`);
console.log(`   📦 ${(specJson.length / 1024).toFixed(1)} KB`);
