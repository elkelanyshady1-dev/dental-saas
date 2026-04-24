/**
 * journal.service.e2e.test.js — Phase 3 C4 lock test
 *
 * Locks the "createInvoice → journal → ledger debit==credit" end-to-end
 * invariant the plan calls out. The orchestrator (`ledger.orchestrator.service`)
 * wraps this with audit logs, outbox events, and operational-ledger rows —
 * none of which affect the core double-entry guarantee. That guarantee
 * lives in `journal.service` and is the thing a regression would quietly
 * break.
 *
 * Scope:
 *   - Session requirement (no transaction → fail-fast)
 *   - Balance invariant (DR === CR, rejected on mismatch)
 *   - Invoice entry factory persists DR AR / CR Revenue with equal legs
 *   - Payment entry factory persists DR Cash / CR AR with equal legs
 *   - Void entry factory reverses invoice with DR Revenue / CR AR
 *   - Idempotency: same (referenceType, referenceId) never creates a duplicate
 *   - Rollback: thrown error inside `withTransaction` aborts the journal insert
 *
 * This test drives `journal.service` with `mongoose.connection` as the
 * "per-org" connection — the same shape the orchestrator passes in prod.
 */

"use strict";

// Suppress the async LEDGER_ENTRY_POSTED emit that fires via setImmediate
// after every successful journal write. The event type is not registered in
// schemaRegistry for the test harness, and its throw inside setImmediate
// would surface as an uncaught exception. This test is about journal
// persistence invariants, not event wiring.
jest.mock("@core/eventBus", () => ({
    emit: jest.fn(),
    on: jest.fn(),
}));

const mongoose = require("mongoose");
const journalService = require("@modules/billingDomain/services/journal.service");
const JournalEntryDef = require("@modules/billingDomain/models/JournalEntry.model");
const getModel = require("@core/db/getModel");
const { ACCOUNTS } = require("@modules/billingDomain/constants/accounts");

// Resolve the JournalEntry model on the default test connection the same way
// the orchestrator does: via `getModel(connection, def)`. This guarantees the
// schema + indexes used by the test match the ones production runs on.
function journalModel() {
    return getModel(mongoose.connection, JournalEntryDef);
}

function seedInvoice(overrides = {}) {
    return {
        _id: new mongoose.Types.ObjectId(),
        organizationId: new mongoose.Types.ObjectId(),
        branchId: new mongoose.Types.ObjectId(),
        patientId: new mongoose.Types.ObjectId(),
        totalAmount: 250,
        totalAmountMinor: 25000,
        currency: "AED",
        issuedByUserId: new mongoose.Types.ObjectId(),
        ...overrides,
    };
}

function seedPayment(invoice, overrides = {}) {
    return {
        _id: new mongoose.Types.ObjectId(),
        organizationId: invoice.organizationId,
        branchId: invoice.branchId,
        patientId: invoice.patientId,
        amount: 100,
        amountMinor: 10000,
        currency: "AED",
        paymentMethod: "cash",
        collectedByUserId: new mongoose.Types.ObjectId(),
        ...overrides,
    };
}

async function withSession(fn) {
    const session = await mongoose.connection.startSession();
    try {
        let result;
        await session.withTransaction(async () => {
            result = await fn(session);
        });
        return result;
    } finally {
        session.endSession();
    }
}

describe("journal.service — invoice → journal → ledger end-to-end (Phase 3 C4)", () => {
    beforeEach(async () => {
        // Clean the JournalEntry collection between tests. The JournalEntry
        // model's immutability guards block `deleteMany` via Mongoose, so
        // drop raw through the native collection handle.
        const JournalEntry = journalModel();
        try {
            await JournalEntry.collection.deleteMany({});
        } catch {
            /* collection may not exist on first run */
        }
    });

    // ── Session requirement ─────────────────────────────────────────

    test("postJournalEntry without a session → fail-fast", async () => {
        const invoice = seedInvoice();
        await expect(
            journalService.postJournalEntry({
                organizationId: invoice.organizationId,
                branchId: invoice.branchId,
                patientId: invoice.patientId,
                referenceType: "invoice",
                referenceId: invoice._id,
                entries: [
                    { account: ACCOUNTS.ACCOUNTS_RECEIVABLE, type: "debit", amount: 250, amountMinor: 25000 },
                    { account: ACCOUNTS.REVENUE, type: "credit", amount: 250, amountMinor: 25000 },
                ],
                currency: "AED",
                // session intentionally missing
                connection: mongoose.connection,
            })
        ).rejects.toThrow(/session is REQUIRED/);
    });

    // ── Balance invariant (fail-fast) ───────────────────────────────

    test("unbalanced DR≠CR rejected BEFORE touching the DB", async () => {
        const invoice = seedInvoice();
        const JournalEntry = journalModel();
        const before = await JournalEntry.countDocuments({});

        await expect(
            withSession((session) =>
                journalService.postJournalEntry({
                    organizationId: invoice.organizationId,
                    branchId: invoice.branchId,
                    patientId: invoice.patientId,
                    referenceType: "invoice",
                    referenceId: invoice._id,
                    entries: [
                        { account: ACCOUNTS.ACCOUNTS_RECEIVABLE, type: "debit", amount: 250, amountMinor: 25000 },
                        { account: ACCOUNTS.REVENUE, type: "credit", amount: 240, amountMinor: 24000 }, // ← off by 1000 minor
                    ],
                    currency: "AED",
                    session,
                    connection: mongoose.connection,
                })
            )
        ).rejects.toThrow(/balance violation/i);

        // No row was persisted — the balance check is pre-DB.
        const after = await JournalEntry.countDocuments({});
        expect(after).toBe(before);
    });

    // ── Happy path: invoice entry ────────────────────────────────────

    test("recordInvoiceEntry persists DR AR / CR Revenue with equal legs", async () => {
        const invoice = seedInvoice({ totalAmount: 500, totalAmountMinor: 50000 });

        const created = await withSession((session) =>
            journalService.recordInvoiceEntry(invoice, session, mongoose.connection)
        );

        expect(created).toBeDefined();
        expect(created._id).toBeDefined();
        expect(String(created.referenceType)).toBe("invoice");
        expect(String(created.referenceId)).toBe(String(invoice._id));

        // Sum the lines ourselves from the persisted doc and assert the
        // double-entry invariant: total debits === total credits === invoice total.
        let drMinor = 0;
        let crMinor = 0;
        for (const line of created.entries) {
            if (line.type === "debit") drMinor += line.amountMinor;
            else crMinor += line.amountMinor;
        }
        expect(drMinor).toBe(crMinor);
        expect(drMinor).toBe(invoice.totalAmountMinor);

        // Account choices are load-bearing: AR and Revenue, nothing else.
        const accounts = created.entries.map((e) => `${e.type}:${e.account}`).sort();
        expect(accounts).toEqual([
            `credit:${ACCOUNTS.REVENUE}`,
            `debit:${ACCOUNTS.ACCOUNTS_RECEIVABLE}`,
        ]);
    });

    // ── Happy path: payment entry ────────────────────────────────────

    test("recordPaymentEntry persists DR Cash / CR AR with equal legs", async () => {
        const invoice = seedInvoice();
        const payment = seedPayment(invoice, { amount: 175, amountMinor: 17500 });

        const created = await withSession((session) =>
            journalService.recordPaymentEntry(payment, session, mongoose.connection)
        );

        expect(String(created.referenceType)).toBe("payment");
        expect(String(created.referenceId)).toBe(String(payment._id));

        let drMinor = 0;
        let crMinor = 0;
        for (const line of created.entries) {
            if (line.type === "debit") drMinor += line.amountMinor;
            else crMinor += line.amountMinor;
        }
        expect(drMinor).toBe(crMinor);
        expect(drMinor).toBe(payment.amountMinor);

        const accounts = created.entries.map((e) => `${e.type}:${e.account}`).sort();
        expect(accounts).toEqual([
            `credit:${ACCOUNTS.ACCOUNTS_RECEIVABLE}`,
            `debit:${ACCOUNTS.CASH}`,
        ]);
    });

    // ── Void reverses invoice ────────────────────────────────────────

    test("recordVoidEntry reverses invoice with DR Revenue / CR AR (balanced)", async () => {
        const invoice = seedInvoice({ totalAmount: 300, totalAmountMinor: 30000 });

        // Post the invoice entry first so the void has something to reverse.
        await withSession((session) =>
            journalService.recordInvoiceEntry(invoice, session, mongoose.connection)
        );

        const voidEntry = await withSession((session) =>
            journalService.recordVoidEntry(
                invoice,
                new mongoose.Types.ObjectId(),
                session,
                mongoose.connection
            )
        );

        expect(String(voidEntry.referenceType)).toBe("void");
        expect(String(voidEntry.referenceId)).toBe(String(invoice._id));

        // Void is the exact mirror of the invoice entry: DR Revenue / CR AR.
        const accounts = voidEntry.entries.map((e) => `${e.type}:${e.account}`).sort();
        expect(accounts).toEqual([
            `credit:${ACCOUNTS.ACCOUNTS_RECEIVABLE}`,
            `debit:${ACCOUNTS.REVENUE}`,
        ]);

        let drMinor = 0;
        let crMinor = 0;
        for (const line of voidEntry.entries) {
            if (line.type === "debit") drMinor += line.amountMinor;
            else crMinor += line.amountMinor;
        }
        expect(drMinor).toBe(crMinor);
        expect(drMinor).toBe(invoice.totalAmountMinor);

        // Both entries now exist for this invoice — one "invoice" ref,
        // one "void" ref. They share the same referenceId but differ
        // by referenceType, which is exactly what the unique index
        // `{referenceType, referenceId}` permits.
        const JournalEntry = journalModel();
        const rows = await JournalEntry.find({ referenceId: invoice._id }).lean();
        const types = rows.map((r) => r.referenceType).sort();
        expect(types).toEqual(["invoice", "void"]);
    });

    // ── Idempotency via the in-service guard ────────────────────────

    test("idempotency: second recordInvoiceEntry for same invoice returns existing, no duplicate", async () => {
        const invoice = seedInvoice();
        const JournalEntry = journalModel();

        const first = await withSession((session) =>
            journalService.recordInvoiceEntry(invoice, session, mongoose.connection)
        );

        const second = await withSession((session) =>
            journalService.recordInvoiceEntry(invoice, session, mongoose.connection)
        );

        // The guard returns the existing entry — same _id — rather than creating a second.
        expect(String(second._id)).toBe(String(first._id));

        const count = await JournalEntry.countDocuments({
            referenceType: "invoice",
            referenceId: invoice._id,
        });
        expect(count).toBe(1);
    });

    // ── Transaction rollback integrity ──────────────────────────────

    test("rollback: a thrown error after recordInvoiceEntry aborts the journal insert", async () => {
        const invoice = seedInvoice();
        const JournalEntry = journalModel();

        const session = await mongoose.connection.startSession();
        try {
            await expect(
                session.withTransaction(async () => {
                    await journalService.recordInvoiceEntry(invoice, session, mongoose.connection);
                    // Simulate a downstream failure (e.g. audit-log insert) —
                    // the journal insert from the previous line MUST roll back
                    // with the transaction.
                    throw new Error("FORCED_DOWNSTREAM_FAILURE");
                })
            ).rejects.toThrow("FORCED_DOWNSTREAM_FAILURE");
        } finally {
            session.endSession();
        }

        const rows = await JournalEntry.find({ referenceId: invoice._id }).lean();
        expect(rows.length).toBe(0);
    });

    // ── Idempotency payload-mismatch ────────────────────────────────
    //
    // A retry (or bug/attack) that passes the SAME (referenceType,
    // referenceId) but a DIFFERENT amount must NOT silently mutate the
    // existing journal entry. The guard returns the original unchanged.

    test("idempotency: same reference with different payload preserves the original entry", async () => {
        const invoice = seedInvoice({ totalAmount: 100, totalAmountMinor: 10000 });
        const JournalEntry = journalModel();

        const first = await withSession((session) =>
            journalService.recordInvoiceEntry(invoice, session, mongoose.connection)
        );

        // Second call uses the same _id but a mutated amount — simulates a
        // corrupted retry or an attacker replaying with a different value.
        const mutated = { ...invoice, totalAmount: 999, totalAmountMinor: 99900 };
        const second = await withSession((session) =>
            journalService.recordInvoiceEntry(mutated, session, mongoose.connection)
        );

        // The guard returned the ORIGINAL, not the mutated payload.
        expect(String(second._id)).toBe(String(first._id));

        // Re-read from DB — amount MUST be the original 10000, not 99900.
        const persisted = await JournalEntry.findById(first._id).lean();
        expect(persisted.totalDebitMinor).toBe(10000);
        expect(persisted.totalCreditMinor).toBe(10000);

        // Still exactly 1 row — no silent duplicate.
        const count = await JournalEntry.countDocuments({
            referenceType: "invoice",
            referenceId: invoice._id,
        });
        expect(count).toBe(1);
    });

    // ── Net-zero reversal invariant ─────────────────────────────────
    //
    // The strongest accounting invariant: after an invoice is voided,
    // the NET balance across all journal entries for that referenceId
    // MUST be exactly zero. Any non-zero residual means money appears
    // or vanishes from the ledger — a catastrophic accounting bug.

    test("invoice + void = net zero across all journal entries", async () => {
        const invoice = seedInvoice({ totalAmount: 750, totalAmountMinor: 75000 });
        const JournalEntry = journalModel();

        await withSession((session) =>
            journalService.recordInvoiceEntry(invoice, session, mongoose.connection)
        );

        await withSession((session) =>
            journalService.recordVoidEntry(
                invoice,
                new mongoose.Types.ObjectId(),
                session,
                mongoose.connection
            )
        );

        // Sum ALL debit and credit minor amounts across both entries.
        const rows = await JournalEntry.find({ referenceId: invoice._id }).lean();
        expect(rows.length).toBe(2);

        let totalDrMinor = 0;
        let totalCrMinor = 0;
        for (const row of rows) {
            for (const line of row.entries) {
                if (line.type === "debit") totalDrMinor += line.amountMinor;
                else totalCrMinor += line.amountMinor;
            }
        }

        // Net zero: total debits across invoice+void === total credits.
        expect(totalDrMinor).toBe(totalCrMinor);

        // And the per-account breakdown confirms the reversal is symmetric:
        // Invoice:  DR AR 75000  / CR Revenue 75000
        // Void:     DR Revenue 75000 / CR AR 75000
        // Net AR: 75000 - 75000 = 0.  Net Revenue: 75000 - 75000 = 0.
        const accountNet = {};
        for (const row of rows) {
            for (const line of row.entries) {
                const key = line.account;
                if (!accountNet[key]) accountNet[key] = 0;
                accountNet[key] += line.type === "debit" ? line.amountMinor : -line.amountMinor;
            }
        }
        // Every account must net to zero after the reversal.
        for (const [account, net] of Object.entries(accountNet)) {
            expect(net).toBe(0);
        }
    });

    // ── Idempotency + concurrency combined ──────────────────────────
    //
    // Two parallel calls with the SAME (referenceType, referenceId) must
    // BOTH resolve successfully — one creates, the other hits the
    // idempotency guard or the unique-index fallback and returns the
    // existing entry. Neither should 409 or throw a write conflict.

    test("concurrent identical invoice entries resolve without conflict (idempotent race)", async () => {
        const invoice = seedInvoice({ totalAmount: 200, totalAmountMinor: 20000 });
        const JournalEntry = journalModel();

        const [resA, resB] = await Promise.allSettled([
            withSession((session) =>
                journalService.recordInvoiceEntry(invoice, session, mongoose.connection)
            ),
            withSession((session) =>
                journalService.recordInvoiceEntry(invoice, session, mongoose.connection)
            ),
        ]);

        // Both must fulfill — no rejections, no 409s, no write conflicts.
        const fulfilled = [resA, resB].filter((r) => r.status === "fulfilled");
        expect(fulfilled.length).toBe(2);

        // Both return the same _id — the loser hit the idempotency guard
        // (or the E11000 unique-index fallback) and returned the existing doc.
        const idA = String(fulfilled[0].value._id);
        const idB = String(fulfilled[1].value._id);
        expect(idA).toBe(idB);

        // Exactly one row in the DB.
        const count = await JournalEntry.countDocuments({
            referenceType: "invoice",
            referenceId: invoice._id,
        });
        expect(count).toBe(1);
    });
});
