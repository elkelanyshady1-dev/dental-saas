#!/usr/bin/env node
/**
 * refactor-models.js — Phase 1 Model System Refactor
 * 
 * Transforms ALL Mongoose model files to the schema-export pattern:
 * 
 * module.exports = {
 *     modelName,
 *     schema,
 *     default: mongoose.models[modelName] || mongoose.model(modelName, schema),
 * };
 * 
 * HANDLES PATTERNS:
 *   P1: module.exports = mongoose.model("X", schema);
 *   P2: const X = mongoose.model("X", schema); module.exports = X;
 *   P3: module.exports = mongoose.models.X || mongoose.model("X", schema);
 *   P4: const X = mongoose.model("X", schema); module.exports = X; module.exports.fooSchema = foo;
 *   P5: Re-export proxy files (skipped — no schema)
 *
 * USAGE:
 *   node scripts/refactor-models.js --dry-run    # Preview changes
 *   node scripts/refactor-models.js              # Apply changes
 *   node scripts/refactor-models.js --verify     # Verify already-refactored files
 */

"use strict";

const fs = require("fs");
const path = require("path");

const DRY_RUN = process.argv.includes("--dry-run");
const VERIFY_ONLY = process.argv.includes("--verify");
const VERBOSE = process.argv.includes("--verbose");

const SRC_ROOT = path.resolve(__dirname, "..", "src");

const MODEL_DIRS = [
    "shared/models",
    "organization/models",
    "organization/patient/models",
    "organization/appointment/models",
    "modules",
    "platform/models",
    "platform/billing/models",
    "platform/domain/models",
    "platform/finance/models",
    "platform/guardian/models",
    "core",
];

let totalFiles = 0;
let refactoredFiles = 0;
let skippedFiles = 0;
let alreadyRefactored = 0;
let errorFiles = 0;
const errors = [];
const changes = [];

function findModelFiles(dir) {
    const results = [];
    if (!fs.existsSync(dir)) return results;
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
            results.push(...findModelFiles(fullPath));
        } else if (entry.isFile() && entry.name.endsWith(".js") && entry.name !== "index.js") {
            results.push(fullPath);
        }
    }
    return results;
}

function isMongooseModelFile(content) {
    return (
        content.includes('require("mongoose")') || content.includes("require('mongoose')")
    ) && (
        content.includes("mongoose.model(") || content.includes("mongoose.model (")
    );
}

function isReExportProxy(content) {
    // Files like: const X = require("../path"); module.exports = X;
    const lines = content.split(/\r?\n/).filter(l => l.trim() && !l.trim().startsWith("//") && !l.trim().startsWith("/*") && !l.trim().startsWith("*"));
    const hasSchema = content.includes("new mongoose.Schema") || content.includes("new Schema");
    return !hasSchema;
}

function isAlreadyRefactored(content) {
    return content.includes("const modelName =") &&
           content.includes("module.exports = {") &&
           content.includes("mongoose.models[modelName]");
}

function extractSchemaVarName(content) {
    const match = content.match(/const\s+(\w+)\s*=\s*new\s+mongoose\.Schema\s*\(/);
    if (match) return match[1];
    const match2 = content.match(/const\s+(\w+)\s*=\s*new\s+Schema\s*\(/);
    if (match2) return match2[1];
    return null;
}

/**
 * Detects the export pattern and transforms the file.
 */
function refactorFile(filePath, content) {
    const schemaVarName = extractSchemaVarName(content);
    if (!schemaVarName) {
        return { success: false, error: `Could not extract schema variable name` };
    }

    const lineEnding = content.includes("\r\n") ? "\r\n" : "\n";
    const lines = content.split(/\r?\n/);

    // ── Detect pattern ───────────────────────────────────────────────────────

    // PATTERN 1: module.exports = mongoose.model("X", schema);
    const p1Regex = /^module\.exports\s*=\s*mongoose\.model\s*\(\s*["'](\w+)["']\s*,\s*\w+\s*\)\s*;?\s*$/;

    // PATTERN 2: const X = mongoose.model("X", schema); ... module.exports = X;
    const p2ModelLine = /^const\s+(\w+)\s*=\s*mongoose\.model\s*\(\s*["'](\w+)["']\s*,\s*\w+\s*\)\s*;?\s*$/;

    // PATTERN 3: module.exports = mongoose.models.X || mongoose.model("X", schema);
    const p3Regex = /^module\.exports\s*=\s*mongoose\.models\.\w+\s*\|\|\s*mongoose\.model\s*\(\s*["'](\w+)["']\s*,\s*\w+\s*\)\s*;?\s*$/;

    // Find all relevant lines
    let modelLine = -1;
    let modelName = null;
    let modelVarName = null;
    let exportLine = -1;
    let extraExportLines = []; // For multi-export patterns (P4)
    let pattern = null;

    for (let i = 0; i < lines.length; i++) {
        const trimmed = lines[i].trim();

        // Check P1
        const p1Match = trimmed.match(p1Regex);
        if (p1Match) {
            modelName = p1Match[1];
            modelLine = i;
            exportLine = i;
            pattern = "P1";
            continue;
        }

        // Check P3
        const p3Match = trimmed.match(p3Regex);
        if (p3Match) {
            modelName = p3Match[1];
            modelLine = i;
            exportLine = i;
            pattern = "P3";
            continue;
        }

        // Check P2 - model assignment
        const p2Match = trimmed.match(p2ModelLine);
        if (p2Match) {
            modelVarName = p2Match[1];
            modelName = p2Match[2];
            modelLine = i;
            pattern = "P2";
            continue;
        }

        // Check P2 - module.exports = VarName;
        if (pattern === "P2" && modelVarName) {
            const exportMatch = trimmed.match(new RegExp(`^module\\.exports\\s*=\\s*${modelVarName}\\s*;?\\s*$`));
            if (exportMatch) {
                exportLine = i;
                continue;
            }

            // Check for extra exports like module.exports.fooSchema = foo;
            const extraExportMatch = trimmed.match(/^module\.exports\.(\w+)\s*=\s*(\w+)\s*;?\s*$/);
            if (extraExportMatch && exportLine !== -1) {
                extraExportLines.push({ idx: i, prop: extraExportMatch[1], value: extraExportMatch[2] });
            }
        }
    }

    if (!modelName || modelLine === -1 || exportLine === -1) {
        return { success: false, error: `Could not parse export pattern (model: ${modelName}, line: ${modelLine}, export: ${exportLine})` };
    }

    // ── Build replacement content ──────────────────────────────────────────

    // Build extra exports string for P4 pattern
    let extraExportsStr = "";
    if (extraExportLines.length > 0) {
        for (const ext of extraExportLines) {
            extraExportsStr += `${lineEnding}module.exports.${ext.prop} = ${ext.value};`;
        }
    }

    const newExportBlock = `const modelName = "${modelName}";${lineEnding}${lineEnding}module.exports = {${lineEnding}    modelName,${lineEnding}    schema: ${schemaVarName},${lineEnding}    default: mongoose.models[modelName] || mongoose.model(modelName, ${schemaVarName}),${lineEnding}};${extraExportsStr}`;

    // ── Apply the transformation ───────────────────────────────────────────

    if (pattern === "P1" || pattern === "P3") {
        // Single line replacement
        lines[modelLine] = newExportBlock;
    } else if (pattern === "P2") {
        // Remove the model assignment line, replace the export line, remove extra export lines
        // Work backwards to keep indices valid
        const linesToRemove = extraExportLines.map(e => e.idx).sort((a, b) => b - a);
        for (const idx of linesToRemove) {
            lines.splice(idx, 1);
        }

        // Recalculate exportLine after removals above it
        let removedBeforeExport = extraExportLines.filter(e => e.idx < exportLine).length;
        const adjustedExportLine = exportLine - removedBeforeExport;

        // Remove the export line
        lines.splice(adjustedExportLine, 1);

        // Recalculate modelLine after removals above it
        let removedBeforeModel = extraExportLines.filter(e => e.idx < modelLine).length;
        if (exportLine < modelLine) removedBeforeModel++; // export was removed before model
        const adjustedModelLine = modelLine - removedBeforeModel;

        // Replace the model assignment line with the new block
        lines[adjustedModelLine] = newExportBlock;
    }

    const newContent = lines.join(lineEnding);

    // ── Validate ───────────────────────────────────────────────────────────
    if (!newContent.includes("const modelName =") || !newContent.includes("schema:") || !newContent.includes("default:")) {
        return { success: false, error: `Post-transform validation failed` };
    }

    return { success: true, content: newContent, modelName, schemaVarName, pattern };
}

function main() {
    console.log("=".repeat(70));
    console.log(`  PHASE 1 — MODEL SYSTEM REFACTOR`);
    console.log(`  Mode: ${DRY_RUN ? "DRY RUN" : VERIFY_ONLY ? "VERIFY ONLY" : "APPLY CHANGES"}`);
    console.log("=".repeat(70));
    console.log();

    const allFiles = [];
    for (const dir of MODEL_DIRS) {
        const fullDir = path.join(SRC_ROOT, dir);
        allFiles.push(...findModelFiles(fullDir));
    }
    const uniqueFiles = [...new Set(allFiles)];
    console.log(`Found ${uniqueFiles.length} potential model files\n`);

    for (const filePath of uniqueFiles) {
        totalFiles++;
        const relativePath = path.relative(SRC_ROOT, filePath).replace(/\\/g, "/");

        let content;
        try {
            content = fs.readFileSync(filePath, "utf-8");
        } catch (err) {
            errors.push({ file: relativePath, error: `Read error: ${err.message}` });
            errorFiles++;
            continue;
        }

        if (!isMongooseModelFile(content)) {
            if (VERBOSE) console.log(`  SKIP (not a model): ${relativePath}`);
            skippedFiles++;
            continue;
        }

        if (isReExportProxy(content)) {
            if (VERBOSE) console.log(`  SKIP (re-export proxy): ${relativePath}`);
            skippedFiles++;
            continue;
        }

        if (isAlreadyRefactored(content)) {
            if (VERBOSE || VERIFY_ONLY) console.log(`  ✅ Already refactored: ${relativePath}`);
            alreadyRefactored++;
            continue;
        }

        if (VERIFY_ONLY) {
            console.log(`  ❌ NOT refactored: ${relativePath}`);
            continue;
        }

        const result = refactorFile(filePath, content);

        if (!result.success) {
            console.log(`  ⚠️  ERROR: ${relativePath} — ${result.error}`);
            errors.push({ file: relativePath, error: result.error });
            errorFiles++;
            continue;
        }

        changes.push({ file: relativePath, modelName: result.modelName, schemaVar: result.schemaVarName, pattern: result.pattern });

        if (DRY_RUN) {
            console.log(`  📝 [${result.pattern}] Would refactor: ${relativePath} → ${result.modelName}`);
        } else {
            try {
                fs.writeFileSync(filePath, result.content, "utf-8");
                console.log(`  ✅ [${result.pattern}] Refactored: ${relativePath} → { modelName: "${result.modelName}" }`);
                refactoredFiles++;
            } catch (err) {
                console.log(`  ❌ Write error: ${relativePath} — ${err.message}`);
                errors.push({ file: relativePath, error: `Write error: ${err.message}` });
                errorFiles++;
            }
        }
    }

    // ── Summary ───────────────────────────────────────────────────────────────
    console.log("\n" + "=".repeat(70));
    console.log("  SUMMARY");
    console.log("=".repeat(70));
    console.log(`  Total files scanned:    ${totalFiles}`);
    console.log(`  Skipped (not models):   ${skippedFiles}`);
    console.log(`  Already refactored:     ${alreadyRefactored}`);
    if (DRY_RUN) {
        console.log(`  Would refactor:         ${changes.length}`);
    } else {
        console.log(`  Successfully refactored: ${refactoredFiles}`);
    }
    console.log(`  Errors:                 ${errorFiles}`);

    if (errors.length > 0) {
        console.log("\n  ERRORS:");
        for (const e of errors) {
            console.log(`    ❌ ${e.file}: ${e.error}`);
        }
    }

    if (changes.length > 0 && DRY_RUN) {
        console.log("\n  FILES TO REFACTOR:");
        for (const c of changes) {
            console.log(`    [${c.pattern}] ${c.file} → ${c.modelName}`);
        }
    }

    console.log("\n" + "=".repeat(70));
    if (DRY_RUN) console.log("  Run without --dry-run to apply changes.");

    if (errorFiles > 0) process.exit(1);
}

main();
