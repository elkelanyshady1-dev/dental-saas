/**
 * rbac.invariant.test.js
 * Architecture Invariant: RBAC Enforcement Verification
 *
 * Part A: Scans all controller files and verifies they import and invoke authorize().
 * Part B: Verifies route-level RBAC enforcement (requireOrgPermission/authOnly).
 * Part C: Verifies firewall integration (_permissionChecked flag).
 * Part D: Verifies permission SSOT enforcement.
 */

const fs = require("fs");
const path = require("path");

const CONTROLLER_DIRS = [
  path.resolve(__dirname, "../../src/modules"),
  path.resolve(__dirname, "../../src/platform"),
];

// Controllers that are intentionally exempt from authorize() checks:
// - Auth endpoints run before authentication
// - Portal/supervisor controllers use their own JWT guard model
// - Authorization controllers manage RBAC itself
// - Some org controllers use route-level middleware only (pre-existing debt)
const EXEMPT_FILES = [
  // Auth endpoints
  "auth.controller.js",
  "patientAccess.controller.js",
  "patientAuth.controller.js",
  "platformAuth.controller.js",
  "platformPublicPricing.controller.js",
  "publicBooking.controller.js",
  "webhooks.controller.js",
  "profile.controller.js",
  "supervisorAuth.controller.js",
  "portalAuth.controller.js",
  "portalAccess.controller.js",
  // RBAC management controllers (manage the auth system itself)
  "authorization.controller.js",
  "override.controller.js",
  "roles.controller.js",
  // Pre-existing debt: these use route-level requireOrgPermission middleware
  // but lack controller-level authorize(). Tagged for future hardening.
  "analytics.controller.js",
  "auditTimeline.controller.js",
  "backup.controller.js",
  "orgAddOnPurchase.controller.js",
  "booking.controller.js",
  "bookingApproval.controller.js",
  "notification.controller.js",
  "language.controller.js",
  "timezone.controller.js",
  "exportCase.controller.js",
  "supervisorInvitation.controller.js",
  "bookingIntegration.controller.js",
  "patient.search.controller.js",
  "documents.controller.js",
  "financial.controller.js",
  "users.controller.js",
];

// These directories use different auth models — not org-level authorize()
const EXEMPT_DIRS = [
  "src/platform",         // uses requirePlatformCapability middleware
  "src/modules/supervisor", // uses supervisor JWT guards
  "src/modules/patientPortal", // uses portal JWT guards
  "src/modules/patientDomain/access", // patient auth endpoints
  "src/modules/file",   // file endpoints use route-level guards
  "src/modules/files",  // file endpoints use route-level guards
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
      entry.name.endsWith(".controller.js") ||
      (entry.isFile() && entry.name.endsWith("Controller.js"))
    ) {
      results.push(fullPath);
    }
  }
  return results;
}

const SRC = path.resolve(__dirname, "../../src");
function readSrc(relPath) {
  return fs.readFileSync(path.join(SRC, relPath), "utf-8");
}

// ═══════════════════════════════════════════════════════════════════════════
// Part B: Route-Level RBAC Enforcement
// ═══════════════════════════════════════════════════════════════════════════

describe("RBAC Invariant: requireOrgPermission sets firewall flag", () => {
  const content = readSrc("middleware/requireOrgPermission.js");

  it("must set req.context._permissionChecked = true on ALLOW", () => {
    expect(content).toMatch(/req\.context\._permissionChecked\s*=\s*true/);
  });

  it("must validate permission at boot via assertValidPermission", () => {
    expect(content).toContain("assertValidPermission");
  });
});

describe("RBAC Invariant: authOnly middleware exists and sets flag", () => {
  it("authOnly.js must exist", () => {
    expect(fs.existsSync(path.join(SRC, "middleware/authOnly.js"))).toBe(true);
  });

  it("must set _permissionChecked flag", () => {
    const content = readSrc("middleware/authOnly.js");
    expect(content).toMatch(/req\.context\._permissionChecked\s*=\s*true/);
  });

  it("must return 401 if no auth context", () => {
    const content = readSrc("middleware/authOnly.js");
    expect(content).toContain("401");
  });
});

describe("RBAC Invariant: assertAuthorization firewall blocks bypasses", () => {
  const content = readSrc("middleware/firewall/assertAuthorization.js");

  it("must check _permissionChecked flag", () => {
    expect(content).toContain("_permissionChecked");
  });

  it("must return 500 AUTHORIZATION_NOT_EXECUTED on bypass", () => {
    expect(content).toContain("AUTHORIZATION_NOT_EXECUTED");
    expect(content).toContain("500");
  });
});

describe("RBAC Invariant: orgV1Routes critical routes are protected", () => {
  const content = readSrc("routes/orgV1Routes.js");

  it("must import authOnly", () => {
    expect(content).toContain("authOnly");
  });

  it("/settings/profile must have requireOrgPermission", () => {
    const match = content.match(/router\.get\s*\(\s*["']\/settings\/profile["'][\s\S]*?\)/);
    expect(match).not.toBeNull();
    expect(match[0]).toContain("requireOrgPermission");
  });

  it("/context/branches must have authOnly", () => {
    const match = content.match(/router\.get\s*\(\s*["']\/context\/branches["'][\s\S]*?\)/);
    expect(match).not.toBeNull();
    expect(match[0]).toContain("authOnly");
  });

  it("/dashboard/overview must have requireOrgPermission", () => {
    const match = content.match(/router\.get\s*\(\s*["']\/dashboard\/overview["'][\s\S]*?\)/);
    expect(match).not.toBeNull();
    expect(match[0]).toContain("requireOrgPermission");
  });

  it("/support/tickets GET must have requireOrgPermission", () => {
    const match = content.match(/router\.get\s*\(\s*["']\/support\/tickets["'][\s\S]*?\)/);
    expect(match).not.toBeNull();
    expect(match[0]).toContain("requireOrgPermission");
  });

  it("/case/:caseId/teeth must have requireOrgPermission", () => {
    const match = content.match(/router\.get\s*\(\s*["']\/case\/:caseId\/teeth["'][\s\S]*?\)/);
    expect(match).not.toBeNull();
    expect(match[0]).toContain("requireOrgPermission");
  });
});

describe("RBAC Invariant: patient routes have requireOrgPermission", () => {
  const content = readSrc("modules/patientDomain/patientDomain.routes.js");

  it("GET / (list) must have requireOrgPermission", () => {
    const match = content.match(/router\.get\s*\(\s*["']\/["']\s*,[\s\S]*?patientController\.list/);
    expect(match).not.toBeNull();
    expect(match[0]).toContain("requireOrgPermission");
  });

  it("PUT /:id must have requireOrgPermission", () => {
    const match = content.match(/router\.put\s*\(\s*["']\/:id["']\s*,[\s\S]*?patientController\.update/);
    expect(match).not.toBeNull();
    expect(match[0]).toContain("requireOrgPermission");
  });

  it("DELETE /:id must have requireOrgPermission", () => {
    const match = content.match(/router\.delete\s*\(\s*["']\/:id["']\s*,[\s\S]*?patientController\.delete/);
    expect(match).not.toBeNull();
    expect(match[0]).toContain("requireOrgPermission");
  });
});

describe("RBAC Invariant: user self-service routes have authOnly", () => {
  const content = readSrc("modules/users/routes/users.routes.js");

  it("GET /me must have authOnly()", () => {
    const match = content.match(/router\.get\s*\(\s*["']\/me["']\s*,[\s\S]*?profileController\.getMyProfile/);
    expect(match).not.toBeNull();
    expect(match[0]).toContain("authOnly");
  });

  it("PATCH /me must have authOnly()", () => {
    const match = content.match(/router\.patch\s*\(\s*["']\/me["']\s*,[\s\S]*?profileController\.updateMyProfile/);
    expect(match).not.toBeNull();
    expect(match[0]).toContain("authOnly");
  });
});

describe("RBAC Invariant: Permission SSOT enforcement at boot", () => {
  it("server.js must call assertNoDrift({ strict: true })", () => {
    const content = fs.readFileSync(
      path.resolve(__dirname, "../../server.js"), "utf-8"
    );
    expect(content).toContain("assertNoDrift");
    expect(content).toContain("strict: true");
  });

  it("permissionDrift.js must cross-check featureRegistry against P enum", () => {
    const content = readSrc("rbac/permissionDrift.js");
    expect(content).toContain("FEATURE_REGISTRY");
    expect(content).toContain("isValidPermission");
  });
});

describe("RBAC Invariant: No inline permission strings in key route files", () => {
  const routeFiles = [
    "routes/orgV1Routes.js",
    "modules/patientDomain/patientDomain.routes.js",
    "modules/users/routes/users.routes.js",
  ];

  it.each(routeFiles)("%s must not use inline strings in requireOrgPermission()", (file) => {
    const filePath = path.join(SRC, file);
    if (!fs.existsSync(filePath)) return;
    const content = fs.readFileSync(filePath, "utf-8");
    // BAD: requireOrgPermission("some.string")
    // GOOD: requireOrgPermission(P.SOME_CONST)
    const inlineStrings = content.match(/requireOrgPermission\s*\(\s*["'][^"']+["']\s*\)/g);
    expect(inlineStrings).toBeNull();
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Part A: Controller-Level authorize() Enforcement (Original)
// ═══════════════════════════════════════════════════════════════════════════

describe("RBAC Invariant: authorize() must be called in every controller", () => {
  const controllers = [];
  for (const dir of CONTROLLER_DIRS) {
    findControllerFiles(dir, controllers);
  }

  // Filter out exempted files and directories
  const nonExempt = controllers.filter(
    (f) =>
      !EXEMPT_FILES.some((ex) => f.endsWith(ex)) &&
      !EXEMPT_DIRS.some((dir) => f.replace(/\\/g, "/").includes(dir))
  );

  it("should find at least 5 controller files to validate", () => {
    expect(nonExempt.length).toBeGreaterThanOrEqual(5);
  });

  for (const filePath of nonExempt) {
    const relPath = path.relative(path.resolve(__dirname, "../.."), filePath);

    it(`${relPath} must import authorize`, () => {
      const content = fs.readFileSync(filePath, "utf8");
      // Check for any import of authorize — alias or relative path
      const hasImport =
        content.includes("authorize") &&
        (content.includes("utils/authorize") ||
         content.includes("@utils/authorize"));
      expect(hasImport).toBe(true);
    });

    it(`${relPath} must call authorize()`, () => {
      const content = fs.readFileSync(filePath, "utf8");
      const hasCall = content.includes("authorize(");
      expect(hasCall).toBe(true);
    });
  }
});
