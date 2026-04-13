/**
 * clinicalReducer.parity.test.js
 * ══════════════════════════════════════════════════════════════════════════════
 * P1-4: REDUCER PARITY TEST
 *
 * WHAT THIS TESTS:
 *   The backend (JS) and frontend (TS, compiled to JS in dist/) must produce
 *   IDENTICAL state for every event type. This test feeds the same event
 *   sequence to both reducers and asserts their outputs are equal.
 *
 *   Any divergence means replay will produce different chart state depending
 *   on where it runs — a data-integrity bug that is extremely hard to debug
 *   in production.
 *
 * COVERAGE:
 *   - All 7 ADD/APPLY events that require stable IDs (P0-1 invariant)
 *   - All matching REMOVED events
 *   - Archwire SET / REMOVE
 *   - Tooth-level mutations (SET_TOOTH_STATUS, SET_TOOTH_BONDING, etc.)
 *   - Idempotency: applying the same event twice must not change state
 *   - Unknown events: must return state unchanged in both reducers
 *   - Missing entity ID: both reducers must throw with code MISSING_ENTITY_ID
 *
 * RUN:
 *   jest clinicalReducer.parity
 *
 * FRONTEND BUILD REQUIREMENT:
 *   The frontend reducer must be compiled to:
 *     frontend/dist/clinicalReducer.js
 *   before running this test. In CI:
 *     cd frontend && npx tsc --outDir dist --module commonjs --esModuleInterop true \
 *       src/org/modules/patients/components/orthodontic-chart/utils/clinicalReducer.ts
 *
 *   If the compiled file is missing, frontend tests are skipped with a warning.
 * ══════════════════════════════════════════════════════════════════════════════
 */

"use strict";

const path = require("path");

// ── Import backend (authoritative) reducer ────────────────────────────────────
const {
    applyClinicalEvent: applyBackend,
    upgradeEvent,
} = require("../clinicalReducer");

// ── Import frontend reducer (compiled TS → JS) ────────────────────────────────
// The frontend dist path is resolved relative to the monorepo root.
const FE_REDUCER_PATH = path.resolve(
    __dirname,
    "../../../../../../frontend/dist/clinicalReducer.js"
);

let applyFrontend = null;
let frontendAvailable = false;

try {
    const feModule = require(FE_REDUCER_PATH);
    applyFrontend      = feModule.applyClinicalEvent ?? feModule.default?.applyClinicalEvent;
    frontendAvailable  = typeof applyFrontend === "function";
} catch (_) {
    // Compiled file missing — frontend tests will be skipped.
}

// ── Shared test helpers ───────────────────────────────────────────────────────

/** Minimal valid chart state used as the starting point for each test. */
function blankState() {
    return {
        upperTeeth:   Array.from({ length: 14 }, (_, i) => ({ id: 11 + i, status: "present" })),
        lowerTeeth:   Array.from({ length: 14 }, (_, i) => ({ id: 31 + i, status: "present" })),
        upperArchwire: null,
        lowerArchwire: null,
        elastics:      [],
        powerchains:   [],
        accessories:   [],
        ligatures:     [],
        iprMarkers:    [],
        spaceMarkers:  [],
        miniscrews:    [],
    };
}

/** Applies an array of raw events to state using the backend reducer. */
function applyEvents(events, initialState = blankState()) {
    return events.reduce((state, ev) => applyBackend(state, upgradeEvent(ev)), initialState);
}

/** Applies an array of raw events using the frontend reducer. */
function applyEventsFE(events, initialState = blankState()) {
    if (!applyFrontend) throw new Error("Frontend reducer not available");
    return events.reduce((state, ev) => applyFrontend(state, upgradeEvent(ev)), initialState);
}

// ── Fixture events ────────────────────────────────────────────────────────────

const FIXTURES = {
    archwireUpper: {
        type: "ARCHWIRE_PLACED",
        payload: { arch: "upper", material: "NiTi", size: "0.014", brand: null },
    },
    archwireLower: {
        type: "ARCHWIRE_PLACED",
        payload: { arch: "lower", material: "SS", size: "0.016x0.022", brand: null },
    },
    archwireUpperRemoved: {
        type: "ARCHWIRE_REMOVED",
        payload: { arch: "upper" },
    },
    elasticApplied: {
        type: "ELASTIC_APPLIED",
        payload: { _id: "elastic-001", fromTooth: 13, toTooth: 43, type: "Class II", size: "3/16" },
    },
    elasticRemoved: {
        type: "ELASTIC_REMOVED",
        payload: { actionId: "elastic-001" },
    },
    powerchainApplied: {
        type: "POWERCHAIN_APPLIED",
        payload: { _id: "pc-001", arch: "upper", segments: [{ from: 13, to: 23 }], type: "full" },
    },
    powerchainRemoved: {
        type: "POWERCHAIN_REMOVED",
        payload: { actionId: "pc-001" },
    },
    accessoryAdded: {
        type: "ACCESSORY_ADDED",
        payload: { _id: "acc-001", toothId: 21, type: "hook" },
    },
    accessoryRemoved: {
        type: "ACCESSORY_REMOVED",
        payload: { actionId: "acc-001" },
    },
    ligatureAdded: {
        type: "LIGATURE_ADDED",
        payload: { _id: "lig-001", toothId: 22, type: "metal" },
    },
    ligatureRemoved: {
        type: "LIGATURE_REMOVED",
        payload: { actionId: "lig-001" },
    },
    iprAdded: {
        type: "IPR_ADDED",
        payload: { _id: "ipr-001", betweenTeeth: [12, 11], amount: 0.3 },
    },
    iprRemoved: {
        type: "IPR_REMOVED",
        payload: { actionId: "ipr-001" },
    },
    spaceMarkerAdded: {
        type: "SPACE_MARKER_ADDED",
        payload: { _id: "sm-001", toothId: 14, type: "space_maintainer" },
    },
    spaceMarkerRemoved: {
        type: "SPACE_MARKER_REMOVED",
        payload: { actionId: "sm-001" },
    },
    tadInserted: {
        type: "TAD_INSERTED",
        payload: { _id: "tad-001", toothNumber: 16, position: "mesial", brand: "ORMCO", diameter: 1.6, length: 8 },
    },
    tadRemoved: {
        type: "TAD_REMOVED",
        payload: { tadId: "tad-001" },
    },
    setToothStatus: {
        type: "SET_TOOTH_STATUS",
        payload: { toothId: 11, status: "missing" },
    },
    setToothBonding: {
        type: "SET_TOOTH_BONDING",
        payload: { toothId: 12, bonded: true, bracketType: "ceramic" },
    },
    clearTooth: {
        type: "CLEAR_TOOTH",
        payload: { toothId: 11 },
    },
    unknownEvent: {
        type: "UNKNOWN_FUTURE_EVENT_TYPE",
        payload: { someField: "value" },
    },
    bondingApplied: {
        // Bonding events are audit-only — reducer returns state unchanged.
        type: "BONDING_APPLIED",
        payload: { _id: "bonding-001", teeth: [11, 12, 13] },
    },
};

// ══════════════════════════════════════════════════════════════════════════════
// SUITE 1 — Backend reducer unit tests (always run)
// ══════════════════════════════════════════════════════════════════════════════

describe("Backend clinicalReducer", () => {

    // ── Archwire ──────────────────────────────────────────────────────────────

    test("ARCHWIRE_PLACED sets upper archwire", () => {
        const state = applyEvents([FIXTURES.archwireUpper]);
        expect(state.upperArchwire).toMatchObject({ material: "NiTi", size: "0.014" });
        expect(state.lowerArchwire).toBeNull();
    });

    test("ARCHWIRE_PLACED sets lower archwire", () => {
        const state = applyEvents([FIXTURES.archwireLower]);
        expect(state.lowerArchwire).toMatchObject({ material: "SS", size: "0.016x0.022" });
    });

    test("ARCHWIRE_REMOVED clears upper archwire", () => {
        const state = applyEvents([FIXTURES.archwireUpper, FIXTURES.archwireUpperRemoved]);
        expect(state.upperArchwire).toBeNull();
    });

    // ── Elastic ───────────────────────────────────────────────────────────────

    test("ELASTIC_APPLIED adds elastic with stable ID", () => {
        const state = applyEvents([FIXTURES.elasticApplied]);
        expect(state.elastics).toHaveLength(1);
        expect(state.elastics[0]).toMatchObject({ id: "elastic-001", type: "Class II" });
    });

    test("ELASTIC_REMOVED removes elastic by actionId", () => {
        const state = applyEvents([FIXTURES.elasticApplied, FIXTURES.elasticRemoved]);
        expect(state.elastics).toHaveLength(0);
    });

    test("ELASTIC_APPLIED throws MISSING_ENTITY_ID when _id absent", () => {
        const badEvent = { type: "ELASTIC_APPLIED", payload: { fromTooth: 13, toTooth: 43 } };
        expect(() => applyBackend(blankState(), badEvent)).toThrow(
            expect.objectContaining({ code: "MISSING_ENTITY_ID" })
        );
    });

    // ── PowerChain ────────────────────────────────────────────────────────────

    test("POWERCHAIN_APPLIED adds powerchain", () => {
        const state = applyEvents([FIXTURES.powerchainApplied]);
        expect(state.powerchains).toHaveLength(1);
        expect(state.powerchains[0]).toMatchObject({ id: "pc-001", arch: "upper" });
    });

    test("POWERCHAIN_REMOVED removes powerchain", () => {
        const state = applyEvents([FIXTURES.powerchainApplied, FIXTURES.powerchainRemoved]);
        expect(state.powerchains).toHaveLength(0);
    });

    // ── Accessory ─────────────────────────────────────────────────────────────

    test("ACCESSORY_ADDED adds accessory with stable ID", () => {
        const state = applyEvents([FIXTURES.accessoryAdded]);
        expect(state.accessories).toHaveLength(1);
        expect(state.accessories[0]).toMatchObject({ id: "acc-001", toothId: 21 });
    });

    test("ACCESSORY_REMOVED removes accessory", () => {
        const state = applyEvents([FIXTURES.accessoryAdded, FIXTURES.accessoryRemoved]);
        expect(state.accessories).toHaveLength(0);
    });

    // ── Ligature ──────────────────────────────────────────────────────────────

    test("LIGATURE_ADDED adds ligature", () => {
        const state = applyEvents([FIXTURES.ligatureAdded]);
        expect(state.ligatures).toHaveLength(1);
        expect(state.ligatures[0]).toMatchObject({ id: "lig-001", toothId: 22 });
    });

    test("LIGATURE_REMOVED removes ligature", () => {
        const state = applyEvents([FIXTURES.ligatureAdded, FIXTURES.ligatureRemoved]);
        expect(state.ligatures).toHaveLength(0);
    });

    // ── IPR ───────────────────────────────────────────────────────────────────

    test("IPR_ADDED adds ipr marker", () => {
        const state = applyEvents([FIXTURES.iprAdded]);
        expect(state.iprMarkers).toHaveLength(1);
        expect(state.iprMarkers[0]).toMatchObject({ id: "ipr-001", amount: 0.3 });
    });

    test("IPR_REMOVED removes ipr marker", () => {
        const state = applyEvents([FIXTURES.iprAdded, FIXTURES.iprRemoved]);
        expect(state.iprMarkers).toHaveLength(0);
    });

    // ── Space Marker ──────────────────────────────────────────────────────────

    test("SPACE_MARKER_ADDED adds space marker", () => {
        const state = applyEvents([FIXTURES.spaceMarkerAdded]);
        expect(state.spaceMarkers).toHaveLength(1);
        expect(state.spaceMarkers[0]).toMatchObject({ id: "sm-001", toothId: 14 });
    });

    test("SPACE_MARKER_REMOVED removes space marker", () => {
        const state = applyEvents([FIXTURES.spaceMarkerAdded, FIXTURES.spaceMarkerRemoved]);
        expect(state.spaceMarkers).toHaveLength(0);
    });

    // ── TAD ───────────────────────────────────────────────────────────────────

    test("TAD_INSERTED adds miniscrew with stable ID", () => {
        const state = applyEvents([FIXTURES.tadInserted]);
        expect(state.miniscrews).toHaveLength(1);
        expect(state.miniscrews[0]).toMatchObject({ id: "tad-001", toothId: 16 });
    });

    test("TAD_REMOVED removes miniscrew by tadId", () => {
        const state = applyEvents([FIXTURES.tadInserted, FIXTURES.tadRemoved]);
        expect(state.miniscrews).toHaveLength(0);
    });

    test("TAD_INSERTED throws MISSING_ENTITY_ID when _id absent", () => {
        const badEvent = { type: "TAD_INSERTED", payload: { toothNumber: 16, position: "mesial" } };
        expect(() => applyBackend(blankState(), badEvent)).toThrow(
            expect.objectContaining({ code: "MISSING_ENTITY_ID" })
        );
    });

    // ── Tooth-level mutations ─────────────────────────────────────────────────

    test("SET_TOOTH_STATUS updates tooth status", () => {
        const state = applyEvents([FIXTURES.setToothStatus]);
        const tooth = state.upperTeeth.find((t) => t.id === 11);
        expect(tooth.status).toBe("missing");
    });

    test("SET_TOOTH_BONDING updates bonding flags on tooth", () => {
        const state = applyEvents([FIXTURES.setToothBonding]);
        const tooth = state.upperTeeth.find((t) => t.id === 12);
        expect(tooth.bonded).toBe(true);
        expect(tooth.bracketType).toBe("ceramic");
    });

    // ── Bonding audit-only events ─────────────────────────────────────────────

    test("BONDING_APPLIED returns state unchanged (audit-only)", () => {
        const initial = blankState();
        const result  = applyBackend(initial, FIXTURES.bondingApplied);
        expect(result).toEqual(initial);
    });

    // ── Idempotency ───────────────────────────────────────────────────────────

    test("Applying ELASTIC_APPLIED twice does not duplicate the elastic", () => {
        const state = applyEvents([FIXTURES.elasticApplied, FIXTURES.elasticApplied]);
        expect(state.elastics).toHaveLength(1);
    });

    test("Applying TAD_INSERTED twice does not duplicate the miniscrew", () => {
        const state = applyEvents([FIXTURES.tadInserted, FIXTURES.tadInserted]);
        expect(state.miniscrews).toHaveLength(1);
    });

    // ── Unknown events ────────────────────────────────────────────────────────

    test("Unknown event type returns state unchanged", () => {
        const initial = blankState();
        const result  = applyBackend(initial, FIXTURES.unknownEvent);
        expect(result).toEqual(initial);
    });

    // ── Pure function invariants ──────────────────────────────────────────────

    test("applyClinicalEvent never mutates input state", () => {
        const initial = blankState();
        const frozen  = Object.freeze({ ...initial, elastics: Object.freeze([...initial.elastics]) });
        // Should not throw "Cannot assign to read only property"
        expect(() => applyBackend(frozen, FIXTURES.elasticApplied)).not.toThrow();
    });

    // ── Full sequence replay ──────────────────────────────────────────────────

    test("Full sequence: place + remove all appliance types", () => {
        const sequence = [
            FIXTURES.archwireUpper,
            FIXTURES.archwireLower,
            FIXTURES.elasticApplied,
            FIXTURES.powerchainApplied,
            FIXTURES.accessoryAdded,
            FIXTURES.ligatureAdded,
            FIXTURES.iprAdded,
            FIXTURES.spaceMarkerAdded,
            FIXTURES.tadInserted,
            // Remove all
            FIXTURES.archwireUpperRemoved,
            FIXTURES.elasticRemoved,
            FIXTURES.powerchainRemoved,
            FIXTURES.accessoryRemoved,
            FIXTURES.ligatureRemoved,
            FIXTURES.iprRemoved,
            FIXTURES.spaceMarkerRemoved,
            FIXTURES.tadRemoved,
        ];

        const state = applyEvents(sequence);

        expect(state.upperArchwire).toBeNull();
        expect(state.lowerArchwire).not.toBeNull(); // lower was not removed
        expect(state.elastics).toHaveLength(0);
        expect(state.powerchains).toHaveLength(0);
        expect(state.accessories).toHaveLength(0);
        expect(state.ligatures).toHaveLength(0);
        expect(state.iprMarkers).toHaveLength(0);
        expect(state.spaceMarkers).toHaveLength(0);
        expect(state.miniscrews).toHaveLength(0);
    });
});

// ══════════════════════════════════════════════════════════════════════════════
// SUITE 2 — Frontend ↔ Backend parity (requires compiled frontend dist)
// ══════════════════════════════════════════════════════════════════════════════

const describeIfFE = frontendAvailable ? describe : describe.skip;

describeIfFE("Frontend ↔ Backend reducer parity", () => {

    if (!frontendAvailable) {
        // This block is unreachable when skipped but satisfies the test runner.
        test.skip("Frontend reducer not compiled — run: cd frontend && npx tsc", () => {});
        return;
    }

    /**
     * Core parity helper.
     * Feeds the same sequence to both reducers and asserts deep equality.
     */
    function assertParity(label, events) {
        test(label, () => {
            const beState = applyEvents(events);
            const feState = applyEventsFE(events);
            expect(feState).toEqual(beState);
        });
    }

    assertParity("ARCHWIRE_PLACED upper", [FIXTURES.archwireUpper]);
    assertParity("ARCHWIRE_PLACED lower", [FIXTURES.archwireLower]);
    assertParity("ARCHWIRE_PLACED + ARCHWIRE_REMOVED", [FIXTURES.archwireUpper, FIXTURES.archwireUpperRemoved]);
    assertParity("ELASTIC_APPLIED", [FIXTURES.elasticApplied]);
    assertParity("ELASTIC_APPLIED + ELASTIC_REMOVED", [FIXTURES.elasticApplied, FIXTURES.elasticRemoved]);
    assertParity("POWERCHAIN_APPLIED", [FIXTURES.powerchainApplied]);
    assertParity("POWERCHAIN_APPLIED + POWERCHAIN_REMOVED", [FIXTURES.powerchainApplied, FIXTURES.powerchainRemoved]);
    assertParity("ACCESSORY_ADDED", [FIXTURES.accessoryAdded]);
    assertParity("ACCESSORY_ADDED + ACCESSORY_REMOVED", [FIXTURES.accessoryAdded, FIXTURES.accessoryRemoved]);
    assertParity("LIGATURE_ADDED", [FIXTURES.ligatureAdded]);
    assertParity("LIGATURE_ADDED + LIGATURE_REMOVED", [FIXTURES.ligatureAdded, FIXTURES.ligatureRemoved]);
    assertParity("IPR_ADDED", [FIXTURES.iprAdded]);
    assertParity("IPR_ADDED + IPR_REMOVED", [FIXTURES.iprAdded, FIXTURES.iprRemoved]);
    assertParity("SPACE_MARKER_ADDED", [FIXTURES.spaceMarkerAdded]);
    assertParity("SPACE_MARKER_ADDED + SPACE_MARKER_REMOVED", [FIXTURES.spaceMarkerAdded, FIXTURES.spaceMarkerRemoved]);
    assertParity("TAD_INSERTED", [FIXTURES.tadInserted]);
    assertParity("TAD_INSERTED + TAD_REMOVED", [FIXTURES.tadInserted, FIXTURES.tadRemoved]);
    assertParity("SET_TOOTH_STATUS", [FIXTURES.setToothStatus]);
    assertParity("SET_TOOTH_BONDING", [FIXTURES.setToothBonding]);
    assertParity("BONDING_APPLIED (audit-only, state unchanged)", [FIXTURES.bondingApplied]);
    assertParity("Unknown event returns state unchanged", [FIXTURES.unknownEvent]);

    assertParity("Idempotency: ELASTIC_APPLIED twice", [FIXTURES.elasticApplied, FIXTURES.elasticApplied]);
    assertParity("Idempotency: TAD_INSERTED twice", [FIXTURES.tadInserted, FIXTURES.tadInserted]);

    assertParity("Full sequence: all appliance types placed then removed", [
        FIXTURES.archwireUpper,
        FIXTURES.archwireLower,
        FIXTURES.elasticApplied,
        FIXTURES.powerchainApplied,
        FIXTURES.accessoryAdded,
        FIXTURES.ligatureAdded,
        FIXTURES.iprAdded,
        FIXTURES.spaceMarkerAdded,
        FIXTURES.tadInserted,
        FIXTURES.archwireUpperRemoved,
        FIXTURES.elasticRemoved,
        FIXTURES.powerchainRemoved,
        FIXTURES.accessoryRemoved,
        FIXTURES.ligatureRemoved,
        FIXTURES.iprRemoved,
        FIXTURES.spaceMarkerRemoved,
        FIXTURES.tadRemoved,
    ]);

    // ── Missing entity ID: both reducers must throw identically ──────────────

    test("ELASTIC_APPLIED missing _id: both throw MISSING_ENTITY_ID", () => {
        const badEvent = { type: "ELASTIC_APPLIED", payload: { fromTooth: 13, toTooth: 43 } };
        const bErr = (() => { try { applyBackend(blankState(), badEvent); } catch (e) { return e; } })();
        const fErr = (() => { try { applyFrontend(blankState(), badEvent); } catch (e) { return e; } })();

        expect(bErr).toBeDefined();
        expect(fErr).toBeDefined();
        expect(bErr.code).toBe("MISSING_ENTITY_ID");
        expect(fErr.code).toBe("MISSING_ENTITY_ID");
    });

    test("TAD_INSERTED missing _id: both throw MISSING_ENTITY_ID", () => {
        const badEvent = { type: "TAD_INSERTED", payload: { toothNumber: 16 } };
        const bErr = (() => { try { applyBackend(blankState(), badEvent); } catch (e) { return e; } })();
        const fErr = (() => { try { applyFrontend(blankState(), badEvent); } catch (e) { return e; } })();

        expect(bErr.code).toBe("MISSING_ENTITY_ID");
        expect(fErr.code).toBe("MISSING_ENTITY_ID");
    });
});

// ── Informational log ─────────────────────────────────────────────────────────

beforeAll(() => {
    if (!frontendAvailable) {
        console.warn(
            "\n⚠️  [clinicalReducer.parity] Frontend reducer not found at:\n" +
            `   ${FE_REDUCER_PATH}\n` +
            "   Parity suite (Suite 2) is SKIPPED.\n" +
            "   To enable: cd frontend && npx tsc --outDir dist --module commonjs \\\n" +
            "     --esModuleInterop true \\\n" +
            "     src/org/modules/patients/components/orthodontic-chart/utils/clinicalReducer.ts\n"
        );
    }
});
