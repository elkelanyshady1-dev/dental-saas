/**
 * ledgerHash.js
 * Platform Billing — Ledger Hash Chain Utility
 *
 * PURPOSE:
 * Generates a tamper-evident SHA-256 hash for each BillingLedger entry.
 * Each hash is derived from the entry's financial fields PLUS the previous
 * entry's hash, forming an immutable cryptographic chain.
 *
 * DESIGN:
 *   hash(N) = SHA-256( previousHash(N-1) + deterministic_payload(N) )
 *
 * If any ledger entry is modified or deleted, the hash chain breaks and
 * the LEDGER_HASH_CHAIN_VALID guardian invariant will detect the violation.
 *
 * FIELDS INCLUDED IN HASH:
 *   - previousHash   (chain link)
 *   - eventType      (what happened)
 *   - organizationId (who it happened to)
 *   - invoiceId      (which invoice)
 *   - amount         (monetary value — tamper magnet)
 *   - currency       (denomination)
 *   - source         (which system wrote it)
 *   - createdAt      (when it happened — set before hashing)
 *
 * BACKWARD COMPATIBILITY:
 *   Existing entries without a hash MUST remain valid. The guardian check
 *   and chain traversal skip entries where hash is null/undefined.
 *
 * PLANE: Platform
 */

"use strict";

const crypto = require("crypto");

/**
 * computeLedgerHash
 *
 * Deterministically hashes an in-memory ledger entry document.
 * Called BEFORE saving to DB so that createdAt can be injected as a stable value.
 *
 * @param {object} entry            - The ledger entry fields (as plain object)
 * @param {string|null} previousHash - Hash of the preceding entry for this org (null if first)
 * @returns {string}                 - 64-char hex SHA-256 digest
 */
function computeLedgerHash(entry, previousHash) {
    const payload = JSON.stringify({
        previousHash: previousHash ?? null,
        eventType: entry.eventType ?? null,
        organizationId: String(entry.organizationId ?? ""),
        invoiceId: entry.invoiceId ? String(entry.invoiceId) : null,
        amount: entry.amount ?? 0,
        currency: entry.currency ?? null,
        source: entry.source ?? null,
        // createdAt must be stable — caller should pass the value it will persist
        createdAt: entry.createdAt instanceof Date
            ? entry.createdAt.toISOString()
            : (entry.createdAt ?? null)
    });

    return crypto
        .createHash("sha256")
        .update(payload, "utf8")
        .digest("hex");
}

/**
 * verifyLedgerHash
 *
 * Re-derives the expected hash for a saved ledger entry and compares it
 * to the stored hash. Used by the LEDGER_HASH_CHAIN_VALID guardian invariant.
 *
 * @param {object} entry - A lean() BillingLedger document from MongoDB
 * @returns {{ valid: boolean, expected: string, actual: string }}
 */
function verifyLedgerHash(entry) {
    // Entries created before the hash chain was introduced have no hash — skip
    if (!entry.hash) {
        return { valid: true, skipped: true };
    }

    const expected = computeLedgerHash(
        {
            eventType: entry.eventType,
            organizationId: entry.organizationId,
            invoiceId: entry.invoiceId,
            amount: entry.amount,
            currency: entry.currency,
            source: entry.source,
            createdAt: entry.createdAt
        },
        entry.previousHash ?? null
    );

    return {
        valid: expected === entry.hash,
        expected,
        actual: entry.hash
    };
}

module.exports = { computeLedgerHash, verifyLedgerHash };
