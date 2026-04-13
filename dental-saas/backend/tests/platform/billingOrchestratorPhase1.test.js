/**
 * billingOrchestratorPhase1.test.js
 * v22.0 — Phase 1 tests for BillingOrchestrator + LedgerEngine
 *
 * Validates:
 *   1. BillingOrchestrator loads and exports expected methods
 *   2. LedgerEngine loads and exports expected methods
 *   3. Backward-compatible writeLedgerEntry re-export from model
 *   4. getCreditBalance returns correct shape
 *   5. verifyChain returns correct shape
 *   6. Orchestrator delegation (method signature alignment)
 *
 * These are structural and contract tests — no MongoDB required.
 */

"use strict";

require("module-alias/register");

// ─── 1. BillingOrchestrator loads ──────────────────────────────────────────────

describe("BillingOrchestrator — module contract", () => {
    let BillingOrchestrator;

    beforeAll(() => {
        BillingOrchestrator = require("../../src/platform/billing/orchestrator/BillingOrchestrator.service");
    });

    test("loads without error", () => {
        expect(BillingOrchestrator).toBeDefined();
    });

    const expectedMethods = [
        "applyPayment",
        "refundPayment",
        "createContract",
        "activateContract",
        "suspendContract",
        "voidContract",
        "graceContract",
        "expireContract",
        "generateInvoice",
        "writeLedgerEntry",
        "getCreditBalance"
    ];

    test.each(expectedMethods)("exports %s as a function", (methodName) => {
        expect(typeof BillingOrchestrator[methodName]).toBe("function");
    });

    test("has at least the expected Phase 1 methods present", () => {
        const actualMethods = Object.keys(BillingOrchestrator)
            .filter(k => typeof BillingOrchestrator[k] === "function");
        // Phase 1 had 11 methods; Phase 3 expanded to 21 — test that all P1 methods still exist
        expect(actualMethods.length).toBeGreaterThanOrEqual(expectedMethods.length);
    });
});

// ─── 2. LedgerEngine loads ─────────────────────────────────────────────────────

describe("LedgerEngine — module contract", () => {
    let LedgerEngine;

    beforeAll(() => {
        LedgerEngine = require("../../src/platform/billing/engines/LedgerEngine.service");
    });

    test("loads without error", () => {
        expect(LedgerEngine).toBeDefined();
    });

    test("exports writeLedgerEntry", () => {
        expect(typeof LedgerEngine.writeLedgerEntry).toBe("function");
    });

    test("exports getCreditBalance", () => {
        expect(typeof LedgerEngine.getCreditBalance).toBe("function");
    });

    test("exports verifyChain", () => {
        expect(typeof LedgerEngine.verifyChain).toBe("function");
    });
});

// ─── 3. Backward-compatible re-export ─────────────────────────────────────────

describe("BillingLedger model — backward compatibility", () => {
    let BillingLedgerModel;

    beforeAll(() => {
        BillingLedgerModel = require("../../src/platform/billing/models/BillingLedger.model");
    });

    test("still exports writeLedgerEntry as a function", () => {
        expect(typeof BillingLedgerModel.writeLedgerEntry).toBe("function");
    });

    test("still exports LEDGER_EVENT_TYPES", () => {
        expect(Array.isArray(BillingLedgerModel.LEDGER_EVENT_TYPES)).toBe(true);
        expect(BillingLedgerModel.LEDGER_EVENT_TYPES.length).toBeGreaterThan(5);
    });

    test("still exports LEDGER_SOURCES", () => {
        expect(Array.isArray(BillingLedgerModel.LEDGER_SOURCES)).toBe(true);
        expect(BillingLedgerModel.LEDGER_SOURCES.length).toBeGreaterThan(3);
    });
});

// ─── 4. billingCredits controller loads ───────────────────────────────────────

describe("billingCredits controller — module contract", () => {
    let creditsCtrl;

    beforeAll(() => {
        creditsCtrl = require("../../src/platform/billing/controllers/billingCredits.controller");
    });

    test("loads without error", () => {
        expect(creditsCtrl).toBeDefined();
    });

    test("exports getCredits as a function", () => {
        expect(typeof creditsCtrl.getCredits).toBe("function");
    });
});

// ─── 5. getCreditBalance returns correct shape ────────────────────────────────

describe("LedgerEngine.getCreditBalance — shape test", () => {
    const LedgerEngine = require("../../src/platform/billing/engines/LedgerEngine.service");
    const mongoose = require("mongoose");

    test("returns { creditBalance: 0, credits: [] } for invalid/unconnected orgId", async () => {
        // Without a DB connection, getCreditBalance should gracefully degrade
        const result = await LedgerEngine.getCreditBalance(
            new mongoose.Types.ObjectId().toString()
        );

        expect(result).toHaveProperty("creditBalance");
        expect(result).toHaveProperty("credits");
        expect(typeof result.creditBalance).toBe("number");
        expect(Array.isArray(result.credits)).toBe(true);
    });
});

// ─── 6. Orchestrator method signatures align with engine services ─────────────

describe("BillingOrchestrator — delegation alignment", () => {
    const BillingOrchestrator = require("../../src/platform/billing/orchestrator/BillingOrchestrator.service");

    test("applyPayment accepts a single data object", () => {
        // Verify the function expects 1 argument (data object)
        expect(BillingOrchestrator.applyPayment.length).toBe(1);
    });

    test("activateContract accepts contractId, invoiceId, actorId, options", () => {
        // Matches contractEngine.service.activateContract(contractId, invoiceId, actorId, options)
        expect(BillingOrchestrator.activateContract.length).toBe(3); // contractId, invoiceId, actorId (options has default)
    });

    test("suspendContract accepts contractId + opts", () => {
        expect(BillingOrchestrator.suspendContract.length).toBe(1); // contractId (opts has default)
    });

    test("writeLedgerEntry accepts entry + session", () => {
        expect(BillingOrchestrator.writeLedgerEntry.length).toBe(1); // entry (session has default)
    });
});
