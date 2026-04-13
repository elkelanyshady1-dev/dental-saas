/**
 * hardening.stress.test.js
 * v11.0 Hardening Verification — Concurrent & Multi-node Stability
 */
"use strict";

const request = require("supertest");
const app = require("../app");
const mongoose = require("mongoose");
const { Ticket } = require("../src/models/Ticket");
const { BillingInvoice } = require("../src/modules/billingDomain/models/billingInvoice.model");
const RefundService = require("../src/modules/supportDomain/services/refund.service");
const { redis } = require("../src/utils/redisLock");

describe("Hardening Stress & Concurrency Tests", () => {
    let testInvoice;
    let testTicket;

    beforeAll(async () => {
        // Setup shared state
        testInvoice = await BillingInvoice.create({
            organizationId: new mongoose.Types.ObjectId(),
            amountMinor: 10000,
            status: "paid",
            stripePaymentIntentId: "pi_test_concurrency"
        });

        testTicket = await Ticket.create({
            organizationId: testInvoice.organizationId,
            category: "REFUND_REQUEST",
            linkedInvoiceId: testInvoice._id,
            refundAmountRequestedMinor: 5000,
            status: "OPEN"
        });
    });

    afterAll(async () => {
        await mongoose.connection.close();
        await redis.quit();
    });

    test("Concurrent Refund Attempts — Atomic OAV Protection", async () => {
        const actorId = new mongoose.Types.ObjectId();
        const ip = "127.0.0.1";

        // Launch 10 concurrent approvedRefund calls
        const results = await Promise.allSettled([
            RefundService.approveRefund(testTicket._id, actorId, ip),
            RefundService.approveRefund(testTicket._id, actorId, ip),
            RefundService.approveRefund(testTicket._id, actorId, ip),
            RefundService.approveRefund(testTicket._id, actorId, ip),
            RefundService.approveRefund(testTicket._id, actorId, ip)
        ]);

        const successes = results.filter(r => r.status === "fulfilled" && r.value.success);
        const resumed = results.filter(r => r.status === "fulfilled" && r.value.resumed);

        // One should succeed initially, others should either see Resumed (idempotency) or fail OAV if simultaneous
        console.log(`Successes: ${successes.length}, Resumed: ${resumed.length}`);

        const finalInvoice = await BillingInvoice.findById(testInvoice._id);
        expect(finalInvoice.refundedAmountMinor).toBe(5000); // Should never be 10k or 15k
    }, 15000);

    test("Webhook Replay Storm — Redis + DB Deduplication", async () => {
        const eventId = "evt_storm_" + Date.now();
        const payload = {
            id: eventId,
            type: "payment_intent.succeeded",
            data: { object: { id: "pi_storm" } }
        };

        // Simulated storm of 50 concurrent requests for same event
        const reqs = Array(50).fill(0).map(() =>
            request(app)
                .post("/api/public/stripe/webhook")
                .set("stripe-signature", "valid_sim_sig")
                .send(payload)
        );

        const responses = await Promise.all(reqs);

        const duplicates = responses.filter(r => r.body.duplicate);
        const locked = responses.filter(r => r.body.locked);
        const received = responses.filter(r => r.status === 200 && !r.body.duplicate && !r.body.locked);

        expect(received.length).toBe(1); // Only one should process
        expect(duplicates.length + locked.length).toBe(49);
    }, 20000);
});
