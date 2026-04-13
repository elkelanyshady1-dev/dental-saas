/**
 * monitoring.integration.test.js
 * v11.0 Hardening Verification — Observability & Alerting
 */
"use strict";

const request = require("supertest");
const { app } = require("../app");
const mongoose = require("mongoose");
const { metrics, register } = require("../src/infrastructure/metrics/metrics");

describe("Monitoring & observability Tests", () => {
    beforeAll(() => {
        process.env.METRICS_ENABLED = "true";
    });

    test("Correlation ID Propagation — Request to Response", async () => {
        const res = await request(app).get("/api/health");
        expect(res.headers["x-correlation-id"]).toBeDefined();
        const cid = res.headers["x-correlation-id"];

        // Re-use cid
        const res2 = await request(app)
            .get("/api/health")
            .set("X-Correlation-ID", cid);
        expect(res2.headers["x-correlation-id"]).toBe(cid);
    });

    test("/metrics Endpoint Security & Format", async () => {
        // Test disabled
        process.env.METRICS_ENABLED = "false";
        const res404 = await request(app).get("/metrics");
        expect(res404.status).toBe(404);

        // Test enabled
        process.env.METRICS_ENABLED = "true";
        const res200 = await request(app).get("/metrics");
        expect(res200.status).toBe(200);
        expect(res200.text).toContain("dental_saas_active_http_requests");
    });

    test("Metrics Increment — Webhook Logic", async () => {
        const initial = await register.getSingleMetric("dental_saas_webhook_received_total").get();
        const startCount = initial.values.find(v => v.labels.status === "signature_failed")?.value || 0;

        // Fail signature
        await request(app)
            .post("/api/public/stripe/webhook")
            .set("stripe-signature", "invalid")
            .send({ id: "test" });

        const after = await register.getSingleMetric("dental_saas_webhook_received_total").get();
        const endCount = after.values.find(v => v.labels.status === "signature_failed").value;
        expect(endCount).toBe(startCount + 1);
    });

    test("Load Scenario — Metrics Registry Throughput", async () => {
        const startMemory = process.memoryUsage().heapUsed;

        // 1000 increments
        for (let i = 0; i < 1000; i++) {
            metrics.refundExecutionTotal.inc({ status: "completed" });
        }

        const endMemory = process.memoryUsage().heapUsed;
        const diffMb = (endMemory - startMemory) / 1024 / 1024;

        // Should not leak significant memory (> 5MB for 1000 simple counters is safe)
        expect(diffMb).toBeLessThan(5);

        const finalMetric = await register.getSingleMetric("dental_saas_refund_execution_total").get();
        const completedVal = finalMetric.values.find(v => v.labels.status === "completed").value;
        expect(completedVal).toBeGreaterThanOrEqual(1000);
    });
});
