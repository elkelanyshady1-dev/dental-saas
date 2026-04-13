/**
 * tests/contract/contractLifecycle.test.js
 *
 * Contract Engine — Lifecycle Simulation Tests
 *
 * What this tests:
 *   ✅ Draft → Active transition via activateContract() service
 *   ✅ Supersession: existing active contract marked superseded on new activation
 *   ✅ Termination: contract moved to "terminated" via expireContract()
 *   ✅ Idempotency: activating an already-active contract is a no-op
 *   ❌ Draft-only contracts cannot be terminated from superseded state
 *   ❌ Non-draft contracts cannot be re-activated
 *
 * Uses real service-layer logic. No controller involvement.
 * In-memory DB (mongodb-memory-server) via tests/setup.js.
 */

"use strict";

const mongoose = require("mongoose");

const {
    createContract,
    activateContract,
    expireContract,
    ContractEngineError,
} = require("../../src/platform/billing/services/contractEngine.service");

const OrgContract = require("../../src/platform/billing/models/OrgContract.model");
const Organization = require("../../src/shared/models/Organization");

const {
    ACTOR_ID,
    createOrg,
    createPlanVersion,
    createDraftContract,
    createActiveContract,
    createPaidInvoice,
} = require("./helpers/factory");

// ─── Contract Creation (createContract service) ───────────────────────────────

describe("ContractEngine — createContract()", () => {
    it("✅ creates a draft contract with correct fields", async () => {
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

        expect(contract.contractStatus).toBe("draft");
        expect(contract.lockedPrice).toBe(100);
        expect(contract.currency).toBe("EGP");
        expect(contract.planCode).toBe("basic");
        expect(contract.organizationId.toString()).toBe(org._id.toString());
    });

    it("✅ uppercases currency on create", async () => {
        const org = await createOrg();
        const pv = await createPlanVersion();

        const contract = await createContract({
            organizationId: org._id,
            planVersionId: pv._id,
            planCode: "basic",
            planVersionTag: "v1.0.0",
            lockedPrice: 200,
            currency: "egp", // lowercase input
            effectiveFrom: new Date(),
        }, ACTOR_ID);

        expect(contract.currency).toBe("EGP");
    });

    it("❌ rejects duplicate draft for same org", async () => {
        const org = await createOrg();
        const pv = await createPlanVersion();

        // First draft
        await createContract({
            organizationId: org._id,
            planVersionId: pv._id,
            planCode: "basic",
            planVersionTag: "v1.0.0",
            lockedPrice: 100,
            currency: "EGP",
            effectiveFrom: new Date(),
        }, ACTOR_ID);

        // Second draft for same org — must fail
        await expect(
            createContract({
                organizationId: org._id,
                planVersionId: pv._id,
                planCode: "basic",
                planVersionTag: "v1.0.0",
                lockedPrice: 100,
                currency: "EGP",
                effectiveFrom: new Date(),
            }, ACTOR_ID)
        ).rejects.toMatchObject({ code: "DUPLICATE_DRAFT" });
    });

    it("❌ rejects contract for archived organization", async () => {
        const org = await createOrg({ isArchived: true });
        const pv = await createPlanVersion();

        await expect(
            createContract({
                organizationId: org._id,
                planVersionId: pv._id,
                planCode: "basic",
                planVersionTag: "v1.0.0",
                lockedPrice: 100,
                currency: "EGP",
                effectiveFrom: new Date(),
            }, ACTOR_ID)
        ).rejects.toMatchObject({ code: "ORG_ARCHIVED" });
    });
});

// ─── Contract Activation (activateContract service) ───────────────────────────

describe("ContractEngine — activateContract()", () => {
    it("✅ Draft → Active transition sets contractStatus, currency, lockedPrice", async () => {
        const org = await createOrg();
        const pv = await createPlanVersion();
        const draft = await createDraftContract(org._id, pv._id);
        const invoice = await createPaidInvoice(org._id, draft._id);

        const { contract, organization } = await activateContract(
            draft._id,
            invoice._id,
            ACTOR_ID
        );

        expect(contract.contractStatus).toBe("active");
        expect(contract.lockedPrice).toBeDefined();
        expect(contract.currency).toBeDefined();
        expect(contract.activatedBy.toString()).toBe(ACTOR_ID.toString());

        // Org should have currentContractId updated
        expect(organization.currentContractId.toString()).toBe(contract._id.toString());
        // subscription.status should be active
        expect(organization.subscription.status).toBe("active");
    });

    it("✅ Supersedes previous active contract when activating a new one", async () => {
        const org = await createOrg();
        const pv = await createPlanVersion();

        // Set up existing active contract
        const existingActive = await createActiveContract(org._id, pv._id);
        await Organization.findByIdAndUpdate(org._id, {
            $set: { currentContractId: existingActive._id }
        });

        // Create a new draft
        const newDraft = await createDraftContract(org._id, pv._id, {
            lockedPrice: 150,
        });
        const invoice = await createPaidInvoice(org._id, newDraft._id);

        await activateContract(newDraft._id, invoice._id, ACTOR_ID);

        // The old contract must now be superseded
        const superseded = await OrgContract.findById(existingActive._id);
        expect(superseded.contractStatus).toBe("superseded");
        expect(superseded.supersededAt).toBeDefined();
    });

    it("✅ Idempotent: activating an already-active contract is a no-op", async () => {
        const org = await createOrg();
        const pv = await createPlanVersion();
        const draft = await createDraftContract(org._id, pv._id);
        const invoice = await createPaidInvoice(org._id, draft._id);

        // First activation
        const { contract } = await activateContract(draft._id, invoice._id, ACTOR_ID);
        expect(contract.contractStatus).toBe("active");

        // Second activation — must not throw, must return same state
        const { contract: again } = await activateContract(draft._id, invoice._id, ACTOR_ID);
        expect(again.contractStatus).toBe("active");
    });

    it("❌ Rejects activation if invoice is not paid", async () => {
        const org = await createOrg();
        const pv = await createPlanVersion();
        const draft = await createDraftContract(org._id, pv._id);
        const invoice = await createPaidInvoice(org._id, draft._id, { status: "open" });

        await expect(
            activateContract(draft._id, invoice._id, ACTOR_ID)
        ).rejects.toMatchObject({ code: "INVOICE_NOT_PAID" });
    });

    it("❌ Rejects activation of non-draft contract (terminated)", async () => {
        const org = await createOrg();
        const pv = await createPlanVersion();
        const terminated = await createDraftContract(org._id, pv._id, {
            contractStatus: "terminated",
        });
        const invoice = await createPaidInvoice(org._id, terminated._id);

        await expect(
            activateContract(terminated._id, invoice._id, ACTOR_ID)
        ).rejects.toMatchObject({ code: "INVALID_CONTRACT_STATUS" });
    });

    it("❌ Rejects activation if invoice belongs to different org", async () => {
        const org1 = await createOrg();
        const org2 = await createOrg();
        const pv = await createPlanVersion();

        const draft = await createDraftContract(org1._id, pv._id);
        // Invoice belongs to org2 — mismatch
        const invoice = await createPaidInvoice(org2._id, draft._id, {
            status: "paid",
        });

        await expect(
            activateContract(draft._id, invoice._id, ACTOR_ID)
        ).rejects.toMatchObject({ code: "ORG_MISMATCH" });
    });
});

// ─── Contract Expiration (expireContract service) ─────────────────────────────

describe("ContractEngine — expireContract()", () => {
    it("✅ Terminates an active contract", async () => {
        const org = await createOrg();
        const pv = await createPlanVersion();
        const active = await createActiveContract(org._id, pv._id);

        const terminated = await expireContract(active._id, "test termination", ACTOR_ID);

        expect(terminated.contractStatus).toBe("terminated");
        expect(terminated.terminatedAt).toBeDefined();
        expect(terminated.terminatedBy.toString()).toBe(ACTOR_ID.toString());
    });

    it("✅ Terminating an already-terminated contract is idempotent", async () => {
        const org = await createOrg();
        const pv = await createPlanVersion();
        const contract = await createDraftContract(org._id, pv._id, {
            contractStatus: "terminated",
        });

        const result = await expireContract(contract._id, "re-terminate", ACTOR_ID);
        expect(result.contractStatus).toBe("terminated");
    });

    it("❌ Cannot terminate a superseded contract", async () => {
        const org = await createOrg();
        const pv = await createPlanVersion();
        const superseded = await createDraftContract(org._id, pv._id, {
            contractStatus: "superseded",
        });

        await expect(
            expireContract(superseded._id, "bad termination", ACTOR_ID)
        ).rejects.toMatchObject({ code: "INVALID_STATUS_TRANSITION" });
    });
});

// ─── replaceContract service ──────────────────────────────────────────────────

describe("ContractEngine — replaceContract()", () => {
    const {
        replaceContract,
    } = require("../../src/platform/billing/services/contractEngine.service");

    it("✅ Creates a draft replacement for an active contract", async () => {
        const org = await createOrg();
        const pv = await createPlanVersion();
        const active = await createActiveContract(org._id, pv._id, {
            lockedPrice: 100,
        });

        const replacement = await replaceContract(
            active._id,
            { lockedPrice: 150, currency: "SAR" },
            ACTOR_ID
        );

        expect(replacement.contractStatus).toBe("draft");
        expect(replacement.lockedPrice).toBe(150);
        expect(replacement.currency).toBe("SAR");
        expect(replacement.previousContractId.toString()).toBe(active._id.toString());
    });

    it("❌ Cannot replace a draft contract (must be active)", async () => {
        const org = await createOrg();
        const pv = await createPlanVersion();
        const draft = await createDraftContract(org._id, pv._id);

        await expect(
            replaceContract(draft._id, { lockedPrice: 200 }, ACTOR_ID)
        ).rejects.toMatchObject({ code: "INVALID_SOURCE_STATUS" });
    });
});
