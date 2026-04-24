/**
 * tests/unit/billing/providers/StripeProvider.parseEvent.unit.test.js
 * Phase 6 — StripeProvider.parseEvent canonical adapter.
 *
 * The parseEvent output shape must mirror KashierProvider.parseEvent so
 * handlePaymentSuccess works identically for both.
 */

"use strict";

const stripe = require("@billing/providers/StripeProvider");

describe("StripeProvider.parseEvent", () => {
    test("maps checkout.session.completed → payment_success with full metadata", () => {
        const raw = {
            id: "evt_stripe_1",
            type: "checkout.session.completed",
            data: {
                object: {
                    id: "cs_test_1",
                    amount_total: 4900,
                    currency: "usd",
                    metadata: {
                        orgId: "org_1",
                        planVersionId: "plan_v1",
                        contractId: "ctr_1",
                        invoiceId: "inv_1",
                        interval: "monthly",
                        source: "checkout_v1"
                    }
                }
            }
        };

        const event = stripe.parseEvent(raw);
        expect(event).toMatchObject({
            type: "payment_success",
            provider: "stripe",
            eventId: "evt_stripe_1",
            orgId: "org_1",
            planVersionId: "plan_v1",
            contractId: "ctr_1",
            invoiceId: "inv_1",
            interval: "monthly",
            amount: 4900,
            amountMinor: 4900,       // alias matching Kashier's shape
            currency: "USD",
            correlationId: "evt_stripe_1"
        });
    });

    test("falls back to legacy metadata keys (organizationId, platformInvoiceId)", () => {
        const event = stripe.parseEvent({
            id: "evt_legacy",
            type: "checkout.session.completed",
            data: {
                object: {
                    id: "cs_legacy",
                    amount_total: 1000,
                    currency: "eur",
                    metadata: {
                        organizationId: "org_legacy",
                        platformInvoiceId: "inv_legacy",
                        contractId: "ctr_legacy",
                        planVersionId: "p",
                        interval: "monthly"
                    }
                }
            }
        });
        expect(event.orgId).toBe("org_legacy");
        expect(event.invoiceId).toBe("inv_legacy");
    });

    test("payment_success emits amount/amountMinor/currency from Stripe payload", () => {
        const event = stripe.parseEvent({
            id: "evt_y",
            type: "checkout.session.completed",
            data: { object: { id: "cs_y", amount_total: 49000, currency: "egp", metadata: { orgId: "o", planVersionId: "p", contractId: "c", interval: "yearly" } } }
        });
        expect(event.amount).toBe(49000);
        expect(event.amountMinor).toBe(49000);
        expect(event.currency).toBe("EGP");
    });

    test("maps invoice.payment_failed → payment_failed", () => {
        const event = stripe.parseEvent({
            id: "evt_fail",
            type: "invoice.payment_failed",
            data: { object: { id: "in_1" } }
        });
        expect(event.type).toBe("payment_failed");
        expect(event.provider).toBe("stripe");
        expect(event.eventId).toBe("evt_fail");
    });

    test.each([
        ["customer.subscription.updated"],
        ["customer.subscription.deleted"],
        ["charge.refunded"],
        ["payment_intent.succeeded"],
        ["invoice.paid"]
    ])("unsupported event type '%s' → ignored", (type) => {
        const event = stripe.parseEvent({ id: "e", type, data: { object: {} } });
        expect(event.type).toBe("ignored");
        expect(event.provider).toBe("stripe");
    });

    test("null/undefined raw event → ignored (no throw)", () => {
        expect(stripe.parseEvent(null).type).toBe("ignored");
        expect(stripe.parseEvent(undefined).type).toBe("ignored");
        expect(stripe.parseEvent({}).type).toBe("ignored");
    });

    test("missing metadata fields → present-but-null in output (strict check happens at caller)", () => {
        const event = stripe.parseEvent({
            id: "evt_meta",
            type: "checkout.session.completed",
            data: { object: { id: "cs_m", amount_total: 100, currency: "usd", metadata: {} } }
        });
        expect(event.type).toBe("payment_success");
        expect(event.orgId).toBeNull();
        expect(event.contractId).toBeNull();
        expect(event.planVersionId).toBeNull();
        expect(event.interval).toBeNull();
    });
});
