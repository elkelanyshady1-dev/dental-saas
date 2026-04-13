// @per-org-transactional — Event-driven subscriber. No HTTP request context available.
// All queries include explicit organizationId from event payload + idempotency session.
// Phase 3.2 — Connection-aware model resolution via getModel.
"use strict";

const mongoose = require("mongoose");
const eventBus = require("@core/eventBus");
const { FINANCIAL_SNAPSHOT_REQUESTED } = require("@core/domainEvents");
const FinancialSnapshotDef = require("./FinancialSnapshot.model");
const { resolveModelForOrg } = require("@core/db/connectionResolver");
const idempotencyService = require("@core/idempotency.service");
const logger = require("@utils/logger");

class FinancialSnapshotSubscriber {
    constructor() {
        this.init();
    }

    init() {
        eventBus.on(FINANCIAL_SNAPSHOT_REQUESTED, async (event) => {
            try {
                await this.handleEvent(event);
            } catch (err) {
                logger.error({ service: "FinancialSnapshotSubscriber", eventId: event.eventId, error: err.message }, "Error processing financial event.");
            }
        });
        logger.info({ service: "FinancialSnapshotSubscriber" }, "Subscriber initialized.");
    }

    async handleEvent(event) {
        const { eventId, organizationId, patientId, branchId, type, amount, amountMinor, currency = "AED", revenueCategory } = event;

        if (!eventId || !organizationId || !patientId) {
            logger.warn({ service: "FinancialSnapshotSubscriber", event }, "Missing required fields for idempotency.");
            return;
        }

        await idempotencyService.process({
            organizationId,
            subscriber: "FinancialSnapshotSubscriber",
            eventId,
            handler: async (session) => {
                const Money = require("@utils/money").Money;

                // Resolve model for this organization's connection (per-org or shared)
                const FinancialSnapshot = resolveModelForOrg(organizationId, FinancialSnapshotDef);

                // STEP 1 — Fetch/Create Snapshot
                let snapshot = await FinancialSnapshot.findOne({ organizationId, patientId }).session(session);
                if (!snapshot) {
                    snapshot = new FinancialSnapshot({ organizationId, patientId, currency });
                }

                // Use Minority if available (v8.2 Preferred)
                const eventMoney = amountMinor !== undefined
                    ? Money.fromMinor(amountMinor, currency)
                    : Money.fromDecimal(amount, currency);

                // STEP 2 — Delta Logic
                const deltaMoney = this._calculateDeltaMoney(type, eventMoney, revenueCategory, currency);

                // Accumulate Global Totals (v8.2 Precision)
                const invoicedMoney = Money.fromMinor(snapshot.totalInvoicedMinor, currency).add(deltaMoney.invoiced);
                const paidMoney = Money.fromMinor(snapshot.totalPaidMinor, currency).add(deltaMoney.paid);
                const outstandingMoney = invoicedMoney.subtract(paidMoney);

                snapshot.totalInvoiced = invoicedMoney.toDecimal();
                snapshot.totalInvoicedMinor = invoicedMoney.amountMinor;
                snapshot.totalPaid = paidMoney.toDecimal();
                snapshot.totalPaidMinor = paidMoney.amountMinor;
                snapshot.outstandingBalance = outstandingMoney.toDecimal();
                snapshot.outstandingBalanceMinor = outstandingMoney.amountMinor;

                const treatmentRevMoney = Money.fromMinor(snapshot.totalTreatmentRevenueMinor, currency).add(deltaMoney.treatmentRev);
                const diagnosticRevMoney = Money.fromMinor(snapshot.totalDiagnosticRevenueMinor, currency).add(deltaMoney.diagnosticRev);
                const walletMoney = Money.fromMinor(snapshot.walletBalanceMinor, currency).add(deltaMoney.wallet);

                snapshot.totalTreatmentRevenue = treatmentRevMoney.toDecimal();
                snapshot.totalTreatmentRevenueMinor = treatmentRevMoney.amountMinor;
                snapshot.totalDiagnosticRevenue = diagnosticRevMoney.toDecimal();
                snapshot.totalDiagnosticRevenueMinor = diagnosticRevMoney.amountMinor;
                snapshot.walletBalance = walletMoney.toDecimal();
                snapshot.walletBalanceMinor = walletMoney.amountMinor;

                // STEP 3 — Branch Breakdown Update
                if (branchId) {
                    let branchData = snapshot.branchBreakdown.find(b => b.branchId.toString() === branchId.toString());
                    if (!branchData) {
                        branchData = {
                            branchId,
                            totalInvoiced: 0, totalInvoicedMinor: 0,
                            totalPaid: 0, totalPaidMinor: 0,
                            totalTreatmentRevenue: 0, totalTreatmentRevenueMinor: 0,
                            totalDiagnosticRevenue: 0, totalDiagnosticRevenueMinor: 0,
                            outstandingBalance: 0, outstandingBalanceMinor: 0
                        };
                        snapshot.branchBreakdown.push(branchData);
                    }

                    const bInvoicedMoney = Money.fromMinor(branchData.totalInvoicedMinor, currency).add(deltaMoney.invoiced);
                    const bPaidMoney = Money.fromMinor(branchData.totalPaidMinor, currency).add(deltaMoney.paid);
                    const bOutstandingMoney = bInvoicedMoney.subtract(bPaidMoney);

                    branchData.totalInvoiced = bInvoicedMoney.toDecimal();
                    branchData.totalInvoicedMinor = bInvoicedMoney.amountMinor;
                    branchData.totalPaid = bPaidMoney.toDecimal();
                    branchData.totalPaidMinor = bPaidMoney.amountMinor;
                    branchData.totalTreatmentRevenue = Money.fromMinor(branchData.totalTreatmentRevenueMinor, currency).add(deltaMoney.treatmentRev).toDecimal();
                    branchData.totalTreatmentRevenueMinor = Money.fromMinor(branchData.totalTreatmentRevenueMinor, currency).add(deltaMoney.treatmentRev).amountMinor;
                    branchData.totalDiagnosticRevenue = Money.fromMinor(branchData.totalDiagnosticRevenueMinor, currency).add(deltaMoney.diagnosticRev).toDecimal();
                    branchData.totalDiagnosticRevenueMinor = Money.fromMinor(branchData.totalDiagnosticRevenueMinor, currency).add(deltaMoney.diagnosticRev).amountMinor;
                    branchData.outstandingBalance = bOutstandingMoney.toDecimal();
                    branchData.outstandingBalanceMinor = bOutstandingMoney.amountMinor;
                }

                snapshot.version += 1;
                snapshot.lastProcessedEventAt = new Date();
                await snapshot.save({ session });
            }
        });
    }

    _calculateDeltaMoney(type, eventMoney, revenueCategory, currency) {
        const { Money } = require("@utils/money");
        const zero = Money.fromMinor(0, currency);
        const delta = { invoiced: zero, paid: zero, treatmentRev: zero, diagnosticRev: zero, wallet: zero };

        switch (type) {
            case "INVOICE_CREATED":
                delta.invoiced = eventMoney;
                if (revenueCategory === "TREATMENT") delta.treatmentRev = eventMoney;
                if (revenueCategory === "DIAGNOSTIC") delta.diagnosticRev = eventMoney;
                break;

            case "PAYMENT_RECORDED":
                delta.paid = eventMoney;
                break;

            case "PAYMENT_REFUNDED":
                delta.paid = eventMoney.multiply(-1);
                break;

            case "WALLET_CREDITED":
                delta.wallet = eventMoney;
                break;

            case "WALLET_DEBITED":
                delta.wallet = eventMoney.multiply(-1);
                break;

            case "INVOICE_VOIDED":
                delta.invoiced = eventMoney.multiply(-1);
                if (revenueCategory === "TREATMENT") delta.treatmentRev = eventMoney.multiply(-1);
                if (revenueCategory === "DIAGNOSTIC") delta.diagnosticRev = eventMoney.multiply(-1);
                break;
        }

        return delta;
    }
}

module.exports = new FinancialSnapshotSubscriber();
