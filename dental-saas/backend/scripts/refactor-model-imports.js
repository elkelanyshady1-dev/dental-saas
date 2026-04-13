#!/usr/bin/env node
/**
 * refactor-model-imports.js — Phase 1.5: Model Consumption Alignment
 *
 * Normalizes ALL model imports across the codebase to use `.default`
 * after Phase 1 changed model exports to `{ modelName, schema, default }`.
 *
 * USAGE:
 *   node scripts/refactor-model-imports.js --dry-run   # Preview changes
 *   node scripts/refactor-model-imports.js              # Apply changes
 *   node scripts/refactor-model-imports.js --verify     # Post-refactor verification
 *
 * RULES:
 *   1. Simple model imports: const X = require("...models/...") → .default
 *   2. Destructured schema/utility imports: SKIP (they access named exports)
 *   3. Inline requires in function bodies: append .default
 *   4. Re-export proxies: module.exports = require("...") → require("...").default
 *   5. Multi-model proxy files: fix internal imports to use .default
 */

"use strict";

const fs = require("fs");
const path = require("path");

// ─── CLI Flags ────────────────────────────────────────────────────────────────
const DRY_RUN = process.argv.includes("--dry-run");
const VERIFY = process.argv.includes("--verify");

const ROOT = path.resolve(__dirname, "../src");

// ─── Known model paths (from Phase 1 refactor) ────────────────────────────────
// These are folder segments that indicate a model file import
const MODEL_PATH_MARKERS = [
    "/models/",
    "\\models\\",
];

// ─── Destructured property names that are NOT model defaults ────────────────
// These are utility functions, schemas, or constants exported alongside models.
// If someone writes `const { writeLedgerEntry } = require(...)`, we skip it.
const NON_MODEL_PROPERTIES = new Set([
    // Schema exports
    "schema",
    "modelName",
    // BillingLedger utilities
    "writeLedgerEntry",
    "LEDGER_EVENT_TYPES",
    "LEDGER_SOURCES",
    // EmailEvent utilities
    "hashRecipient",
    "maskEmail",
    "getDomain",
    // BillingEventLog
    "computePayloadHash",
    // Named schema exports (used for dynamic model compilation)
    "auditLogSchema",
    "ticketSchema",
    "domainEventOutboxSchema",
    "invoiceSchema",
    "refundExecutionRecordSchema",
    "subscriptionMutationRecordSchema",
    "revenueSnapshotProjectionSchema",
    // SCPEModels named model exports (these are actual model instances, not schemas)
    // "ClinicalCase" and "ProtocolDefinition" are model instances in the export
    // "CephStudy" is a model instance
    // These are FINE as-is since they're direct model properties
    // Multi-model file named exports
    "CaseCostSnapshot",
    "InventoryItem",
    "InventoryTransaction",
    // BillingLedger extra
    "billingLedgerSchema",
]);

// ─── Files to completely skip ─────────────────────────────────────────────────
// Model files themselves, scripts, and non-JS files
const SKIP_PATTERNS = [
    /[\\\/]scripts[\\\/]/,       // Script files
    /[\\\/]node_modules[\\\/]/,  // Dependencies
    /\.test\.js$/,              // Test files (handle separately or skip for now)
    /\.spec\.js$/,              // Spec files
    /refactor-model/,           // This script
];

// Known proxy model files that need special handling
const PROXY_FILES = new Set([
    "InventoryModels.js",
    "StorageUsage.js",
]);

// ─── Helpers ──────────────────────────────────────────────────────────────────

function isModelImport(requirePath) {
    return MODEL_PATH_MARKERS.some((m) => requirePath.includes(m));
}

function shouldSkipFile(filePath) {
    return SKIP_PATTERNS.some((p) => p.test(filePath));
}

function isModelFile(filePath) {
    // Model files export { modelName, schema, default } — they import their own model
    // We don't want to modify model files importing other model files though.
    // But model files ARE already refactored from Phase 1.
    return false; // We DO want to process model files that import other models
}

/**
 * Classify a line to determine if it needs transformation.
 *
 * Returns:
 *   { type: "simple", varName, requirePath, lineIdx }
 *   { type: "destructured_skip" }  — schema/utility destructured import
 *   { type: "destructured_model", props, requirePath, lineIdx } — model destructured
 *   { type: "reexport", requirePath, lineIdx }
 *   { type: "inline", requirePath, lineIdx }
 *   null — not a model import
 */
function classifyLine(line, lineIdx) {
    const trimmed = line.trim();

    // Already has .default — skip
    if (trimmed.includes(".default")) return null;

    // Skip comments
    if (trimmed.startsWith("//") || trimmed.startsWith("*") || trimmed.startsWith("/*")) return null;

    // ── Pattern 1: Simple const/let/var assignment ──────────────────────────
    // const User = require("@shared/models/User");
    const simpleMatch = trimmed.match(
        /^(?:const|let|var)\s+(\w+)\s*=\s*require\(\s*["'`]([^"'`]+)["'`]\s*\)\s*;?\s*$/
    );
    if (simpleMatch) {
        const [, varName, reqPath] = simpleMatch;
        if (!isModelImport(reqPath)) return null;
        return { type: "simple", varName, requirePath: reqPath, lineIdx };
    }

    // ── Pattern 2: Destructured import ─────────────────────────────────────
    // const { X, Y } = require("...models/...");
    const destructuredMatch = trimmed.match(
        /^(?:const|let|var)\s+\{([^}]+)\}\s*=\s*require\(\s*["'`]([^"'`]+)["'`]\s*\)\s*;?\s*$/
    );
    if (destructuredMatch) {
        const [, propsStr, reqPath] = destructuredMatch;
        if (!isModelImport(reqPath)) return null;

        const props = propsStr.split(",").map((p) => {
            const parts = p.trim().split(/\s*:\s*/);
            return parts[0].trim(); // Handle `{ X: aliasX }` — we want `X`
        }).filter(Boolean);

        // If ALL props are non-model (schema, utility), skip entirely
        const allNonModel = props.every((p) => NON_MODEL_PROPERTIES.has(p));
        if (allNonModel) return { type: "destructured_skip" };

        // If some are model properties, these are named exports that
        // are actual model instances (e.g., { ClinicalCase, ProtocolDefinition })
        // These DON'T need `.default` because they're accessed by property name
        return { type: "destructured_model_skip", props, requirePath: reqPath, lineIdx };
    }

    // ── Pattern 3: Re-export proxy ─────────────────────────────────────────
    // module.exports = require("../../models/...");
    const reexportMatch = trimmed.match(
        /^module\.exports\s*=\s*require\(\s*["'`]([^"'`]+)["'`]\s*\)\s*;?\s*$/
    );
    if (reexportMatch) {
        const [, reqPath] = reexportMatch;
        if (!isModelImport(reqPath)) return null;
        return { type: "reexport", requirePath: reqPath, lineIdx };
    }

    // ── Pattern 4: Inline require in function body ─────────────────────────
    // const X = require("...models/...");  (inside function, matches Pattern 1 shape)
    // This was already handled by Pattern 1

    // ── Pattern 5: Inline require without assignment ───────────────────────
    // require("...models/...").doSomething()
    // Too complex for automated handling — skip

    return null;
}

// ─── Main Processing ──────────────────────────────────────────────────────────

function getAllJSFiles(dir, results = []) {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
            if (entry.name === "node_modules" || entry.name === ".git") continue;
            getAllJSFiles(fullPath, results);
        } else if (entry.name.endsWith(".js")) {
            results.push(fullPath);
        }
    }
    return results;
}

function processFile(filePath) {
    const content = fs.readFileSync(filePath, "utf-8");
    const lines = content.split(/\r?\n/);
    let modified = false;
    const changes = [];

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const classification = classifyLine(line, i);

        if (!classification) continue;

        switch (classification.type) {
            case "simple": {
                // const X = require("...") → const X = require("...").default;
                const newLine = line.replace(
                    /require\(\s*(["'`][^"'`]+["'`])\s*\)/,
                    "require($1).default"
                );
                if (newLine !== line) {
                    lines[i] = newLine;
                    modified = true;
                    changes.push({
                        line: i + 1,
                        from: line.trim(),
                        to: newLine.trim(),
                        var: classification.varName,
                    });
                }
                break;
            }

            case "reexport": {
                // module.exports = require("...") → module.exports = require("...").default;
                // But only for simple re-export files (like StorageUsage.js)
                // For proxy files that re-export the whole module (InventoryModels),
                // we need to handle differently
                const filename = path.basename(filePath);
                if (PROXY_FILES.has(filename)) {
                    // This is a proxy file — check if it re-exports the whole object
                    // or if it needs .default
                    // StorageUsage.js: simple re-export → needs .default
                    // InventoryModels.js: destructures from requires → handled below
                }

                // For simple re-exports, apply .default
                const newLine = line.replace(
                    /require\(\s*(["'`][^"'`]+["'`])\s*\)/,
                    "require($1).default"
                );
                if (newLine !== line) {
                    lines[i] = newLine;
                    modified = true;
                    changes.push({
                        line: i + 1,
                        from: line.trim(),
                        to: newLine.trim(),
                        var: "[re-export]",
                    });
                }
                break;
            }

            case "destructured_skip":
            case "destructured_model_skip":
                // These access named exports, not the default model
                // No transformation needed
                break;
        }
    }

    return { modified, changes, newContent: lines.join(content.includes("\r\n") ? "\r\n" : "\n") };
}

// ─── Verify Mode ──────────────────────────────────────────────────────────────

function verifyFile(filePath) {
    const content = fs.readFileSync(filePath, "utf-8");
    const lines = content.split(/\r?\n/);
    const issues = [];

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const trimmed = line.trim();

        // Skip comments
        if (trimmed.startsWith("//") || trimmed.startsWith("*") || trimmed.startsWith("/*")) continue;

        // Already has .default — OK
        if (trimmed.includes(".default")) continue;

        // Check for simple model import without .default
        const simpleMatch = trimmed.match(
            /^(?:const|let|var)\s+(\w+)\s*=\s*require\(\s*["'`]([^"'`]+)["'`]\s*\)\s*;?\s*$/
        );
        if (simpleMatch) {
            const [, varName, reqPath] = simpleMatch;
            if (isModelImport(reqPath)) {
                // Check if file is a model file itself (Phase 1 already refactored)
                const basename = path.basename(filePath);
                const isModelSelf = basename.endsWith(".model.js") ||
                    /^[A-Z]\w*\.js$/.test(basename);

                // Check if this is inside a model file folder
                const isInModelsDir = filePath.includes(path.sep + "models" + path.sep);

                if (isInModelsDir) {
                    // Model files importing other models — this is fine if they
                    // are doing internal references. But we should check usage.
                    // For now, be cautious and report.
                }

                issues.push({
                    line: i + 1,
                    content: trimmed,
                    varName,
                    reqPath,
                });
            }
        }
    }

    return issues;
}

// ─── Entry Point ──────────────────────────────────────────────────────────────

function main() {
    console.log("=" .repeat(70));
    console.log(
        VERIFY
            ? "  Phase 1.5 — Model Import VERIFICATION"
            : DRY_RUN
                ? "  Phase 1.5 — Model Import Refactor (DRY RUN)"
                : "  Phase 1.5 — Model Import Refactor (LIVE)"
    );
    console.log("=".repeat(70));
    console.log();

    const allFiles = getAllJSFiles(ROOT);
    const eligible = allFiles.filter((f) => !shouldSkipFile(f));

    console.log(`  Total JS files:  ${allFiles.length}`);
    console.log(`  Eligible files:  ${eligible.length}`);
    console.log();

    if (VERIFY) {
        let totalIssues = 0;
        for (const file of eligible) {
            const issues = verifyFile(file);
            if (issues.length > 0) {
                const rel = path.relative(ROOT, file);
                for (const iss of issues) {
                    console.log(`  ❌ ${rel}:${iss.line} — ${iss.varName} = require("${iss.reqPath}") missing .default`);
                    totalIssues++;
                }
            }
        }
        console.log();
        console.log("=".repeat(70));
        console.log(`  Total issues: ${totalIssues}`);
        console.log("=".repeat(70));
        return;
    }

    let totalFilesModified = 0;
    let totalChanges = 0;
    let errors = 0;

    for (const file of eligible) {
        try {
            const { modified, changes, newContent } = processFile(file);
            if (modified) {
                const rel = path.relative(ROOT, file);
                totalFilesModified++;
                totalChanges += changes.length;

                for (const ch of changes) {
                    console.log(`  ✅ ${rel}:${ch.line} [${ch.var}]`);
                    if (DRY_RUN) {
                        console.log(`     FROM: ${ch.from}`);
                        console.log(`     TO:   ${ch.to}`);
                    }
                }

                if (!DRY_RUN) {
                    fs.writeFileSync(file, newContent, "utf-8");
                }
            }
        } catch (err) {
            const rel = path.relative(ROOT, file);
            console.error(`  ⚠️  ERROR: ${rel} — ${err.message}`);
            errors++;
        }
    }

    console.log();
    console.log("=".repeat(70));
    console.log(`  SUMMARY`);
    console.log("=".repeat(70));
    console.log(`  Files modified:     ${totalFilesModified}`);
    console.log(`  Total changes:      ${totalChanges}`);
    console.log(`  Errors:             ${errors}`);
    if (DRY_RUN) {
        console.log(`\n  ℹ️  DRY RUN — no files were modified. Run without --dry-run to apply.`);
    }
    console.log("=".repeat(70));
}

main();
