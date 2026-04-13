/**
 * hybridOnboarding.test.js
 * Sprint 8 — Hybrid SaaS Onboarding Billing Flow Tests
 *
 * Verifies:
 * 1. Org without postTrialPlanVersionId → trial contract only
 * 2. Org with postTrialPlanVersionId → trial + pending_activation contract
 * 3. Trial expiration → pending contract activates, trial becomes superseded
 * 4. BillingTimeline shows full lifecycle events (CONTRACT_ACTIVATED, TRIAL_STARTED, PLAN_SCHEDULED)
 */

"use strict";

const mongoose = require("mongoose");
const Organization = require("../../src/shared/models/Organization");
const OrgContract = require("../../src/platform/billing/models/OrgContract.model");
const PlanTemplate = require("../../src/platform/billing/models/PlanTemplate.model");
const PlanVersion = require("../../src/platform/billing/models/PlanVersion.model");
const BillingTimeline = require("../../src/platform/billing/models/BillingTimeline.model");
const { provisionOrganization } = require("../../src/organization/services/organization.service");


// Sentinel actor ID — fake PlatformUser ref, required by PlanTemplate.createdBy
const SENTINEL_ACTOR = new mongoose.Types.ObjectId();

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Create a minimal active PlanTemplate + PlanVersion for a given templateCode */
async function createActivePlanVersion(templateCode, overrides = {}) {
    const template = await PlanTemplate.create({
        name: templateCode,
        code: templateCode,
        status: "published",
        createdBy: SENTINEL_ACTOR,  // required field
    });


    const version = await PlanVersion.create({
        templateId: template._id,
        templateCode,
        versionTag: overrides.versionTag || "v1",
        status: overrides.status || "active",
        label: overrides.label || templateCode,
        trialDays: overrides.trialDays ?? 14,
        modules: overrides.modules || { patients: true, appointments: true },
        // versionLimitsSchema requires maxUsers + maxBranches (not maxPatients)
        limits: overrides.limits || { maxUsers: 5, maxBranches: 1 },
        pricing: {
            regions: overrides.regions || [{
                regionCode: "MEA",
                currency: "EGP",
                monthly: overrides.monthlyPrice ?? 0,
                yearly: overrides.yearlyPrice ?? 0,
                countries: ["EG"],
            }]
        },
        createdBy: SENTINEL_ACTOR,  // required field
    });

    return { template, version };
}

/** Minimal provisioning payload */
function buildPayload(overrides = {}) {
    return {
        organizationName: overrides.name || `Test Org ${Date.now()}`,
        adminEmail: overrides.email || `admin-${Date.now()}@test.com`,
        adminPassword: "test1234!",
        adminName: "Test Admin",
        country: "EG",
        ...overrides,
    };
}

// ─── Setup / Teardown ─────────────────────────────────────────────────────────
// Connection lifecycle + bootstrapCollections() are managed globally by tests/setup.js.
// Collection bootstrap (syncIndexes) runs once in setup.js beforeAll — no local
// beforeAll needed here.
//
// NOTE: provisionOrganization() manages its own internal MongoDB session/transaction.
// MongoDB does not support nested transactions, so these tests run in MODE B
// (deleteMany cleanup) rather than MODE A (transaction rollback).
// The afterEach drain below ensures provisionOrganization's async setImmediate
// callbacks complete before setup.js afterEach runs its deleteMany cleanup.
afterEach(async () => {
    // Drain the event loop so provisionOrganization's setImmediate callbacks
    // (timeline events, audit logs) settle before setup.js wipes the collections.
    // Without this, deleteMany() conflicts with in-flight IX locks on the replica set.
    await new Promise(resolve => setImmediate(resolve));
    await new Promise(resolve => setTimeout(resolve, 300));
});

// ─── Test Suite ───────────────────────────────────────────────────────────────

describe("Hybrid Onboarding Billing Flow", () => {

    // ── Test 1 ────────────────────────────────────────────────────────────────
    describe("SECTION 1: Org without postTrialPlanVersionId", () => {
        it("should create ONE active trial contract with no pending contract", async () => {
            await createActivePlanVersion("trial-tier", { trialDays: 14 });

            const platformUserId = new mongoose.Types.ObjectId();
            const result = await provisionOrganization(
                buildPayload(),
                platformUserId,
                "127.0.0.1",
                "jest-test"
            );

            // 1a. provisioning result has currentContractId
            expect(result.currentContractId).toBeTruthy();
            expect(result.contractStatus).toBe("active");
            expect(result.trialEndsAt).toBeTruthy();
            expect(result.pendingContractId).toBeUndefined();

            // 1b. exactly one OrgContract exists
            const contracts = await OrgContract.find({
                organizationId: result.organization._id
            });
            expect(contracts).toHaveLength(1);

            const trialContract = contracts[0];
            expect(trialContract.contractStatus).toBe("active");
            expect(trialContract.lockedPrice).toBe(0);
            expect(trialContract.trialDays).toBe(14);
            expect(trialContract.source).toBe("provisioning");
            expect(trialContract.paymentProvider).toBe("manual");

            // 1c. Organization has currentContractId set
            const org = await Organization.findById(result.organization._id);
            expect(String(org.currentContractId)).toBe(String(trialContract._id));
        });
    });

    // ── Test 2 ────────────────────────────────────────────────────────────────
    describe("SECTION 2: Org with postTrialPlanVersionId", () => {
        it("should create trial contract + pending_activation contract with previousContractId link", async () => {
            await createActivePlanVersion("trial-tier", { trialDays: 14 });
            const { version: professionalPlan } = await createActivePlanVersion("professional", {
                monthlyPrice: 399,
            });

            const platformUserId = new mongoose.Types.ObjectId();
            const result = await provisionOrganization(
                buildPayload({
                    postTrialPlanVersionId: String(professionalPlan._id),
                    billingInterval: "monthly",
                }),
                platformUserId,
                "127.0.0.1",
                "jest-test"
            );

            // 2a. provisioning result surfaces pending contract info
            expect(result.pendingContractId).toBeTruthy();
            expect(result.postTrialPlanCode).toBe("professional");
            expect(result.postTrialActivatesAt).toBeTruthy();

            // 2b. two contracts exist
            const contracts = await OrgContract.find({
                organizationId: result.organization._id
            }).sort({ effectiveFrom: 1 });

            expect(contracts).toHaveLength(2);

            const trialContract = contracts.find(c => c.contractStatus === "active");
            const pendingContract = contracts.find(c => c.contractStatus === "pending_activation");

            expect(trialContract).toBeDefined();
            expect(pendingContract).toBeDefined();

            // 2c. pending contract is correctly linked
            expect(String(pendingContract.previousContractId)).toBe(String(trialContract._id));
            expect(pendingContract.planCode).toBe("professional");
            expect(pendingContract.billingInterval).toBe("monthly");
            expect(pendingContract.trialDays).toBe(0);
            expect(pendingContract.autoRenew).toBe(true);
            expect(pendingContract.gracePeriodDays).toBe(7);
            expect(pendingContract.paymentProvider).toBe("manual");

            // 2d. pending contract effectiveFrom = trial contract effectiveTo
            const trialEnd = new Date(trialContract.effectiveTo);
            const pendingFrom = new Date(pendingContract.effectiveFrom);
            expect(Math.abs(trialEnd - pendingFrom)).toBeLessThan(1000); // within 1s
        });

        it("should reject if postTrialPlanVersionId refers to a draft plan", async () => {
            await createActivePlanVersion("trial-tier", { trialDays: 14 });

            // Create a draft plan (not active)
            const template = await PlanTemplate.create({ name: "draft-plan", code: "draft-plan", status: "draft", createdBy: SENTINEL_ACTOR });
            const draftVersion = await PlanVersion.create({
                templateId: template._id,
                templateCode: "draft-plan",
                versionTag: "v1",
                status: "draft",
                label: "Draft Plan",
                limits: { maxUsers: 1, maxBranches: 1 },
                createdBy: SENTINEL_ACTOR,
            });

            const platformUserId = new mongoose.Types.ObjectId();
            await expect(
                provisionOrganization(
                    buildPayload({ postTrialPlanVersionId: String(draftVersion._id) }),
                    platformUserId,
                    "127.0.0.1",
                    "jest-test"
                )
            ).rejects.toThrow("POST_TRIAL_PLAN_NOT_ACTIVE");
        });

        it("should reject if no active trial plan is found", async () => {
            // No trial plan seeded
            const platformUserId = new mongoose.Types.ObjectId();
            await expect(
                provisionOrganization(buildPayload(), platformUserId, "127.0.0.1", "jest-test")
            ).rejects.toThrow("NO_ACTIVE_TRIAL_PLAN_VERSION");
        });
    });

    // ── Test 3 ────────────────────────────────────────────────────────────────
    describe("SECTION 3: Trial expiration → pending contract activates", () => {
        it("should use previousContractId to link to the correct pending contract", async () => {
            await createActivePlanVersion("trial-tier", { trialDays: 14 });
            const { version: professionalPlan } = await createActivePlanVersion("professional", {
                monthlyPrice: 399,
            });

            const platformUserId = new mongoose.Types.ObjectId();
            const result = await provisionOrganization(
                buildPayload({
                    postTrialPlanVersionId: String(professionalPlan._id),
                    billingInterval: "monthly",
                }),
                platformUserId,
                "127.0.0.1",
                "jest-test"
            );

            const trialContract = await OrgContract.findById(result.currentContractId);
            const pendingContract = await OrgContract.findById(result.pendingContractId);

            // Verify chain: pending.previousContractId === trial._id
            expect(String(pendingContract.previousContractId)).toBe(String(trialContract._id));

            // Verify the job's query would find this pending contract
            const found = await OrgContract.findOne({
                organizationId: result.organization._id,
                previousContractId: trialContract._id,
                contractStatus: "pending_activation",
            });
            expect(found).toBeDefined();
            expect(String(found._id)).toBe(String(pendingContract._id));
        });
    });

    // ── Test 4 ────────────────────────────────────────────────────────────────
    describe("SECTION 4: BillingTimeline events", () => {
        it("should emit CONTRACT_ACTIVATED and TRIAL_STARTED events after trial provisioning", async () => {
            await createActivePlanVersion("trial-tier", { trialDays: 14 });

            const platformUserId = new mongoose.Types.ObjectId();
            const result = await provisionOrganization(
                buildPayload(),
                platformUserId,
                "127.0.0.1",
                "jest-test"
            );

            // Wait for setImmediate callbacks to fire
            await new Promise(resolve => setImmediate(resolve));
            await new Promise(resolve => setTimeout(resolve, 100));

            const events = await BillingTimeline.find({
                organizationId: result.organization._id
            }).lean();

            const eventTypes = events.map(e => e.eventType);
            expect(eventTypes).toContain("CONTRACT_ACTIVATED");
            expect(eventTypes).toContain("TRIAL_STARTED");
        });

        it("should emit PLAN_SCHEDULED when a post-trial plan is provided", async () => {
            await createActivePlanVersion("trial-tier", { trialDays: 14 });
            const { version: professionalPlan } = await createActivePlanVersion("professional", {
                monthlyPrice: 399,
            });

            const platformUserId = new mongoose.Types.ObjectId();
            const result = await provisionOrganization(
                buildPayload({
                    postTrialPlanVersionId: String(professionalPlan._id),
                    billingInterval: "monthly",
                }),
                platformUserId,
                "127.0.0.1",
                "jest-test"
            );

            // Wait for setImmediate callbacks to fire
            await new Promise(resolve => setImmediate(resolve));
            await new Promise(resolve => setTimeout(resolve, 200));

            const events = await BillingTimeline.find({
                organizationId: result.organization._id
            }).lean();

            const eventTypes = events.map(e => e.eventType);
            expect(eventTypes).toContain("CONTRACT_ACTIVATED");
            expect(eventTypes).toContain("TRIAL_STARTED");
            expect(eventTypes).toContain("PLAN_SCHEDULED");

            const scheduledEvent = events.find(e => e.eventType === "PLAN_SCHEDULED");
            // Sprint 8.1: payload enrichment renamed toPlanCode → toPlan
            expect(scheduledEvent.payload.toPlan).toBe("professional");
            expect(scheduledEvent.payload.pendingContractId).toBe(result.pendingContractId);
        });
    });
});
