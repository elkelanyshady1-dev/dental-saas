/**
 * ledger.immutability.test.js — Phase 3 lock test
 *
 * Locks the FinancialLedger "write-once" invariant. Every mutation path MUST
 * throw LEDGER_IMMUTABLE and increment the dental_saas_ledger_immutable_violation_total
 * counter. `create()` and `insertMany()` are the ONLY legal writes.
 */

"use strict";

const mongoose = require("mongoose");
const FinancialLedger = require("@modules/billingDomain/organizationFinance/models/FinancialLedger.model").default;
const { register } = require("@infra/metrics/metrics");

async function violationValue() {
    const m = await register.getSingleMetric("dental_saas_ledger_immutable_violation_total").get();
    return (m.values || []).reduce((sum, v) => sum + (v.value || 0), 0);
}

function seedDoc() {
    return {
        organizationId: new mongoose.Types.ObjectId(),
        patientId: new mongoose.Types.ObjectId(),
        type: "DEBIT",
        amount: 1000,
        amountMinor: 100000,
        currency: "AED",
        referenceId: new mongoose.Types.ObjectId(),
        branchId: new mongoose.Types.ObjectId(),
        performedByUserId: new mongoose.Types.ObjectId(),
    };
}

describe("FinancialLedger — immutability (Phase 1 C1 / E10)", () => {
    let seeded;

    beforeEach(async () => {
        // Ledger's raw collection.deleteMany is trapped; use the preserved
        // pre-wrap handle exposed for exactly this case.
        const raw = FinancialLedger.collection.__ledgerImmutableRaw;
        if (raw && raw.deleteMany) {
            await raw.deleteMany({});
        }
        seeded = await FinancialLedger.create(seedDoc());
    });

    test("create() is permitted and persists the row", async () => {
        expect(seeded._id).toBeDefined();
        const found = await FinancialLedger.findById(seeded._id).lean();
        expect(found).not.toBeNull();
        expect(found.amount).toBe(1000);
    });

    test("updateOne via Model throws LEDGER_IMMUTABLE and increments metric", async () => {
        const before = await violationValue();
        await expect(
            FinancialLedger.updateOne({ _id: seeded._id }, { $set: { amount: 9999 } })
        ).rejects.toThrow(/LEDGER_IMMUTABLE/);
        const after = await violationValue();
        expect(after).toBeGreaterThan(before);
    });

    test("findOneAndUpdate throws LEDGER_IMMUTABLE", async () => {
        await expect(
            FinancialLedger.findOneAndUpdate({ _id: seeded._id }, { $set: { amount: 1 } })
        ).rejects.toThrow(/LEDGER_IMMUTABLE/);
    });

    test("deleteOne throws LEDGER_IMMUTABLE", async () => {
        await expect(
            FinancialLedger.deleteOne({ _id: seeded._id })
        ).rejects.toThrow(/LEDGER_IMMUTABLE/);
    });

    test("bulkWrite static is replaced with a throwing stub", async () => {
        expect(() => FinancialLedger.bulkWrite([{ updateOne: { filter: {}, update: {} } }]))
            .toThrow(/LEDGER_IMMUTABLE/);
    });

    test("document.save() after load is blocked", async () => {
        const doc = await FinancialLedger.findById(seeded._id);
        doc.amount = 42;
        await expect(doc.save()).rejects.toThrow(/LEDGER_IMMUTABLE/);
    });

    test("raw collection.updateOne is trapped (sync throw)", () => {
        // The raw wrapper throws synchronously — `expect().toThrow` is the
        // right assertion, not `.rejects.toThrow`.
        expect(() =>
            FinancialLedger.collection.updateOne({ _id: seeded._id }, { $set: { amount: 1 } })
        ).toThrow(/LEDGER_IMMUTABLE/);
    });

    // ── Full BLOCKED_QUERY_OPS coverage ──────────────────────────────
    //
    // The hand-written cases above cover updateOne, findOneAndUpdate,
    // deleteOne, bulkWrite, save. This loop asserts EVERY op listed in
    // the model's `BLOCKED_QUERY_OPS` array is blocked — catches a
    // regression where someone weakens a single op (e.g. drops the
    // pre-hook on `updateMany` or `findOneAndDelete`) while leaving the
    // hand-written cases green.
    describe("every mutation op in BLOCKED_QUERY_OPS is blocked", () => {
        test.each([
            ["updateOne",         () => FinancialLedger.updateOne({ _id: seeded._id }, { $set: { amount: 1 } })],
            ["updateMany",        () => FinancialLedger.updateMany({ type: "DEBIT" }, { $set: { amount: 1 } })],
            ["findOneAndUpdate",  () => FinancialLedger.findOneAndUpdate({ _id: seeded._id }, { $set: { amount: 1 } })],
            ["findOneAndReplace", () => FinancialLedger.findOneAndReplace({ _id: seeded._id }, seedDoc())],
            ["findOneAndDelete",  () => FinancialLedger.findOneAndDelete({ _id: seeded._id })],
            ["replaceOne",        () => FinancialLedger.replaceOne({ _id: seeded._id }, seedDoc())],
            ["deleteOne",         () => FinancialLedger.deleteOne({ _id: seeded._id })],
            ["deleteMany",        () => FinancialLedger.deleteMany({ type: "DEBIT" })],
        ])("%s → LEDGER_IMMUTABLE", async (_op, invoke) => {
            await expect(invoke()).rejects.toThrow(/LEDGER_IMMUTABLE/);
            // And the doc is still there — no partial mutation leaked through.
            const reloaded = await FinancialLedger.findById(seeded._id).lean();
            expect(reloaded).not.toBeNull();
            expect(reloaded.amount).toBe(1000);
        });
    });

    // ── insertMany stays legal (append-only is the whole point) ──────
    test("insertMany is permitted — ledger is append-only, not write-forbidden", async () => {
        const before = await FinancialLedger.countDocuments({});
        await FinancialLedger.insertMany([seedDoc(), seedDoc()]);
        const after = await FinancialLedger.countDocuments({});
        expect(after - before).toBe(2);
    });

    // ── Metric is incremented per violation, not per test file ───────
    //
    // Locks the observability guarantee from §E17: every LEDGER_IMMUTABLE
    // throw MUST bump the counter. A bug where one op silently fails to
    // increment would hide security-alert-worthy events from the dashboard.
    test("every mutation attempt increments the violation metric", async () => {
        const before = await violationValue();
        await expect(
            FinancialLedger.updateOne({ _id: seeded._id }, { $set: { amount: 1 } })
        ).rejects.toThrow(/LEDGER_IMMUTABLE/);
        await expect(
            FinancialLedger.deleteMany({ type: "DEBIT" })
        ).rejects.toThrow(/LEDGER_IMMUTABLE/);
        expect(() => FinancialLedger.bulkWrite([{ updateOne: { filter: {}, update: {} } }]))
            .toThrow(/LEDGER_IMMUTABLE/);
        const after = await violationValue();
        // 3 attempts, 3 increments — no silent drops.
        expect(after - before).toBeGreaterThanOrEqual(3);
    });
});
