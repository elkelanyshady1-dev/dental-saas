require("module-alias/register");
/**
 * check-domain-isolation.js — Sovereign CI Guard
 * v2.0 — Phase 2 Enforcer (CQRS-lite Hardened)
 *
 * Scans domains in backend/src/modules/ for illegal cross-domain model imports.
 * Fail criteria:
 * 1. Domain A imports models/ from Domain B.
 * 2. Domain A imports the top-level models/ that have been decentralized (like Appointment).
 * 3. Controllers using .populate() or .lean() (Phase 2 constraint).
 */

"use strict";

const fs = require("fs");
const path = require("path");
const glob = require("glob");

const SRC_DIR = path.join(__dirname, "../src");
const FORBIDDEN_MODEL_IMPORTS = [
    { pattern: /require\(["'].*\/appointmentDomain\/models\/.*["']\)/, domain: "appointmentDomain" },
    { pattern: /require\(["'].*\/patientDomain\/.*model.*["']\)/, domain: "patientDomain" },
    { pattern: /require\(["'].*\/booking\/.*model.*["']\)/, domain: "bookingDomain" },
    { pattern: /require\(["'].*\/appointmentDomain\/models\/.*["']\)/, domain: "patientPortal" }
];

// Models that have been moved out of the global models/ folder and should NO LONGER be imported from there
const DECENTRALIZED_MODELS = [
    "Appointment"
];

let violationCount = 0;

function checkFile(filePath) {
    const content = fs.readFileSync(filePath, "utf8");
    const relativePath = path.relative(path.join(__dirname, ".."), filePath);
    const currentDomain = relativePath.split(path.sep).find(part =>
        fs.existsSync(path.join(SRC_DIR, "modules", part))
    );

    if (!currentDomain) return; // Not inside a domain module

    // 1. Check for cross-domain imports
    FORBIDDEN_MODEL_IMPORTS.forEach(({ pattern, domain }) => {
        if (domain !== currentDomain && pattern.test(content)) {
            console.error(`[VIOLATION] ${relativePath}: Domain "${currentDomain}" is importing models from "${domain}". Use events instead.`);
            violationCount++;
        }
    });

    // 2. Check for legacy global model imports
    DECENTRALIZED_MODELS.forEach(model => {
        const legacyPattern = new RegExp(`require\\(["'].*models/${model}["']\\)`);
        if (legacyPattern.test(content)) {
            console.error(`[VIOLATION] ${relativePath}: Importing legacy global model "${model}". Use domain model or service instead.`);
            violationCount++;
        }
    });

    // 3. Phase 2: CQRS-lite Enforcements (No reads in controllers)
    const isController = relativePath.includes("controller.js") || relativePath.includes("Controller.js");
    const isProjection = relativePath.includes("projection.js");

    if (isController && !isProjection) {
        // Controllers must not use population or lean (must use projections)
        if (content.includes(".populate(")) {
            console.error(`[VIOLATION] ${relativePath}: Inline .populate() detected. Use a Projection Builder instead.`);
            violationCount++;
        }
        if (content.includes(".lean(")) {
            console.error(`[VIOLATION] ${relativePath}: Inline .lean() detected in controller. Clean reads must happen in the Projection layer.`);
            violationCount++;
        }
        // Strict boundary: Controllers should not import domain models for reads
        // (This is a fuzzy check, allowing internal model imports for write logic if absolutely necessary, 
        // but flagging common read-heavy patterns)
        if (/require\(["'].*\/models\/.*model.*["']\)/.test(content)) {
            // console.warn(`[WARNING] ${relativePath}: Controller imports a domain model directly. Ensure it's for WRITE/COUNT logic only.`);
        }
    }
}

console.log("Starting Domain Isolation Scan...");

const files = glob.sync(path.join(SRC_DIR, "**/*.js"), {
    ignore: ["**/node_modules/**", "**/tests/**", "**/test/**", "**/seeders/**", "**/migrations/**"]
});

files.forEach(checkFile);

if (violationCount > 0) {
    console.error(`\nFound ${violationCount} domain isolation violations. Hardening failed.`);
    process.exit(1);
} else {
    console.log("\nDomain isolation verified. Sovereignty intact.");
    process.exit(0);
}
