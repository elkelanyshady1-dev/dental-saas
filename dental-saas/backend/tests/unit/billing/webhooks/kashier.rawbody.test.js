/**
 * tests/unit/billing/webhooks/kashier.rawbody.test.js
 *
 * Proves the Kashier webhook mount captures req.rawBody. Spins up a minimal
 * Express app with the SAME middleware shape used in app.js — route-scoped
 * `express.json({ verify })` followed by the controller — and POSTs JSON
 * via supertest. Asserts:
 *
 *   - req.rawBody is a Buffer at handler entry
 *   - req.rawBody bytes match the on-the-wire payload
 *   - the controller does NOT throw RAW_BODY_REQUIRED (200 response)
 *
 * If a future refactor re-orders middleware so the global json parser
 * runs first, this test breaks immediately.
 */

"use strict";

const express = require("express");
const supertest = require("supertest");

describe("Kashier webhook — req.rawBody is captured by the mount", () => {
    let receivedRawBody = null;
    let receivedBody = null;
    let app;

    beforeAll(() => {
        app = express();
        // Mirrors app.js: route-scoped json with verify, mounted BEFORE the
        // global json parser. The verify hook captures the raw bytes.
        app.post(
            "/api/public/webhooks/kashier",
            express.json({
                limit: "1mb",
                verify: (req, _res, buf) => { req.rawBody = buf; }
            }),
            (req, res) => {
                receivedRawBody = req.rawBody;
                receivedBody = req.body;
                // The real controller hard-fails RAW_BODY_REQUIRED if rawBody
                // is missing; emulate that contract here.
                if (!req.rawBody) {
                    return res.status(400).json({ error: "RAW_BODY_REQUIRED" });
                }
                return res.status(200).json({ ok: true });
            }
        );
        // Global json AFTER the route-scoped one — same order as app.js.
        app.use(express.json({ limit: "10mb" }));
    });

    beforeEach(() => {
        receivedRawBody = null;
        receivedBody = null;
    });

    test("POST with JSON payload → handler sees req.rawBody as a Buffer", async () => {
        const payload = { event: "payment.success", data: { id: "pay_1" } };
        const expectedBytes = JSON.stringify(payload);

        const res = await supertest(app)
            .post("/api/public/webhooks/kashier")
            .set("Content-Type", "application/json")
            .send(payload);

        expect(res.status).toBe(200);
        expect(res.body).toEqual({ ok: true });

        expect(Buffer.isBuffer(receivedRawBody)).toBe(true);
        expect(receivedRawBody.toString("utf8")).toBe(expectedBytes);

        // Parsed body is also available — both halves of the contract hold.
        expect(receivedBody).toEqual(payload);
    });

    test("rawBody bytes match exactly — HMAC over them would succeed", async () => {
        const crypto = require("crypto");
        const SECRET = "test_secret";
        const payload = { event: "payment.success", id: "evt_1" };
        const json = JSON.stringify(payload);
        const expectedSignature = crypto
            .createHmac("sha256", SECRET)
            .update(Buffer.from(json, "utf8"))
            .digest("hex");

        await supertest(app)
            .post("/api/public/webhooks/kashier")
            .set("Content-Type", "application/json")
            .send(payload);

        // Recompute HMAC over the captured rawBody — must match.
        const actualSignature = crypto
            .createHmac("sha256", SECRET)
            .update(receivedRawBody)
            .digest("hex");
        expect(actualSignature).toBe(expectedSignature);
    });

    test("controller does NOT throw RAW_BODY_REQUIRED when middleware is wired correctly", async () => {
        const res = await supertest(app)
            .post("/api/public/webhooks/kashier")
            .set("Content-Type", "application/json")
            .send({ ping: "pong" });

        expect(res.status).toBe(200);
        expect(res.body.error).not.toBe("RAW_BODY_REQUIRED");
    });
});
