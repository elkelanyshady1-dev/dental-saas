/**
 * ticketFSM.unit.test.js — Unit tests for Ticket FSM (Plan E11)
 *
 * Verifies the canonical state machine:
 *   - every declared transition is legal
 *   - every undeclared transition throws
 *   - no-op (same state) never throws
 *   - reopen guard enforces both `reopen: true` and a non-empty `reason`
 *   - terminal states (CLOSED, REJECTED) allow no outgoing transitions
 */

"use strict";

const {
    ALLOWED_TRANSITIONS,
    canTransition,
    assertTransition,
    isTerminal,
    allStates,
    InvalidTransitionError,
    ReopenRequirementError,
} = require("@modules/supportDomain/services/ticketFSM");

describe("ticketFSM", () => {
    describe("canTransition", () => {
        test("allows same-state no-op for every state", () => {
            for (const s of allStates()) {
                expect(canTransition(s, s)).toBe(true);
            }
        });

        test("allows every declared transition", () => {
            for (const [from, targets] of Object.entries(ALLOWED_TRANSITIONS)) {
                for (const to of targets) {
                    expect(canTransition(from, to)).toBe(true);
                }
            }
        });

        test("rejects transitions not in the registry", () => {
            // OPEN → RESOLVED is not declared
            expect(canTransition("OPEN", "RESOLVED")).toBe(false);
            // CLOSED → anything is not declared
            expect(canTransition("CLOSED", "OPEN")).toBe(false);
            expect(canTransition("REJECTED", "IN_REVIEW")).toBe(false);
        });

        test("unknown source state is never transitionable", () => {
            expect(canTransition("NOPE", "OPEN")).toBe(false);
        });
    });

    describe("assertTransition", () => {
        test("silent on same-state", () => {
            expect(() => assertTransition("OPEN", "OPEN")).not.toThrow();
            expect(() => assertTransition("CLOSED", "CLOSED")).not.toThrow();
        });

        test("throws InvalidTransitionError on disallowed transitions", () => {
            let thrown;
            try { assertTransition("OPEN", "RESOLVED"); } catch (e) { thrown = e; }
            expect(thrown).toBeInstanceOf(InvalidTransitionError);
            expect(thrown.code).toBe("INVALID_STATE_TRANSITION");
            expect(thrown.status).toBe(422);
            expect(thrown.from).toBe("OPEN");
            expect(thrown.to).toBe("RESOLVED");
        });

        test("RESOLVED → IN_REVIEW requires explicit reopen flag", () => {
            expect(() => assertTransition("RESOLVED", "IN_REVIEW")).toThrow(ReopenRequirementError);
            expect(() => assertTransition("RESOLVED", "IN_REVIEW", { reopen: true })).toThrow(ReopenRequirementError);
            expect(() => assertTransition("RESOLVED", "IN_REVIEW", { reopen: true, reason: "   " })).toThrow(ReopenRequirementError);
            expect(() => assertTransition("RESOLVED", "IN_REVIEW", { reopen: true, reason: "Regression reported" })).not.toThrow();
        });

        test("reopen flag is NOT required for other RESOLVED transitions", () => {
            expect(() => assertTransition("RESOLVED", "CLOSED")).not.toThrow();
        });
    });

    describe("isTerminal", () => {
        test("CLOSED and REJECTED are terminal", () => {
            expect(isTerminal("CLOSED")).toBe(true);
            expect(isTerminal("REJECTED")).toBe(true);
        });
        test("others are not terminal", () => {
            expect(isTerminal("OPEN")).toBe(false);
            expect(isTerminal("IN_REVIEW")).toBe(false);
            expect(isTerminal("RESOLVED")).toBe(false);
        });
    });

    describe("terminal states have no outgoing transitions", () => {
        test("CLOSED allows nothing", () => {
            expect(ALLOWED_TRANSITIONS.CLOSED).toEqual([]);
            for (const s of allStates()) {
                if (s === "CLOSED") continue;
                expect(canTransition("CLOSED", s)).toBe(false);
            }
        });
        test("REJECTED allows nothing", () => {
            expect(ALLOWED_TRANSITIONS.REJECTED).toEqual([]);
            for (const s of allStates()) {
                if (s === "REJECTED") continue;
                expect(canTransition("REJECTED", s)).toBe(false);
            }
        });
    });
});
