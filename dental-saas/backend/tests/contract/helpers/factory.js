/**
 * tests/contract/helpers/factory.js
 *
 * Test data factory for Contract Engine Simulation tests.
 * Creates minimal-valid documents directly in the in-memory DB.
 * Uses real Mongoose models — no mocks.
 *
 * Design decisions:
 *   - Keeps fixtures DRY across all three test suites
 *   - Resolves required nested fields (planVersionId, etc.) deterministically
 *   - All ObjectIds are fresh per call (no global state shared between tests)
 */

"use strict";

const mongoose = require("mongoose");
const Organization = require("../../../src/shared/models/Organization");
const OrgContract = require("../../../src/platform/billing/models/OrgContract.model");
const PlatformInvoice = require("../../../src/platform/billing/models/PlatformInvoice.model");
const PlanVersion = require("../../../src/platform/billing/models/PlanVersion.model");

// ─── Sentinel actor ID (fake PlatformUser ref) ────────────────────────────────
const ACTOR_ID = new mongoose.Types.ObjectId();

// ─── createOrg ────────────────────────────────────────────────────────────────
/**
 * Creates a minimal Organization document.
 * @param {object} [overrides]
 * @returns {Promise<Organization>}
 */
async function createOrg(overrides = {}) {
    const unique = Date.now() + Math.random().toString(36).slice(2, 7);
    const base = {
        name: `Test Clinic ${unique}`,
        slug: `test-clinic-${unique}`,
        ownerId: new mongoose.Types.ObjectId(), // fake ref — not enforced in tests
        country: "EG",
        regionCode: "MEA",
        billingCountry: "EG",
        billingCurrency: "EGP",
        subscription: {
            status: "trial",
            plan: "basic",
        },
    };
    const [org] = await Organization.create([{ ...base, ...overrides }]);
    return org;
}

// ─── createPlanVersion ────────────────────────────────────────────────────────
/**
 * Creates a minimal active PlanVersion.
 * activateContract requires planVersionId to exist.
 * @param {object} [overrides]
 * @returns {Promise<PlanVersion>}
 */
async function createPlanVersion(overrides = {}) {
    const templateId = new mongoose.Types.ObjectId();
    const base = {
        templateId,
        templateCode: "basic",
        versionTag: "v1.0.0",
        label: "Basic v1",
        status: "active",
        limits: { maxUsers: 5, maxBranches: 1 },
        modules: {
            patients: true,
            appointments: true,
            finance: true,
            inventory: false,
            lab: false,
            orthodonticsAdv: false,
            analytics: false,
            booking: false,
        },
        pricing: {
            baseCurrency: "USD",
            regions: [],
        },
        createdBy: ACTOR_ID,
    };
    const [pv] = await PlanVersion.create([{ ...base, ...overrides }]);
    return pv;
}

// ─── createDraftContract ──────────────────────────────────────────────────────
/**
 * Creates a draft OrgContract.
 * Does NOT call createContract() service (to keep it decoupled).
 * Directly inserts – tests service layer separately.
 *
 * @param {ObjectId} organizationId
 * @param {ObjectId} planVersionId
 * @param {object} [overrides]
 * @returns {Promise<OrgContract>}
 */
async function createDraftContract(organizationId, planVersionId, overrides = {}) {
    const base = {
        organizationId,
        planVersionId,
        planCode: "basic",
        planVersionTag: "v1.0.0",
        contractStatus: "draft",
        lockedPrice: 100,
        currency: "EGP",
        effectiveFrom: new Date(),
        autoRenew: true,
        gracePeriodDays: 7,
        renewalTerms: { inflationPercent: 0, billingInterval: "monthly" },
        createdBy: ACTOR_ID,
    };
    const [contract] = await OrgContract.create([{ ...base, ...overrides }]);
    return contract;
}

// ─── createActiveContract ─────────────────────────────────────────────────────
/**
 * Creates an OrgContract already in "active" status (bypasses service).
 * Used when testing scenarios that require a pre-existing active contract.
 *
 * @param {ObjectId} organizationId
 * @param {ObjectId} planVersionId
 * @param {object} [overrides]
 * @returns {Promise<OrgContract>}
 */
async function createActiveContract(organizationId, planVersionId, overrides = {}) {
    return createDraftContract(organizationId, planVersionId, {
        contractStatus: "active",
        ...overrides,
    });
}

// ─── createPaidInvoice ────────────────────────────────────────────────────────
/**
 * Creates a PlatformInvoice with status="paid" tied to the contract.
 * Required by activateContract() service.
 *
 * @param {ObjectId} organizationId
 * @param {ObjectId} contractId
 * @param {object} [overrides]
 * @returns {Promise<PlatformInvoice>}
 */
async function createPaidInvoice(organizationId, contractId, overrides = {}) {
    const now = new Date();
    const end = new Date(now);
    end.setMonth(end.getMonth() + 1);

    const base = {
        organizationId,
        contractId,
        invoiceType: "initial",
        billingCycleStart: now,
        billingCycleEnd: end,
        dueDate: end,
        currency: "EGP",
        subtotalAmount: 100,
        subtotalAmountMinor: 10000,
        totalAmount: 100,
        totalAmountMinor: 10000,
        status: "paid",
        paidAt: now,
    };
    const [invoice] = await PlatformInvoice.create([{ ...base, ...overrides }]);
    return invoice;
}

// ─── computeLockedPrice ───────────────────────────────────────────────────────
/**
 * Applies coupon / pricing override logic to a base price.
 * Mirrors the pricing rules defined in createContract().
 * Used in pricing tests to verify expected lockedPrice.
 *
 * Pricing order of precedence (highest wins):
 *   1. pricingOverride.isCustom  → overrides everything
 *   2. appliedCoupon percentage  → basePrice * (1 - pct/100)
 *   3. appliedCoupon fixed       → max(0, basePrice - fixedAmount)
 *   4. basePrice unchanged
 *
 * Note: The service currently stores lockedPrice AS PASSED — it does not
 * auto-compute from coupon. Tests verify the stored value matches what
 * the caller provided as lockedPrice (which is the authoritative source).
 *
 * @param {number} basePrice
 * @param {object|null} pricingOverride
 * @param {object|null} coupon  { discountType, discountValue }
 * @returns {number}
 */
function computeLockedPrice(basePrice, pricingOverride = null, coupon = null) {
    if (pricingOverride?.isCustom) {
        return pricingOverride.lockedPrice;
    }
    if (coupon) {
        if (coupon.discountType === "percentage") {
            return Math.max(0, basePrice * (1 - coupon.discountValue / 100));
        }
        if (coupon.discountType === "fixed") {
            return Math.max(0, basePrice - coupon.discountValue);
        }
    }
    return basePrice;
}

module.exports = {
    ACTOR_ID,
    createOrg,
    createPlanVersion,
    createDraftContract,
    createActiveContract,
    createPaidInvoice,
    computeLockedPrice,
};
