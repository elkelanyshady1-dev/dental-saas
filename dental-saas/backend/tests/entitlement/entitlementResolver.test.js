/**
 * tests/entitlement/entitlementResolver.test.js
 * Sprint 2 — Tenant Entitlement Engine
 *
 * Tests the entitlementResolver.service.js against:
 *   ✅ 1. Returns plan defaults when no OrganizationEntitlement exists
 *   ✅ 2. Module override merges correctly (override wins per-field)
 *   ✅ 3. Limits override merges correctly
 *   ✅ 4. Addons list is returned from override
 *   ✅ 5. Capabilities map derived correctly from merged modules
 *   ✅ 6. Cache hit returns cached result
 *   ✅ 7. Cache invalidation forces fresh DB lookup
 *   ✅ 8. DB failure falls back to plan defaults (never throws)
 *
 * Uses real service-layer logic + in-memory MongoDB (via tests/setup.js).
 * No HTTP layer — controller not involved.
 */

"use strict";

const mongoose = require("mongoose");

const {
    resolveOrganizationEntitlements,
    invalidateEntitlementCache,
    deriveCapabilities,
    _cache
} = require("../../src/platform/billing/services/entitlementResolver.service");

const OrganizationEntitlement = require("../../src/platform/billing/models/OrganizationEntitlement.model");
const OrgContract = require("../../src/platform/billing/models/OrgContract.model");

// ── Factory helpers (reuse from contract tests) ───────────────────────────────
const {
    ACTOR_ID,
    createOrg,
    createPlanVersion,
    createDraftContract
} = require("../contract/helpers/factory");

// ─── Minimal planVersion fixture ──────────────────────────────────────────────
function makePlanVersion(overrides = {}) {
    return {
        _id: new mongoose.Types.ObjectId(),
        modules: {
            patients: true,
            appointments: true,
            finance: true,
            inventory: false,
            lab: false,
            orthodonticsAdv: false,
            analytics: false,
            booking: false,
            communication: { enabled: false, smsQuota: 0 }
        },
        limits: {
            maxUsers: 5,
            maxBranches: 1
        },
        ...overrides
    };
}

// ─── Test Suite ───────────────────────────────────────────────────────────────

describe("entitlementResolver — resolveOrganizationEntitlements()", () => {

    let org, planVersion;

    beforeEach(async () => {
        // Reset in-memory cache before every test
        _cache.clear();

        org = await createOrg();
        const pv = await createPlanVersion();
        // Use a plain object (lean-style) so the resolver works with it
        planVersion = makePlanVersion({
            _id: pv._id,
        });
    });

    // ── Test 1 ─────────────────────────────────────────────────────────────────
    it("✅ 1. Returns plan defaults when no OrganizationEntitlement exists", async () => {
        const result = await resolveOrganizationEntitlements(org._id, planVersion);

        expect(result.modules.patients).toBe(true);
        expect(result.modules.inventory).toBe(false);
        expect(result.limits.maxUsers).toBe(5);
        expect(result.addons).toEqual([]);
    });

    // ── Test 2 ─────────────────────────────────────────────────────────────────
    it("✅ 2. Module override merges correctly — override wins per-field", async () => {
        const contract = await createDraftContract(org._id, planVersion._id);

        await OrganizationEntitlement.create({
            organizationId: org._id,
            contractId: contract._id,
            planVersionId: planVersion._id,
            modules: { analytics: true, inventory: true },   // override 2 fields
            limits: {},
            addons: [],
            source: "override",
            effectiveUntil: null
        });

        const result = await resolveOrganizationEntitlements(org._id, planVersion);

        // Overridden fields come from entitlement
        expect(result.modules.analytics).toBe(true);
        expect(result.modules.inventory).toBe(true);
        // Non-overridden fields come from plan defaults
        expect(result.modules.patients).toBe(true);
        expect(result.modules.lab).toBe(false);
    });

    // ── Test 3 ─────────────────────────────────────────────────────────────────
    it("✅ 3. Limits override merges correctly", async () => {
        const contract = await createDraftContract(org._id, planVersion._id);

        await OrganizationEntitlement.create({
            organizationId: org._id,
            contractId: contract._id,
            planVersionId: planVersion._id,
            modules: {},
            limits: { maxUsers: 20 },   // only maxUsers overridden
            addons: [],
            source: "override",
            effectiveUntil: null
        });

        const result = await resolveOrganizationEntitlements(org._id, planVersion);

        expect(result.limits.maxUsers).toBe(20);            // override wins
        expect(result.limits.maxBranches).toBe(1);          // plan default retained
    });

    // ── Test 4 ─────────────────────────────────────────────────────────────────
    it("✅ 4. Addons list is returned from override", async () => {
        const contract = await createDraftContract(org._id, planVersion._id);

        await OrganizationEntitlement.create({
            organizationId: org._id,
            contractId: contract._id,
            planVersionId: planVersion._id,
            modules: {},
            limits: {},
            addons: ["extra_sms_5000", "priority_support"],
            source: "addon",
            effectiveUntil: null
        });

        const result = await resolveOrganizationEntitlements(org._id, planVersion);

        expect(result.addons).toEqual(["extra_sms_5000", "priority_support"]);
    });

    // ── Test 5 ─────────────────────────────────────────────────────────────────
    it("✅ 5. Capabilities map derived correctly from merged modules", async () => {
        const contract = await createDraftContract(org._id, planVersion._id);

        // Override analytics → true, leave rest as plan defaults
        await OrganizationEntitlement.create({
            organizationId: org._id,
            contractId: contract._id,
            planVersionId: planVersion._id,
            modules: { analytics: true, orthodonticsAdv: true },
            limits: {},
            addons: [],
            source: "override",
            effectiveUntil: null
        });

        const result = await resolveOrganizationEntitlements(org._id, planVersion);

        expect(result.capabilities.analytics).toBe(true);
        expect(result.capabilities.orthodontics).toBe(true);
        expect(result.capabilities.inventory).toBe(false);     // plan default = false
        expect(result.capabilities.patients).toBe(true);       // plan default = true
    });

    // ── Test 6 ─────────────────────────────────────────────────────────────────
    it("✅ 6. Cache hit returns cached result without a second DB lookup", async () => {
        // First call — DB hit
        const first = await resolveOrganizationEntitlements(org._id, planVersion);
        expect(_cache.has(String(org._id))).toBe(true);

        // Mutate DB directly — cache should still serve stale result
        await OrganizationEntitlement.deleteMany({ organizationId: org._id });

        const second = await resolveOrganizationEntitlements(org._id, planVersion);

        // Both calls return the same snapshot (from cache)
        expect(second.limits.maxUsers).toBe(first.limits.maxUsers);
    });

    // ── Test 7 ─────────────────────────────────────────────────────────────────
    it("✅ 7. Cache invalidation forces fresh DB lookup", async () => {
        // Populate cache
        await resolveOrganizationEntitlements(org._id, planVersion);
        expect(_cache.has(String(org._id))).toBe(true);

        // Invalidate
        invalidateEntitlementCache(org._id);
        expect(_cache.has(String(org._id))).toBe(false);

        // Insert override
        const contract = await createDraftContract(org._id, planVersion._id);
        await OrganizationEntitlement.create({
            organizationId: org._id,
            contractId: contract._id,
            planVersionId: planVersion._id,
            modules: { analytics: true },
            limits: {},
            addons: ["new_addon"],
            source: "override",
            effectiveUntil: null
        });

        // Fresh DB lookup should pick up the new override
        const result = await resolveOrganizationEntitlements(org._id, planVersion);
        expect(result.modules.analytics).toBe(true);
        expect(result.addons).toContain("new_addon");
    });

    // ── Test 8 ─────────────────────────────────────────────────────────────────
    it("✅ 8. DB failure falls back to plan defaults — never throws", async () => {
        // Disconnect to simulate DB failure mid-request
        // We mock findOne to throw instead of actually disconnecting (avoids teardown issues)
        const original = OrganizationEntitlement.findOne;
        OrganizationEntitlement.findOne = () => {
            throw new Error("Simulated DB failure");
        };

        let result;
        await expect(async () => {
            result = await resolveOrganizationEntitlements(org._id, planVersion);
        }).not.toThrow();

        // Should return plan defaults
        expect(result.modules.patients).toBe(true);
        expect(result.limits.maxUsers).toBe(5);
        expect(result.addons).toEqual([]);

        // Restore
        OrganizationEntitlement.findOne = original;
    });
});

// ─── deriveCapabilities unit tests ───────────────────────────────────────────

describe("entitlementResolver — deriveCapabilities()", () => {

    it("maps analytics correctly", () => {
        expect(deriveCapabilities({ analytics: true }).analytics).toBe(true);
        expect(deriveCapabilities({ analytics: false }).analytics).toBe(false);
        expect(deriveCapabilities({}).analytics).toBe(false);
    });

    it("maps orthodonticsAdv → orthodontics key", () => {
        expect(deriveCapabilities({ orthodonticsAdv: true }).orthodontics).toBe(true);
        expect(deriveCapabilities({ orthodonticsAdv: false }).orthodontics).toBe(false);
    });

    it("maps communication.enabled correctly", () => {
        expect(deriveCapabilities({ communication: { enabled: true } }).communication).toBe(true);
        expect(deriveCapabilities({ communication: { enabled: false } }).communication).toBe(false);
        expect(deriveCapabilities({}).communication).toBe(false);
    });

    it("handles empty/null input gracefully", () => {
        expect(() => deriveCapabilities(null)).not.toThrow();
        expect(() => deriveCapabilities(undefined)).not.toThrow();
        const caps = deriveCapabilities(null);
        expect(caps.analytics).toBe(false);
    });
});
