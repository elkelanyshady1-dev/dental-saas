/**
 * KashierProvider.js
 * Kashier payment provider (one-time payments only).
 *
 * ARCHITECTURE
 *   - Kashier has no native recurring-subscription API. Every renewal is a
 *     brand-new checkout session + webhook roundtrip. The platform handles
 *     the renewal cadence internally (`billingMode: "manual"`,
 *     `renewalStrategy: "internal"` on org.subscription).
 *
 * INTERFACE
 *   - `createCheckout({ amountMinor, currency, metadata })`
 *       → POSTs to the real Kashier API and returns `{ url, sessionId }`.
 *   - `createNewCheckoutSession({ organizationId, invoiceId, amount,
 *       currency, successUrl, cancelUrl })`
 *       → adapter for the existing CheckoutOrchestrator contract. Internally
 *         delegates to `createCheckout`.
 *   - `verifyWebhook({ rawBody, signature })`
 *       → HMAC-SHA256 signature check (Kashier's documented scheme).
 *   - `verifyWebhookSignature(payload, signature, secret)`
 *       → PaymentProvider base-class alignment.
 *   - `parseEvent(rawEvent)`
 *       → normalises Kashier's payload into the platform event shape.
 *   - `refundPayment(paymentId, amountMinor)`
 *       → stub. Throws `KASHIER_REFUND_NOT_IMPLEMENTED`.
 *
 * REQUIRED ENV (validated at runtime — see Section 10 boot-time check):
 *   - KASHIER_API_KEY        — server API key (Bearer)
 *   - KASHIER_MERCHANT_ID    — merchant identifier
 *   - KASHIER_WEBHOOK_SECRET — HMAC secret for inbound webhook verification
 * Optional:
 *   - KASHIER_BASE_URL       — Kashier API base; defaults to https://api.kashier.io
 *   - BASE_URL               — public origin used to build webhook URL
 *
 * RETRY POLICY: NONE. Retrying a checkout-session POST risks creating
 * duplicate sessions (and confusing the user with two open payment pages).
 * The orchestrator + idempotency layer above us handles this.
 *
 * PLANE: Platform / Billing
 */

"use strict";

const crypto = require("crypto");
const axios = require("axios");
const PaymentProvider = require("./PaymentProvider");
const logger = require("@utils/logger");

const KASHIER_API_BASE_DEFAULT = "https://api.kashier.io";
const KASHIER_API_TIMEOUT_MS = 10_000;

class KashierProvider extends PaymentProvider {
    constructor() {
        super();
        this.name = "kashier";
        // IMPORTANT: Kashier is one-time only; no native subscription API.
        this.supportsSubscriptions = false;
    }

    // ─── Checkout — canonical Phase-2 entry point ─────────────────────────────
    /**
     * createCheckout
     * Creates a hosted-payment-page session for a single one-off charge.
     *
     * @param {object} params
     * @param {number} params.amountMinor - Minor currency units (piastres for EGP).
     * @param {string} params.currency    - ISO 4217 (e.g. "EGP").
     * @param {object} params.metadata    - orgId, planId, interval, invoiceId, …
     * @returns {Promise<{ url: string, sessionId: string, provider: "kashier" }>}
     */
    async createCheckout({ amountMinor, currency, metadata = {} } = {}) {
        if (typeof amountMinor !== "number" || amountMinor <= 0) {
            throw Object.assign(
                new Error("KASHIER_INVALID_AMOUNT: amountMinor must be a positive number."),
                { code: "KASHIER_INVALID_AMOUNT" }
            );
        }
        if (!currency) {
            throw Object.assign(
                new Error("KASHIER_INVALID_CURRENCY: currency is required."),
                { code: "KASHIER_INVALID_CURRENCY" }
            );
        }

        const {
            KASHIER_API_KEY,
            KASHIER_MERCHANT_ID,
            KASHIER_BASE_URL,
            BASE_URL
        } = process.env;

        if (!KASHIER_API_KEY || !KASHIER_MERCHANT_ID) {
            throw Object.assign(
                new Error("KASHIER_CONFIG_MISSING: KASHIER_API_KEY and KASHIER_MERCHANT_ID are required."),
                {
                    code: "KASHIER_CONFIG_MISSING",
                    status: 500,
                    missing: [
                        ...(KASHIER_API_KEY ? [] : ["KASHIER_API_KEY"]),
                        ...(KASHIER_MERCHANT_ID ? [] : ["KASHIER_MERCHANT_ID"])
                    ]
                }
            );
        }

        const apiBase = KASHIER_BASE_URL || KASHIER_API_BASE_DEFAULT;
        // Webhook URL is read at session-creation time so Kashier can call
        // it back at payment completion. `successUrl` is honoured if the
        // caller passed it (legacy orchestrator); otherwise `returnUrl`.
        const redirectUrl = metadata.returnUrl || metadata.successUrl || null;
        const webhookUrl = `${BASE_URL || ""}/api/public/webhooks/kashier`;

        const payload = {
            amount: amountMinor / 100, // Kashier expects major units
            currency: currency.toUpperCase(),
            merchantId: KASHIER_MERCHANT_ID,
            orderId: metadata.contractId,
            redirectUrl,
            webhookUrl,
            metadata
        };

        let response;
        try {
            response = await axios.post(
                `${apiBase}/payments/checkout`,
                payload,
                {
                    headers: {
                        Authorization: `Bearer ${KASHIER_API_KEY}`,
                        "Content-Type": "application/json"
                    },
                    timeout: KASHIER_API_TIMEOUT_MS
                    // No retries: a duplicate POST risks creating two open
                    // payment sessions. Failure here propagates as 502 below.
                }
            );
        } catch (err) {
            logger.error({
                provider: "kashier",
                contractId: metadata.contractId,
                err: err.message,
                responseData: err.response?.data
            }, "[KashierProvider] Kashier API call failed");
            throw Object.assign(
                new Error("KASHIER_API_ERROR: Kashier API call failed."),
                {
                    code: "KASHIER_API_ERROR",
                    status: 502,
                    upstream: err.response?.data || err.message
                }
            );
        }

        const checkoutUrl = response?.data?.checkoutUrl;
        const sessionId = response?.data?.sessionId || null;

        if (!checkoutUrl) {
            throw Object.assign(
                new Error("KASHIER_INVALID_RESPONSE: Kashier API response missing checkoutUrl."),
                {
                    code: "KASHIER_INVALID_RESPONSE",
                    status: 502,
                    response: response?.data
                }
            );
        }

        if (!String(checkoutUrl).startsWith("https://")) {
            throw Object.assign(
                new Error(`KASHIER_INVALID_URL: refusing non-https URL "${checkoutUrl}".`),
                { code: "KASHIER_INVALID_URL", status: 500, checkoutUrl }
            );
        }

        logger.info({
            event: "KASHIER_SESSION_CREATED",
            contractId: metadata.contractId,
            sessionId,
            amountMinor,
            currency: currency.toUpperCase()
        }, "[KashierProvider] Kashier session created");

        return {
            provider: "kashier",
            url: checkoutUrl,
            sessionId,
            amountMinor,
            currency: currency.toUpperCase()
        };
    }

    // ─── Adapter for the existing CheckoutOrchestrator contract ───────────────
    /**
     * createNewCheckoutSession
     * Matches StripeProvider.createNewCheckoutSession() so the existing
     * org checkout flow calls Kashier without branching on provider.
     */
    async createNewCheckoutSession({
        organizationId,
        invoiceId,
        contractId,       // Phase 3: required for webhook contract lookup
        planVersionId,    // Phase 3: required for webhook metadata integrity
        interval,         // Phase 3: carried into webhook for activation
        amount,           // minor units (orchestrator already converts)
        currency,
        successUrl,
        cancelUrl,
        providerPriceId   // unused by Kashier; accepted for interface parity
    } = {}) {
        const session = await this.createCheckout({
            amountMinor: amount,
            currency,
            metadata: {
                orgId: organizationId,
                invoiceId,
                contractId,
                planVersionId,
                interval,
                successUrl,
                cancelUrl,
                providerPriceId: providerPriceId || null
            }
        });
        return { url: session.url, sessionId: session.sessionId };
    }

    // ─── Webhook signature verification ───────────────────────────────────────
    /**
     * verifyWebhook — Phase-2 canonical form.
     * Uses HMAC-SHA256 over the raw request body with KASHIER_WEBHOOK_SECRET.
     *
     * @returns {Promise<boolean>} true iff signature matches.
     */
    async verifyWebhook({ rawBody, signature } = {}) {
        const secret = process.env.KASHIER_WEBHOOK_SECRET;
        if (!secret) {
            logger.warn({ provider: "kashier" }, "[KashierProvider] KASHIER_WEBHOOK_SECRET not configured");
            return false;
        }
        return this._verify(rawBody, signature, secret);
    }

    /**
     * verifyWebhookSignature — base-class alignment with an explicit secret.
     * Returns the parsed event on success (mirrors Stripe's behaviour) so
     * callers that expect the base-class contract keep working.
     *
     * @throws Error when signature is invalid.
     */
    verifyWebhookSignature(payload, signature, secret) {
        const ok = this._verify(payload, signature, secret);
        if (!ok) {
            throw Object.assign(
                new Error("KASHIER_INVALID_SIGNATURE"),
                { code: "KASHIER_INVALID_SIGNATURE" }
            );
        }
        // Payload may be a Buffer or string; parse once if possible.
        if (Buffer.isBuffer(payload) || typeof payload === "string") {
            try { return JSON.parse(payload.toString()); }
            catch (_) { return { raw: payload.toString() }; }
        }
        return payload;
    }

    // ─── Event parsing ────────────────────────────────────────────────────────
    /**
     * parseEvent
     * Normalises Kashier's payload into the platform's canonical event shape.
     * We intentionally only emit `payment_success` and `payment_failed` in
     * Phase 2 — refunds / disputes arrive later with the real integration.
     */
    async parseEvent(rawEvent = {}) {
        const status = (rawEvent.data?.status || rawEvent.status || "").toUpperCase();
        const metadata = rawEvent.data?.metadata || rawEvent.metadata || {};
        const type = status === "SUCCESS" || status === "SUCCEEDED"
            ? "payment_success"
            : "payment_failed";

        const paymentId = rawEvent.data?.id || rawEvent.id || null;
        return {
            provider: "kashier",
            type,
            externalId: paymentId,
            paymentId, // Phase 8 alias — consumer code reads `event.paymentId`
            amountMinor: rawEvent.data?.amount || rawEvent.amount || 0,
            currency: (rawEvent.data?.currency || rawEvent.currency || "EGP").toUpperCase(),
            orgId: metadata.orgId || null,
            // Phase 2 Hardening — canonical name is `planVersionId`.
            // `planId` is accepted as a legacy alias so old sessions still parse.
            planVersionId: metadata.planVersionId || metadata.planId || null,
            contractId: metadata.contractId || null,
            invoiceId: metadata.invoiceId || null,
            interval: metadata.interval || null,
            metadata,
            raw: rawEvent
        };
    }

    // ─── Refunds — stub ───────────────────────────────────────────────────────
    async refundPayment(_paymentId, _amountMinor, _idempotencyKey) {
        throw Object.assign(
            new Error("KASHIER_REFUND_NOT_IMPLEMENTED: refunds will ship with Phase 3 reconciliation."),
            { code: "KASHIER_REFUND_NOT_IMPLEMENTED", status: 501 }
        );
    }

    // ─── Internal helpers ─────────────────────────────────────────────────────
    _verify(rawBody, signature, secret) {
        if (!rawBody || !signature || !secret) return false;
        const bodyBuf = Buffer.isBuffer(rawBody)
            ? rawBody
            : Buffer.from(String(rawBody), "utf8");
        const expected = crypto
            .createHmac("sha256", secret)
            .update(bodyBuf)
            .digest("hex");
        const given = Buffer.from(String(signature), "utf8");
        const expectedBuf = Buffer.from(expected, "utf8");
        if (given.length !== expectedBuf.length) return false;
        return crypto.timingSafeEqual(given, expectedBuf);
    }

}

module.exports = new KashierProvider();
