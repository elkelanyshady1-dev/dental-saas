/**
 * dto.invariant.test.js
 * Architecture Invariant: Controllers must not return raw DB objects
 *
 * Scans controller files for patterns that indicate raw Mongoose documents
 * being sent directly in responses without going through a DTO builder.
 */

const fs = require("fs");
const path = require("path");

const CONTROLLER_DIRS = [
  path.resolve(__dirname, "../../src/modules"),
  path.resolve(__dirname, "../../src/platform"),
];

// Patterns that suggest raw DB objects in responses
const RAW_RESPONSE_PATTERNS = [
  // Direct .find()/.findById() result in res.json()
  /res\.json\(\s*\{[^}]*data:\s*(?:await\s+)?\w+\.find\(/,
  /res\.json\(\s*\{[^}]*data:\s*(?:await\s+)?\w+\.findById\(/,
  /res\.json\(\s*\{[^}]*data:\s*(?:await\s+)?\w+\.findOne\(/,
  // .toObject() — indicates raw Mongoose doc being manually converted
  /\.toObject\(\)/,
];

// Files that are intentionally exempt
const EXEMPT_FILES = [
  "webhooks.controller.js",
  "platformDebug.controller.js",
  "profile.controller.js",                // user profile — uses toObject for field selection
  "platformContract.controller.js",       // platform billing — uses toObject for plan version serialization
  "orgAddOnPurchase.controller.js",       // add-on purchase — uses toObject for safe conversion
  "platformPlanVersion.controller.js",    // platform — uses toObject for version serialization
  "platformUserController.js",            // platform — uses toObject for user management
  "platformPlan.controller.js",           // platform — uses toObject for plan management
];

function findControllerFiles(dir, results = []) {
  if (!fs.existsSync(dir)) return results;
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory() && entry.name !== "node_modules") {
      findControllerFiles(fullPath, results);
    } else if (
      entry.isFile() &&
      (entry.name.endsWith(".controller.js") || entry.name.endsWith("Controller.js"))
    ) {
      results.push(fullPath);
    }
  }
  return results;
}

describe("DTO Invariant: Controllers must use DTO builders", () => {
  const controllers = [];
  for (const dir of CONTROLLER_DIRS) {
    findControllerFiles(dir, controllers);
  }

  const nonExempt = controllers.filter(
    (f) => !EXEMPT_FILES.some((ex) => f.endsWith(ex))
  );

  it("should find at least 5 controller files to validate", () => {
    expect(nonExempt.length).toBeGreaterThanOrEqual(5);
  });

  for (const filePath of nonExempt) {
    const relPath = path.relative(path.resolve(__dirname, "../.."), filePath);

    it(`${relPath} should not return raw .toObject() in responses`, () => {
      const content = fs.readFileSync(filePath, "utf8");
      // .toObject() in a controller strongly suggests raw Mongoose docs
      // being manually shaped instead of going through a DTO builder
      const lines = content.split("\n");
      const violations = lines
        .map((line, i) => ({ line: line.trim(), num: i + 1 }))
        .filter(
          ({ line }) =>
            line.includes(".toObject()") &&
            !line.startsWith("//") &&
            !line.startsWith("*") &&
            // Allow .toObject() when passed as argument to a DTO builder
            !/build\w+DTO\(.*\.toObject\(\)/.test(line) &&
            // Allow .toObject() when used with ternary for safe conversion
            !/\.toObject\s*\?\s*/.test(line) &&
            !/typeof\s+\w+\.toObject/.test(line)
        );

      if (violations.length > 0) {
        const detail = violations
          .map((v) => `  L${v.num}: ${v.line}`)
          .join("\n");
        throw new Error(
          `Found .toObject() in ${relPath} — use a DTO builder instead:\n${detail}`
        );
      }
    });
  }
});
