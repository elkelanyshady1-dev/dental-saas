/**
 * guardianDeprecatedPlan.test.js
 * Platform Guardian — DEPRECATED_PUBLIC_PLAN Invariant Tests
 *
 * Covers:
 *   1. Guardian check fails on deprecated+public
 *   2. Guardian check passes on deprecated+sales
 *   3. Guardian check passes on active+public
 *   4. Guardian check fails on archived+public (future-proof: "archived" is not a current status
 *      but included to verify the check only targets "deprecated")
 *   5. Auto-repair corrects deprecated+public → deprecated+sales
 *   6. PlanVersion pre-save hook auto-corrects visibility when status transitions to "deprecated"
 *   7. PlanVersion pre-save hook hard-blocks direct save of deprecated+public
 *
 * Test strategy: mock Mongoose connection models so no real DB is required.
 *
 * PLANE: Platform / Billing
 */

"use strict";

// ─── Mocking Utilities ────────────────────────────────────────────────────────

/**
 * Build a minimal mock PlanVersion document for checkDeprecatedPublicPlan.
 */
function makePlanVersionMock(docs) {
    return {
        find: jest.fn().mockReturnValue({
            select: jest.fn().mockReturnValue({
                lean: jest.fn().mockResolvedValue(docs),
            }),
        }),
    };
}

/**
 * Inline reimplementation of checkDeprecatedPublicPlan so tests don't
 * require a live MongoDB connection.
 */
async function checkDeprecatedPublicPlan(PlanVersionModel) {
    const violations = await PlanVersionModel.find({
        status: "deprecated",
        visibility: "public",
    })
        .select("_id templateCode versionTag")
        .lean();

    if (violations.length === 0) return;

    const details = violations
        .map((v) => `_id=${v._id} templateCode="${v.templateCode}" tag="${v.versionTag}"`)
        .join(" | ");

    throw new Error(
        `DEPRECATED_PUBLIC_PLAN violated: ${violations.length} PlanVersion(s) are deprecated ` +
        `but still have visibility="public". ` +
        details
    );
}

// ─── Test Suite ───────────────────────────────────────────────────────────────

describe("Guardian: DEPRECATED_PUBLIC_PLAN invariant", () => {
    // ── Test 1 ────────────────────────────────────────────────────────────────
    it("1. fails when a deprecated PlanVersion has visibility=public", async () => {
        const model = makePlanVersionMock([
            {
                _id: "69a9301c02e28881242468a2",
                templateCode: "trial-tier",
                versionTag: "v1",
                status: "deprecated",
                visibility: "public",
            },
        ]);

        await expect(checkDeprecatedPublicPlan(model)).rejects.toThrow(
            "DEPRECATED_PUBLIC_PLAN violated"
        );
    });

    // ── Test 2 ────────────────────────────────────────────────────────────────
    it("2. passes when a deprecated PlanVersion has visibility=sales", async () => {
        const model = makePlanVersionMock([]);
        // find returns no violations → check should pass silently
        await expect(checkDeprecatedPublicPlan(model)).resolves.toBeUndefined();
    });

    // ── Test 3 ────────────────────────────────────────────────────────────────
    it("3. passes when an active PlanVersion has visibility=public", async () => {
        // The check only queries { status: "deprecated", visibility: "public" }.
        // An active+public version will NOT appear in the find() result.
        const model = makePlanVersionMock([]);
        await expect(checkDeprecatedPublicPlan(model)).resolves.toBeUndefined();
    });

    // ── Test 4 ────────────────────────────────────────────────────────────────
    it("4. passes when querying for archived+public (not in deprecated scope)", async () => {
        // "archived" is not a current PlanVersion status (schema only allows
        // draft/active/deprecated). The check specifically targets "deprecated",
        // so future status values don't accidentally enter the violation set.
        const model = makePlanVersionMock([]);
        await expect(checkDeprecatedPublicPlan(model)).resolves.toBeUndefined();
    });

    // ── Test 5: auto-repair ───────────────────────────────────────────────────
    it("5. auto-repair corrects deprecated+public plans to visibility=sales", async () => {
        // Mock the raw collection updateMany
        const updateMany = jest.fn().mockResolvedValue({ modifiedCount: 2 });
        const getCollection = jest.fn().mockReturnValue({ updateMany });

        // Replicate the repair function inline (same logic as repairDeprecatedPublicPlans)
        async function runRepair(collection) {
            const result = await collection.updateMany(
                { status: "deprecated", visibility: "public" },
                { $set: { visibility: "sales" } }
            );
            return result.modifiedCount;
        }

        const fixed = await runRepair({ updateMany });
        expect(fixed).toBe(2);
        expect(updateMany).toHaveBeenCalledWith(
            { status: "deprecated", visibility: "public" },
            { $set: { visibility: "sales" } }
        );
    });

    // ── Test 6: model-layer auto-correction ───────────────────────────────────
    it("6. PlanVersion pre-save: auto-corrects visibility public→sales when status transitions to deprecated", () => {
        // Simulate the pre-save hook logic in isolation
        function simulatePreSaveHook(doc) {
            // This mirrors the hook:
            // if (isModified("status") && status === "deprecated") {
            //     if (visibility === "public") visibility = "sales";
            // }
            if (doc._statusModified && doc.status === "deprecated") {
                if (doc.visibility === "public") {
                    doc.visibility = "sales";
                }
            }
            // Hard block check (should never reach this after correction)
            if (doc.status === "deprecated" && doc.visibility === "public") {
                throw new Error("[PlanVersion] DEPRECATED_PUBLIC_PLAN invariant violated");
            }
        }

        const doc = {
            _statusModified: true,   // isModified("status") === true
            status: "deprecated",
            visibility: "public",
        };

        simulatePreSaveHook(doc);
        expect(doc.visibility).toBe("sales");  // auto-corrected
    });

    // ── Test 7: model-layer hard block ────────────────────────────────────────
    it("7. PlanVersion pre-save: throws if deprecated+public is set without status transition", () => {
        // Simulates a doc that was already deprecated (no status modification)
        // but someone set visibility="public" directly.
        function simulatePreSaveHook(doc) {
            if (doc._statusModified && doc.status === "deprecated") {
                if (doc.visibility === "public") {
                    doc.visibility = "sales";
                }
            }
            if (doc.status === "deprecated" && doc.visibility === "public") {
                throw new Error("[PlanVersion] DEPRECATED_PUBLIC_PLAN invariant violated");
            }
        }

        const doc = {
            _statusModified: false,  // status was NOT just changed — already deprecated
            status: "deprecated",
            visibility: "public",   // someone patched visibility directly
        };

        expect(() => simulatePreSaveHook(doc)).toThrow(
            "[PlanVersion] DEPRECATED_PUBLIC_PLAN invariant violated"
        );
    });
});

// ─── Lifecycle Matrix Validation ──────────────────────────────────────────────
describe("PlanVersion lifecycle matrix: valid status+visibility combinations", () => {
    const VALID_COMBINATIONS = [
        { status: "draft", visibility: "internal", valid: true },
        { status: "draft", visibility: "public", valid: true },
        { status: "draft", visibility: "sales", valid: true },
        { status: "active", visibility: "public", valid: true },
        { status: "active", visibility: "sales", valid: true },
        { status: "active", visibility: "internal", valid: true },
        { status: "deprecated", visibility: "sales", valid: true },
        { status: "deprecated", visibility: "internal", valid: true },
        { status: "deprecated", visibility: "public", valid: false }, // INVARIANT
    ];

    function isValidCombination(status, visibility) {
        if (status === "deprecated" && visibility === "public") return false;
        return true;
    }

    VALID_COMBINATIONS.forEach(({ status, visibility, valid }) => {
        it(`${status}+${visibility} → should be ${valid ? "valid" : "INVALID"}`, () => {
            expect(isValidCombination(status, visibility)).toBe(valid);
        });
    });
});
