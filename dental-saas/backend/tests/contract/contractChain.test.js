/**
 * contractChain.test.js
 * Sprint 8.1 — Contract Chain Debugging API Tests
 *
 * Connection lifecycle managed by tests/setup.js (MongoMemoryReplSet).
 * Collections wiped after each test by setup.js afterEach.
 * Uses factory.js for minimal-valid test data creation.
 *
 * Tests:
 *   ✔ returns 2-node forward chain for trial → paid contract
 *   ✔ returns single-node chain when no supersession exists
 *   ✔ returns 404 for an unknown (valid) ObjectId
 *   ✔ returns 400 for a malformed ObjectId
 *   ✔ maintains chronological forward order
 *   ✔ returns backward chain via previousContractId
 *   ✔ returns 400 for an invalid direction query param
 *   ✔ each chain node includes all required fields
 */

"use strict";

const mongoose = require("mongoose");
const OrgContract = require("../../src/platform/billing/models/OrgContract.model");
const { ACTOR_ID, createPlanVersion, createOrg } =
    require("./helpers/factory");

const contractController = require("../../src/platform/billing/controllers/platformContract.controller");

// ─── In-process mock req/res ──────────────────────────────────────────────────

function makeMockRes() {
    const res = {
        _status: 200,
        _body: null,
        status(code) { this._status = code; return this; },
        json(body) { this._body = body; return this; }
    };
    return res;
}

function makeMockReq({ contractId = "", direction = "forward" } = {}) {
    return {
        params: { contractId },
        query: { direction },
        platformUser: { _id: ACTOR_ID }
    };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function createContract(overrides = {}) {
    const pv = overrides._pv || await createPlanVersion({ templateCode: overrides.planCode || "trial-tier" });
    const [contract] = await OrgContract.create([{
        organizationId: overrides.organizationId || new mongoose.Types.ObjectId(),
        planVersionId: pv._id,
        planCode: pv.templateCode,
        planVersionTag: pv.versionTag,
        contractStatus: overrides.contractStatus || "active",
        effectiveFrom: overrides.effectiveFrom || new Date("2026-03-01"),
        effectiveTo: overrides.effectiveTo || new Date("2026-03-15"),
        lockedPrice: overrides.lockedPrice ?? 0,
        currency: overrides.currency || "EGP",
        billingInterval: overrides.billingInterval || "monthly",
        trialDays: overrides.trialDays ?? 14,
        source: overrides.source || "provisioning",
        paymentProvider: overrides.paymentProvider || "manual",
        createdBy: ACTOR_ID,
        supersededById: overrides.supersededById || null,
        previousContractId: overrides.previousContractId || null,
    }]);
    return contract;
}

// ─── Test Suite ───────────────────────────────────────────────────────────────

describe("GET /contracts/:contractId/chain — getContractChain controller", () => {

    // ── Test 1: 2-node forward chain ─────────────────────────────────────────
    it("returns 2-node forward chain: trial (superseded) → paid (active)", async () => {
        const orgId = new mongoose.Types.ObjectId();
        const trialPV = await createPlanVersion({ templateCode: "trial-tier" });
        const proPV = await createPlanVersion({ templateCode: "professional" });

        const trial = await createContract({
            organizationId: orgId,
            _pv: trialPV,
            contractStatus: "superseded",
            effectiveFrom: new Date("2026-03-01"),
            effectiveTo: new Date("2026-03-15"),
            lockedPrice: 0,
            trialDays: 14,
        });

        const paid = await createContract({
            organizationId: orgId,
            _pv: proPV,
            contractStatus: "active",
            effectiveFrom: new Date("2026-03-15"),
            effectiveTo: new Date("2026-04-15"),
            lockedPrice: 399,
            trialDays: 0,
            previousContractId: trial._id,
        });

        // Wire forward pointer
        trial.supersededById = paid._id;
        await trial.save();

        const req = makeMockReq({ contractId: String(trial._id), direction: "forward" });
        const res = makeMockRes();
        await contractController.getContractChain(req, res);

        expect(res._status).toBe(200);
        expect(res._body.success).toBe(true);
        expect(res._body.direction).toBe("forward");
        expect(res._body.chain).toHaveLength(2);
        expect(res._body.chainLength).toBe(2);
        expect(res._body.truncated).toBe(false);

        const [n0, n1] = res._body.chain;
        expect(n0.planCode).toBe("trial-tier");
        expect(n0.contractStatus).toBe("superseded");
        expect(n1.planCode).toBe("professional");
        expect(n1.contractStatus).toBe("active");

        // Chronological: n0.effectiveFrom < n1.effectiveFrom
        expect(new Date(n0.effectiveFrom) < new Date(n1.effectiveFrom)).toBe(true);
    });

    // ── Test 2: Single-node chain ─────────────────────────────────────────────
    it("returns single-node chain when no supersession exists", async () => {
        const contract = await createContract({ contractStatus: "active" });

        const req = makeMockReq({ contractId: String(contract._id) });
        const res = makeMockRes();
        await contractController.getContractChain(req, res);

        expect(res._status).toBe(200);
        expect(res._body.chain).toHaveLength(1);
        expect(res._body.chain[0].contractId).toBe(String(contract._id));
        expect(res._body.truncated).toBe(false);
    });

    // ── Test 3: 404 for unknown ObjectId ──────────────────────────────────────
    it("returns 404 for an unknown but valid ObjectId", async () => {
        const req = makeMockReq({ contractId: String(new mongoose.Types.ObjectId()) });
        const res = makeMockRes();
        await contractController.getContractChain(req, res);

        expect(res._status).toBe(404);
        expect(res._body.error).toBe("CONTRACT_NOT_FOUND");
    });

    // ── Test 4: 400 for malformed contractId ──────────────────────────────────
    it("returns 400 for a malformed (non-ObjectId) contractId", async () => {
        const req = makeMockReq({ contractId: "not-a-valid-id" });
        const res = makeMockRes();
        await contractController.getContractChain(req, res);

        expect(res._status).toBe(400);
        expect(res._body.error).toBe("CONTRACT_ID_INVALID");
    });

    // ── Test 5: 400 for invalid direction ─────────────────────────────────────
    it("returns 400 for an invalid direction query param", async () => {
        const contract = await createContract();
        const req = makeMockReq({ contractId: String(contract._id), direction: "sideways" });
        const res = makeMockRes();
        await contractController.getContractChain(req, res);

        expect(res._status).toBe(400);
        expect(res._body.error).toBe("INVALID_DIRECTION");
    });

    // ── Test 6: Backward chain via previousContractId ─────────────────────────
    it("returns backward chain via previousContractId", async () => {
        const orgId = new mongoose.Types.ObjectId();
        const trialPV = await createPlanVersion({ templateCode: "trial-tier" });
        const proPV = await createPlanVersion({ templateCode: "professional" });

        const trial = await createContract({
            organizationId: orgId,
            _pv: trialPV,
            contractStatus: "superseded",
            effectiveFrom: new Date("2026-03-01"),
            effectiveTo: new Date("2026-03-15"),
            lockedPrice: 0,
            trialDays: 14,
        });

        const paid = await createContract({
            organizationId: orgId,
            _pv: proPV,
            contractStatus: "active",
            effectiveFrom: new Date("2026-03-15"),
            effectiveTo: new Date("2026-04-15"),
            lockedPrice: 399,
            trialDays: 0,
            previousContractId: trial._id,
        });

        // Walk backward from paid → trial
        const req = makeMockReq({ contractId: String(paid._id), direction: "backward" });
        const res = makeMockRes();
        await contractController.getContractChain(req, res);

        expect(res._status).toBe(200);
        expect(res._body.direction).toBe("backward");
        expect(res._body.chain).toHaveLength(2);

        const [n0, n1] = res._body.chain;
        expect(n0.planCode).toBe("professional");   // starts at "paid"
        expect(n1.planCode).toBe("trial-tier");      // then walks back to trial
    });

    // ── Test 7: Required node fields ──────────────────────────────────────────
    it("each chain node includes all required fields", async () => {
        const contract = await createContract({ lockedPrice: 199, contractStatus: "active" });

        const req = makeMockReq({ contractId: String(contract._id) });
        const res = makeMockRes();
        await contractController.getContractChain(req, res);

        const node = res._body.chain[0];
        expect(node).toHaveProperty("contractId");
        expect(node).toHaveProperty("planCode");
        expect(node).toHaveProperty("planVersionTag");
        expect(node).toHaveProperty("contractStatus");
        expect(node).toHaveProperty("effectiveFrom");
        expect(node).toHaveProperty("effectiveTo");
        expect(node).toHaveProperty("lockedPrice", 199);
        expect(node).toHaveProperty("currency");
        expect(node).toHaveProperty("billingInterval");
        expect(node).toHaveProperty("source");
        expect(node).toHaveProperty("trialDays");
    });
});
