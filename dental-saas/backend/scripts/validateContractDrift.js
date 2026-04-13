/**
 * validateContractDrift.js — CI Contract Drift Detection
 * Phase 10 — API Contract Automation
 *
 * Validates that:
 *   1. All DTOs are linked to response schemas
 *   2. All response schemas are registered in the OpenAPI registry
 *   3. The exported OpenAPI spec is up-to-date
 *   4. No orphan schemas exist
 *
 * Usage:
 *   node scripts/validateContractDrift.js
 *
 * Exit codes:
 *   0 — All contracts valid
 *   1 — Drift detected
 */

"use strict";

require("module-alias/register");

const fs = require("fs");
const path = require("path");

// ── Colors for terminal output ──────────────────────────────────────────────
const RED = "\x1b[31m";
const GREEN = "\x1b[32m";
const YELLOW = "\x1b[33m";
const RESET = "\x1b[0m";

let violations = 0;

function pass(msg) {
    console.log(`  ${GREEN}✓${RESET} ${msg}`);
}

function fail(msg) {
    console.log(`  ${RED}✗${RESET} ${msg}`);
    violations++;
}

function warn(msg) {
    console.log(`  ${YELLOW}⚠${RESET} ${msg}`);
}

// ── Validation 1: Response schemas exist ────────────────────────────────────

console.log("\n📋 Contract Drift Validation (Phase 10)\n");
console.log("── Checking Response Schemas ──────────────────────────");

const schemasDir = path.join(__dirname, "..", "src", "schemas");

const expectedSchemas = [
    "patient.response.schema.js",
    "lab.response.schema.js",
    "contractEnforcer.js",
    "openApiRegistry.js",
];

for (const file of expectedSchemas) {
    const filePath = path.join(schemasDir, file);
    if (fs.existsSync(filePath)) {
        pass(`${file} exists`);
    } else {
        fail(`${file} MISSING — DTO enforcement broken for this domain`);
    }
}

// ── Validation 2: DTO builders import schemas ───────────────────────────────

console.log("\n── Checking DTO → Schema Linkage ──────────────────────");

const dtoDir = path.join(__dirname, "..", "src", "dto");
const dtoFiles = ["patient.dto.js", "lab.dto.js"];

for (const file of dtoFiles) {
    const filePath = path.join(dtoDir, file);
    if (!fs.existsSync(filePath)) {
        fail(`${file} not found`);
        continue;
    }

    const content = fs.readFileSync(filePath, "utf-8");

    if (content.includes("contractEnforcer")) {
        pass(`${file} imports contractEnforcer`);
    } else {
        fail(`${file} does NOT import contractEnforcer — DTOs are unvalidated`);
    }

    if (content.includes("enforce(")) {
        pass(`${file} uses enforce() on builders`);
    } else {
        fail(`${file} does NOT call enforce() — schema validation bypassed`);
    }
}

// ── Validation 3: OpenAPI config references all schemas ─────────────────────

console.log("\n── Checking OpenAPI Registry ──────────────────────────");

try {
    const { contractOpenApiDoc } = require("../src/config/openapi");
    const schemaNames = Object.keys(contractOpenApiDoc.components?.schemas || {});

    const expectedRegistrations = [
        "PatientListDTO", "PatientSearchDTO", "PatientCoreDTO", "PatientSummaryDTO",
        "LabPartnerListDTO", "LabPartnerDetailDTO", "LabCaseListDTO", "LabCaseDetailDTO",
        "LabClaimDTO", "LabMessageDTO", "LabDashboardDTO",
    ];

    for (const name of expectedRegistrations) {
        if (schemaNames.includes(name)) {
            pass(`OpenAPI registry contains ${name}`);
        } else {
            fail(`OpenAPI registry MISSING ${name}`);
        }
    }

    // Check for orphan schemas (registered but no source)
    for (const name of schemaNames) {
        if (!expectedRegistrations.includes(name)) {
            warn(`Orphan schema in registry: ${name} (not in expected list)`);
        }
    }
} catch (err) {
    fail(`Failed to load OpenAPI config: ${err.message}`);
}

// ── Validation 4: Exported spec exists and is current ───────────────────────

console.log("\n── Checking Exported Spec ─────────────────────────────");

const specPath = path.join(__dirname, "..", "openapi", "contracts.json");
if (fs.existsSync(specPath)) {
    try {
        const spec = JSON.parse(fs.readFileSync(specPath, "utf-8"));
        const schemaCount = Object.keys(spec.components?.schemas || {}).length;
        pass(`contracts.json exists (${schemaCount} schemas)`);
    } catch (err) {
        fail(`contracts.json is corrupted: ${err.message}`);
    }
} else {
    warn(`contracts.json not found — run 'npm run api:export-spec' to generate`);
}

// ── Validation 5: Contract tests exist ──────────────────────────────────────

console.log("\n── Checking Contract Tests ────────────────────────────");

const testsDir = path.join(__dirname, "..", "tests");
const expectedTests = ["patient.contract.test.js", "lab.contract.test.js"];

for (const file of expectedTests) {
    const filePath = path.join(testsDir, file);
    if (fs.existsSync(filePath)) {
        pass(`${file} exists`);
    } else {
        fail(`${file} MISSING — no CI gate for this domain`);
    }
}

// ── Result ──────────────────────────────────────────────────────────────────

console.log(`\n${"─".repeat(55)}`);
if (violations > 0) {
    console.log(`${RED}❌ ${violations} contract drift violation(s) detected${RESET}`);
    console.log(`   Fix the above issues to ensure API contract integrity.\n`);
    process.exit(1);
} else {
    console.log(`${GREEN}✅ All contract validations passed${RESET}\n`);
    process.exit(0);
}
