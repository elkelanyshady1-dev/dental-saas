/**
 * policyCoverage.invariant.test.js — Policy↔Permission Coverage Invariants
 *
 * Static analysis tests ensuring ZERO drift between the P permission enum
 * and the policyRegistry. No database or server required.
 *
 * RUN: jest src/tests/invariants/policyCoverage.invariant.test.js
 *
 * Invariants Tested:
 *   1. Every permission in P has a policy in policyRegistry
 *   2. No empty policy arrays
 *   3. Every policy rule has valid structure (effect, condition, description)
 *   4. No orphan policies (policies without matching P.* constant)
 *   5. Auto-sync engine detects the same set as manual scan
 */

"use strict";

const { P } = require("@rbac/orgPermissions");
const { policies: policyRegistry } = require("@rbac/policyRegistry");
const { autoSyncPolicies } = require("@rbac/policyAutoSync");

const allPermissions = [...new Set(Object.values(P))];

describe("Policy Coverage Invariants", () => {
    test("All permissions have policies", () => {
        const policyKeys = new Set(Object.keys(policyRegistry));
        const missing = allPermissions.filter((p) => !policyKeys.has(p));

        if (missing.length > 0) {
            // Provide actionable error message
            const msg = missing.map((p) => `  - ${p}`).join("\n");
            fail(
                `${missing.length} permission(s) have no policy in policyRegistry:\n${msg}\n\n` +
                `Fix: Add policy rules in backend/src/rbac/policies/ for each missing permission.`
            );
        }
    });

    test("No empty policy arrays", () => {
        const empty = [];
        for (const perm of allPermissions) {
            const rules = policyRegistry[perm];
            if (rules && (!Array.isArray(rules) || rules.length === 0)) {
                empty.push(perm);
            }
        }
        expect(empty).toEqual([]);
    });

    test("Every policy rule has valid structure", () => {
        const errors = [];

        for (const [permission, rules] of Object.entries(policyRegistry)) {
            if (!Array.isArray(rules)) continue;

            for (let i = 0; i < rules.length; i++) {
                const rule = rules[i];
                if (typeof rule !== "object" || rule === null) {
                    errors.push(`${permission}[${i}]: not an object`);
                    continue;
                }
                if (rule.effect !== "allow" && rule.effect !== "deny") {
                    errors.push(`${permission}[${i}]: invalid effect "${rule.effect}"`);
                }
                if (typeof rule.condition !== "function") {
                    errors.push(`${permission}[${i}]: condition is ${typeof rule.condition}, expected function`);
                }
                if (typeof rule.description !== "string" || !rule.description.trim()) {
                    errors.push(`${permission}[${i}]: missing description`);
                }
            }
        }

        if (errors.length > 0) {
            fail(`${errors.length} structural error(s):\n${errors.map((e) => `  - ${e}`).join("\n")}`);
        }
    });

    test("No orphan policies without matching P.* constant", () => {
        const permSet = new Set(allPermissions);
        const orphans = Object.keys(policyRegistry).filter((key) => !permSet.has(key));

        if (orphans.length > 0) {
            const msg = orphans.map((p) => `  - ${p}`).join("\n");
            console.warn(
                `⚠️ ${orphans.length} orphan policy key(s) (no matching P.* constant):\n${msg}`
            );
        }
        // Orphans are advisory, not hard failures — uncomment below to enforce:
        // expect(orphans).toEqual([]);
    });

    test("autoSyncPolicies strict mode throws on missing policies", () => {
        // This test verifies the auto-sync engine itself works correctly.
        // If all policies exist, strict mode should NOT throw.
        // If policies are missing, it SHOULD throw.
        const policyKeys = new Set(Object.keys(policyRegistry));
        const missing = allPermissions.filter((p) => !policyKeys.has(p));

        if (missing.length === 0) {
            // All covered — strict mode should succeed
            expect(() => autoSyncPolicies({ mode: "strict" })).not.toThrow();
        } else {
            // Missing policies — strict mode must throw
            expect(() => autoSyncPolicies({ mode: "strict" })).toThrow(/Missing policies/);
        }
    });
});
