const mongoose = require("mongoose");
const { Money } = require("../backend/src/utils/money");
const BillingInvoice = require("../backend/src/modules/billingDomain/models/billingInvoice.model");
const RevenueAnalytics = require("../backend/src/modules/platformDomain/models/revenueAnalytics.model");
const PatientInvoice = require("../backend/src/modules/financialDomain/models/patientInvoice.model");
const PatientPayment = require("../backend/src/modules/financialDomain/models/patientPayment.model");
const FinancialLedger = require("../backend/src/modules/financialDomain/models/financialLedger.model");
const PaymentAllocation = require("../backend/src/modules/financialDomain/models/paymentAllocation.model");
const FinancialSnapshot = require("../backend/src/modules/financialDomain/models/financialSnapshot.model");

async function migrate() {
    console.log("Starting v8.2 Precision Migration...");
    const uri = process.env.MONGODB_URI || "mongodb://localhost:27017/dental-saas";
    await mongoose.connect(uri);

    // 1. Billing Invoices
    console.log("Migrating BillingInvoice...");
    const invoices = await BillingInvoice.find({ totalAmountMinor: { $exists: false } }).populate('organizationId');
    for (const inv of invoices) {
        let currency = inv.currency;

        // v8.2.1 Strict Currency Backfill
        if (!currency || currency === "USD") { // USD was old default, verify it wasn't silent
            currency = inv.planCurrency || (inv.organizationId && inv.organizationId.billingCurrency);
        }

        if (!currency) {
            console.error(`[Migration] SKIP: Invoice ${inv._id} lacks currency and backfill failed.`);
            continue;
        }

        inv.currency = currency;
        inv.basePlanAmountMinor = Money.fromDecimal(inv.basePlanAmount || 0, currency).amountMinor;
        inv.addOnAmountMinor = Money.fromDecimal(inv.addOnAmount || 0, currency).amountMinor;
        inv.overageAmountMinor = Money.fromDecimal(inv.overageAmount || 0, currency).amountMinor;
        inv.couponDiscountAmountMinor = Money.fromDecimal(inv.couponDiscountAmount || 0, currency).amountMinor;
        inv.campaignDiscountAmountMinor = Money.fromDecimal(inv.campaignDiscountAmount || 0, currency).amountMinor;
        inv.subtotalAmountMinor = Money.fromDecimal(inv.subtotalAmount || 0, currency).amountMinor;
        inv.taxAmountMinor = Money.fromDecimal(inv.taxAmount || 0, currency).amountMinor;
        inv.totalAmountMinor = Money.fromDecimal(inv.totalAmount || 0, currency).amountMinor;
        await inv.save();
    }

    // 2. Revenue Analytics
    console.log("Migrating RevenueAnalytics...");
    const analytics = await RevenueAnalytics.find({ totalRevenueMinor: { $exists: false } });
    for (const rev of analytics) {
        const currency = rev.currency || "USD";
        rev.totalRevenueMinor = Money.fromDecimal(rev.totalRevenue || 0, currency).amountMinor;
        rev.planRevenueMinor = Money.fromDecimal(rev.planRevenue || 0, currency).amountMinor;
        rev.addOnRevenueMinor = Money.fromDecimal(rev.addOnRevenue || 0, currency).amountMinor;
        rev.overageRevenueMinor = Money.fromDecimal(rev.overageRevenue || 0, currency).amountMinor;
        rev.taxCollectedMinor = Money.fromDecimal(rev.taxCollected || 0, currency).amountMinor;
        rev.netRevenueMinor = Money.fromDecimal(rev.netRevenue || 0, currency).amountMinor;
        await rev.save();
    }

    // 3. Patient Invoices
    console.log("Migrating PatientInvoice...");
    const pInvoices = await PatientInvoice.find({ totalAmountMinor: { $exists: false } });
    for (const inv of pInvoices) {
        const currency = inv.currency || "AED";
        inv.subtotalMinor = Money.fromDecimal(inv.subtotal || 0, currency).amountMinor;
        inv.taxMinor = Money.fromDecimal(inv.tax || 0, currency).amountMinor;
        inv.discountMinor = Money.fromDecimal(inv.discount || 0, currency).amountMinor;
        inv.insuranceCoveredMinor = Money.fromDecimal(inv.insuranceCovered || 0, currency).amountMinor;
        inv.totalAmountMinor = Money.fromDecimal(inv.totalAmount || 0, currency).amountMinor;
        inv.downpaymentAmountMinor = Money.fromDecimal(inv.downpaymentAmount || 0, currency).amountMinor;

        // Treatments
        if (inv.treatments) {
            for (const t of inv.treatments) {
                t.subtotalMinor = Money.fromDecimal(t.subtotal || 0, currency).amountMinor;
            }
        }
        // Charges
        if (inv.charges) {
            for (const c of inv.charges) {
                c.amountMinor = Money.fromDecimal(c.amount || 0, currency).amountMinor;
            }
        }
        await inv.save();
    }

    // 4. Patient Payments
    console.log("Migrating PatientPayment...");
    const pPayments = await PatientPayment.find({ amountMinor: { $exists: false } });
    for (const p of pPayments) {
        const currency = p.currency || "AED";
        p.amountMinor = Money.fromDecimal(p.amount || 0, currency).amountMinor;
        await p.save();
    }

    // 5. Financial Ledger
    console.log("Migrating FinancialLedger...");
    const ledgers = await FinancialLedger.find({ amountMinor: { $exists: false } });
    for (const l of ledgers) {
        const currency = l.currency || "AED";
        l.amountMinor = Money.fromDecimal(l.amount || 0, currency).amountMinor;
        await l.save();
    }

    // 6. Payment Allocation
    console.log("Migrating PaymentAllocation...");
    const allocations = await PaymentAllocation.find({ allocatedAmountMinor: { $exists: false } });
    for (const a of allocations) {
        const currency = a.currency || "AED";
        a.allocatedAmountMinor = Money.fromDecimal(a.allocatedAmount || 0, currency).amountMinor;
        await a.save();
    }

    // 7. Financial Snapshot
    console.log("Migrating FinancialSnapshot...");
    const snapshots = await FinancialSnapshot.find({ totalInvoicedMinor: { $exists: false } });
    for (const s of snapshots) {
        const currency = s.currency || "AED";
        s.totalInvoicedMinor = Money.fromDecimal(s.totalInvoiced || 0, currency).amountMinor;
        s.totalPaidMinor = Money.fromDecimal(s.totalPaid || 0, currency).amountMinor;
        s.outstandingBalanceMinor = Money.fromDecimal(s.outstandingBalance || 0, currency).amountMinor;
        s.totalTreatmentRevenueMinor = Money.fromDecimal(s.totalTreatmentRevenue || 0, currency).amountMinor;
        s.totalDiagnosticRevenueMinor = Money.fromDecimal(s.totalDiagnosticRevenue || 0, currency).amountMinor;
        s.walletBalanceMinor = Money.fromDecimal(s.walletBalance || 0, currency).amountMinor;

        if (s.branchBreakdown) {
            for (const b of s.branchBreakdown) {
                b.totalInvoicedMinor = Money.fromDecimal(b.totalInvoiced || 0, currency).amountMinor;
                b.totalPaidMinor = Money.fromDecimal(b.totalPaid || 0, currency).amountMinor;
                b.totalTreatmentRevenueMinor = Money.fromDecimal(b.totalTreatmentRevenue || 0, currency).amountMinor;
                b.totalDiagnosticRevenueMinor = Money.fromDecimal(b.totalDiagnosticRevenue || 0, currency).amountMinor;
                b.outstandingBalanceMinor = Money.fromDecimal(b.outstandingBalance || 0, currency).amountMinor;
            }
        }
        await s.save();
    }

    console.log("v8.2 Precision Migration Completed Successfully.");
    await mongoose.disconnect();
}

migrate().catch(err => {
    console.error("Migration failed:", err);
    process.exit(1);
});
