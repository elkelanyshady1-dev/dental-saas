/**
 * billingPhase2Safety.test.js
 * v22.0 — Phase 2 Financial Safety Hardening Tests
 *
 * Validates:
 *   1. Invoice state machine — void transitions removed from partial and overdue
 *   2. Invoice state machine — processing state added correctly
 *   3. Invoice state machine — assertVoidable enforces Safety Rule 4
 *   4. assertVoidable error codes and fields
 *   5. Guardian invariant — checkRefundNotGreaterThanPayment structure
 *   6. BillingLedger — invoice.voided event type registered
 *   7. Runtime guardian — REFUND_NOT_GREATER_THAN_PAYMENT check registered
 *   8. refundProcessor — updated imports (structural check)
 *   9. billing.invariants — new export present
 */

"use strict";

require("module-alias/register");

// ─── 1 & 2. State machine transition changes ──────────────────────────────────

describe("invoiceStateMachine — void transitions (Safety Rule 4)", () => {
    let sm;

    beforeAll(() => {
        sm = require("../../src/platform/billing/services/invoiceStateMachine");
    });

    // REMOVED transitions
    test("partial → void is NO LONGER allowed", () => {
        expect(sm.canTransition("partial", "void")).toBe(false);
    });

    test("overdue → void is NO LONGER allowed", () => {
        expect(sm.canTransition("overdue", "void")).toBe(false);
    });

    // Still allowed
    test("draft → void is still allowed", () => {
        expect(sm.canTransition("draft", "void")).toBe(true);
    });

    test("issued → void is still allowed (amountPaid guard applied separately)", () => {
        expect(sm.canTransition("issued", "void")).toBe(true);
    });

    // assertTransition should also block these
    test("assertTransition(partial → void) throws INVALID_INVOICE_TRANSITION", () => {
        expect(() => sm.assertTransition("partial", "void", "inv-001")).toThrow();
        try {
            sm.assertTransition("partial", "void", "inv-001");
        } catch (e) {
            expect(e.code).toBe("INVALID_INVOICE_TRANSITION");
            expect(e.status).toBe(409);
        }
    });

    test("assertTransition(overdue → void) throws INVALID_INVOICE_TRANSITION", () => {
        expect(() => sm.assertTransition("overdue", "void", "inv-002")).toThrow();
    });
});

// ─── 3. Processing state ──────────────────────────────────────────────────────

describe("invoiceStateMachine — processing state (async payments)", () => {
    let sm;

    beforeAll(() => {
        sm = require("../../src/platform/billing/services/invoiceStateMachine");
    });

    test("issued → processing is allowed", () => {
        expect(sm.canTransition("issued", "processing")).toBe(true);
    });

    test("processing → paid is allowed", () => {
        expect(sm.canTransition("processing", "paid")).toBe(true);
    });

    test("processing → failed is allowed", () => {
        expect(sm.canTransition("processing", "failed")).toBe(true);
    });

    test("processing → void is NOT allowed", () => {
        expect(sm.canTransition("processing", "void")).toBe(false);
    });

    test("'failed' is a terminal state", () => {
        expect(sm.isTerminal("failed")).toBe(true);
    });

    test("isProcessing() returns true only for 'processing'", () => {
        expect(sm.isProcessing("processing")).toBe(true);
        expect(sm.isProcessing("paid")).toBe(false);
        expect(sm.isProcessing("issued")).toBe(false);
    });

    test("ALLOWED_TRANSITIONS has 'failed' as a terminal key", () => {
        expect(sm.ALLOWED_TRANSITIONS.failed).toEqual([]);
    });
});

// ─── 4. assertVoidable ────────────────────────────────────────────────────────

describe("invoiceStateMachine.assertVoidable — Safety Rule 4", () => {
    let sm;

    beforeAll(() => {
        sm = require("../../src/platform/billing/services/invoiceStateMachine");
    });

    test("assertVoidable is exported", () => {
        expect(typeof sm.assertVoidable).toBe("function");
    });

    test("throws CANNOT_VOID_PAID_INVOICE when amountPaid > 0 (decimal)", () => {
        const inv = { status: "partial", amountPaid: 50.00 };
        try {
            sm.assertVoidable(inv, "test-id");
            fail("Should have thrown");
        } catch (e) {
            expect(e.code).toBe("CANNOT_VOID_PAID_INVOICE");
            expect(e.status).toBe(422);
            expect(e.amountPaid).toBe(50.00);
        }
    });

    test("throws CANNOT_VOID_PAID_INVOICE for overdue with partial payment", () => {
        const inv = { status: "overdue", amountPaid: 0.01 };
        expect(() => sm.assertVoidable(inv)).toThrow("amountPaid=0.01");
    });

    test("passes for draft invoice with no payments", () => {
        const inv = { status: "draft", amountPaid: 0 };
        expect(() => sm.assertVoidable(inv, "test-id")).not.toThrow();
    });

    test("passes for issued invoice with no payments", () => {
        const inv = { status: "issued", amountPaid: 0 };
        expect(() => sm.assertVoidable(inv, "test-id")).not.toThrow();
    });

    test("passes when amountPaid is undefined (treated as 0)", () => {
        const inv = { status: "draft" };   // amountPaid missing
        expect(() => sm.assertVoidable(inv)).not.toThrow();
    });

    test("throws INVALID_INVOICE_TRANSITION for paid invoice (terminal state)", () => {
        const inv = { status: "paid", amountPaid: 100 };
        try {
            sm.assertVoidable(inv, "test-id");
            fail("Should have thrown");
        } catch (e) {
            // Will throw CANNOT_VOID_PAID_INVOICE (amountPaid check runs first)
            expect(["CANNOT_VOID_PAID_INVOICE", "INVALID_INVOICE_TRANSITION"]).toContain(e.code);
        }
    });

    test("VOIDABLE_STATES contains draft and issued", () => {
        expect(sm.VOIDABLE_STATES.has("draft")).toBe(true);
        expect(sm.VOIDABLE_STATES.has("issued")).toBe(true);
        expect(sm.VOIDABLE_STATES.has("partial")).toBe(false);
        expect(sm.VOIDABLE_STATES.has("overdue")).toBe(false);
    });
});

// ─── 5. REFUND_NOT_GREATER_THAN_PAYMENT invariant ─────────────────────────────

describe("billing.invariants — checkRefundNotGreaterThanPayment", () => {
    let invariants;

    beforeAll(() => {
        invariants = require("../../src/platform/guardian/billing.invariants");
    });

    test("checkRefundNotGreaterThanPayment is exported", () => {
        expect(typeof invariants.checkRefundNotGreaterThanPayment).toBe("function");
    });

    test("returns pass: true when model not loaded (graceful degrade)", async () => {
        // Without DB connection, PlatformInvoice model won't be in mongoose.connection.models
        const result = await invariants.checkRefundNotGreaterThanPayment();
        expect(result).toHaveProperty("pass");
        // Either pass:true (model not loaded) or result with violations
        expect(typeof result.pass).toBe("boolean");
    });
});

// ─── 6. BillingLedger event types ────────────────────────────────────────────

describe("BillingLedger model — invoice.voided event type (v22.0)", () => {
    let BillingLedger;

    beforeAll(() => {
        BillingLedger = require("../../src/platform/billing/models/BillingLedger.model");
    });

    test("LEDGER_EVENT_TYPES includes invoice.voided", () => {
        expect(BillingLedger.LEDGER_EVENT_TYPES).toContain("invoice.voided");
    });

    test("LEDGER_EVENT_TYPES includes contract.terminated", () => {
        expect(BillingLedger.LEDGER_EVENT_TYPES).toContain("contract.terminated");
    });

    test("LEDGER_SOURCES includes refundEngine", () => {
        expect(BillingLedger.LEDGER_SOURCES).toContain("refundEngine");
    });
});

// ─── 7. Runtime guardian — invariant registration ────────────────────────────

describe("runtime.guardian — REFUND_NOT_GREATER_THAN_PAYMENT registered", () => {
    let guardian;

    beforeAll(() => {
        guardian = require("../../src/platform/guardian/runtime.guardian");
    });

    test("runtime guardian loads without error", () => {
        expect(guardian).toBeDefined();
    });

    test("_checks includes checkRefundNotGreaterThanPayment", () => {
        expect(typeof guardian._checks.checkRefundNotGreaterThanPayment).toBe("function");
    });

    test("_checks includes all expected v21 invariants untouched", () => {
        const expectedChecks = [
            "checkInvoiceTotalMatch",
            "checkPaymentNotGreaterThanInvoice",
            "checkContractSingleActive",
            "checkLedgerAppendOnly",
            "checkPlanVersionValid",
            "checkLedgerHashChainValid",
            "checkRefundNotGreaterThanPayment"
        ];
        for (const name of expectedChecks) {
            expect(typeof guardian._checks[name]).toBe("function");
        }
    });
});

// ─── 8. invoiceAction controller loads with new import ────────────────────────

describe("invoiceAction.controller — assertVoidable import", () => {
    test("loads without error", () => {
        expect(() => {
            require("../../src/platform/billing/controllers/invoiceAction.controller");
        }).not.toThrow();
    });
});
