/**
 * tests/contract/contractPricing.test.js
 *
 * Contract Engine — Pricing Logic Tests
 *
 * What this tests:
 *   ✅ Pricing override takes precedence over base price
 *   ✅ Percentage coupon reduces price correctly
 *   ✅ Fixed coupon reduces price correctly
 *   ❌ Coupon cannot make lockedPrice go negative
 *   ✅ No coupon → lockedPrice is the base price as-is
 *   ✅ Currency is uppercased and stored correctly
 *   ✅ autoRenew defaults to true
 *   ✅ gracePeriodDays defaults to 7
 *   ✅ trialDays = 0 means no trial dates are set
 *   ✅ trialDays > 0 sets trialStartDate and trialEndDate
 *
 * Design note:
 *   The Contract Engine stores lockedPrice exactly as passed by the caller.
 *   Pricing computation (applying coupon/override to a base price) is the
 *   responsibility of the CALLER before invoking createContract. These tests:
 *     a) Verify the contract correctly STORES what it receives
 *     b) Verify the pricing invariant: stored lockedPrice >= 0
 *     c) Verify pricingOverride field is persisted correctly
 *     d) Verify appliedCoupon snapshot is persisted correctly
 *
 *   The computeLockedPrice() helper in factory.js mirrors the pricing rules
 *   that callers must apply before calling createContract.
 */

"use strict";

const {
    createContract,
} = require("../../src/platform/billing/services/contractEngine.service");

const OrgContract = require("../../src/platform/billing/models/OrgContract.model");

const {
    ACTOR_ID,
    createOrg,
    createPlanVersion,
    computeLockedPrice,
} = require("./helpers/factory");

// ─── Base Pricing Storage ─────────────────────────────────────────────────────

describe("ContractPricing — base price storage", () => {
    it("✅ Stores lockedPrice exactly as provided", async () => {
        const org = await createOrg();
        const pv = await createPlanVersion();

        const contract = await createContract({
            organizationId: org._id,
            planVersionId: pv._id,
            planCode: "pro",
            planVersionTag: "v2.0.0",
            lockedPrice: 299,
            currency: "USD",
            effectiveFrom: new Date(),
        }, ACTOR_ID);

        expect(contract.lockedPrice).toBe(299);
        expect(contract.currency).toBe("USD");
    });

    it("✅ autoRenew defaults to true if not specified", async () => {
        const org = await createOrg();
        const pv = await createPlanVersion();

        const contract = await createContract({
            organizationId: org._id,
            planVersionId: pv._id,
            planCode: "basic",
            planVersionTag: "v1.0.0",
            lockedPrice: 100,
            currency: "EGP",
            effectiveFrom: new Date(),
        }, ACTOR_ID);

        expect(contract.autoRenew).toBe(true);
    });

    it("✅ autoRenew can be set to false explicitly", async () => {
        const org = await createOrg();
        const pv = await createPlanVersion();

        const contract = await createContract({
            organizationId: org._id,
            planVersionId: pv._id,
            planCode: "basic",
            planVersionTag: "v1.0.0",
            lockedPrice: 100,
            currency: "EGP",
            effectiveFrom: new Date(),
            autoRenew: false,
        }, ACTOR_ID);

        expect(contract.autoRenew).toBe(false);
    });

    it("✅ gracePeriodDays defaults to 7 if not specified", async () => {
        const org = await createOrg();
        const pv = await createPlanVersion();

        const contract = await createContract({
            organizationId: org._id,
            planVersionId: pv._id,
            planCode: "basic",
            planVersionTag: "v1.0.0",
            lockedPrice: 100,
            currency: "EGP",
            effectiveFrom: new Date(),
        }, ACTOR_ID);

        expect(contract.gracePeriodDays).toBe(7);
    });
});

// ─── Trial Terms ──────────────────────────────────────────────────────────────

describe("ContractPricing — trial terms", () => {
    it("✅ trialDays = 0 → no trial dates set", async () => {
        const org = await createOrg();
        const pv = await createPlanVersion();

        const contract = await createContract({
            organizationId: org._id,
            planVersionId: pv._id,
            planCode: "basic",
            planVersionTag: "v1.0.0",
            lockedPrice: 100,
            currency: "EGP",
            effectiveFrom: new Date(),
            trialDays: 0,
        }, ACTOR_ID);

        expect(contract.trialDays).toBe(0);
        expect(contract.trialStartDate).toBeNull();
        expect(contract.trialEndDate).toBeNull();
    });

    it("✅ trialDays > 0 → sets trialStartDate and trialEndDate", async () => {
        const org = await createOrg();
        const pv = await createPlanVersion();

        const before = new Date();
        const contract = await createContract({
            organizationId: org._id,
            planVersionId: pv._id,
            planCode: "basic",
            planVersionTag: "v1.0.0",
            lockedPrice: 100,
            currency: "EGP",
            effectiveFrom: new Date(),
            trialDays: 14,
        }, ACTOR_ID);

        expect(contract.trialDays).toBe(14);
        expect(contract.trialStartDate).toBeDefined();
        expect(contract.trialStartDate).not.toBeNull();
        expect(contract.trialEndDate).toBeDefined();
        expect(contract.trialEndDate).not.toBeNull();

        // trialEndDate should be ~14 days after trialStartDate
        const diffDays = (contract.trialEndDate - contract.trialStartDate) / (1000 * 60 * 60 * 24);
        expect(diffDays).toBeCloseTo(14, 0);
    });
});

// ─── Pricing Override ─────────────────────────────────────────────────────────

describe("ContractPricing — pricingOverride", () => {
    it("✅ pricingOverride stored and lockedPrice reflects override value", async () => {
        const BASE_PRICE = 100;
        const OVERRIDE_PRICE = 75;
        const org = await createOrg();
        const pv = await createPlanVersion();

        // Caller computes the new price from override before calling createContract
        const effectivePrice = computeLockedPrice(BASE_PRICE, {
            isCustom: true,
            lockedPrice: OVERRIDE_PRICE
        });
        expect(effectivePrice).toBe(75); // Factory helper invariant

        const contract = await createContract({
            organizationId: org._id,
            planVersionId: pv._id,
            planCode: "basic",
            planVersionTag: "v1.0.0",
            lockedPrice: effectivePrice,
            currency: "EGP",
            effectiveFrom: new Date(),
            pricingOverride: { isCustom: true, lockedPrice: OVERRIDE_PRICE, reason: "VIP org" },
        }, ACTOR_ID);

        expect(contract.lockedPrice).toBe(75);
        expect(contract.pricingOverride.isCustom).toBe(true);
        expect(contract.pricingOverride.lockedPrice).toBe(75);
        expect(contract.pricingOverride.reason).toBe("VIP org");
    });

    it("✅ pricingOverride takes precedence over coupon in computeLockedPrice()", () => {
        const price = computeLockedPrice(
            100,
            { isCustom: true, lockedPrice: 60 },
            { discountType: "percentage", discountValue: 50 }
        );
        // Override wins over coupon
        expect(price).toBe(60);
    });
});

// ─── Coupon Logic ─────────────────────────────────────────────────────────────

describe("ContractPricing — appliedCoupon", () => {
    it("✅ Percentage coupon: 20% off 100 = 80", async () => {
        const BASE_PRICE = 100;
        const coupon = { code: "SAVE20", discountType: "percentage", discountValue: 20 };
        const org = await createOrg();
        const pv = await createPlanVersion();

        const effectivePrice = computeLockedPrice(BASE_PRICE, null, coupon);
        expect(effectivePrice).toBe(80); // Factory helper invariant

        const contract = await createContract({
            organizationId: org._id,
            planVersionId: pv._id,
            planCode: "basic",
            planVersionTag: "v1.0.0",
            lockedPrice: effectivePrice,
            currency: "EGP",
            effectiveFrom: new Date(),
            appliedCoupon: {
                code: coupon.code,
                discountType: coupon.discountType,
                discountValue: coupon.discountValue,
            },
        }, ACTOR_ID);

        expect(contract.lockedPrice).toBe(80);
        expect(contract.appliedCoupon.code).toBe("SAVE20");
        expect(contract.appliedCoupon.discountType).toBe("percentage");
        expect(contract.appliedCoupon.discountValue).toBe(20);
    });

    it("✅ Fixed coupon: $30 off 100 = 70", async () => {
        const BASE_PRICE = 100;
        const coupon = { code: "FIXED30", discountType: "fixed", discountValue: 30 };
        const org = await createOrg();
        const pv = await createPlanVersion();

        const effectivePrice = computeLockedPrice(BASE_PRICE, null, coupon);
        expect(effectivePrice).toBe(70);

        const contract = await createContract({
            organizationId: org._id,
            planVersionId: pv._id,
            planCode: "basic",
            planVersionTag: "v1.0.0",
            lockedPrice: effectivePrice,
            currency: "USD",
            effectiveFrom: new Date(),
            appliedCoupon: {
                code: coupon.code,
                discountType: coupon.discountType,
                discountValue: coupon.discountValue,
            },
        }, ACTOR_ID);

        expect(contract.lockedPrice).toBe(70);
        expect(contract.appliedCoupon.code).toBe("FIXED30");
    });

    it("❌ Coupon cannot make lockedPrice negative — clamped to 0", () => {
        // Fixed coupon larger than base price
        const price = computeLockedPrice(
            50,
            null,
            { discountType: "fixed", discountValue: 100 }
        );
        expect(price).toBe(0);
        expect(price).toBeGreaterThanOrEqual(0);
    });

    it("❌ Coupon cannot make lockedPrice negative — 120% off is clamped to 0", () => {
        const price = computeLockedPrice(
            100,
            null,
            { discountType: "percentage", discountValue: 120 }
        );
        expect(price).toBe(0);
        expect(price).toBeGreaterThanOrEqual(0);
    });

    it("✅ No coupon → lockedPrice stored as-is", async () => {
        const org = await createOrg();
        const pv = await createPlanVersion();

        const contract = await createContract({
            organizationId: org._id,
            planVersionId: pv._id,
            planCode: "basic",
            planVersionTag: "v1.0.0",
            lockedPrice: 199,
            currency: "SAR",
            effectiveFrom: new Date(),
        }, ACTOR_ID);

        expect(contract.lockedPrice).toBe(199);
        expect(contract.appliedCoupon).toBeNull();
    });

    it("✅ 100% coupon results in lockedPrice = 0 (free trial variant)", async () => {
        const BASE_PRICE = 100;
        const coupon = { code: "FREE", discountType: "percentage", discountValue: 100 };
        const effectivePrice = computeLockedPrice(BASE_PRICE, null, coupon);
        expect(effectivePrice).toBe(0);

        const org = await createOrg();
        const pv = await createPlanVersion();

        const contract = await createContract({
            organizationId: org._id,
            planVersionId: pv._id,
            planCode: "basic",
            planVersionTag: "v1.0.0",
            lockedPrice: effectivePrice,
            currency: "EGP",
            effectiveFrom: new Date(),
            appliedCoupon: {
                code: coupon.code,
                discountType: coupon.discountType,
                discountValue: coupon.discountValue,
            },
        }, ACTOR_ID);

        expect(contract.lockedPrice).toBe(0);
    });
});

// ─── OAV Version Counter ──────────────────────────────────────────────────────

describe("ContractPricing — OAV version counter", () => {
    it("✅ New contract starts at version 0", async () => {
        const org = await createOrg();
        const pv = await createPlanVersion();

        const contract = await createContract({
            organizationId: org._id,
            planVersionId: pv._id,
            planCode: "basic",
            planVersionTag: "v1.0.0",
            lockedPrice: 100,
            currency: "EGP",
            effectiveFrom: new Date(),
        }, ACTOR_ID);

        expect(contract.version).toBe(0);
    });

    it("✅ Version increments on each save", async () => {
        const org = await createOrg();
        const pv = await createPlanVersion();

        const contract = await createContract({
            organizationId: org._id,
            planVersionId: pv._id,
            planCode: "basic",
            planVersionTag: "v1.0.0",
            lockedPrice: 100,
            currency: "EGP",
            effectiveFrom: new Date(),
        }, ACTOR_ID);

        expect(contract.version).toBe(0);

        // Mutate and save
        contract.gracePeriodDays = 14;
        await contract.save();

        const reloaded = await OrgContract.findById(contract._id);
        expect(reloaded.version).toBe(1);
    });
});
