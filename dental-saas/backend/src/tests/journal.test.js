/**
 * journal.test.js — Double-Entry Ledger Unit Tests
 * Phase C — Billing Domain
 *
 * Tests:
 * 1. JournalEntry model schema enforcement
 * 2. Balance validation (debit = credit)
 * 3. Immutability guards
 * 4. Journal service factory functions
 * 5. Account constants integrity
 * 6. RBAC permission & PBAC policy presence
 * 7. Domain events
 */

"use strict";

// ─── 1. JournalEntry Model — Schema Enforcement ─────────────────────────────

describe("JournalEntry Model — Schema Enforcement", () => {
    const JournalEntry = require("../modules/billingDomain/models/JournalEntry.model").default;
    const schema = JournalEntry.schema;

    test("organizationId is required and immutable", () => {
        const field = schema.path("organizationId");
        expect(field).toBeDefined();
        expect(field.isRequired).toBe(true);
        expect(field.options.immutable).toBe(true);
    });

    test("branchId is required and immutable", () => {
        const field = schema.path("branchId");
        expect(field.isRequired).toBe(true);
        expect(field.options.immutable).toBe(true);
    });

    test("referenceType is required with correct enum", () => {
        const field = schema.path("referenceType");
        expect(field.isRequired).toBe(true);
        expect(field.options.immutable).toBe(true);
        expect(field.enumValues).toEqual(
            expect.arrayContaining(["invoice", "payment", "refund", "void", "wallet_credit"])
        );
    });

    test("referenceId is required and immutable", () => {
        const field = schema.path("referenceId");
        expect(field.isRequired).toBe(true);
        expect(field.options.immutable).toBe(true);
    });

    test("totalDebit and totalCredit are required and immutable", () => {
        expect(schema.path("totalDebit").isRequired).toBe(true);
        expect(schema.path("totalDebit").options.immutable).toBe(true);
        expect(schema.path("totalCredit").isRequired).toBe(true);
        expect(schema.path("totalCredit").options.immutable).toBe(true);
    });

    test("totalDebitMinor and totalCreditMinor are required and immutable", () => {
        expect(schema.path("totalDebitMinor").isRequired).toBe(true);
        expect(schema.path("totalDebitMinor").options.immutable).toBe(true);
        expect(schema.path("totalCreditMinor").isRequired).toBe(true);
        expect(schema.path("totalCreditMinor").options.immutable).toBe(true);
    });

    test("currency is required and immutable", () => {
        const field = schema.path("currency");
        expect(field.isRequired).toBe(true);
        expect(field.options.immutable).toBe(true);
        expect(field.defaultValue).toBe("AED");
    });

    test("status is immutable with only 'posted' value", () => {
        const field = schema.path("status");
        expect(field.enumValues).toEqual(["posted"]);
        expect(field.options.immutable).toBe(true);
        expect(field.defaultValue).toBe("posted");
    });

    test("entries is required array", () => {
        expect(schema.path("entries")).toBeDefined();
    });

    test("has organizationId index", () => {
        const indexes = schema.indexes();
        const orgIndexes = indexes.filter(([fields]) => fields.organizationId === 1);
        expect(orgIndexes.length).toBeGreaterThanOrEqual(1);
    });
});

// ─── 2. Balance Validation ──────────────────────────────────────────────────

describe("JournalEntry — Balance Validation", () => {
    const JournalEntry = require("../modules/billingDomain/models/JournalEntry.model").default;
    const mongoose = require("mongoose");

    const validBase = {
        organizationId: new mongoose.Types.ObjectId(),
        branchId: new mongoose.Types.ObjectId(),
        patientId: new mongoose.Types.ObjectId(),
        referenceType: "invoice",
        referenceId: new mongoose.Types.ObjectId(),
        currency: "AED",
    };

    test("balanced entry passes validation", async () => {
        const entry = new JournalEntry({
            ...validBase,
            entries: [
                { account: "accounts_receivable", type: "debit", amount: 100, amountMinor: 10000 },
                { account: "revenue", type: "credit", amount: 100, amountMinor: 10000 },
            ],
            totalDebit: 100,
            totalDebitMinor: 10000,
            totalCredit: 100,
            totalCreditMinor: 10000,
        });
        await expect(entry.validate()).resolves.toBeUndefined();
    });

    test("unbalanced entry fails validation", async () => {
        const entry = new JournalEntry({
            ...validBase,
            entries: [
                { account: "accounts_receivable", type: "debit", amount: 100, amountMinor: 10000 },
                { account: "revenue", type: "credit", amount: 50, amountMinor: 5000 },
            ],
            totalDebit: 100,
            totalDebitMinor: 10000,
            totalCredit: 50,
            totalCreditMinor: 5000,
        });
        await expect(entry.validate()).rejects.toThrow("unbalanced");
    });

    test("single-line entry fails validation (minimum 2 lines)", async () => {
        const entry = new JournalEntry({
            ...validBase,
            entries: [
                { account: "cash", type: "debit", amount: 50, amountMinor: 5000 },
            ],
            totalDebit: 50,
            totalDebitMinor: 5000,
            totalCredit: 0,
            totalCreditMinor: 0,
        });
        await expect(entry.validate()).rejects.toThrow();
    });
});

// ─── 3. Immutability Guards ─────────────────────────────────────────────────

describe("JournalEntry — Immutability Guards", () => {
    const JournalEntry = require("../modules/billingDomain/models/JournalEntry.model").default;

    test("updateOne throws immutability error", async () => {
        await expect(
            JournalEntry.updateOne({}, { $set: { status: "reversed" } })
        ).rejects.toThrow("immutable");
    });

    test("deleteOne throws immutability error", async () => {
        await expect(
            JournalEntry.deleteOne({})
        ).rejects.toThrow("immutable");
    });

    test("findOneAndUpdate throws immutability error", async () => {
        await expect(
            JournalEntry.findOneAndUpdate({}, { $set: { totalDebit: 0 } })
        ).rejects.toThrow("immutable");
    });
});

// ─── 4. Journal Service — Export Contract ───────────────────────────────────

describe("Journal Service — Contract", () => {
    const journalService = require("../modules/billingDomain/services/journal.service");

    test("exports postJournalEntry", () => {
        expect(typeof journalService.postJournalEntry).toBe("function");
    });

    test("exports recordInvoiceEntry", () => {
        expect(typeof journalService.recordInvoiceEntry).toBe("function");
    });

    test("exports recordPaymentEntry", () => {
        expect(typeof journalService.recordPaymentEntry).toBe("function");
    });

    test("exports recordVoidEntry", () => {
        expect(typeof journalService.recordVoidEntry).toBe("function");
    });

    test("exports recordRefundEntry", () => {
        expect(typeof journalService.recordRefundEntry).toBe("function");
    });
});

// ─── 5. Accounts Constants ──────────────────────────────────────────────────

describe("Accounts Constants — Integrity", () => {
    const { ACCOUNTS, ACCOUNT_META } = require("../modules/billingDomain/constants/accounts");

    test("ACCOUNTS object is frozen", () => {
        expect(Object.isFrozen(ACCOUNTS)).toBe(true);
    });

    test("ACCOUNT_META object is frozen", () => {
        expect(Object.isFrozen(ACCOUNT_META)).toBe(true);
    });

    test("every ACCOUNTS entry has metadata", () => {
        for (const account of Object.values(ACCOUNTS)) {
            expect(ACCOUNT_META[account]).toBeDefined();
            expect(ACCOUNT_META[account].type).toBeDefined();
            expect(ACCOUNT_META[account].normalBalance).toBeDefined();
            expect(ACCOUNT_META[account].label).toBeDefined();
        }
    });

    test("normalBalance is either debit or credit", () => {
        for (const meta of Object.values(ACCOUNT_META)) {
            expect(["debit", "credit"]).toContain(meta.normalBalance);
        }
    });

    test("mandatory accounts exist", () => {
        expect(ACCOUNTS.ACCOUNTS_RECEIVABLE).toBe("accounts_receivable");
        expect(ACCOUNTS.CASH).toBe("cash");
        expect(ACCOUNTS.REVENUE).toBe("revenue");
        expect(ACCOUNTS.REFUNDS).toBe("refunds");
    });
});

// ─── 6. RBAC & PBAC ────────────────────────────────────────────────────────

describe("Ledger RBAC Permissions", () => {
    const { P, ORG_ROLE_PERMISSIONS } = require("../rbac/orgPermissions");

    test("ledger.read permission exists", () => {
        expect(P.LEDGER_READ).toBe("ledger.read");
    });

    test("org_admin has LEDGER_READ", () => {
        expect(ORG_ROLE_PERMISSIONS.org_admin).toContain(P.LEDGER_READ);
    });

    test("doctor does NOT have LEDGER_READ", () => {
        expect(ORG_ROLE_PERMISSIONS.doctor).not.toContain(P.LEDGER_READ);
    });

    test("receptionist does NOT have LEDGER_READ", () => {
        expect(ORG_ROLE_PERMISSIONS.receptionist).not.toContain(P.LEDGER_READ);
    });
});

describe("Ledger PBAC Policy", () => {
    const { policies } = require("../rbac/policyRegistry");
    const { P } = require("../rbac/orgPermissions");

    test("LEDGER_READ has PBAC policy defined", () => {
        expect(policies[P.LEDGER_READ]).toBeDefined();
        expect(policies[P.LEDGER_READ].length).toBeGreaterThanOrEqual(1);
    });
});

// ─── 7. Domain Events ──────────────────────────────────────────────────────

describe("Ledger Domain Events", () => {
    const domainEvents = require("../core/domainEvents");

    test("LEDGER_ENTRY_POSTED event is defined", () => {
        expect(domainEvents.LEDGER_ENTRY_POSTED).toBe("ledger.entry.posted");
    });
});
