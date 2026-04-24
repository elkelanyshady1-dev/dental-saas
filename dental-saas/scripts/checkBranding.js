/**
 * checkBranding.js — CI / pre-commit brand enforcement
 *
 * Scans all frontend source files for forbidden legacy brand strings.
 * Exits with code 1 if any violation is found → fails CI pipeline.
 *
 * Usage: node scripts/checkBranding.js
 * Add to package.json: "lint:branding": "node scripts/checkBranding.js"
 */
const fs = require("fs");
const path = require("path");

const FORBIDDEN = ["DentalSaaS", "dentalsaas.com", "support@dentalsaas"];
const EXTENSIONS = [".js", ".jsx", ".ts", ".tsx", ".html", ".css", ".json"];
// Skip generated API client files (auto-generated from backend swagger)
const SKIP_DIRS = ["node_modules", ".git", "dist", "build"];
const SKIP_FILES = ["checkBranding.js", "assertNoLegacyBrand.js"]; // Don't flag enforcement tools

let violations = 0;

function scan(dir) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);

    if (entry.isDirectory()) {
      if (SKIP_DIRS.includes(entry.name)) continue;
      scan(fullPath);
    } else if (entry.isFile()) {
      if (SKIP_FILES.includes(entry.name)) continue;
      if (!EXTENSIONS.some((ext) => entry.name.endsWith(ext))) continue;

      const content = fs.readFileSync(fullPath, "utf8");
      for (const term of FORBIDDEN) {
        if (content.includes(term)) {
          const lines = content.split("\n");
          lines.forEach((line, idx) => {
            if (line.includes(term)) {
              console.error(
                `  ❌ ${path.relative(process.cwd(), fullPath)}:${idx + 1}  →  "${term}"`
              );
              violations++;
            }
          });
        }
      }
    }
  }
}

console.log("\n🔍 Scanning for forbidden branding...\n");

const srcDir = path.resolve(__dirname, "../frontend/src");
const indexHtml = path.resolve(__dirname, "../frontend/index.html");

scan(srcDir);

// Also check index.html
if (fs.existsSync(indexHtml)) {
  const content = fs.readFileSync(indexHtml, "utf8");
  for (const term of FORBIDDEN) {
    if (content.includes(term)) {
      const lines = content.split("\n");
      lines.forEach((line, idx) => {
        if (line.includes(term)) {
          console.error(`  ❌ frontend/index.html:${idx + 1}  →  "${term}"`);
          violations++;
        }
      });
    }
  }
}

if (violations > 0) {
  console.error(`\n🚫 BRANDING CHECK FAILED: ${violations} violation(s) found.\n`);
  process.exit(1);
} else {
  console.log("✅ BRANDING CHECK PASSED: Zero legacy brand references found.\n");
  process.exit(0);
}
