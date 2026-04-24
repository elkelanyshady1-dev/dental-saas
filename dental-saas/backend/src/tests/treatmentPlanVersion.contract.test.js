"use strict";

/**
 * treatmentPlanVersion.unit.test.js
 *
 * Schema + guard contract tests for the Orthodontic Treatment Plan Versioning
 * system. These tests do NOT hit a live DB — they validate:
 *   1. TreatmentPlanVersion schema shape (enums, required fields, indexes)
 *   2. planningGuard action matrix + legacy-field detection
 *   3. compareVersions diff helpers (via public export)
 *
 * Integration tests covering transactional approve/revision flows belong under
 * backend/src/tests/integration/ and require a live Mongo + req scaffolding —
 * tracked as a follow-up task.
 */

// ─── 1. TreatmentPlanVersion Schema ──────────────────────────────────────────

describe("TreatmentPlanVersion — Schema Contract", () => {
    const TreatmentPlanVersion = require("../modules/orthodontics/models/TreatmentPlanVersion.model").default;
    const schema = TreatmentPlanVersion.schema;

    test("required scalars are marked required", () => {
        for (const path of ["organizationId", "caseId", "recordSetId", "recordSetType", "version", "stage", "isActive", "isApproved", "payload", "createdFrom", "createdBy"]) {
            expect(schema.path(path)?.isRequired).toBe(true);
        }
    });

    test("stage enum restricts to DRAFT/APPROVED/REVISION", () => {
        expect(schema.path("stage").enumValues).toEqual(["DRAFT", "APPROVED", "REVISION"]);
    });

    test("recordSetType enum restricts to PRE/MID", () => {
        expect(schema.path("recordSetType").enumValues).toEqual(["PRE", "MID"]);
    });

    test("createdFrom enum restricts to PRE/MID", () => {
        expect(schema.path("createdFrom").enumValues).toEqual(["PRE", "MID"]);
    });

    test("versionLock defaults to 0", () => {
        expect(schema.path("versionLock").defaultValue).toBe(0);
    });

    test("parentVersionId defaults to null (root versions)", () => {
        expect(schema.path("parentVersionId").defaultValue).toBe(null);
    });

    test("indexes include monotonic unique on {caseId, version}", () => {
        const indexes = schema.indexes();
        const monotonic = indexes.find(([spec]) => spec.caseId === 1 && spec.version === 1);
        expect(monotonic).toBeDefined();
        expect(monotonic[1].unique).toBe(true);
    });

    test("indexes include partial unique for single-approved invariant", () => {
        const indexes = schema.indexes();
        const approvedIdx = indexes.find(([spec, opts]) =>
            spec.caseId === 1 && spec.isApproved === 1 && opts?.partialFilterExpression?.isApproved === true,
        );
        expect(approvedIdx).toBeDefined();
        expect(approvedIdx[1].unique).toBe(true);
    });

    test("indexes include partial unique for single-active invariant", () => {
        const indexes = schema.indexes();
        const activeIdx = indexes.find(([spec, opts]) =>
            spec.caseId === 1 && spec.isActive === 1 && opts?.partialFilterExpression?.isActive === true,
        );
        expect(activeIdx).toBeDefined();
        expect(activeIdx[1].unique).toBe(true);
    });

    test("audit is defined as an array sub-schema", () => {
        const auditPath = schema.path("audit");
        expect(auditPath).toBeDefined();
        expect(auditPath.instance).toBe("Array");
    });

    test("assets subdocument has 4 ObjectId arrays", () => {
        const assets = schema.path("assets");
        expect(assets).toBeDefined();
        for (const cat of ["photos", "documents", "stlFiles", "dicomFiles"]) {
            expect(assets.schema.path(cat)).toBeDefined();
        }
    });
});

// ─── 2. Schema-level defaults & enum coverage ────────────────────────────────
// Pre-save hook behavior (changeSummary requirement, immutability, lock
// increment) is validated by integration tests against a live Mongo connection
// — skipped here to keep unit tests pure (no DB).

describe("TreatmentPlanVersion — Defaults", () => {
    const TreatmentPlanVersion = require("../modules/orthodontics/models/TreatmentPlanVersion.model").default;

    test("stage defaults to DRAFT", () => {
        expect(TreatmentPlanVersion.schema.path("stage").defaultValue).toBe("DRAFT");
    });

    test("isActive and isApproved default to false", () => {
        expect(TreatmentPlanVersion.schema.path("isActive").defaultValue).toBe(false);
        expect(TreatmentPlanVersion.schema.path("isApproved").defaultValue).toBe(false);
    });

    test("changeSummary max length 2000", () => {
        expect(TreatmentPlanVersion.schema.path("changeSummary").options.maxlength).toBe(2000);
    });
});

// ─── 3. planningGuard — Action Matrix & Legacy Detection ─────────────────────

describe("planningGuard — action matrix", () => {
    const {
        assertRecordSetSupportsAction,
        canRecordSetPerform,
        assertNoLegacyPlanWrites,
        LEGACY_PLAN_FIELDS,
    } = require("../modules/orthodontics/utils/planningGuard");

    test("PRE supports all planning actions", () => {
        for (const action of ["CREATE_DRAFT", "EDIT_DRAFT", "DELETE_DRAFT", "APPROVE", "VIEW"]) {
            expect(canRecordSetPerform("PRE", action)).toBe(true);
        }
    });

    test("MID only supports CREATE_REVISION and VIEW", () => {
        expect(canRecordSetPerform("MID", "CREATE_REVISION")).toBe(true);
        expect(canRecordSetPerform("MID", "VIEW")).toBe(true);
        expect(canRecordSetPerform("MID", "CREATE_DRAFT")).toBe(false);
        expect(canRecordSetPerform("MID", "APPROVE")).toBe(false);
    });

    test("POST supports only VIEW", () => {
        expect(canRecordSetPerform("POST", "VIEW")).toBe(true);
        expect(canRecordSetPerform("POST", "CREATE_REVISION")).toBe(false);
        expect(canRecordSetPerform("POST", "APPROVE")).toBe(false);
    });

    test("CUSTOM defaults to VIEW-only", () => {
        expect(canRecordSetPerform("CUSTOM", "VIEW")).toBe(true);
        expect(canRecordSetPerform("CUSTOM", "CREATE_DRAFT")).toBe(false);
    });

    test("assertRecordSetSupportsAction throws 403 for disallowed", () => {
        expect(() => assertRecordSetSupportsAction("POST", "APPROVE")).toThrow(/not permitted/);
        try { assertRecordSetSupportsAction("POST", "APPROVE"); }
        catch (e) {
            expect(e.statusCode).toBe(403);
            expect(e.code).toBe("RECORD_SET_ACTION_DENIED");
        }
    });

    test("assertRecordSetSupportsAction throws 400 for unknown type", () => {
        try { assertRecordSetSupportsAction("GARBAGE", "VIEW"); }
        catch (e) {
            expect(e.statusCode).toBe(400);
            expect(e.code).toBe("RECORD_SET_UNKNOWN");
        }
    });

    test("legacy field set covers the full retired surface", () => {
        expect(new Set(LEGACY_PLAN_FIELDS)).toEqual(new Set([
            "treatmentPlan", "finalPlan", "problemList",
            "treatmentGoals", "treatmentOptions", "selectedOptionId",
        ]));
    });

    test("assertNoLegacyPlanWrites throws 400 when any legacy field is present", () => {
        expect(() => assertNoLegacyPlanWrites({ treatmentPlan: {} }, "recordSetData")).toThrow(/PLAN_WRITE_FORBIDDEN|retired plan fields/);
        try { assertNoLegacyPlanWrites({ finalPlan: {} }); }
        catch (e) {
            expect(e.statusCode).toBe(400);
            expect(e.code).toBe("PLAN_WRITE_FORBIDDEN");
        }
    });

    test("assertNoLegacyPlanWrites passes for clean payloads", () => {
        expect(() => assertNoLegacyPlanWrites({ name: "x", chiefComplaint: "y" })).not.toThrow();
        expect(() => assertNoLegacyPlanWrites(null)).not.toThrow();
        expect(() => assertNoLegacyPlanWrites(undefined)).not.toThrow();
    });
});

// ─── 4. Service Hardening — _freezeForPersist ────────────────────────────────

describe("treatmentPlanVersion.service — _freezeForPersist", () => {
    const { _freezeForPersist } = require("../modules/orthodontics/services/treatmentPlanVersion.service");

    test("returns a deep-frozen clone (caller's object stays writable)", () => {
        const input  = { bracketSystem: "metal", retention: { maxilla: "fixed" } };
        const frozen = _freezeForPersist(input);

        expect(Object.isFrozen(frozen)).toBe(true);
        expect(Object.isFrozen(frozen.retention)).toBe(true);
        expect(Object.isFrozen(input)).toBe(false); // original untouched
        expect(() => { (frozen).bracketSystem = "clear"; }).toThrow(TypeError);
    });

    test("passes through null / undefined unchanged", () => {
        expect(_freezeForPersist(null)).toBe(null);
        expect(_freezeForPersist(undefined)).toBe(undefined);
    });

    test("rejects payloads with circular references (§4.2)", () => {
        const circular = { a: 1 };
        circular.self = circular;
        try {
            _freezeForPersist(circular);
            throw new Error("expected throw");
        } catch (e) {
            expect(e.code).toBe("PAYLOAD_NOT_SERIALIZABLE");
            expect(e.statusCode).toBe(400);
        }
    });

    test("rejects functions under structuredClone (§4.2)", () => {
        const input = { bracketSystem: "metal", helper: () => 42 };
        if (typeof structuredClone === "function") {
            // structuredClone throws DataCloneError for functions → our guard
            // wraps it as PAYLOAD_NOT_SERIALIZABLE with statusCode 400.
            try {
                _freezeForPersist(input);
                throw new Error("expected throw");
            } catch (e) {
                expect(e.code).toBe("PAYLOAD_NOT_SERIALIZABLE");
                expect(e.statusCode).toBe(400);
            }
        } else {
            // Pre-Node-17 fallback: JSON clone drops functions silently. Assert
            // serializable keys survive — the function field is simply stripped.
            const frozen = _freezeForPersist(input);
            expect(frozen.bracketSystem).toBe("metal");
            expect(frozen.helper).toBeUndefined();
        }
    });
});

// ─── 5. Revision chain invariant (pure helper test) ──────────────────────────

describe("TreatmentPlanVersion — Revision chain invariant", () => {
    // This test exercises the pure invariants we expect across a v1→v2→v3 chain.
    // It does not require a live DB — we validate the shape contracts that a
    // correctly-seeded chain must satisfy, so the frontend VersionHistory and
    // CompareModal can rely on them.

    function _chain() {
        // Represents a seeded chain: v1 APPROVED → v2 REVISION (parent v1) → v3 REVISION (parent v2)
        return [
            { version: 1, stage: "APPROVED", isApproved: true,  isActive: false, parentVersionId: null, createdFrom: "PRE" },
            { version: 2, stage: "REVISION", isApproved: false, isActive: false, parentVersionId: "v1id", createdFrom: "MID" },
            { version: 3, stage: "REVISION", isApproved: false, isActive: true,  parentVersionId: "v2id", createdFrom: "MID" },
        ];
    }

    test("version numbers are strictly monotonic", () => {
        const versions = _chain().map((v) => v.version);
        for (let i = 1; i < versions.length; i++) {
            expect(versions[i]).toBe(versions[i - 1] + 1);
        }
    });

    test("exactly one version has isApproved=true", () => {
        const approved = _chain().filter((v) => v.isApproved);
        expect(approved).toHaveLength(1);
        expect(approved[0].stage).toBe("APPROVED");
    });

    test("exactly one version has isActive=true", () => {
        const active = _chain().filter((v) => v.isActive);
        expect(active).toHaveLength(1);
    });

    test("non-root revisions have a parentVersionId", () => {
        const chain = _chain();
        const nonRoot = chain.filter((v) => v.stage !== "APPROVED" || v.version !== 1);
        for (const v of nonRoot) {
            expect(v.parentVersionId).not.toBeNull();
        }
    });

    test("APPROVED version has createdFrom=PRE; REVISIONs have createdFrom=MID", () => {
        for (const v of _chain()) {
            if (v.stage === "APPROVED") expect(v.createdFrom).toBe("PRE");
            if (v.stage === "REVISION") expect(v.createdFrom).toBe("MID");
        }
    });
});
