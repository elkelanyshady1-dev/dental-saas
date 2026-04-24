/**
 * payment.concurrency.test.js — Phase 3 lock test (C3 / E16)
 *
 * Locks the optimistic-concurrency primitive that backs every invoice/payment
 * mutation path. Two parallel writers loaded against the SAME `version` can
 * both read successfully, but only one `findOneAndUpdate({_id, version})`
 * with `$inc:{version:1}` may win; the loser MUST observe a null result
 * which the route layer maps to HTTP 409 VERSION_CONFLICT.
 *
 * This is the integration-level guarantee behind the payment 409 retry UX.
 * It does NOT require the full orchestrator stack — locking the primitive
 * here is what prevents the class of "lost update" bugs across every
 * downstream caller.
 */

"use strict";

const mongoose = require("mongoose");
const PatientInvoice = require("@modules/billingDomain/organizationFinance/models/PatientInvoice.model").default;
const { register } = require("@infra/metrics/metrics");

function seed() {
    return {
        organizationId: new mongoose.Types.ObjectId(),
        branchId: new mongoose.Types.ObjectId(),
        patientId: new mongoose.Types.ObjectId(),
        treatments: [
            { procedureName: "consult", unitPrice: 100, quantity: 1, subtotal: 100 },
        ],
        subtotal: 100,
        totalAmount: 100,
        subtotalMinor: 10000,
        totalAmountMinor: 10000,
        currency: "AED",
        status: "issued",
        regionCode: "MEA",
        version: 0,
    };
}

async function conflictCountValue() {
    const m = await register
        .getSingleMetric("dental_saas_billing_payment_conflicts_total")
        .get();
    return (m.values || []).reduce((sum, v) => sum + (v.value || 0), 0);
}

describe("Payment optimistic concurrency (Phase 3 C3 / E16)", () => {
    test("two parallel updates against version=0 → exactly one wins", async () => {
        const invoice = await PatientInvoice.create(seed());

        // Both writers see version=0 and attempt to advance to version=1.
        // Only one of them finds a matching document; the other gets null.
        const writer = async (newStatus) =>
            PatientInvoice.findOneAndUpdate(
                { _id: invoice._id, version: 0 },
                { $set: { status: newStatus }, $inc: { version: 1 } },
                { new: true }
            );

        const [a, b] = await Promise.all([
            writer("partially_paid"),
            writer("partially_paid"),
        ]);

        const winners = [a, b].filter(Boolean);
        const losers = [a, b].filter((x) => x === null);
        expect(winners).toHaveLength(1);
        expect(losers).toHaveLength(1);

        const reloaded = await PatientInvoice.findById(invoice._id).lean();
        expect(reloaded.version).toBe(1);
    });

    test("sequential retry after conflict succeeds against the fresh version", async () => {
        const invoice = await PatientInvoice.create(seed());

        const first = await PatientInvoice.findOneAndUpdate(
            { _id: invoice._id, version: 0 },
            { $inc: { version: 1 }, $set: { status: "partially_paid" } },
            { new: true }
        );
        expect(first).toBeTruthy();

        // Stale version — conflict
        const stale = await PatientInvoice.findOneAndUpdate(
            { _id: invoice._id, version: 0 },
            { $inc: { version: 1 }, $set: { status: "paid" } },
            { new: true }
        );
        expect(stale).toBeNull();

        // Retry with the refreshed version — success
        const retry = await PatientInvoice.findOneAndUpdate(
            { _id: invoice._id, version: 1 },
            { $inc: { version: 1 }, $set: { status: "paid" } },
            { new: true }
        );
        expect(retry).toBeTruthy();
        expect(retry.version).toBe(2);
        expect(retry.status).toBe("paid");
    });

    // ── 3-writer race ────────────────────────────────────────────────
    //
    // Mirrors the ticket 3-writer pattern. A 2-way race can be passed by
    // a broken implementation that serializes writes under a global lock
    // but still double-commits under load; the 3-way race exposes that by
    // requiring at-most-one `$inc` against version=0.
    test("3 parallel updates against version=0 → exactly one wins, version lands at 1", async () => {
        const invoice = await PatientInvoice.create(seed());

        const writer = (tag) =>
            PatientInvoice.findOneAndUpdate(
                { _id: invoice._id, version: 0 },
                { $set: { status: tag }, $inc: { version: 1 } },
                { returnDocument: "after" }
            );

        const results = await Promise.all([
            writer("partially_paid"),
            writer("paid"),
            writer("void"),
        ]);

        const winners = results.filter(Boolean);
        const losers = results.filter((x) => x === null);

        // Exactly one winner across 3 racers. Not 2, not 0.
        expect(winners).toHaveLength(1);
        expect(losers).toHaveLength(2);

        // DB state: version advanced by exactly 1 (not 3, not 0).
        const reloaded = await PatientInvoice.findById(invoice._id).lean();
        expect(reloaded.version).toBe(1);

        // And the surviving status matches whichever writer actually won —
        // no silent cross-contamination where one writer's $set lands on
        // another writer's document.
        expect(["partially_paid", "paid", "void"]).toContain(reloaded.status);
        expect(reloaded.status).toBe(winners[0].status);
    });

    // ── Version cannot skip ──────────────────────────────────────────
    //
    // A subtle regression class: if a caller builds `{version: current + 2}`
    // instead of `{version: current}` in the filter, writes silently drop
    // with no indication. This case proves the primitive rejects any
    // expectedVersion that isn't the exact current value.
    test("filter with future version → no match (version cannot be skipped)", async () => {
        const invoice = await PatientInvoice.create(seed());

        const future = await PatientInvoice.findOneAndUpdate(
            { _id: invoice._id, version: 5 }, // invoice is at 0
            { $inc: { version: 1 }, $set: { status: "paid" } },
            { returnDocument: "after" }
        );
        expect(future).toBeNull();

        const reloaded = await PatientInvoice.findById(invoice._id).lean();
        expect(reloaded.version).toBe(0);
        expect(reloaded.status).toBe("issued");
    });

    test("conflict metric can be incremented from the route error mapper", async () => {
        const { metrics } = require("@infra/metrics/metrics");
        const before = await conflictCountValue();
        metrics.billingPaymentConflictsTotal.inc({ reason: "version_mismatch" });
        const after = await conflictCountValue();
        expect(after).toBeGreaterThan(before);
    });
});
