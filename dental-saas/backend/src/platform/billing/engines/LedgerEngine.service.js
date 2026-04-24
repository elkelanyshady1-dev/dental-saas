/**
 * LedgerEngine.service.js
 * v22.0 — Formal Ledger Engine
 *
 * PURPOSE:
 * Encapsulates all ledger write operations in a dedicated engine service.
 * Previously, `writeLedgerEntry()` was co-located with the BillingLedger model.
 * This service is now the canonical entry point for ledger writes.
 *
 * The BillingLedger model file continues to export writeLedgerEntry for
 * backward compatibility — but it now delegates HERE. All new code should
 * import from this engine.
 *
 * Also provides:
 *   - getCreditBalance(orgId) — aggregates refund/credit ledger events
 *   - verifyChain(orgId)      — validates hash chain integrity
 *
 * SENTINEL PRE-CHECK:
 *   Contract impact:  None
 *   RBAC impact:      None — called by services, not directly by routes
 *   Plane isolation:  Platform only
 *   Regression risk:  LOW — additive; model re-export unchanged
 *
 * PLANE: Platform
 */

"use strict";

const mongoose = require("mongoose");
const logger = require("@utils/logger");
const { computeLedgerHash, verifyLedgerHash } = require("../utils/ledgerHash");

// ── Model reference ──────────────────────────────────────────────────────────
// Bound to the platform connection via getPlatformModel (Step 5f).
const getPlatformModel = require("@core/db/getPlatformModel");
const BillingLedgerDef = require("../models/BillingLedger.model");

let _BillingLedger;
function getBillingLedger() {
    if (!_BillingLedger) {
        _BillingLedger = getPlatformModel(BillingLedgerDef);
    }
    return _BillingLedger;
}

// ─── Event severity classification ───────────────────────────────────────────
const CRITICAL_EVENT_TYPES = new Set([
    "invoice.created", "invoice.voided",
    "payment.succeeded", "payment.failed", "payment.partial", "payment.refunded",
    "invoice.refunded",
    "contract.activated", "contract.suspended", "contract.voided", "contract.terminated",
    "renewal.completed"
]);

// ─── writeLedgerEntry ─────────────────────────────────────────────────────────
async function writeLedgerEntry(entry, session = null, options = {}) {
    const { strict = false } = options;

    try {
        const BillingLedger = getBillingLedger();

        // ── v23.0: Zero-value guard — skip financial noise ──────────────────
        // Non-financial events (amount === 0) from non-billable contracts
        // pollute the ledger without adding audit value. Skip them with a
        // warning so reconciliation can still detect anomalies.
        if ((!entry.amount || entry.amount === 0) && entry.eventType !== "contract.activated") {
            logger.warn({
                event: "LEDGER_ZERO_VALUE_SKIPPED",
                eventType: entry.eventType,
                contractId: entry.contractId || null,
                organizationId: entry.organizationId,
            }, "[LedgerEngine] Skipping zero-value ledger entry");
            return { written: false, hash: null, skipped: true, reason: "ZERO_VALUE" };
        }

        // ── PART 4: Idempotency key guard (strong — key-based, retry-safe) ────
        // Checked FIRST — if a key is present and already used, return immediately.
        // This is stronger than the time-window check below: it guarantees exactly-once
        // semantics regardless of timing (covers retries hours/days later).
        if (entry.idempotencyKey) {
            const keyMatch = await BillingLedger.findOne({ idempotencyKey: entry.idempotencyKey })
                .select("_id eventType")
                .lean();
            if (keyMatch) {
                logger.info({
                    event: "LEDGER_IDEMPOTENT_RETURN",
                    idempotencyKey: entry.idempotencyKey,
                    existingEntryId: String(keyMatch._id),
                    eventType: entry.eventType,
                }, "[LedgerEngine] Idempotent write — returning existing entry");
                return { written: false, hash: null, idempotent: true, existingId: String(keyMatch._id) };
            }
        }

        // ── PART 7: Time-window duplicate protection (soft — heuristic fallback) ──
        // Catches duplicates within 60 s for events without an idempotency key.
        // Belt-and-suspenders: the key guard above handles keyed callers precisely.
        if (entry.organizationId && entry.eventType) {
            const dupeWindow = new Date(Date.now() - 60000);
            const dupeQuery = {
                organizationId: entry.organizationId,
                eventType: entry.eventType,
                createdAt: { $gte: dupeWindow },
            };
            if (entry.contractId) dupeQuery.contractId = entry.contractId;
            if (entry.invoiceId) dupeQuery.invoiceId = entry.invoiceId;

            const existing = await BillingLedger.findOne(dupeQuery)
                .select("_id eventType createdAt")
                .lean();

            if (existing) {
                logger.warn({
                    event: "LEDGER_DUPLICATE_BLOCKED",
                    eventType: entry.eventType,
                    organizationId: entry.organizationId,
                    contractId: entry.contractId || null,
                    invoiceId: entry.invoiceId || null,
                    existingEntryId: String(existing._id),
                    existingCreatedAt: existing.createdAt,
                }, "[LedgerEngine] Duplicate ledger event blocked — time-window guard");
                return { written: false, hash: null, duplicate: true };
            }
        }

        // ── Resolve previous hash for this organization (chain link) ─────────
        let previousHash = null;
        try {
            const lastHashed = await BillingLedger
                .findOne(
                    { organizationId: entry.organizationId, hash: { $ne: null } },
                    { hash: 1, createdAt: 1 }
                )
                .sort({ createdAt: -1 })
                .lean();
            previousHash = (lastHashed && lastHashed.hash) ? lastHashed.hash : "GENESIS";
        } catch (hashLookupErr) {
            logger.error(
                { err: hashLookupErr, organizationId: entry.organizationId, event: "HASH_LOOKUP_FAILED" },
                "[LedgerEngine] Could not resolve previousHash — entry will have null previousHash (chain broken)"
            );
        }

        // ── Build the document ────────────────────────────────────────────────
        const createdAt = new Date();

        const doc = {
            eventType: entry.eventType,
            organizationId: entry.organizationId,
            contractId: entry.contractId || null,
            invoiceId: entry.invoiceId || null,
            paymentAttemptId: entry.paymentAttemptId || null,
            providerEventId: entry.providerEventId || null,
            provider: entry.provider || "internal",
            amount: entry.amount || 0,
            amountMinor: Math.round((entry.amount || 0) * 100),
            currency: entry.currency,
            source: entry.source,
            actorType: entry.actorType || "system",
            metadata: entry.metadata || {},
            // v24.1: Idempotency key — enables exactly-once semantics on retry
            idempotencyKey: entry.idempotencyKey || null,
            previousHash: previousHash,
            hash: null
        };

        // ── Compute hash AFTER all fields are set ─────────────────────────────
        doc.hash = computeLedgerHash(
            Object.assign({}, doc, { createdAt: createdAt }),
            previousHash
        );

        var createOpts = session ? { session: session } : {};
        var result = await BillingLedger.create([Object.assign({}, doc, { createdAt: createdAt })], createOpts);
        var created = result[0];

        // ── PART 4: Post-write hash chain verification ──────────────────────
        if (created && previousHash !== null) {
            var storedHash = created.hash || (created.toObject ? created.toObject().hash : null);
            if (storedHash && storedHash !== doc.hash) {
                logger.error({
                    event: "LEDGER_HASH_CHAIN_MISMATCH",
                    organizationId: entry.organizationId,
                    expectedHash: doc.hash,
                    storedHash: storedHash,
                    previousHash: previousHash,
                    eventType: entry.eventType
                }, "[LedgerEngine] Hash chain mismatch detected after write — chain integrity compromised");
            }
        }

        return { written: true, hash: doc.hash };
    } catch (err) {
        var severity = CRITICAL_EVENT_TYPES.has(entry.eventType) ? "CRITICAL" : "WARNING";

        logger.error({
            err: err,
            event: "LEDGER_WRITE_FAILED",
            severity: severity,
            context: "LedgerEngine.writeLedgerEntry",
            eventType: entry.eventType,
            organizationId: entry.organizationId,
            contractId: entry.contractId || null,
            invoiceId: entry.invoiceId || null,
            requestId: (entry.requestId || (entry.metadata && entry.metadata.correlationId)) || null,
            source: entry.source || null
        }, "[LedgerEngine] LEDGER_WRITE_FAILED (" + severity + ") — run reconciliation immediately if CRITICAL");

        // ── PART 3: Strict mode — re-throw for CRITICAL events ──────────────
        if (strict && severity === "CRITICAL") {
            var strictErr = new Error(
                "[LedgerEngine] CRITICAL ledger write failed for " + entry.eventType + ": " + err.message
            );
            strictErr.code = "LEDGER_WRITE_CRITICAL_FAILURE";
            strictErr.status = 500;
            strictErr.originalError = err;
            throw strictErr;
        }

        return { written: false, hash: null };
    }
}

// ─── getCreditBalance ─────────────────────────────────────────────────────────
async function getCreditBalance(orgId) {
    try {
        const BillingLedger = getBillingLedger();

        const creditEventTypes = ["payment.refunded", "invoice.refunded"];
        const debitEventTypes = ["credit.applied"];

        const results = await Promise.all([
            BillingLedger.find(
                { organizationId: orgId, eventType: { $in: creditEventTypes } },
                { amount: 1, currency: 1, eventType: 1, createdAt: 1, invoiceId: 1, metadata: 1 }
            ).sort({ createdAt: -1 }).lean(),

            BillingLedger.find(
                { organizationId: orgId, eventType: { $in: debitEventTypes } },
                { amount: 1, currency: 1, eventType: 1, createdAt: 1, invoiceId: 1 }
            ).sort({ createdAt: -1 }).lean()
        ]);

        const creditEntries = results[0];
        const debitEntries = results[1];

        const totalCredits = creditEntries.reduce(function(sum, e) { return sum + (e.amount || 0); }, 0);
        const totalDebits = debitEntries.reduce(function(sum, e) { return sum + (e.amount || 0); }, 0);
        const creditBalance = Math.max(0, totalCredits - totalDebits);

        const credits = [].concat(
            creditEntries.map(function(e) {
                return {
                    type: "credit",
                    eventType: e.eventType,
                    amount: e.amount,
                    currency: e.currency,
                    invoiceId: e.invoiceId,
                    createdAt: e.createdAt,
                    reason: (e.metadata && (e.metadata.refundReason || e.metadata.reason)) || null
                };
            }),
            debitEntries.map(function(e) {
                return {
                    type: "debit",
                    eventType: e.eventType,
                    amount: e.amount,
                    currency: e.currency,
                    invoiceId: e.invoiceId,
                    createdAt: e.createdAt
                };
            })
        ).sort(function(a, b) { return new Date(b.createdAt) - new Date(a.createdAt); });

        return { creditBalance: creditBalance, credits: credits };
    } catch (err) {
        logger.error(
            { err: err, orgId: orgId, event: "CREDIT_BALANCE_QUERY_FAILED" },
            "[LedgerEngine] getCreditBalance failed — returning zero"
        );
        return { creditBalance: 0, credits: [] };
    }
}

// ─── verifyChain ──────────────────────────────────────────────────────────────
async function verifyChain(orgId, limit) {
    if (limit === undefined) limit = 500;
    const BillingLedger = getBillingLedger();
    const violations = [];

    const entries = await BillingLedger
        .find(
            { organizationId: orgId, hash: { $ne: null } },
            {
                hash: 1, previousHash: 1, eventType: 1, organizationId: 1,
                invoiceId: 1, amount: 1, currency: 1, source: 1, createdAt: 1
            }
        )
        .sort({ createdAt: 1 })
        .limit(limit)
        .lean();

    for (var i = 0; i < entries.length; i++) {
        var entry = entries[i];
        var isValid = verifyLedgerHash(entry, entry.previousHash);
        if (!isValid) {
            violations.push({
                ledgerId: entry._id,
                eventType: entry.eventType,
                expectedHash: computeLedgerHash(entry, entry.previousHash),
                actualHash: entry.hash,
                createdAt: entry.createdAt
            });
            if (violations.length >= 10) break;
        }
    }

    return {
        valid: violations.length === 0,
        violations: violations,
        checked: entries.length
    };
}

// ─── Exports ──────────────────────────────────────────────────────────────────

module.exports = {
    writeLedgerEntry: writeLedgerEntry,
    getCreditBalance: getCreditBalance,
    verifyChain: verifyChain
};
