/**
 * stripe.webhook.controller.js
 * v14.1 — Relocated to platform/billing/controllers (Platform Plane)
 *
 * Region-Aware Webhook Gateway.
 * Lives in platform plane because:
 *   - processes provider-level events (Stripe, Paymob, PayPal)
 *   - uses platform billing domain (paymentProviderFactory, canonicalEventProcessor)
 *   - has no org-plane authorization concern
 *
 * Previously at: modules/billingDomain/controllers/stripe.webhook.controller.js
 */

"use strict";

const { getRegionContext } = require("@infra/regionRouter");
const { getProvider } = require("../providers/paymentProviderFactory");
const { handleCanonicalEvent } = require("../domain/canonicalEventProcessor");
const logger = require("@utils/logger");
const distributedLock = require("../../../utils/DistributedLock");
const { metrics } = require("@infra/metrics/metrics");

/**
 * handleWebhook
 * v14.1 — Resolves regional context, validates signature with regional secret.
 */
exports.handleWebhook = async (req, res) => {
    const startTime = Date.now();
    const sig = req.headers["stripe-signature"];
    const correlationId = req.correlationId;

    // 1. Resolve Region
    const regionCode = req.params.regionCode || req.regionCode;

    if (!regionCode) {
        metrics.webhook_region_validation_failure_total?.inc({ regionCode: "UNKNOWN" });
        logger.error({ correlationId }, "[Webhook] Region context missing in webhook flow");
        return res.status(400).send("Region context required");
    }

    try {
        const { mongooseConnection } = await getRegionContext(regionCode);
        const StripeEvent = mongooseConnection.model("StripeEvent");

        // 2. Early Guard
        if (!sig) {
            metrics.webhookTotal.inc({ status: "signature_failed", regionCode });
            return res.status(400).send("Missing signature");
        }

        // 3. Signature Verification via StripeProvider
        let event;
        try {
            const stripeProvider = getProvider("stripe");
            const regionConfig = await require("@shared/models/Region.model").findOne({ code: regionCode.toUpperCase() });
            const webhookSecret =
                regionConfig?.providerKeys?.stripe?.webhookSecret ||
                regionConfig?.stripeWebhookSecret ||  // legacy fallback
                process.env.STRIPE_WEBHOOK_SECRET;

            event = stripeProvider.verifyWebhookSignature(req.body, sig, webhookSecret);
        } catch (err) {
            metrics.webhookTotal.inc({ status: "signature_failed", regionCode });
            logger.error({ err, correlationId, regionCode }, "Webhook signature verification failed for region");
            return res.status(400).json({ error: `Webhook Error: ${err.message}` });
        }

        metrics.webhookTotal.inc({ type: event.type, status: "received", regionCode });

        // 4. Multi-node Lock (Short-lived, Mongo-backed via DistributedLock).
        // Phase 6 migration: v14.1's Redis lock was replaced by the Mongo
        // primitive in src/utils/DistributedLock.js. API shape identical —
        // acquire returns a token string on success, null on contention.
        // Stripe safety: contention returns 200 so Stripe does NOT retry;
        // another instance is already processing the same event.id.
        const lockKey = `webhook:lock:${regionCode}:${event.id}`;
        const token = await distributedLock.acquire(lockKey, 30000);
        if (!token) {
            metrics.webhookTotal.inc({ type: event.type, status: "locked", regionCode });
            return res.status(200).json({ received: true, locked: true });
        }

        try {
            // 5. Deduplication (Regional DB)
            const existingEvent = await StripeEvent.findOne({ eventId: event.id });
            if (existingEvent) {
                metrics.webhookTotal.inc({ type: event.type, status: "duplicate", regionCode });
                return res.status(200).json({ received: true, duplicate: true });
            }

            await StripeEvent.create({
                eventId: event.id,
                type: event.type,
                correlationId,
                regionCode
            });

            // 6. Normalize to canonical event shape (Stripe-specific strings STAY in provider layer)
            const stripeProvider = getProvider("stripe");
            const canonicalEvent = stripeProvider.normalizeToCanonical(event);

            if (!canonicalEvent) {
                // Event type is not handled — log and acknowledge
                logger.info({ type: event.type, correlationId, regionCode }, `[Webhook] Unhandled event type — no canonical mapping`);
                return res.json({ received: true, handled: false });
            }

            // 7. Canonical processing (provider-agnostic business logic)
            const result = await handleCanonicalEvent(canonicalEvent, { regionCode, correlationId });

            metrics.webhookTotal.inc({ type: canonicalEvent.type, status: result.reason || "processed", regionCode });
            metrics.webhookDuration.observe({ type: canonicalEvent.type, regionCode }, Date.now() - startTime);

            res.json({ received: true, ...result });

        } finally {
            await distributedLock.release(lockKey, token);
        }

    } catch (err) {
        metrics.webhookTotal.inc({ status: "failed", regionCode });
        logger.error({ err, correlationId, regionCode }, "Webhook processing failed");
        res.status(500).json({ error: "Internal processing error" });
    }
};
