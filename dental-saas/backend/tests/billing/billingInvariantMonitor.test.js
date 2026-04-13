/**
 * tests/billing/billingInvariantMonitor.test.js
 * Sprint 4 — Financial Invariant Monitor Tests
 *
 * STRATEGY: Uses MODE B (deleteMany cleanup).
 * Tests that need to bypass Mongoose validation (orphaned invoice, duplicate
 * invoice number) use collection.insertOne directly.
 *
 * TEST GROUPS:
 *   1. checkPaymentTotals — invariant green/red paths
 *   2. replayLedgerRevenue — reconstruction correctness
 *   3. detectAnomalies — each anomaly class triggered independently
 *   4. runFullIntegrityCheck — full pass / full fail scenarios
 */

"use strict";

const mongoose = require("mongoose");
const BillingLedger = require("../../src/platform/billing/models/BillingLedger.model");
const PlatformInvoice = require("../../src/platform/billing/models/PlatformInvoice.model");
const {
    checkPaymentTotals,
    replayLedgerRevenue,
    detectAnomalies,
    runFullIntegrityCheck
} = require("../../src/platform/billing/services/billingInvariantMonitor.service");

// ─── Helpers ──────────────────────────────────────────────────────────────────

const newId = () => new mongoose.Types.ObjectId();

/** Minimal valid PlatformInvoice fixture */
function invoiceFixture({
    orgId = newId(),
    contractId = newId(),
    amountMinor = 9900,
    currency = "USD",
    status = "paid",
    invoiceNumber = null,
    idempotencyKey = null
} = {}) {
    return {
        organizationId: orgId,
        contractId,
        invoiceType: "subscription",
        status,
        paymentStatus: status === "paid" ? "captured" : "pending",
        paidAt: status === "paid" ? new Date() : null,
        currency,
        lineItems: [{
            description: "Plan",
            quantity: 1,
            type: "plan",
            unitPrice: amountMinor / 100,
            unitPriceMinor: amountMinor,
            total: amountMinor / 100,
            totalMinor: amountMinor
        }],
        subtotalAmountMinor: amountMinor,
        subtotalAmount: amountMinor / 100,
        taxAmountMinor: 0,
        taxAmount: 0,
        totalAmount: amountMinor / 100,
        totalAmountMinor: amountMinor,
        invoiceNumber: invoiceNumber ?? `TEST-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
        idempotencyKey: idempotencyKey ?? `test-${orgId}-${Date.now()}-${Math.random()}`,
        billingCycleStart: new Date("2025-01-01"),
        billingCycleEnd: new Date("2025-02-01"),
        dueDate: new Date("2025-01-15"),
        regionCode: "US",
        retryCount: 0,
        maxRetries: 3
    };
}

/** Minimal valid BillingLedger payment.succeeded fixture */
function ledgerPaymentFixture({
    orgId = newId(),
    contractId = newId(),
    invoiceId = newId(),
    amountMinor = 9900,
    currency = "USD",
    eventType = "payment.succeeded"
} = {}) {
    return {
        eventType,
        organizationId: orgId,
        contractId,
        invoiceId,
        provider: "internal",
        amount: amountMinor / 100,
        amountMinor,
        currency,
        source: "invoiceEngine",
        actorType: "system",
        metadata: {}
    };
}

/**
 * Seeds a matched ledger payment + paid invoice.
 * Returns { orgId, contractId, invoiceId, amountMinor }
 */
async function seedMatchedPair(overrides = {}) {
    const orgId = overrides.orgId || newId();
    const contractId = overrides.contractId || newId();
    const amountMinor = overrides.amountMinor || 9900;
    const currency = overrides.currency || "USD";

    // Create invoice first to get its real _id
    const [invoice] = await PlatformInvoice.create([
        invoiceFixture({ orgId, contractId, amountMinor, currency })
    ]);

    // Link ledger entry to the real invoice._id so anomaly-D scan can match them
    await BillingLedger.create([
        ledgerPaymentFixture({ orgId, contractId, invoiceId: invoice._id, amountMinor, currency })
    ]);

    return { orgId, contractId, invoiceId: invoice._id, amountMinor, currency };
}

// If the anomaly-E test crashes mid-way and leaves a non-sparse unique index,
// this afterAll restores the correct index for any downstream test suites.
afterAll(async () => {
    try {
        const coll = PlatformInvoice.collection;
        try { await coll.dropIndex("invoiceNumber_1"); } catch (_) { }
        await coll.createIndex({ invoiceNumber: 1 }, { unique: true, sparse: true, name: "invoiceNumber_1" });
    } catch (_) { }
});

afterEach(async () => {
    await Promise.all([
        BillingLedger.collection.deleteMany({}),
        PlatformInvoice.collection.deleteMany({})
    ]);
});

// ══════════════════════════════════════════════════════════════════════════════
// 1. checkPaymentTotals
// ══════════════════════════════════════════════════════════════════════════════

describe("checkPaymentTotals", () => {
    it("PASS — ledger and invoice totals match exactly", async () => {
        const pair1 = await seedMatchedPair({ amountMinor: 9900, currency: "USD" });
        const pair2 = await seedMatchedPair({ amountMinor: 4950, currency: "USD" });

        // Check per-org to avoid any residual data from other tests
        const r1 = await checkPaymentTotals({ organizationId: pair1.orgId, currency: "USD" });
        const r2 = await checkPaymentTotals({ organizationId: pair2.orgId, currency: "USD" });

        expect(r1.passed).toBe(true);
        expect(r1.ledgerTotalMinor).toBe(9900);
        expect(r1.invoiceTotalMinor).toBe(9900);
        expect(r1.discrepancyMinor).toBe(0);

        expect(r2.passed).toBe(true);
        expect(r2.ledgerTotalMinor).toBe(4950);
        expect(r2.discrepancyMinor).toBe(0);
    });

    it("PASS — empty database returns 0 = 0", async () => {
        const result = await checkPaymentTotals();
        expect(result.passed).toBe(true);
        expect(result.ledgerTotalMinor).toBe(0);
        expect(result.invoiceTotalMinor).toBe(0);
    });

    it("FAIL — ledger has payment but invoice never marked paid", async () => {
        const orgId = newId();

        // Ledger entry only — no paid invoice
        await BillingLedger.create([
            ledgerPaymentFixture({ orgId, amountMinor: 9900, currency: "USD" })
        ]);

        const result = await checkPaymentTotals({ currency: "USD" });
        expect(result.passed).toBe(false);
        expect(result.ledgerTotalMinor).toBe(9900);
        expect(result.invoiceTotalMinor).toBe(0);
        expect(result.discrepancyMinor).toBe(9900);
    });

    it("FAIL — invoice marked paid but ledger write was skipped", async () => {
        const orgId = newId();

        // Paid invoice only — no ledger entry
        await PlatformInvoice.create([invoiceFixture({ orgId, amountMinor: 4950 })]);

        const result = await checkPaymentTotals({ currency: "USD" });
        expect(result.passed).toBe(false);
        expect(result.invoiceTotalMinor).toBe(4950);
        expect(result.ledgerTotalMinor).toBe(0);
        expect(result.discrepancyMinor).toBe(4950);
    });

    it("PASS — scoped to organizationId ignores other orgs anomalies", async () => {
        const targetOrg = newId();
        const otherOrg = newId();

        // Target org: clean match
        await seedMatchedPair({ orgId: targetOrg, amountMinor: 5000, currency: "USD" });

        // Other org: ledger-only (would fail globally but not scoped to targetOrg)
        await BillingLedger.create([
            ledgerPaymentFixture({ orgId: otherOrg, amountMinor: 20000, currency: "USD" })
        ]);

        const result = await checkPaymentTotals({ organizationId: targetOrg, currency: "USD" });
        expect(result.passed).toBe(true);
        expect(result.ledgerTotalMinor).toBe(5000);
        expect(result.invoiceTotalMinor).toBe(5000);
    });
});

// ══════════════════════════════════════════════════════════════════════════════
// 2. replayLedgerRevenue
// ══════════════════════════════════════════════════════════════════════════════

describe("replayLedgerRevenue", () => {
    it("reconstructs gross revenue from payment.succeeded events", async () => {
        const orgId = newId();
        await BillingLedger.create([
            ledgerPaymentFixture({ orgId, amountMinor: 9900, currency: "USD" }),
            ledgerPaymentFixture({ orgId, amountMinor: 4950, currency: "USD" })
        ]);

        const result = await replayLedgerRevenue({ organizationId: orgId });

        expect(result.rows).toHaveLength(1);
        expect(result.rows[0].grossMinor).toBe(14850);
        expect(result.rows[0].refundsMinor).toBe(0);
        expect(result.rows[0].netMinor).toBe(14850);
        expect(result.rows[0].paymentCount).toBe(2);
    });

    it("subtracts refunds from gross to yield net revenue", async () => {
        const orgId = newId();
        await BillingLedger.create([
            ledgerPaymentFixture({ orgId, amountMinor: 9900, currency: "USD" }),
            ledgerPaymentFixture({ orgId, amountMinor: 3000, currency: "USD", eventType: "invoice.refunded" })
        ]);

        const result = await replayLedgerRevenue({ organizationId: orgId });
        expect(result.rows[0].grossMinor).toBe(9900);
        expect(result.rows[0].refundsMinor).toBe(3000);
        expect(result.rows[0].netMinor).toBe(6900);
        expect(result.rows[0].refundCount).toBe(1);
    });

    it("groups by currency when org has multiple currencies", async () => {
        const orgId = newId();
        await BillingLedger.create([
            ledgerPaymentFixture({ orgId, amountMinor: 9900, currency: "USD" }),
            ledgerPaymentFixture({ orgId, amountMinor: 5000, currency: "EGP" })
        ]);

        const result = await replayLedgerRevenue({ organizationId: orgId });
        expect(result.rows).toHaveLength(2);

        const usd = result.rows.find(r => r.currency === "USD");
        const egp = result.rows.find(r => r.currency === "EGP");
        expect(usd.grossMinor).toBe(9900);
        expect(egp.grossMinor).toBe(5000);
    });

    it("returns empty rows for org with no ledger events", async () => {
        const result = await replayLedgerRevenue({ organizationId: newId() });
        expect(result.rows).toHaveLength(0);
        expect(result.replayedAt).toBeTruthy();
    });

    it("report includes window timestamps", async () => {
        const from = new Date("2025-01-01");
        const to = new Date("2025-12-31");
        const result = await replayLedgerRevenue({ from, to });
        expect(result.windowFrom).toBe(from.toISOString());
        expect(result.windowTo).toBe(to.toISOString());
    });
});

// ══════════════════════════════════════════════════════════════════════════════
// 3. detectAnomalies
// ══════════════════════════════════════════════════════════════════════════════

describe("detectAnomalies", () => {
    it("PASS — clean matched pair produces no anomalies", async () => {
        await seedMatchedPair({ amountMinor: 9900 });

        const result = await detectAnomalies();
        expect(result.passed).toBe(true);
        expect(result.anomalyCount).toBe(0);
    });

    it("ANOMALY A — detects net-negative org: refund > payment", async () => {
        const orgId = newId();
        await BillingLedger.create([
            // $50 payment
            ledgerPaymentFixture({ orgId, amountMinor: 5000, currency: "USD" }),
            // $99 refund — exceeds payment
            ledgerPaymentFixture({ orgId, amountMinor: 9900, currency: "USD", eventType: "invoice.refunded" })
        ]);

        const result = await detectAnomalies({ organizationId: orgId });
        expect(result.passed).toBe(false);
        expect(result.anomalies.netNegativeOrgs).toHaveLength(1);
        expect(result.anomalies.netNegativeOrgs[0].netMinor).toBeLessThan(0);
        expect(result.anomalies.netNegativeOrgs[0].anomaly).toBe("refund_exceeds_payment");
    });

    it("ANOMALY B — detects invoice with totalAmountMinor < 0", async () => {
        const orgId = newId();

        // Use collection.insertOne to bypass Mongoose validation
        // (Mongoose prevents negative amounts but the scanner must catch legacy/bypassed data)
        await PlatformInvoice.collection.insertOne({
            organizationId: orgId,
            contractId: newId(),
            invoiceType: "subscription",
            status: "draft",
            paymentStatus: "pending",
            currency: "USD",
            lineItems: [],
            totalAmountMinor: -100,   // the bug we are scanning for
            subtotalAmountMinor: -100,
            taxAmountMinor: 0,
            totalAmount: -1,
            subtotalAmount: -1,
            taxAmount: 0,
            billingCycleStart: new Date("2025-01-01"),
            billingCycleEnd: new Date("2025-02-01"),
            dueDate: new Date("2025-01-15"),
            retryCount: 0,
            maxRetries: 3,
            createdAt: new Date()
        });

        const result = await detectAnomalies({ organizationId: orgId });
        expect(result.passed).toBe(false);
        expect(result.anomalies.negativeInvoices).toHaveLength(1);
        expect(result.anomalies.negativeInvoices[0].totalAmountMinor).toBeLessThan(0);
    });

    it("ANOMALY C — detects orphaned invoice (contractId is null)", async () => {
        const orgId = newId();

        // Must use collection.insertOne — contractId is required in Mongoose schema
        // but we need to test that the scanner catches data that bypassed validation
        await PlatformInvoice.collection.insertOne({
            organizationId: orgId,
            contractId: null,   // orphaned
            invoiceType: "subscription",
            status: "open",
            paymentStatus: "pending",
            currency: "USD",
            lineItems: [],
            totalAmountMinor: 9900,
            subtotalAmountMinor: 9900,
            taxAmountMinor: 0,
            totalAmount: 99,
            subtotalAmount: 99,
            taxAmount: 0,
            billingCycleStart: new Date("2025-01-01"),
            billingCycleEnd: new Date("2025-02-01"),
            dueDate: new Date("2025-01-15"),
            retryCount: 0,
            maxRetries: 3,
            createdAt: new Date()
        });

        const result = await detectAnomalies({ organizationId: orgId });
        expect(result.passed).toBe(false);
        expect(result.anomalies.orphanedInvoices).toHaveLength(1);
    });

    it("ANOMALY D — detects paid invoice with no ledger entry", async () => {
        const orgId = newId();

        // Mark invoice paid but write NO ledger entry
        await PlatformInvoice.create([
            invoiceFixture({ orgId, amountMinor: 9900, status: "paid" })
        ]);

        const result = await detectAnomalies({ organizationId: orgId });
        expect(result.passed).toBe(false);
        expect(result.anomalies.paidInvoicesMissingLedgerEntry).toHaveLength(1);
        expect(result.anomalies.paidInvoicesMissingLedgerEntry[0].anomaly)
            .toBe("paid_invoice_no_ledger_entry");
    });

    it("ANOMALY D — paid invoice WITH ledger entry is not flagged", async () => {
        // Properly matched: both paid invoice + ledger entry
        await seedMatchedPair({ amountMinor: 5000 });

        const result = await detectAnomalies();
        expect(result.anomalies.paidInvoicesMissingLedgerEntry).toHaveLength(0);
    });

    it("ANOMALY E — detects duplicate invoice numbers", async () => {
        const num = "INV-202501-DUP01";
        const coll = PlatformInvoice.collection;

        // Temporarily drop unique index so we can insert duplicates.
        // The scanner detects duplicates via aggregation — the index is a
        // guard against new writes, not a scanner replacement.
        try {
            await coll.dropIndex("invoiceNumber_1");
        } catch (_) { /* index may not be named exactly this — ignore */ }

        const baseDoc = {
            organizationId: newId(), contractId: newId(),
            invoiceType: "subscription", status: "paid", paymentStatus: "captured",
            paidAt: new Date(), currency: "USD", lineItems: [],
            totalAmountMinor: 9900, subtotalAmountMinor: 9900, taxAmountMinor: 0,
            totalAmount: 99, subtotalAmount: 99, taxAmount: 0,
            invoiceNumber: num,
            billingCycleStart: new Date("2025-01-01"),
            billingCycleEnd: new Date("2025-02-01"),
            dueDate: new Date("2025-01-15"),
            retryCount: 0, maxRetries: 3, createdAt: new Date()
        };

        await coll.insertOne({ ...baseDoc, organizationId: newId(), contractId: newId() });
        await coll.insertOne({ ...baseDoc, organizationId: newId(), contractId: newId() });

        const result = await detectAnomalies();
        expect(result.passed).toBe(false);
        expect(result.anomalies.duplicateInvoiceNumbers).toHaveLength(1);
        expect(result.anomalies.duplicateInvoiceNumbers[0].invoiceNumber).toBe(num);
        expect(result.anomalies.duplicateInvoiceNumbers[0].count).toBe(2);
        expect(result.anomalies.duplicateInvoiceNumbers[0].anomaly).toBe("duplicate_invoice_number");

        // Clean up the duplicates BEFORE restoring the unique index —
        // if we restore the index while duplicates still exist, the index build fails.
        await PlatformInvoice.collection.deleteMany({ invoiceNumber: num });
        // CRITICAL: restore with sparse:true — the production schema requires this so that
        // invoices with invoiceNumber:null (checkout invoices) can coexist without
        // triggering a duplicate key violation in subsequent tests.
        await coll.createIndex(
            { invoiceNumber: 1 },
            { unique: true, sparse: true, name: "invoiceNumber_1" }
        );
    });
});

// ══════════════════════════════════════════════════════════════════════════════
// 4. runFullIntegrityCheck
// ══════════════════════════════════════════════════════════════════════════════

describe("runFullIntegrityCheck", () => {
    it("FULL PASS — matched pairs pass all three checks", async () => {
        const { orgId } = await seedMatchedPair({ amountMinor: 9900, currency: "USD" });

        const report = await runFullIntegrityCheck({
            organizationId: orgId,
            currency: "USD",
            correlationId: "test-full-pass"
        });

        expect(report.passed).toBe(true);
        expect(report.correlationId).toBe("test-full-pass");
        expect(report.paymentTotals.passed).toBe(true);
        expect(report.anomalyDetection.passed).toBe(true);
        expect(report.revenueReplay.rows.length).toBeGreaterThan(0);
        expect(report.ranAt).toBeTruthy();
    });

    it("FULL FAIL — net-negative org fails the combined check", async () => {
        const orgId = newId();
        await BillingLedger.create([
            ledgerPaymentFixture({ orgId, amountMinor: 1000, currency: "USD" }),
            ledgerPaymentFixture({ orgId, amountMinor: 5000, currency: "USD", eventType: "invoice.refunded" })
        ]);

        const report = await runFullIntegrityCheck({ organizationId: orgId });
        expect(report.passed).toBe(false);
        expect(report.anomalyDetection.passed).toBe(false);
        expect(report.anomalyDetection.anomalies.netNegativeOrgs).toHaveLength(1);
    });

    it("report always has complete structure", async () => {
        const report = await runFullIntegrityCheck();

        expect(report).toHaveProperty("passed");
        expect(report).toHaveProperty("correlationId");
        expect(report).toHaveProperty("ranAt");
        expect(report).toHaveProperty("paymentTotals");
        expect(report).toHaveProperty("revenueReplay");
        expect(report).toHaveProperty("anomalyDetection");
        expect(report.anomalyDetection.anomalies).toMatchObject({
            netNegativeOrgs: expect.any(Array),
            negativeInvoices: expect.any(Array),
            orphanedInvoices: expect.any(Array),
            paidInvoicesMissingLedgerEntry: expect.any(Array),
            duplicateInvoiceNumbers: expect.any(Array)
        });
    });
});
