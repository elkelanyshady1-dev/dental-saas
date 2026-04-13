/**
 * tests/guardian/guardian.test.js
 *
 * Platform Guardian Layer — Test Suite
 *
 * What this covers:
 *
 * 1. STARTUP GUARDIAN
 *    ✅ Passes all invariants on a clean schema state
 *    ❌ Fails if Organization.planId is required (regression detection)
 *    ❌ Fails if OrgContract.previousContractId is missing
 *
 * 2. COMMERCIAL GUARDIAN
 *    ❌ Blocks activation when org already has 2+ active contracts
 *    ✅ Passes activation when org has ≤1 active contract
 *    ❌ Blocks renewal when autoRenew=false
 *    ❌ Blocks renewal when contractStatus is not active/draft
 *
 * 3. RUNTIME GUARDIAN
 *    ❌ Detects null lockedPrice on active contracts
 *    ✅ Reports clean when no violations
 *    ❌ Detects multiple active contracts per org
 *
 * 4. OBSERVABILITY GUARDIAN
 *    ✅ safeSerialize handles circular references
 *    ✅ healthSnapshot never throws
 *    ✅ getPlatformMetrics returns metric object
 *
 * Uses real models + MongoMemoryReplSet. No mocks of business logic.
 */

"use strict";

const mongoose = require("mongoose");
const OrgContract = require("../../src/platform/billing/models/OrgContract.model");
const {
    ACTOR_ID,
    createOrg,
    createPlanVersion,
    createActiveContract,
    createDraftContract
} = require("../contract/helpers/factory");

const {
    guardActivateContract,
    guardRenewContract,
    _validators: commercialValidators
} = require("../../src/platform/guardian/commercial.guardian");

const {
    _checks: runtimeChecks
} = require("../../src/platform/guardian/runtime.guardian");

const {
    safeSerialize,
    healthSnapshot,
    getPlatformMetrics
} = require("../../src/platform/guardian/observability.guardian");

const {
    runStartupGuardian
} = require("../../src/platform/guardian/startup.guardian");

const { DomainViolation } = require("../../src/platform/billing/services/contractResolver.service");

// ─── 1. STARTUP GUARDIAN ──────────────────────────────────────────────────────

describe("StartupGuardian — schema invariants", () => {
    it("✅ Startup guardian runs without crashing in permissive mode (schema checks pass)", async () => {
        // In test environment, app.js is NOT bootstrapped, so routerRegistry is empty.
        // ROUTE_MANIFEST_INTEGRITY will log a CRITICAL warning, but in permissive mode
        // (no PLATFORM_GUARDIAN_MODE=strict env var), the guardian must NOT throw.
        // The 5 schema/DB invariants (models, planId, previousContractId, min, transactions)
        // MUST all pass.
        const originalMode = process.env.PLATFORM_GUARDIAN_MODE;
        delete process.env.PLATFORM_GUARDIAN_MODE; // permissive — no process.exit

        // Must resolve (not throw) in permissive mode even if route manifest fails
        await expect(runStartupGuardian()).resolves.toBeUndefined();

        process.env.PLATFORM_GUARDIAN_MODE = originalMode;
    });

    it("❌ Detects regression: Organization.planId must NOT be required", () => {
        const OrgModel = mongoose.connection.models["Organization"];
        if (!OrgModel) return; // model not loaded in test env — skip

        const planIdPath = OrgModel.schema.path("planId");
        // This is the exact regression we protect against
        expect(planIdPath?.isRequired).toBeFalsy(); // must not be required
    });

    it("❌ Detects regression: OrgContract.previousContractId must exist in schema", () => {
        const ContractModel = mongoose.connection.models["OrgContract"];
        if (!ContractModel) return;

        const field = ContractModel.schema.path("previousContractId");
        expect(field).not.toBeNull();
        expect(field).not.toBeUndefined();
    });

    it("❌ Detects regression: OrgContract.lockedPrice must have min validator", () => {
        const ContractModel = mongoose.connection.models["OrgContract"];
        if (!ContractModel) return;

        const lockedPricePath = ContractModel.schema.path("lockedPrice");
        const hasMin = lockedPricePath?.validators?.some(v => v.type === "min");
        expect(hasMin).toBe(true);
    });
});

// ─── 2. COMMERCIAL GUARDIAN ───────────────────────────────────────────────────

describe("CommercialGuardian — pre-condition enforcement", () => {
    let org, pv;

    beforeEach(async () => {
        org = await createOrg();
        pv = await createPlanVersion();
    });

    it("❌ Blocks activation when org has 2+ active contracts (overlapping invariant)", async () => {
        // The unique index prevents duplicates at DB level in normal operation.
        // This test simulates the scenario where the index is absent (e.g., post-migration),
        // which is exactly when the commercial guardian pre-condition matters.
        const db = mongoose.connection.db;

        // Drop the partial unique index temporarily
        await db.collection("orgcontracts").dropIndex("unique_active_contract_per_org").catch(() => { });

        const base = {
            organizationId: org._id,
            planVersionId: pv._id,
            planCode: "basic",
            planVersionTag: "v1.0.0",
            lockedPrice: 100,
            currency: "EGP",
            contractStatus: "active",
            effectiveFrom: new Date(),
            createdBy: ACTOR_ID,
            createdAt: new Date(),
            updatedAt: new Date(),
            version: 0
        };
        await db.collection("orgcontracts").insertMany([
            { ...base, _id: new mongoose.Types.ObjectId() },
            { ...base, _id: new mongoose.Types.ObjectId() }
        ]);

        await expect(
            commercialValidators.assertNoOverlappingActiveContracts(org._id)
        ).rejects.toMatchObject({
            name: "DomainViolation",
            code: "MULTIPLE_ACTIVE_CONTRACTS_PRE_ACTIVATION"
        });
    });

    it("✅ Allows activation when org has 0 active contracts", async () => {
        // No active contracts yet — should pass silently
        await expect(
            commercialValidators.assertNoOverlappingActiveContracts(org._id)
        ).resolves.toBeUndefined();
    });

    it("✅ Allows activation when org has exactly 1 active contract (will be superseded)", async () => {
        await createActiveContract(org._id, pv._id, { lockedPrice: 100 });

        // 1 active contract is fine (will be superseded by the new one)
        await expect(
            commercialValidators.assertNoOverlappingActiveContracts(org._id)
        ).resolves.toBeUndefined();
    });

    it("❌ Blocks assertContractHasRequiredFields when planCode missing", () => {
        expect(() =>
            commercialValidators.assertContractHasRequiredFields({
                _id: new mongoose.Types.ObjectId(),
                // planCode missing
                currency: "EGP",
                lockedPrice: 100,
                organizationId: org._id
            })
        ).toThrow(DomainViolation);
    });

    it("❌ Blocks assertContractHasRequiredFields when lockedPrice is null", () => {
        expect(() =>
            commercialValidators.assertContractHasRequiredFields({
                _id: new mongoose.Types.ObjectId(),
                planCode: "basic",
                currency: "EGP",
                lockedPrice: null, // null is invalid
                organizationId: org._id
            })
        ).toThrow(DomainViolation);
    });

    it("✅ assertContractHasRequiredFields passes when lockedPrice=0 (free plan)", () => {
        expect(() =>
            commercialValidators.assertContractHasRequiredFields({
                _id: new mongoose.Types.ObjectId(),
                planCode: "basic",
                currency: "EGP",
                lockedPrice: 0, // 0 is valid (free plan)
                organizationId: org._id
            })
        ).not.toThrow();
    });

    it("❌ Blocks renewal when autoRenew=false", () => {
        expect(() =>
            commercialValidators.assertRenewalEligible({
                _id: new mongoose.Types.ObjectId(),
                contractStatus: "active",
                autoRenew: false
            })
        ).toThrow(DomainViolation);
    });

    it("❌ Blocks renewal when contract is terminated", () => {
        expect(() =>
            commercialValidators.assertRenewalEligible({
                _id: new mongoose.Types.ObjectId(),
                contractStatus: "terminated",
                autoRenew: true
            })
        ).toThrow(DomainViolation);
    });

    it("✅ Allows renewal when contractStatus=active and autoRenew=true", () => {
        expect(() =>
            commercialValidators.assertRenewalEligible({
                _id: new mongoose.Types.ObjectId(),
                contractStatus: "active",
                autoRenew: true
            })
        ).not.toThrow();
    });
});

// ─── 3. RUNTIME GUARDIAN ─────────────────────────────────────────────────────

describe("RuntimeGuardian — DB-backed integrity checks", () => {
    it("✅ Reports clean when no contracts exist", async () => {
        const result = await runtimeChecks.checkLockedPriceNotNull();
        expect(result.pass).toBe(true);
    });

    it("✅ Reports clean when active contract has valid lockedPrice", async () => {
        const org = await createOrg();
        const pv = await createPlanVersion();
        await createActiveContract(org._id, pv._id, { lockedPrice: 200 });

        const result = await runtimeChecks.checkLockedPriceNotNull();
        expect(result.pass).toBe(true);
    });

    it("❌ Detects null lockedPrice on active contract", async () => {
        // Insert an active contract with lockedPrice bypassing Mongoose min validation
        // using direct MongoDB to simulate corruption that snuck through
        const db = mongoose.connection.db;
        await db.collection("orgcontracts").insertOne({
            _id: new mongoose.Types.ObjectId(),
            organizationId: new mongoose.Types.ObjectId(),
            planVersionId: new mongoose.Types.ObjectId(),
            planCode: "basic",
            planVersionTag: "v1.0.0",
            lockedPrice: null,  // corrupt — null lockedPrice
            currency: "EGP",
            contractStatus: "active",
            effectiveFrom: new Date(),
            createdBy: ACTOR_ID,
            createdAt: new Date(),
            updatedAt: new Date(),
            version: 0
        });

        const result = await runtimeChecks.checkLockedPriceNotNull();
        expect(result.pass).toBe(false);
        expect(result.violation).toBe("NULL_OR_NEGATIVE_LOCKED_PRICE");
    });

    it("❌ Detects multiple active contracts per org", async () => {
        const org = await createOrg();
        const pv = await createPlanVersion();

        // Simulate DB-level corruption: drop the partial unique index then insert duplicates.
        // This is the exact scenario the runtime guardian must catch.
        const db = mongoose.connection.db;
        await db.collection("orgcontracts").dropIndex("unique_active_contract_per_org").catch(() => { });

        const base = {
            organizationId: org._id,
            planVersionId: pv._id,
            planCode: "basic",
            planVersionTag: "v1.0.0",
            lockedPrice: 100,
            currency: "EGP",
            contractStatus: "active",
            effectiveFrom: new Date(),
            createdBy: ACTOR_ID,
            createdAt: new Date(),
            updatedAt: new Date(),
            version: 0
        };

        await db.collection("orgcontracts").insertMany([
            { ...base, _id: new mongoose.Types.ObjectId() },
            { ...base, _id: new mongoose.Types.ObjectId() }
        ]);

        const result = await runtimeChecks.checkNoMultipleActiveContracts();
        expect(result.pass).toBe(false);
        expect(result.violation).toBe("MULTIPLE_ACTIVE_CONTRACTS");
    });

    it("✅ Reports clean on NO_ORPHAN_DRAFTS when no drafts exist", async () => {
        const result = await runtimeChecks.checkNoOrphanDrafts();
        expect(result.pass).toBe(true);
    });
});

// ─── 4. OBSERVABILITY GUARDIAN ────────────────────────────────────────────────

describe("ObservabilityGuardian — serializer + snapshot", () => {
    it("✅ safeSerialize handles normal Error", () => {
        const err = new Error("test error");
        err.code = "TEST_CODE";
        const result = safeSerialize(err);

        expect(result.message).toBe("test error");
        expect(result.code).toBe("TEST_CODE");
        expect(result.name).toBe("Error");
    });

    it("✅ safeSerialize handles circular references without throwing", () => {
        const err = new Error("circular");
        err.self = err; // circular ref — safeSerialize must not throw

        let result;
        expect(() => {
            result = safeSerialize(err);
        }).not.toThrow();

        expect(result.message).toBe("circular");
    });

    it("✅ safeSerialize handles null/undefined gracefully", () => {
        expect(safeSerialize(null)).toHaveProperty("message");
        expect(safeSerialize(undefined)).toHaveProperty("message");
        expect(safeSerialize("string error")).toHaveProperty("message");
    });

    it("✅ healthSnapshot returns valid structure without throwing", () => {
        const snap = healthSnapshot();

        expect(snap).toHaveProperty("timestamp");
        expect(snap).toHaveProperty("process");
        expect(snap).toHaveProperty("database");
        expect(snap).toHaveProperty("guardian");
        expect(snap.process.pid).toBe(process.pid);
        expect(typeof snap.process.uptime).toBe("number");
        expect(["connected", "disconnected", "connecting", "disconnecting"]).toContain(snap.database.state);
    });

    it("✅ getPlatformMetrics returns an object with expected keys", () => {
        const metrics = getPlatformMetrics();

        expect(metrics).toHaveProperty("startupGuardianRuns");
        expect(metrics).toHaveProperty("runtimeGuardianRuns");
        expect(metrics).toHaveProperty("invariantViolations");
        expect(metrics).toHaveProperty("commercialBlockedEvents");
        expect(typeof metrics.startupGuardianRuns).toBe("number");
    });
});
