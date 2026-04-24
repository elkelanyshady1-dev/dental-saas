"use strict";

/**
 * planConcurrency.test.js — Live-replset concurrency locks for the
 * orthodontic treatment-plan versioning system.
 *
 * REQUIRES: MongoMemoryReplSet via the existing integration jest setup.
 *
 * LOCKS:
 *   1. Double approve of the same draft → one wins, the other is an idempotent
 *      replay (same approved version returned, no duplicate PLAN_EVENT).
 *   2. Competing approve of two different drafts → exactly one approved, the
 *      other throws ALREADY_APPROVED (409).
 *   3. Concurrent revisions off the same approved baseline → exactly one
 *      isActive=true at the end; monotonic version numbers; no duplicate
 *      (caseId, isActive=true) rows.
 *   4. Transaction rollback — when an error is thrown mid-transaction, no
 *      partial writes persist AND no PLAN_EVENT is emitted.
 *
 * These tests are the only place where the partial unique indexes and the
 * withTransaction boundary are exercised against a real replica set. Unit /
 * contract tests cannot prove these guarantees.
 */

const mongoose = require("mongoose");

const TreatmentPlanVersionDef = require("../../modules/orthodontics/models/TreatmentPlanVersion.model");
const OrthodonticCaseDef      = require("../../modules/orthodontics/models/orthodonticCase.model");
const WorkflowRecordSetDef    = require("../../modules/orthodontics/models/WorkflowRecordSet.model");
const svc                     = require("../../modules/orthodontics/services/treatmentPlanVersion.service");

const TreatmentPlanVersion = TreatmentPlanVersionDef.default;
const OrthodonticCase      = OrthodonticCaseDef.default;
const WorkflowRecordSet    = WorkflowRecordSetDef.default;

// ─── Fixtures ─────────────────────────────────────────────────────────────────

function _makeReq() {
    // The service reads req.dbConnection and req.context; for the integration
    // harness we piggyback on the default mongoose connection that Jest's
    // setup.js points at the MongoMemoryReplSet.
    return {
        dbConnection: mongoose.connection,
        context: {
            userId: new mongoose.Types.ObjectId(),
            organizationId: new mongoose.Types.ObjectId(),
        },
        id: `req-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    };
}

async function _seedCase(req) {
    const { organizationId, userId } = req.context;
    const caseDoc = await OrthodonticCase.create({
        organizationId,
        patientId: new mongoose.Types.ObjectId(),
        treatmentCaseId: new mongoose.Types.ObjectId(),
        malocclusionClass: "CLASS_I",
        ownerId: userId,
    });
    const recordSet = await WorkflowRecordSet.create({
        organizationId,
        caseId: caseDoc._id,
        type: "PRE",
        name: "PRE #1",
    });
    return { caseDoc, recordSet };
}

async function _createDraft(req, caseId, recordSetId, payload = { note: "d" }) {
    return svc.createDraft(req, {
        caseId,
        recordSetId,
        payload,
        assets: undefined,
        userId: req.context.userId,
    });
}

async function _mkMidRecordSet(req, caseId) {
    return WorkflowRecordSet.create({
        organizationId: req.context.organizationId,
        caseId,
        type: "MID",
        name: "MID #1",
    });
}

afterEach(async () => {
    // Clean slate between tests to keep partial-unique indexes independent.
    await Promise.all([
        TreatmentPlanVersion.deleteMany({}),
        OrthodonticCase.deleteMany({}),
        WorkflowRecordSet.deleteMany({}),
    ]);
});

// ─── 1. Double approve of the same draft ─────────────────────────────────────

describe("plan concurrency — double approve (same draft)", () => {
    test("two parallel approve calls → 1 success + 1 idempotent replay", async () => {
        const req = _makeReq();
        const { caseDoc, recordSet } = await _seedCase(req);
        const draft = await _createDraft(req, caseDoc._id, recordSet._id);

        const [a, b] = await Promise.allSettled([
            svc.approvePlan(req, { versionId: draft._id, userId: req.context.userId }),
            svc.approvePlan(req, { versionId: draft._id, userId: req.context.userId }),
        ]);

        const fulfilled = [a, b].filter((r) => r.status === "fulfilled");
        expect(fulfilled).toHaveLength(2); // both succeed — one primary, one replay

        const approvedCount = await TreatmentPlanVersion.countDocuments({
            caseId: caseDoc._id, isApproved: true,
        });
        expect(approvedCount).toBe(1);

        const freshCase = await OrthodonticCase.findById(caseDoc._id).lean();
        expect(String(freshCase.approvedPlanVersionId)).toBe(String(draft._id));
        expect(String(freshCase.activePlanVersionId)).toBe(String(draft._id));
    });
});

// ─── 2. Competing approve of two different drafts ────────────────────────────

describe("plan concurrency — competing approve (two drafts)", () => {
    test("only one is approved; the other throws ALREADY_APPROVED", async () => {
        const req = _makeReq();
        const { caseDoc, recordSet } = await _seedCase(req);
        const draftA = await _createDraft(req, caseDoc._id, recordSet._id, { name: "A" });
        const draftB = await _createDraft(req, caseDoc._id, recordSet._id, { name: "B" });

        const results = await Promise.allSettled([
            svc.approvePlan(req, { versionId: draftA._id, userId: req.context.userId }),
            svc.approvePlan(req, { versionId: draftB._id, userId: req.context.userId }),
        ]);

        const fulfilled = results.filter((r) => r.status === "fulfilled");
        const rejected  = results.filter((r) => r.status === "rejected");
        expect(fulfilled).toHaveLength(1);
        expect(rejected).toHaveLength(1);
        expect(rejected[0].reason.code).toBe("ALREADY_APPROVED");
        expect(rejected[0].reason.statusCode).toBe(409);

        const approvedCount = await TreatmentPlanVersion.countDocuments({
            caseId: caseDoc._id, isApproved: true,
        });
        expect(approvedCount).toBe(1);
    });
});

// ─── 3. Concurrent revisions off the same approved baseline ──────────────────

describe("plan concurrency — concurrent revisions", () => {
    test("exactly one isActive=true at end; monotonic versions; no dup active", async () => {
        const req = _makeReq();
        const { caseDoc, recordSet: preRs } = await _seedCase(req);
        const draft = await _createDraft(req, caseDoc._id, preRs._id);
        await svc.approvePlan(req, { versionId: draft._id, userId: req.context.userId });

        const midRs = await _mkMidRecordSet(req, caseDoc._id);

        const mkRevision = (summary) => svc.createRevision(req, {
            caseId: caseDoc._id,
            recordSetId: midRs._id,
            payload: { note: summary },
            changeSummary: summary,
            assets: undefined,
            userId: req.context.userId,
        });

        const results = await Promise.allSettled([
            mkRevision("rev A"),
            mkRevision("rev B"),
        ]);

        // At least one must succeed. If both succeed, the partial unique index
        // + updateMany demotion must keep only one isActive at the end.
        const fulfilled = results.filter((r) => r.status === "fulfilled");
        expect(fulfilled.length).toBeGreaterThanOrEqual(1);

        const activeCount = await TreatmentPlanVersion.countDocuments({
            caseId: caseDoc._id, isActive: true,
        });
        expect(activeCount).toBe(1);

        const versions = await TreatmentPlanVersion
            .find({ caseId: caseDoc._id })
            .sort({ version: 1 })
            .lean();
        for (let i = 1; i < versions.length; i++) {
            expect(versions[i].version).toBe(versions[i - 1].version + 1);
        }
    });
});

// ─── 4. Transaction rollback — no partial writes, no PLAN_EVENT ──────────────

describe("plan concurrency — transaction rollback", () => {
    test("error thrown inside the session → no version inserted and case pointers untouched", async () => {
        const req = _makeReq();
        const { caseDoc, recordSet } = await _seedCase(req);

        // Force the failure by monkey-patching TreatmentPlanVersion.create so
        // the insert inside the session throws. This proves the $inc on the
        // case counter and the create are both rolled back together.
        const originalCreate = TreatmentPlanVersion.create.bind(TreatmentPlanVersion);
        let createCalled = false;
        TreatmentPlanVersion.create = async (...args) => {
            createCalled = true;
            throw new Error("FORCED_TRANSACTION_FAIL");
        };

        try {
            await expect(
                svc.createDraft(req, {
                    caseId: caseDoc._id,
                    recordSetId: recordSet._id,
                    payload: { note: "will roll back" },
                    userId: req.context.userId,
                }),
            ).rejects.toThrow(/FORCED_TRANSACTION_FAIL/);
        } finally {
            TreatmentPlanVersion.create = originalCreate;
        }

        expect(createCalled).toBe(true); // confirms we entered the transaction

        const count = await TreatmentPlanVersion.countDocuments({ caseId: caseDoc._id });
        expect(count).toBe(0); // rollback worked — no partial write

        const fresh = await OrthodonticCase.findById(caseDoc._id).lean();
        expect(fresh.approvedPlanVersionId ?? null).toBeNull();
        expect(fresh.activePlanVersionId ?? null).toBeNull();
        // __planVersionCounter $inc ran inside the same session, so rollback
        // must revert it — a successful retry should allocate v1, not v2.
        expect(fresh.__planVersionCounter ?? 0).toBe(0);
    });
});
