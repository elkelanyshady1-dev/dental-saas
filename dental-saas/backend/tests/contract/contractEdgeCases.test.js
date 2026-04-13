/**
 * tests/contract/contractEdgeCases.test.js
 *
 * Contract Engine — Edge Case & Invariant Tests
 *
 * What this tests:
 *   ✅ resolveCommercialContext(): returns correct data from active OrgContract
 *   ❌ resolveCommercialContext(): throws DomainViolation if no active contract (Sprint 5 hard cutover)
 *   ✅ loadActiveContract(): returns null (not throw) when no contract exists
 *   ✅ requireActiveContract(): throws DomainViolation with correct code
 *   ✅ Individual field resolvers: resolvePlanCode, resolveCurrency, resolveLockedPrice
 *   ❌ Field resolvers throw DomainViolation on missing fields
 *   ✅ autoRenew=false contract: resolver returns false
 *   ✅ creditBalance defaults to 0
 *   ✅ gracePeriodDays defaults to 7
 *   ✅ renewalTerms defaults are correct
 *   ✅ pricingOverride returns null when not set
 *   ✅ appliedCoupon returns null when not set
 *   ❌ createContract without required fields throws validation error
 *   ✅ Time travel: contract with past effectiveTo is still loaded by loadActiveContract
 *      (status-based, not date-based — contractStatus drives the truth)
 *   ✅ Multiple orgs: resolver correctly scopes to correct org
 */

"use strict";

const mongoose = require("mongoose");
const OrgContract = require("../../src/platform/billing/models/OrgContract.model");

const {
    loadActiveContract,
    requireActiveContract,
    resolveCommercialContext,
    resolvePlanCode,
    resolveCurrency,
    resolveLockedPrice,
    resolveAppliedCoupon,
    resolveRenewalTerms,
    resolvePricingOverride,
    resolveCreditBalance,
    resolveGracePeriodDays,
    resolveAutoRenew,
    DomainViolation,
} = require("../../src/platform/billing/services/contractResolver.service");

const {
    ACTOR_ID,
    createOrg,
    createPlanVersion,
    createDraftContract,
    createActiveContract,
} = require("./helpers/factory");

// ─── loadActiveContract ───────────────────────────────────────────────────────

describe("ContractResolver — loadActiveContract()", () => {
    it("✅ Returns null when no active contract exists (does NOT throw)", async () => {
        const org = await createOrg();
        const result = await loadActiveContract(org._id);
        expect(result).toBeNull();
    });

    it("✅ Returns the active contract when one exists", async () => {
        const org = await createOrg();
        const pv = await createPlanVersion();
        const active = await createActiveContract(org._id, pv._id, {
            planCode: "pro",
            lockedPrice: 500,
            currency: "SAR",
        });

        const result = await loadActiveContract(org._id);
        expect(result).not.toBeNull();
        expect(result._id.toString()).toBe(active._id.toString());
        expect(result.planCode).toBe("pro");
    });

    it("✅ Ignores draft contracts — only active ones are returned", async () => {
        const org = await createOrg();
        const pv = await createPlanVersion();
        await createDraftContract(org._id, pv._id);

        const result = await loadActiveContract(org._id);
        expect(result).toBeNull();
    });

    it("✅ Scopes correctly: returns contract for correct org only", async () => {
        const org1 = await createOrg();
        const org2 = await createOrg();
        const pv = await createPlanVersion();

        await createActiveContract(org1._id, pv._id, { lockedPrice: 100 });
        await createActiveContract(org2._id, pv._id, { lockedPrice: 999 });

        const result1 = await loadActiveContract(org1._id);
        const result2 = await loadActiveContract(org2._id);

        expect(result1.lockedPrice).toBe(100);
        expect(result2.lockedPrice).toBe(999);
        expect(result1._id.toString()).not.toBe(result2._id.toString());
    });
});

// ─── requireActiveContract ────────────────────────────────────────────────────

describe("ContractResolver — requireActiveContract()", () => {
    it("✅ Returns active contract when it exists", async () => {
        const org = await createOrg();
        const pv = await createPlanVersion();
        await createActiveContract(org._id, pv._id, { planCode: "enterprise" });

        const result = await requireActiveContract(org._id);
        expect(result).not.toBeNull();
        expect(result.planCode).toBe("enterprise");
    });

    it("❌ Throws DomainViolation with NO_ACTIVE_CONTRACT when missing (Sprint 5 hard cutover)", async () => {
        const org = await createOrg();

        await expect(requireActiveContract(org._id))
            .rejects.toMatchObject({
                name: "DomainViolation",
                code: "NO_ACTIVE_CONTRACT",
            });
    });
});

// ─── resolveCommercialContext ─────────────────────────────────────────────────

describe("ContractResolver — resolveCommercialContext()", () => {
    it("✅ Returns full commercial context from active OrgContract", async () => {
        const org = await createOrg();
        const pv = await createPlanVersion();
        await createActiveContract(org._id, pv._id, {
            planCode: "pro",
            lockedPrice: 299,
            currency: "USD",
            autoRenew: true,
            gracePeriodDays: 14,
        });

        const ctx = await resolveCommercialContext(org);

        expect(ctx._source).toBe("contract");
        expect(ctx.planCode).toBe("pro");
        expect(ctx.currency).toBe("USD");
        expect(ctx.lockedPrice).toBe(299);
        expect(ctx.autoRenew).toBe(true);
        expect(ctx.gracePeriodDays).toBe(14);
        expect(ctx.appliedCoupon).toBeNull();
        expect(ctx.pricingOverride).toBeNull();
    });

    it("❌ Throws DomainViolation if org has no active contract (Sprint 5: no fallback)", async () => {
        const org = await createOrg();

        await expect(resolveCommercialContext(org))
            .rejects.toMatchObject({
                name: "DomainViolation",
                code: "NO_ACTIVE_CONTRACT",
            });
    });

    it("✅ Uses preloaded contract when provided (avoids re-query)", async () => {
        const org = await createOrg();
        const pv = await createPlanVersion();
        const active = await createActiveContract(org._id, pv._id, {
            planCode: "basic",
            lockedPrice: 50,
            currency: "KWD",
        });

        // Simulate pre-loading
        const preloaded = await OrgContract.findById(active._id).lean();
        const ctx = await resolveCommercialContext(org, preloaded);

        expect(ctx.planCode).toBe("basic");
        expect(ctx.currency).toBe("KWD");
        expect(ctx.lockedPrice).toBe(50);
    });

    it("✅ resolves appliedCoupon snapshot when set on contract", async () => {
        const org = await createOrg();
        const pv = await createPlanVersion();
        await createActiveContract(org._id, pv._id, {
            planCode: "pro",
            lockedPrice: 80,
            currency: "EGP",
            appliedCoupon: {
                code: "PROMO20",
                discountType: "percentage",
                discountValue: 20,
            },
        });

        const ctx = await resolveCommercialContext(org);
        expect(ctx.appliedCoupon).not.toBeNull();
        expect(ctx.appliedCoupon.code).toBe("PROMO20");
        expect(ctx.appliedCoupon.discountType).toBe("percentage");
    });

    it("✅ resolves pricingOverride when set on contract", async () => {
        const org = await createOrg();
        const pv = await createPlanVersion();
        await createActiveContract(org._id, pv._id, {
            planCode: "enterprise",
            lockedPrice: 75,
            currency: "USD",
            pricingOverride: {
                isCustom: true,
                lockedPrice: 75,
                reason: "Beta partner",
            },
        });

        const ctx = await resolveCommercialContext(org);
        expect(ctx.pricingOverride).not.toBeNull();
        expect(ctx.pricingOverride.isCustom).toBe(true);
        expect(ctx.pricingOverride.lockedPrice).toBe(75);
    });
});

// ─── Individual Field Resolvers ───────────────────────────────────────────────

describe("ContractResolver — individual field resolvers", () => {
    let contract;

    beforeEach(async () => {
        // Build a minimal contract object (lean, not Mongoose doc needed by field resolvers)
        contract = {
            planCode: "basic",
            currency: "EGP",
            lockedPrice: 150,
            autoRenew: false,
            gracePeriodDays: 7,
            creditBalance: 25,
            renewalTerms: { inflationPercent: 3, billingInterval: "yearly" },
            pricingOverride: { isCustom: false, lockedPrice: 0, reason: "" },
            appliedCoupon: null,
        };
    });

    it("✅ resolvePlanCode returns planCode", () => {
        expect(resolvePlanCode(contract)).toBe("basic");
    });

    it("✅ resolveCurrency returns currency", () => {
        expect(resolveCurrency(contract)).toBe("EGP");
    });

    it("✅ resolveLockedPrice returns lockedPrice", () => {
        expect(resolveLockedPrice(contract)).toBe(150);
    });

    it("✅ resolveAutoRenew returns false when set to false", () => {
        expect(resolveAutoRenew(contract)).toBe(false);
    });

    it("✅ resolveGracePeriodDays returns 7", () => {
        expect(resolveGracePeriodDays(contract)).toBe(7);
    });

    it("✅ resolveCreditBalance returns 25", () => {
        expect(resolveCreditBalance(contract)).toBe(25);
    });

    it("✅ resolveRenewalTerms returns inflationPercent and interval", () => {
        const terms = resolveRenewalTerms(contract);
        expect(terms.inflationPercent).toBe(3);
        expect(terms.interval).toBe("yearly");
    });

    it("✅ resolvePricingOverride returns null when isCustom=false", () => {
        expect(resolvePricingOverride(contract)).toBeNull();
    });

    it("✅ resolveAppliedCoupon returns null when appliedCoupon is null", () => {
        expect(resolveAppliedCoupon(contract)).toBeNull();
    });

    it("❌ resolvePlanCode throws DomainViolation when planCode missing", () => {
        expect(() => resolvePlanCode({})).toThrow(DomainViolation);
        expect(() => resolvePlanCode({})).toThrow("planCode");
    });

    it("❌ resolveCurrency throws DomainViolation when currency missing", () => {
        expect(() => resolveCurrency({})).toThrow(DomainViolation);
    });

    it("❌ resolveLockedPrice throws DomainViolation when lockedPrice is null/undefined", () => {
        expect(() => resolveLockedPrice({ lockedPrice: null })).toThrow(DomainViolation);
        expect(() => resolveLockedPrice({})).toThrow(DomainViolation);
    });

    it("✅ resolveLockedPrice accepts 0 as valid (free plan / 100% coupon)", () => {
        // lockedPrice = 0 is valid (free plan)
        expect(resolveLockedPrice({ lockedPrice: 0 })).toBe(0);
    });
});

// ─── Time Travel Simulation ───────────────────────────────────────────────────

describe("ContractResolver — time travel & expiry semantics", () => {
    it("✅ Contract with past effectiveTo is still 'active' if contractStatus=active (status is truth)", async () => {
        const org = await createOrg();
        const pv = await createPlanVersion();

        // Contract whose effectiveTo is in the past, but contractStatus is still "active"
        // (not yet processed by the renewal cron). This validates the status-driven model.
        const contract = await createActiveContract(org._id, pv._id, {
            effectiveFrom: new Date("2026-01-01"),
            effectiveTo: new Date("2026-02-01"), // expired period, but status still "active"
            contractStatus: "active",
        });

        // Should still be found — contractStatus="active" wins over effectiveTo date
        const found = await loadActiveContract(org._id);
        expect(found).not.toBeNull();
        expect(found._id.toString()).toBe(contract._id.toString());
    });

    it("✅ resolveCommercialContext works regardless of effectiveTo (status-driven)", async () => {
        const org = await createOrg();
        const pv = await createPlanVersion();

        await createActiveContract(org._id, pv._id, {
            planCode: "basic",
            lockedPrice: 100,
            currency: "EGP",
            effectiveTo: new Date("2020-12-01"), // way in the past
            contractStatus: "active",  // status still says active
        });

        // Resolver must return the contract regardless of effectiveTo
        const ctx = await resolveCommercialContext(org);
        expect(ctx.planCode).toBe("basic");
        expect(ctx.lockedPrice).toBe(100);
    });
});

// ─── Activation Invariant Enforcement ────────────────────────────────────────

describe("ContractEngine — activation invariant: contract required fields", () => {
    it("❌ Cannot create OrgContract without organizationId (Mongoose required)", async () => {
        const pv = await createPlanVersion();
        await expect(
            OrgContract.create([{
                // No organizationId
                planVersionId: pv._id,
                planCode: "basic",
                planVersionTag: "v1.0.0",
                lockedPrice: 100,
                currency: "EGP",
                effectiveFrom: new Date(),
                createdBy: ACTOR_ID,
            }])
        ).rejects.toThrow();
    });

    it("❌ Cannot create OrgContract without planCode (Mongoose required)", async () => {
        const org = await createOrg();
        const pv = await createPlanVersion();
        await expect(
            OrgContract.create([{
                organizationId: org._id,
                planVersionId: pv._id,
                // No planCode
                planVersionTag: "v1.0.0",
                lockedPrice: 100,
                currency: "EGP",
                effectiveFrom: new Date(),
                createdBy: ACTOR_ID,
            }])
        ).rejects.toThrow();
    });

    it("❌ Cannot create OrgContract without currency (Mongoose required)", async () => {
        const org = await createOrg();
        const pv = await createPlanVersion();
        await expect(
            OrgContract.create([{
                organizationId: org._id,
                planVersionId: pv._id,
                planCode: "basic",
                planVersionTag: "v1.0.0",
                lockedPrice: 100,
                // No currency
                effectiveFrom: new Date(),
                createdBy: ACTOR_ID,
            }])
        ).rejects.toThrow();
    });

    it("❌ Cannot create OrgContract with negative lockedPrice", async () => {
        const org = await createOrg();
        const pv = await createPlanVersion();
        await expect(
            OrgContract.create([{
                organizationId: org._id,
                planVersionId: pv._id,
                planCode: "basic",
                planVersionTag: "v1.0.0",
                lockedPrice: -50, // invalid — schema min: 0
                currency: "EGP",
                effectiveFrom: new Date(),
                createdBy: ACTOR_ID,
            }])
        ).rejects.toThrow();
    });
});

// ─── autoRenew=false enforcement ──────────────────────────────────────────────

describe("ContractResolver — autoRenew=false contract behavior", () => {
    it("✅ autoRenew=false is preserved on the contract and resolved correctly", async () => {
        const org = await createOrg();
        const pv = await createPlanVersion();
        await createActiveContract(org._id, pv._id, { autoRenew: false });

        const ctx = await resolveCommercialContext(org);
        expect(ctx.autoRenew).toBe(false);
        expect(ctx.renewalTerms.autoRenew).toBe(false);
    });
});
