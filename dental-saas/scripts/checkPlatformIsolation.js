#!/usr/bin/env node
/**
 * scripts/checkPlatformIsolation.js
 * v13.3 — Platform Isolation Enforcer
 *
 * Fails CI if any platform-layer file:
 *   1. imports the org API client (api.js / services/api)
 *   2. imports the org AuthContext
 *   3. calls /api/auth/* endpoints directly
 *
 * Run: node scripts/checkPlatformIsolation.js
 * npm:  "lint:platform": "node scripts/checkPlatformIsolation.js"
 */

const fs = require("fs");
const path = require("path");

// ── Config ────────────────────────────────────────────────────────────────────
const PLATFORM_DIR = path.resolve(__dirname, "../frontend/src/platform");
const VIOLATIONS = [];

// Patterns that must NOT appear inside /platform/**
const FORBIDDEN = [
    {
        pattern: /from\s+['"].*\/services\/api['"]/,
        label: "Imports org API client (services/api)",
    },
    {
        pattern: /import\s+api\s+from/,
        label: "Imports default org api instance",
    },
    {
        pattern: /from\s+['"].*\/context\/AuthContext['"]/,
        label: "Imports org AuthContext",
    },
    {
        pattern: /useAuth\s*\(\s*\)/,
        label: "Calls useAuth() — org auth hook",
    },
    {
        pattern: /['"`]\/api\/auth\/(login|refresh|profile|logout)['"`]/,
        label: "Hard-codes /api/auth/* org endpoint",
    },
];

// ── Walker ────────────────────────────────────────────────────────────────────
function walk(dir) {
    if (!fs.existsSync(dir)) {
        console.warn(`[checkPlatformIsolation] Directory not found: ${dir}`);
        return;
    }
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
            walk(full);
        } else if (/\.(js|jsx|ts|tsx)$/.test(entry.name)) {
            checkFile(full);
        }
    }
}

function checkFile(filePath) {
    const src = fs.readFileSync(filePath, "utf8");
    const lines = src.split("\n");
    lines.forEach((line, idx) => {
        for (const { pattern, label } of FORBIDDEN) {
            if (pattern.test(line)) {
                VIOLATIONS.push({
                    file: path.relative(process.cwd(), filePath),
                    line: idx + 1,
                    content: line.trim(),
                    label,
                });
            }
        }
    });
}

// ── Run ───────────────────────────────────────────────────────────────────────
walk(PLATFORM_DIR);

if (VIOLATIONS.length === 0) {
    console.log("\n✅  Platform Isolation Check PASSED — No cross-auth contamination detected.\n");
    process.exit(0);
} else {
    console.error("\n❌  Platform Isolation Check FAILED\n");
    console.error("The following violations were found in /platform/**:\n");
    VIOLATIONS.forEach(({ file, line, content, label }) => {
        console.error(`  [${label}]`);
        console.error(`   File : ${file}:${line}`);
        console.error(`   Code : ${content}`);
        console.error("");
    });
    console.error(
        `${VIOLATIONS.length} violation(s) found. Fix before merging.\n`
    );
    process.exit(1);
}
