/**
 * tests/unit/billing/providers/KashierProvider.unit.test.js
 * Phase 2 — KashierProvider interface coverage.
 *
 * Covers:
 *   - createCheckout returns session shape + validates inputs
 *   - verifyWebhook: HMAC-SHA256 positive + negative cases
 *   - parseEvent normalises payload to canonical shape
 *   - createNewCheckoutSession adapter for existing orchestrator
 *   - refundPayment throws the expected stub code
 */

"use strict";

jest.mock("axios", () => ({ post: jest.fn() }));

const crypto = require("crypto");
const axios = require("axios");

const kashier = require("@billing/providers/KashierProvider");

// ─── Common axios + env setup for createCheckout tests ──────────────────────
const ORIGINAL_ENV = {};
function setEnv(env) {
    for (const [k, v] of Object.entries(env)) {
        if (!(k in ORIGINAL_ENV)) ORIGINAL_ENV[k] = process.env[k];
        if (v === null) delete process.env[k];
        else process.env[k] = v;
    }
}
function restoreEnv() {
    for (const [k, v] of Object.entries(ORIGINAL_ENV)) {
        if (v === undefined) delete process.env[k];
        else process.env[k] = v;
    }
}

beforeEach(() => {
    axios.post.mockReset();
    setEnv({
        KASHIER_API_KEY: "test_api_key",
        KASHIER_MERCHANT_ID: "MID_TEST",
        KASHIER_BASE_URL: "https://api.kashier.test",
        BASE_URL: "https://app.example.com"
    });
});
afterAll(() => restoreEnv());

describe("KashierProvider", () => {
    describe("identity", () => {
        test("name is 'kashier' and supportsSubscriptions is false", () => {
            expect(kashier.name).toBe("kashier");
            expect(kashier.supportsSubscriptions).toBe(false);
        });
    });

    // ─── createCheckout (real API call) ──────────────────────────────────────
    describe("createCheckout — real API integration", () => {
        const happy = () => axios.post.mockResolvedValueOnce({
            data: {
                checkoutUrl: "https://checkout.kashier.io/pay/cs_real",
                sessionId: "kshr_session_real"
            }
        });

        test("POSTs to {KASHIER_BASE_URL}/payments/checkout with bearer + payload", async () => {
            happy();
            await kashier.createCheckout({
                amountMinor: 245000,
                currency: "EGP",
                metadata: {
                    orgId: "org_1",
                    contractId: "ctr_1",
                    invoiceId: "inv_1",
                    returnUrl: "https://app.example.com/success"
                }
            });

            expect(axios.post).toHaveBeenCalledTimes(1);
            const [url, payload, opts] = axios.post.mock.calls[0];
            expect(url).toBe("https://api.kashier.test/payments/checkout");
            expect(payload).toEqual({
                amount: 2450, // 245000 / 100 (major units)
                currency: "EGP",
                merchantId: "MID_TEST",
                orderId: "ctr_1",
                redirectUrl: "https://app.example.com/success",
                webhookUrl: "https://app.example.com/api/public/webhooks/kashier",
                metadata: expect.any(Object)
            });
            expect(opts.headers.Authorization).toBe("Bearer test_api_key");
            expect(opts.timeout).toBe(10_000);
        });

        test("returns { url, sessionId } from Kashier response", async () => {
            happy();
            const session = await kashier.createCheckout({
                amountMinor: 100, currency: "EGP", metadata: { contractId: "c" }
            });
            expect(session).toMatchObject({
                provider: "kashier",
                url: "https://checkout.kashier.io/pay/cs_real",
                sessionId: "kshr_session_real",
                amountMinor: 100,
                currency: "EGP"
            });
        });

        test("falls back to successUrl when returnUrl is absent", async () => {
            happy();
            await kashier.createCheckout({
                amountMinor: 100,
                currency: "EGP",
                metadata: { contractId: "c", successUrl: "https://app/success" }
            });
            const [, payload] = axios.post.mock.calls[0];
            expect(payload.redirectUrl).toBe("https://app/success");
        });

        test("rejects non-positive amountMinor (no API call)", async () => {
            await expect(
                kashier.createCheckout({ amountMinor: 0, currency: "EGP" })
            ).rejects.toMatchObject({ code: "KASHIER_INVALID_AMOUNT" });
            expect(axios.post).not.toHaveBeenCalled();
        });

        test("rejects missing currency (no API call)", async () => {
            await expect(
                kashier.createCheckout({ amountMinor: 100 })
            ).rejects.toMatchObject({ code: "KASHIER_INVALID_CURRENCY" });
            expect(axios.post).not.toHaveBeenCalled();
        });

        test("KASHIER_CONFIG_MISSING when KASHIER_API_KEY is absent", async () => {
            setEnv({ KASHIER_API_KEY: null });
            await expect(kashier.createCheckout({
                amountMinor: 100, currency: "EGP", metadata: { contractId: "c" }
            })).rejects.toMatchObject({
                code: "KASHIER_CONFIG_MISSING",
                status: 500,
                missing: ["KASHIER_API_KEY"]
            });
            expect(axios.post).not.toHaveBeenCalled();
        });

        test("KASHIER_CONFIG_MISSING when KASHIER_MERCHANT_ID is absent", async () => {
            setEnv({ KASHIER_MERCHANT_ID: null });
            await expect(kashier.createCheckout({
                amountMinor: 100, currency: "EGP", metadata: { contractId: "c" }
            })).rejects.toMatchObject({
                code: "KASHIER_CONFIG_MISSING",
                missing: ["KASHIER_MERCHANT_ID"]
            });
        });

        test("KASHIER_API_ERROR (502) when axios.post rejects", async () => {
            axios.post.mockRejectedValueOnce(
                Object.assign(new Error("connect ETIMEDOUT"), {
                    response: { data: { error: "timeout" } }
                })
            );
            await expect(kashier.createCheckout({
                amountMinor: 100, currency: "EGP", metadata: { contractId: "c" }
            })).rejects.toMatchObject({
                code: "KASHIER_API_ERROR",
                status: 502
            });
        });

        test("KASHIER_INVALID_RESPONSE (502) when checkoutUrl is absent", async () => {
            axios.post.mockResolvedValueOnce({ data: { sessionId: "kshr_x" } });
            await expect(kashier.createCheckout({
                amountMinor: 100, currency: "EGP", metadata: { contractId: "c" }
            })).rejects.toMatchObject({
                code: "KASHIER_INVALID_RESPONSE",
                status: 502
            });
        });

        test("KASHIER_INVALID_URL (500) when Kashier returns http:// URL", async () => {
            axios.post.mockResolvedValueOnce({
                data: { checkoutUrl: "http://insecure.example.com/pay" }
            });
            await expect(kashier.createCheckout({
                amountMinor: 100, currency: "EGP", metadata: { contractId: "c" }
            })).rejects.toMatchObject({
                code: "KASHIER_INVALID_URL",
                status: 500
            });
        });

        test("NO retries on failure (single POST attempt)", async () => {
            axios.post.mockRejectedValueOnce(new Error("transient"));
            await kashier.createCheckout({
                amountMinor: 100, currency: "EGP", metadata: { contractId: "c" }
            }).catch(() => {});
            expect(axios.post).toHaveBeenCalledTimes(1);
        });
    });

    // ─── createNewCheckoutSession adapter ────────────────────────────────────
    describe("createNewCheckoutSession (adapter)", () => {
        test("maps orchestrator args to createCheckout (real API) and returns { url, sessionId }", async () => {
            axios.post.mockResolvedValueOnce({
                data: {
                    checkoutUrl: "https://checkout.kashier.io/pay/cs_adapter",
                    sessionId: "kshr_adapter"
                }
            });

            const session = await kashier.createNewCheckoutSession({
                organizationId: "org_xyz",
                invoiceId: "inv_42",
                contractId: "ctr_42",
                planVersionId: "plan_v1",
                interval: "monthly",
                amount: 49000,
                currency: "EGP",
                successUrl: "https://app/success",
                cancelUrl: "https://app/cancel"
            });
            expect(session.url).toBe("https://checkout.kashier.io/pay/cs_adapter");
            expect(session.sessionId).toBe("kshr_adapter");
        });
    });

    // ─── verifyWebhook ───────────────────────────────────────────────────────
    describe("verifyWebhook", () => {
        const SECRET = "test_secret_abc";
        const body = Buffer.from(JSON.stringify({ event: "payment.success" }), "utf8");
        const sign = (b, secret) =>
            crypto.createHmac("sha256", secret).update(b).digest("hex");

        beforeEach(() => { process.env.KASHIER_WEBHOOK_SECRET = SECRET; });
        afterAll(() => { delete process.env.KASHIER_WEBHOOK_SECRET; });

        test("returns true when signature matches", async () => {
            const ok = await kashier.verifyWebhook({
                rawBody: body,
                signature: sign(body, SECRET)
            });
            expect(ok).toBe(true);
        });

        test("returns false when signature is tampered", async () => {
            const ok = await kashier.verifyWebhook({
                rawBody: body,
                signature: sign(body, "wrong_secret")
            });
            expect(ok).toBe(false);
        });

        test("returns false when KASHIER_WEBHOOK_SECRET is not set", async () => {
            delete process.env.KASHIER_WEBHOOK_SECRET;
            const ok = await kashier.verifyWebhook({
                rawBody: body,
                signature: sign(body, SECRET)
            });
            expect(ok).toBe(false);
        });

        test("returns false when rawBody is missing", async () => {
            const ok = await kashier.verifyWebhook({ signature: "x" });
            expect(ok).toBe(false);
        });

        test("verifyWebhookSignature throws on mismatch and returns parsed event on success", () => {
            expect(() =>
                kashier.verifyWebhookSignature(body, "bogus", SECRET)
            ).toThrow(/KASHIER_INVALID_SIGNATURE/);

            const parsed = kashier.verifyWebhookSignature(body, sign(body, SECRET), SECRET);
            expect(parsed).toMatchObject({ event: "payment.success" });
        });
    });

    // ─── parseEvent ──────────────────────────────────────────────────────────
    describe("parseEvent", () => {
        test("maps Kashier SUCCESS event to payment_success with canonical metadata", async () => {
            const raw = {
                id: "evt_kshr_1",
                data: {
                    id: "pay_abc",
                    status: "SUCCESS",
                    amount: 245000,
                    currency: "EGP",
                    metadata: {
                        orgId: "org_x",
                        planVersionId: "plan_v1",
                        contractId: "ctr_1",
                        invoiceId: "inv_1",
                        interval: "monthly"
                    }
                }
            };
            const event = await kashier.parseEvent(raw);
            expect(event).toMatchObject({
                provider: "kashier",
                type: "payment_success",
                externalId: "pay_abc",
                amountMinor: 245000,
                currency: "EGP",
                orgId: "org_x",
                planVersionId: "plan_v1",
                contractId: "ctr_1",
                invoiceId: "inv_1",
                interval: "monthly"
            });
        });

        test("accepts legacy `planId` metadata alias", async () => {
            const event = await kashier.parseEvent({
                id: "evt_legacy",
                data: {
                    status: "SUCCESS",
                    metadata: { orgId: "org", planId: "legacy_plan" }
                }
            });
            expect(event.planVersionId).toBe("legacy_plan");
        });

        test("maps non-SUCCESS status to payment_failed", async () => {
            const event = await kashier.parseEvent({
                id: "evt_f",
                data: { status: "FAILED", metadata: { orgId: "o" } }
            });
            expect(event.type).toBe("payment_failed");
        });

        test("falls back to top-level fields when data is absent", async () => {
            const event = await kashier.parseEvent({
                id: "evt_top",
                status: "SUCCEEDED",
                amount: 1000,
                currency: "egp",
                metadata: { orgId: "org_top" }
            });
            expect(event.type).toBe("payment_success");
            expect(event.orgId).toBe("org_top");
            expect(event.currency).toBe("EGP");
        });
    });

    // ─── refundPayment stub ──────────────────────────────────────────────────
    describe("refundPayment", () => {
        test("throws KASHIER_REFUND_NOT_IMPLEMENTED", async () => {
            await expect(
                kashier.refundPayment("pay_1", 100, "idem_1")
            ).rejects.toMatchObject({ code: "KASHIER_REFUND_NOT_IMPLEMENTED" });
        });
    });
});
