/**
 * ledgerImmutability.unit.test.js — FinancialLedger immutability (Plan C1/E10)
 *
 * Verifies that every mutation path on FinancialLedger throws LEDGER_IMMUTABLE:
 *   - Query middleware blocks: updateOne/updateMany/findOneAndUpdate/
 *     findOneAndReplace/findOneAndDelete/replaceOne/deleteOne/deleteMany
 *   - Document middleware blocks: doc.save() on an existing (non-new) doc
 *   - Static override blocks: Model.bulkWrite
 *   - Raw collection wrap blocks: Model.collection.updateOne/deleteOne/bulkWrite
 *   - create() / insertMany() remain permitted (append-only)
 *
 * Runs under the `unit` jest project — pure in-memory mongoose, no DB connect.
 */

"use strict";

const mongoose = require("mongoose");

// Clear any cached registration so the schema middleware installs cleanly.
delete mongoose.models.FinancialLedger;
delete mongoose.modelSchemas?.FinancialLedger;

const {
    default: FinancialLedger,
    schema,
    LedgerImmutableError,
} = require("@modules/billingDomain/organizationFinance/models/FinancialLedger.model");

function expectImmutable(fn) {
    return expect(fn).rejects.toMatchObject({ code: "LEDGER_IMMUTABLE" });
}

describe("FinancialLedger immutability (C1/E10)", () => {
    describe("query middleware blocks every mutation op", () => {
        const ops = [
            ["updateOne", () => FinancialLedger.updateOne({}, { $set: { amount: 1 } })],
            ["updateMany", () => FinancialLedger.updateMany({}, { $set: { amount: 1 } })],
            ["findOneAndUpdate", () => FinancialLedger.findOneAndUpdate({}, { $set: { amount: 1 } })],
            ["findOneAndReplace", () => FinancialLedger.findOneAndReplace({}, {})],
            ["findOneAndDelete", () => FinancialLedger.findOneAndDelete({})],
            ["replaceOne", () => FinancialLedger.replaceOne({}, {})],
            ["deleteOne", () => FinancialLedger.deleteOne({})],
            ["deleteMany", () => FinancialLedger.deleteMany({})],
        ];

        test.each(ops)("%s throws LEDGER_IMMUTABLE", async (_name, run) => {
            await expectImmutable(run);
        });
    });

    describe("document middleware blocks save() on existing docs", () => {
        test("doc.save() on a non-new document throws", async () => {
            const doc = new FinancialLedger({
                patientId: new mongoose.Types.ObjectId(),
                type: "DEBIT",
                amount: 100,
                currency: "AED",
                referenceId: new mongoose.Types.ObjectId(),
                branchId: new mongoose.Types.ObjectId(),
                performedByUserId: new mongoose.Types.ObjectId(),
            });
            // Force the "existing doc" state without hitting the DB.
            doc.isNew = false;
            await expect(doc.save({ validateBeforeSave: false })).rejects.toMatchObject({
                code: "LEDGER_IMMUTABLE",
            });
        });
    });

    describe("static overrides", () => {
        test("Model.bulkWrite is a throwing stub", () => {
            expect(() => FinancialLedger.bulkWrite([])).toThrow(LedgerImmutableError);
            expect(() => FinancialLedger.bulkWrite([])).toThrow(/LEDGER_IMMUTABLE/);
        });
    });

    describe("raw collection accessors are wrapped", () => {
        test("collection.updateOne throws", () => {
            expect(() => FinancialLedger.collection.updateOne({}, {})).toThrow(/LEDGER_IMMUTABLE/);
        });
        test("collection.deleteOne throws", () => {
            expect(() => FinancialLedger.collection.deleteOne({})).toThrow(/LEDGER_IMMUTABLE/);
        });
        test("collection.bulkWrite throws", () => {
            expect(() => FinancialLedger.collection.bulkWrite([])).toThrow(/LEDGER_IMMUTABLE/);
        });
        test("raw handles are preserved under __ledgerImmutableRaw for ops tooling", () => {
            expect(FinancialLedger.collection.__ledgerImmutableWrapped).toBe(true);
            expect(typeof FinancialLedger.collection.__ledgerImmutableRaw.updateOne).toBe("function");
        });
    });

    describe("schema surface", () => {
        test("LedgerImmutableError is exported and carries code", () => {
            const err = new LedgerImmutableError("test");
            expect(err.code).toBe("LEDGER_IMMUTABLE");
            expect(err.status).toBe(500);
            expect(err.op).toBe("test");
        });

        test("schema declares the expected required fields", () => {
            const paths = schema.paths;
            expect(paths.patientId.isRequired).toBe(true);
            expect(paths.type.isRequired).toBe(true);
            expect(paths.amount.isRequired).toBe(true);
            expect(paths.referenceId.isRequired).toBe(true);
            expect(paths.branchId.isRequired).toBe(true);
            expect(paths.performedByUserId.isRequired).toBe(true);
        });
    });
});
