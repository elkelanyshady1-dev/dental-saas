/**
 * billingReplay.service.js
 * Platform Billing — Billing Event Replay System
 *
 * replayBillingEvent(ledgerEntryId, options)
 *
 * Safely replays a recorded BillingLedger entry through canonicalEventProcessor.
 *
 * ─── SAFETY INVARIANTS ───────────────────────────────────────────────────────
 *  1. NEVER re-charges a payment provider. Replay re-runs state logic only.
 *  2. Only these event types are replayable (not all events make sense to replay):
 *       payment.succeeded → re-applies invoice status update (idempotent)
 *       payment.failed    → re-applies dunning/failed state (idempotent)
 *       invoice.refunded  → re-applies refund bookkeeping (idempotent)
 *       subscription.created / canceled → re-syncs contract state
 *  3. Contrat activation (contract.activated) and invoice.created are NOT
 *     replayable — they are CREATE events; replaying would duplicate data.
 *  4. canonicalEventProcessor has built-in idempotency checks (providerEventId).
 *     Replay passes the original providerEventId so duplicates are caught.
 *  5. Each replay attempt is itself written to BillingLedger with a
 *     metadata.replayOf field linking it back to the original — audit trail.
 *
 * ─── Multi-provider support ───────────────────────────────────────────────────
 *  The ledger entry carries `provider` (stripe | paymob | paypal | internal).
 *  canonicalEventProcessor accepts a normalized event shape regardless of provider.
 *  We reconstruct the canonical event from the ledger entry fields — no provider
 *  SDK calls are made during replay.
 *
 * PLANE: Platform
 */

"use strict";

const mongoose = require("mongoose");
const BillingLedger = require("../models/BillingLedger.model").default;
const { writeLedgerEntry } = require("../models/BillingLedger.model");
const { handleCanonicalEvent } = require("../domain/canonicalEventProcessor");
const logger = require("@utils/logger");

// ─── Replayable event types ──────────────────────────────────────────────────
// CREATE events (invoice.created, contract.activated) are intentionally excluded
// — replaying a create would generate duplicate documents.
const REPLAYABLE_TYPES = new Set([
    "payment.succeeded",
    "payment.failed",
    "invoice.refunded",
    "subscription.created",
    "subscription.canceled"
]);

// ─── Reconstruct canonical event from ledger entry ────────────────────────────
// handleCanonicalEvent expects:
//   { provider, type, externalId, amount, currency, metadata, raw }
// We reconstruct as much as possible from ledger fields.
function buildCanonicalEvent(entry) {
    return {
        provider: entry.provider,
        type: entry.eventType,        // canonical: "payment.succeeded" etc.
        externalId: entry.providerEventId,  // canonical: provider's event ID
        isReplay: true,                   // signal to processor that this is a replay
        amount: entry.amountMinor ?? Math.round((entry.amount ?? 0) * 100),
        currency: entry.currency,
        metadata: {
            organizationId: entry.organizationId,
            contractId: entry.contractId,
            invoiceId: entry.invoiceId,
            ...(entry.metadata || {})
        },
        raw: {}   // original raw payload not preserved in ledger — empty for replay
    };
}

/**
 * replayBillingEvent
 *
 * @param {string|ObjectId} ledgerEntryId   - BillingLedger _id to replay
 * @param {{ replayedBy: string }}  options  - actorId for audit trail
 *
 * @returns {Promise<{
 *   success: boolean,
 *   ledgerEntryId: string,
 *   eventType: string,
 *   provider: string,
 *   processResult?: object,
 *   error?: string
 * }>}
 */
async function replayBillingEvent(ledgerEntryId, { replayedBy } = {}) {
    // ── 1. Load ledger entry ─────────────────────────────────────────────────
    const entry = await BillingLedger.findById(ledgerEntryId).lean();
    if (!entry) {
        throw new Error(`[BillingReplay] Ledger entry not found: ${ledgerEntryId}`);
    }

    // ── 2. Guard: only replayable event types ─────────────────────────────────
    if (!REPLAYABLE_TYPES.has(entry.eventType)) {
        throw new Error(
            `[BillingReplay] Event type "${entry.eventType}" is not replayable. ` +
            `Replayable types: ${[...REPLAYABLE_TYPES].join(", ")}.`
        );
    }

    logger.info(
        {
            ledgerEntryId: entry._id,
            eventType: entry.eventType,
            provider: entry.provider,
            providerEventId: entry.providerEventId,
            replayedBy
        },
        "[BillingReplay] Starting event replay"
    );

    // ── 3. Construct canonical event shape ───────────────────────────────────
    const canonicalEvent = buildCanonicalEvent(entry);

    // ── 4. Re-run canonical processor ────────────────────────────────────────
    // processCanonicalEvent is idempotent on providerEventId — if the event was
    // already processed, it recognizes the duplicate and no-ops.
    let processResult;
    try {
        processResult = await handleCanonicalEvent(canonicalEvent, { correlationId: `replay:${entry._id}` });
    } catch (processorErr) {
        logger.error(
            { err: processorErr, ledgerEntryId: entry._id },
            "[BillingReplay] canonicalEventProcessor threw during replay"
        );
        throw new Error(
            `[BillingReplay] Processor error during replay: ${processorErr.message}`
        );
    }

    // ── 5. Write replay audit entry to ledger ────────────────────────────────
    // The replay itself is a new ledger row so we have a full audit trail.
    // replayOf links it back to the original entry.
    await writeLedgerEntry({
        eventType: entry.eventType,
        organizationId: entry.organizationId,
        contractId: entry.contractId,
        invoiceId: entry.invoiceId,
        providerEventId: entry.providerEventId,
        provider: entry.provider,
        amount: entry.amount,
        currency: entry.currency,
        source: "canonicalEventProcessor",
        metadata: {
            replayOf: entry._id.toString(),
            replayedBy: replayedBy || "system",
            replayedAt: new Date().toISOString(),
            processorResponse: processResult ? JSON.stringify(processResult).slice(0, 300) : null
        }
    });

    logger.info(
        { ledgerEntryId: entry._id, eventType: entry.eventType, provider: entry.provider },
        "[BillingReplay] Event replay completed"
    );

    return {
        success: true,
        ledgerEntryId: entry._id.toString(),
        eventType: entry.eventType,
        provider: entry.provider,
        processResult
    };
}

/**
 * listReplayableEvents
 *
 * Returns a paginated list of ledger entries eligible for replay.
 * Used by the admin billing events page.
 *
 * @param {{ page?: number, limit?: number, provider?: string, eventType?: string }} opts
 */
async function listReplayableEvents({ page = 1, limit = 50, provider, eventType } = {}) {
    const filter = {
        eventType: { $in: [...REPLAYABLE_TYPES] }
    };
    if (provider) filter.provider = provider;
    if (eventType && REPLAYABLE_TYPES.has(eventType)) filter.eventType = eventType;

    const skip = (page - 1) * Math.min(limit, 200);

    const [entries, total] = await Promise.all([
        BillingLedger
            .find(filter)
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(Math.min(limit, 200))
            .lean(),
        BillingLedger.countDocuments(filter)
    ]);

    return { entries, total, page, limit };
}

module.exports = { replayBillingEvent, listReplayableEvents, REPLAYABLE_TYPES };
