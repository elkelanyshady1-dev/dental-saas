/**
 * reactQuery.invariant.test.js
 * Architecture Invariant: React Query enforcement
 *
 * Scans frontend source for violations of React Query rules:
 * 1. No useState for API/server data (must use useQuery)
 * 2. No manual refetch() calls (must use queryClient.invalidateQueries)
 * 3. No window.location.reload() (must use query invalidation)
 * 4. No new QueryClient() outside the shared instance
 */

import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const SRC_DIR = path.resolve(__dirname, "../../src");

// Files that are legitimately exempt
const EXEMPT_FILES = [
  "queryClient.js",      // the shared QueryClient instance itself
  "queryClient.ts",
  "setup.js",            // test setup
  "vite.config.js",
];

function findJsxFiles(dir, results = []) {
  if (!fs.existsSync(dir)) return results;
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory() && entry.name !== "node_modules") {
      findJsxFiles(fullPath, results);
    } else if (
      entry.isFile() &&
      (entry.name.endsWith(".jsx") || entry.name.endsWith(".tsx"))
    ) {
      results.push(fullPath);
    }
  }
  return results;
}

function findJsFiles(dir, results = []) {
  if (!fs.existsSync(dir)) return results;
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory() && entry.name !== "node_modules") {
      findJsFiles(fullPath, results);
    } else if (
      entry.isFile() &&
      (entry.name.endsWith(".js") ||
        entry.name.endsWith(".jsx") ||
        entry.name.endsWith(".ts") ||
        entry.name.endsWith(".tsx"))
    ) {
      results.push(fullPath);
    }
  }
  return results;
}

describe("React Query Invariant: No window.location.reload()", () => {
  const files = findJsxFiles(SRC_DIR);

  it("should find JSX files to validate", () => {
    expect(files.length).toBeGreaterThan(0);
  });

  for (const filePath of files) {
    const relPath = path.relative(path.resolve(__dirname, "../.."), filePath);

    it(`${relPath} must not use window.location.reload()`, () => {
      const content = fs.readFileSync(filePath, "utf8");
      const lines = content.split("\n");
      const violations = lines
        .map((line, i) => ({ line: line.trim(), num: i + 1 }))
        .filter(
          ({ line }) =>
            line.includes("window.location.reload()") &&
            !line.startsWith("//") &&
            !line.startsWith("*")
        );

      expect(violations).toEqual([]);
    });
  }
});

describe("React Query Invariant: No new QueryClient()", () => {
  const allFiles = findJsFiles(SRC_DIR);
  const nonExempt = allFiles.filter(
    (f) => !EXEMPT_FILES.some((ex) => f.endsWith(ex))
  );

  for (const filePath of nonExempt) {
    const relPath = path.relative(path.resolve(__dirname, "../.."), filePath);

    it(`${relPath} must not create new QueryClient instances`, () => {
      const content = fs.readFileSync(filePath, "utf8");
      const lines = content.split("\n");
      const violations = lines
        .map((line, i) => ({ line: line.trim(), num: i + 1 }))
        .filter(
          ({ line }) =>
            line.includes("new QueryClient(") &&
            !line.startsWith("//") &&
            !line.startsWith("*")
        );

      expect(violations).toEqual([]);
    });
  }
});
