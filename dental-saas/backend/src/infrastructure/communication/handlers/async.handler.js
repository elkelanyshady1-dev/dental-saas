/**
 * async.handler.js
 * Hybrid Execution Model — ASYNC path (Phase 4: QStash).
 *
 * Delivery matrix:
 *   ENABLE_QUEUE=false              → transparent SYNC fallback (dev default, incident toggle).
 *   ENABLE_QUEUE=true, no QStash    → SYNC fallback + WARN (dev convenience; prod safety interlock
 *                                     in server.js prevents this combo at boot when NODE_ENV=production).
 *   ENABLE_QUEUE=true, QStash ready → publish webhook to QSTASH_WEBHOOK_URL.
 *   ENABLE_QUEUE=true, publish err  → SYNC fallback so the message still goes out.
 *
 * The QStash receiver (src/jobs/controllers/job.controller.js) verifies the signature
 * and re-enters the dispatcher with { hint: "sync" } — forced SYNC is the
 * loop-prevention invariant. Without it, ASYNC routing inside the worker
 * would re-publish the same job and loop indefinitely.
 *
 * Header forwarding: the @upstash/qstash SDK auto-prefixes any header not
 * starting with `content-type` or `upstash-` with `Upstash-Forward-`, so
 * the webhook receives the headers verbatim (see node_modules/@upstash/qstash
 * chunk-35B33QW3.mjs prefixHeaders(), line 268).
 *
 * @per-plane Infrastructure
 */

"use strict";

const logger = require("@utils/logger");
const config = require("@config/communication.config");
const { deliverSync } = require("./sync.handler");

let _qstashClient = null;
function _getClient() {
    if (_qstashClient) return _qstashClient;
    const token = process.env.QSTASH_TOKEN;
    if (!token) return null;
    const { Client } = require("@upstash/qstash");
    _qstashClient = new Client({ token });
    return _qstashClient;
}

async function deliverAsync({ channel, type, payload }) {
    if (!config.ENABLE_QUEUE) {
        logger.warn(
            { channel, type },
            "[ASYNC→SYNC FALLBACK] ENABLE_QUEUE=false — delivering synchronously"
        );
        const syncResult = await deliverSync({ channel, type, payload });
        return { mode: "async-fallback-sync", result: syncResult };
    }

    const client = _getClient();
    const webhookUrl = process.env.QSTASH_WEBHOOK_URL;

    if (!client || !webhookUrl) {
        logger.warn(
            { channel, type, hasToken: !!client, hasUrl: !!webhookUrl },
            "[ASYNC→SYNC FALLBACK] QStash not configured — delivering synchronously"
        );
        const syncResult = await deliverSync({ channel, type, payload });
        return { mode: "async-fallback-sync", result: syncResult };
    }

    try {
        const res = await client.publishJSON({
            url: webhookUrl,
            body: { channel, type, payload },
            headers: {
                // Defense-in-depth beyond the QStash signature. Prod will
                // reject at the receiver if this doesn't match INTERNAL_API_KEY.
                "x-internal-key": process.env.INTERNAL_API_KEY || "",
                // Observability marker — lets the receiver log "yes this came
                // through QStash" and aids debugging if someone curls the
                // endpoint directly. Not used for auth decisions.
                "x-qstash-processed": "true",
            },
            retries: 3,
        });
        return { mode: "async", messageId: res?.messageId || null };
    } catch (err) {
        // Resilience: if QStash publish itself fails (network, rate-limit,
        // token revoked), deliver synchronously rather than dropping the
        // message. The original error is logged, not swallowed.
        logger.error(
            { channel, type, err: err.message },
            "[QSTASH PUBLISH FAILED] falling back to sync delivery"
        );
        const syncResult = await deliverSync({ channel, type, payload });
        return { mode: "async-fallback-sync", result: syncResult };
    }
}

module.exports = { deliverAsync };
