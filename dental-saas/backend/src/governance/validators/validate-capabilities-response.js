require("module-alias/register");
/**
 * validate-capabilities-response.js
 * Phase 22 — Platform Capabilities Response Shape Validator
 *
 * Governance validator that statically verifies the getCapabilities controller
 * produces the correct response shape:
 *
 *   {
 *     role: string,
 *     capabilities: string[],
 *     capabilityHash: string (SHA-256, 64 hex chars)
 *   }
 *
 * Validates by:
 *   1. Statically analyzing the controller source for res.json shape
 *   2. Invoking the resolver directly to confirm array return type
 *   3. Verifying computeCapabilityHash produces a 64-char hex string
 *
 * Does NOT start a server or make HTTP requests.
 * Does NOT modify any files.
 */

require("dotenv").config();

const path = require("path");
const fs = require("fs");

const BACKEND_ROOT = path.resolve(__dirname, "../../..");
const CONTROLLER_PATH = path.resolve(BACKEND_ROOT, "src/controllers/platformMetadataController.js");
const RESOLVER_PATH = path.resolve(BACKEND_ROOT, "src/services/platformCapabilityResolver.js");

const failures = [];
const warnings = [];

console.log("╔══════════════════════════════════════════════╗");
console.log("║  CAPABILITIES RESPONSE SHAPE — Phase 22     ║");
console.log("╚══════════════════════════════════════════════╝");
console.log("");

// ── 1. Verify controller source contains correct response shape ──────────

const controllerSource = fs.readFileSync(CONTROLLER_PATH, "utf-8");

// Check res.json includes role, capabilities, capabilityHash
const hasRoleInResponse = /res\.json\(\{[^}]*role\s*:/s.test(controllerSource);
const hasCapabilitiesInResponse = /res\.json\(\{[^}]*capabilities/s.test(controllerSource);
const hasCapabilityHashInResponse = /res\.json\(\{[^}]*capabilityHash/s.test(controllerSource);

if (!hasRoleInResponse) {
    failures.push({
        type: "MISSING_ROLE_IN_RESPONSE",
        severity: "critical",
        message: "getCapabilities response does not include 'role' field",
        code: "CAP_RESPONSE_NO_ROLE",
        endpoint: "/api/platform/capabilities",
        recommendation: "Ensure res.json includes role: user.role"
    });
} else {
    console.log("  ✅ Response includes 'role' field");
}

if (!hasCapabilitiesInResponse) {
    failures.push({
        type: "MISSING_CAPABILITIES_IN_RESPONSE",
        severity: "critical",
        message: "getCapabilities response does not include 'capabilities' field",
        code: "CAP_RESPONSE_NO_CAPABILITIES",
        endpoint: "/api/platform/capabilities",
        recommendation: "Ensure res.json includes capabilities array"
    });
} else {
    console.log("  ✅ Response includes 'capabilities' field");
}

if (!hasCapabilityHashInResponse) {
    failures.push({
        type: "MISSING_HASH_IN_RESPONSE",
        severity: "critical",
        message: "getCapabilities response does not include 'capabilityHash' field",
        code: "CAP_RESPONSE_NO_HASH",
        endpoint: "/api/platform/capabilities",
        recommendation: "Ensure res.json includes capabilityHash"
    });
} else {
    console.log("  ✅ Response includes 'capabilityHash' field");
}

// Check that res.json(result) as plain array is NOT used
const sendsPlainArray = /res\.json\(result\)\s*;/.test(controllerSource);
if (sendsPlainArray) {
    failures.push({
        type: "PLAIN_ARRAY_RESPONSE",
        severity: "critical",
        message: "getCapabilities sends res.json(result) directly — frontend expects { capabilities: [...] }",
        code: "CAP_RESPONSE_PLAIN_ARRAY",
        endpoint: "/api/platform/capabilities",
        recommendation: "Wrap response in { role, capabilities, capabilityHash }"
    });
}

// ── 2. Verify resolver returns array ─────────────────────────────────────

try {
    const { resolvePlatformCapabilities } = require(RESOLVER_PATH);
    const result = resolvePlatformCapabilities({ role: "superadmin" });

    if (!Array.isArray(result)) {
        failures.push({
            type: "RESOLVER_NOT_ARRAY",
            severity: "critical",
            message: `resolvePlatformCapabilities returned ${typeof result} instead of array`,
            code: "RESOLVER_WRONG_TYPE",
            recommendation: "Resolver must return string[]"
        });
    } else {
        console.log(`  ✅ Resolver returns array (${result.length} capabilities)`);

        // Verify every item is a string
        const nonStrings = result.filter(c => typeof c !== "string");
        if (nonStrings.length > 0) {
            failures.push({
                type: "RESOLVER_NON_STRING_ITEMS",
                severity: "critical",
                message: `Resolver returned ${nonStrings.length} non-string items`,
                code: "RESOLVER_INVALID_ITEMS",
                recommendation: "All capabilities must be strings"
            });
        } else {
            console.log("  ✅ All capability items are strings");
        }
    }
} catch (err) {
    warnings.push({
        type: "RESOLVER_IMPORT_ERROR",
        severity: "medium",
        message: `Could not import resolver: ${err.message}`,
        code: "RESOLVER_IMPORT_FAIL",
        recommendation: "Ensure platformCapabilityResolver.js exports resolvePlatformCapabilities"
    });
}

// ── 3. Verify computeCapabilityHash produces valid SHA-256 ───────────────

try {
    const controller = require(CONTROLLER_PATH);
    if (typeof controller.computeCapabilityHash === "function") {
        const testCaps = ["VIEW_ORGANIZATIONS", "MANAGE_ORGANIZATIONS"];
        const hash = controller.computeCapabilityHash(testCaps);

        if (typeof hash !== "string") {
            failures.push({
                type: "HASH_NOT_STRING",
                severity: "critical",
                message: `computeCapabilityHash returned ${typeof hash}`,
                code: "HASH_WRONG_TYPE",
                recommendation: "Hash must be a hex string"
            });
        } else if (hash.length !== 64) {
            failures.push({
                type: "HASH_WRONG_LENGTH",
                severity: "critical",
                message: `capabilityHash length is ${hash.length}, expected 64 (SHA-256)`,
                code: "HASH_LENGTH_MISMATCH",
                recommendation: "Use SHA-256 for capability hashing"
            });
        } else if (!/^[0-9a-f]{64}$/.test(hash)) {
            failures.push({
                type: "HASH_NOT_HEX",
                severity: "critical",
                message: "capabilityHash is not a valid hex string",
                code: "HASH_FORMAT_INVALID",
                recommendation: "Hash must be lowercase hex"
            });
        } else {
            console.log(`  ✅ capabilityHash is valid SHA-256 (${hash.slice(0, 16)}...)`);
        }

        // Determinism check
        const hash2 = controller.computeCapabilityHash(testCaps);
        if (hash !== hash2) {
            failures.push({
                type: "HASH_NON_DETERMINISTIC",
                severity: "critical",
                message: "computeCapabilityHash is non-deterministic",
                code: "HASH_DETERMINISM_FAIL",
                recommendation: "Hash function must be deterministic"
            });
        } else {
            console.log("  ✅ capabilityHash is deterministic");
        }
    } else {
        warnings.push({
            type: "HASH_FUNCTION_NOT_EXPORTED",
            severity: "medium",
            message: "computeCapabilityHash is not exported from controller",
            code: "HASH_NOT_EXPORTED"
        });
    }
} catch (err) {
    warnings.push({
        type: "CONTROLLER_IMPORT_ERROR",
        severity: "medium",
        message: `Could not import controller: ${err.message}`,
        code: "CONTROLLER_IMPORT_FAIL"
    });
}

// ── 4. Verify invalidatePlatformRoleCache is exported ────────────────────

try {
    const { invalidatePlatformRoleCache } = require(RESOLVER_PATH);
    if (typeof invalidatePlatformRoleCache !== "function") {
        warnings.push({
            type: "INVALIDATE_NOT_FUNCTION",
            severity: "medium",
            message: "invalidatePlatformRoleCache is not a function",
            code: "CACHE_INVALIDATE_MISSING"
        });
    } else {
        console.log("  ✅ invalidatePlatformRoleCache is exported");
    }
} catch (err) {
    warnings.push({
        type: "INVALIDATE_IMPORT_ERROR",
        severity: "medium",
        message: `Could not verify invalidatePlatformRoleCache: ${err.message}`,
        code: "INVALIDATE_IMPORT_FAIL"
    });
}

// ── Output ───────────────────────────────────────────────────────────────

console.log("");

if (warnings.length > 0) {
    for (const w of warnings) {
        console.log(`  ⚠️  [WARNING] ${w.type}: ${w.message}`);
    }
}

if (failures.length > 0) {
    for (const f of failures) {
        console.log(`  ❌ [FAIL] ${f.type}: ${f.message}`);
    }
}

console.log("");
console.log(JSON.stringify({
    name: "validate:capabilities-response",
    status: failures.length === 0 ? "PASS" : "FAIL",
    failures: failures.length,
    warnings: warnings.length,
    details: { failures, warnings }
}));

process.exit(failures.length > 0 ? 1 : 0);
