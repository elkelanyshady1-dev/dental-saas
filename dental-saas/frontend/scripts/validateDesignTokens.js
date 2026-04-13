/**
 * validateDesignTokens.js
 * DentalSaaS Platform — Design Token Governance Validator
 *
 * Purpose:
 *   Scans all JSX/JS/TSX/TS source files in frontend/src and reports any
 *   usage of forbidden raw color values:
 *     • Raw Tailwind base-color utilities (bg-blue-500, text-gray-700, etc.)
 *     • Raw hex colors (#ffffff, #0f172a)
 *     • Raw rgb/rgba/hsl/hsla() function calls
 *
 * Usage:
 *   node scripts/validateDesignTokens.js              # fail on violations
 *   node scripts/validateDesignTokens.js --warn-only  # report but do not exit(1)
 *   DRY_RUN=true node scripts/validateDesignTokens.js # dry run (alias for --warn-only)
 *
 * Add to CI pipeline AFTER the migration sprint is complete:
 *   npm run design:validate
 *
 * Exclusions:
 *   • node_modules/
 *   • dist/
 *   • *.test.js / *.spec.js (test files may use literal colors for assertions)
 *   • tailwind.config.* (the token definitions themselves)
 *   • validateDesignTokens.js (this file)
 *   • Lines that are purely comments (// ... or * ...)
 *
 * Governance:
 *   Registered in platform-governance.policy.json as a required validation script.
 *   Sentinel contract: NONE modified. Plane isolation: SAFE. Backend: UNCHANGED.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ─── Configuration ─────────────────────────────────────────────────────────────

const SRC_DIR = path.join(__dirname, '../src');
const WARN_ONLY = process.argv.includes('--warn-only') || process.env.DRY_RUN === 'true';
const EXTENSIONS = new Set(['.js', '.jsx', '.ts', '.tsx']);
// NOTE: CSS/SCSS files are intentionally excluded — rgba() in box-shadow, border, and
// other CSS properties is valid and not a design-token violation. The token system
// governs JS/JSX source (className attributes and style props), not raw CSS.

const EXCLUDED_PATHS = [
    'node_modules',
    'dist',
    '.vite',
    'validateDesignTokens.js',
    'tailwind.config',
];

const EXCLUDED_FILE_SUFFIXES = ['.test.js', '.spec.js', '.test.jsx', '.spec.jsx'];

// ─── Forbidden patterns with explanatory messages ─────────────────────────────

const FORBIDDEN = [
    {
        // Raw Tailwind base-color utilities: bg-blue-500, text-gray-700, border-red-300, etc.
        // Does NOT match semantic tokens like bg-brand-primary, bg-success, bg-surface.
        pattern: /\b(bg|text|border|ring|from|to|via|fill|stroke|outline|shadow|decoration|accent|caret|divide)-(red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose|gray|slate|zinc|neutral|stone)-\d+\b/,
        message: 'Raw Tailwind color utility detected. Use semantic tokens (bg-brand-primary, bg-success, text-primary, etc.)',
        skipComments: true,
        // Skip lines that are clearly JS object property values for box-shadow/shadow utilities
        skipPattern: /\bboxShadow\b|\bshadow\b.*:\s*['"].*rgba/,
    },
    {
        // Raw hex color literals: #fff, #ffffff, #0f172aff
        // Excludes: hex > 8 chars (not colors), hex in comments
        pattern: /#[0-9a-fA-F]{3,8}\b/,
        message: 'Raw hex color value detected. Use CSS custom properties (var(--color-*)) or Tailwind semantic tokens.',
        skipComments: true,
    },
    {
        // Raw rgb/rgba function calls — skip lines that are clearly box-shadow definitions
        pattern: /\brgba?\s*\(/,
        message: 'Raw rgb()/rgba() value detected. Use CSS custom properties or Tailwind semantic tokens.',
        skipComments: true,
        skipPattern: /\bboxShadow\b|\bshadow\b|\binset\b.*rgba|rgba.*inset|['"](0\s+\d|\d+px)/,
    },
    {
        // Raw hsl/hsla function calls
        pattern: /\bhsla?\s*\(/,
        message: 'Raw hsl()/hsla() value detected. Use CSS custom properties or Tailwind semantic tokens.',
        skipComments: true,
    },
];

// ─── Scanner ──────────────────────────────────────────────────────────────────

let totalViolations = 0;
let scannedFiles = 0;
let violatingFiles = 0;

function isCommentLine(line) {
    const trimmed = line.trim();
    return (
        trimmed.startsWith('//') ||
        trimmed.startsWith('*') ||
        trimmed.startsWith('/*') ||
        trimmed.startsWith('#')   // CSS/shell comments
    );
}

function isExcluded(filePath) {
    const norm = filePath.replace(/\\/g, '/');
    if (EXCLUDED_PATHS.some(ex => norm.includes(ex))) return true;
    if (EXCLUDED_FILE_SUFFIXES.some(s => filePath.endsWith(s))) return true;
    return false;
}

function scanFile(filePath) {
    if (isExcluded(filePath)) return;
    if (!EXTENSIONS.has(path.extname(filePath))) return;

    const content = fs.readFileSync(filePath, 'utf8');
    const lines = content.split('\n');
    const relative = path.relative(SRC_DIR, filePath);

    let fileViolations = 0;

    lines.forEach((line, index) => {
        for (const { pattern, message, skipComments, skipPattern } of FORBIDDEN) {
            if (skipComments && isCommentLine(line)) continue;
            if (skipPattern && skipPattern.test(line)) continue;
            if (pattern.test(line)) {
                const lineNum = index + 1;
                if (fileViolations === 0) {
                    console.error(`\n  ❌ ${relative}`);
                }
                console.error(`     Line ${String(lineNum).padStart(4, ' ')}: ${line.trim().slice(0, 120)}`);
                console.error(`             → ${message}`);
                fileViolations++;
                totalViolations++;
            }
        }
    });

    if (fileViolations > 0) {
        violatingFiles++;
    }

    scannedFiles++;
}

function scanDir(dir) {
    if (!fs.existsSync(dir)) {
        console.error(`[validateDesignTokens] Directory not found: ${dir}`);
        process.exit(1);
    }

    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
            if (!EXCLUDED_PATHS.some(ex => entry.name === ex || entry.name.startsWith(ex))) {
                scanDir(full);
            }
        } else if (entry.isFile()) {
            scanFile(full);
        }
    }
}

// ─── Main ─────────────────────────────────────────────────────────────────────

console.log('');
console.log('┌─────────────────────────────────────────────────────┐');
console.log('│  DentalSaaS — Design Token Governance Validator      │');
console.log('│  Scanning: frontend/src/**/*.{js,jsx,ts,tsx}         │');
if (WARN_ONLY) {
    console.log('│  Mode: WARN-ONLY (--warn-only or DRY_RUN=true)       │');
}
console.log('└─────────────────────────────────────────────────────┘');
console.log('');

scanDir(SRC_DIR);

console.log('');
console.log(`  Scanned   : ${scannedFiles} files`);
console.log(`  Violations: ${totalViolations} in ${violatingFiles} file(s)`);
console.log('');

if (totalViolations === 0) {
    console.log('  ✅ Design tokens validated — no violations found.');
    console.log('');
    process.exit(0);
}

if (WARN_ONLY) {
    console.log(`  ⚠️  ${totalViolations} violation(s) found (warn-only mode — not failing CI).`);
    console.log('  Run without --warn-only to enforce in CI.');
    console.log('');
    process.exit(0);
}

console.log(`  ❌ ${totalViolations} design-token violation(s) detected.`);
console.log('  Fix violations or run with --warn-only to continue anyway.');
console.log('');
process.exit(1);
