/**
 * billingReconciliation.service.js
 * v22.3 — Billing Reconciliation Engine
 *
 * PURPOSE:
 * Self-detection of billing state inconsistencies. Scans contracts, invoices,
 * and ledger entries for a given organization and reports any gaps or mismatches.
 *
 * This is a READ-ONLY diagnostic tool. It does NOT fix anything — it surfaces
 * problems so operators can investigate and resolve them manually.
 *
 * INCONSISTENCIES DETECTED:
 *   1. Active contracts with no matching invoice (paid plans only)
 *   2. Paid invoices with no corresponding ledger entry
 *   3. Ledger hash chain violations
 *   4. Orphaned invoices (no matching contract)
 *   5. Contracts stuck in pending_payment beyond grace window
 *   6. Zero-value contracts that have invoices (should not exist)
 *   7. Duplicate ledger entries for the same event
 *
 * RULE:
 *   ❗ System must self-detect inconsistencies.
 *   ❗ No write operations — read-only diagnostics.
 *
 * SENTINEL PRE-CHECK:
 *   Contract impact:  None — read-only
 *   RBAC impact:      None — called by platform services/controllers
 *   Plane isolation:  Platform only
 *   Regression risk:  NONE — additive, no mutations
 *
 * PLANE: Platform
 */

"use strict";

const logger = require("@utils/logger");
const getPlatformModel = require("@core/db/getPlatformModel");
const OrgContractDef = require("../models/OrgContract.model");
const PlatformInvoiceDef = require("../models/PlatformInvoice.model");
const BillingLedgerDef = require("../models/BillingLedger.model");
const { verifyChain } = require("../engines/LedgerEngine.service");

// ── Lazy model references ────────────────────────────────────────────────────
// Bound to the platform connection via getPlatformModel (Step 5f).
let _OrgContract, _PlatformInvoice, _BillingLedger;

function getOrgContract() {
    if (!_OrgContract) _OrgContract = getPlatformModel(OrgContractDef);
    return _OrgContract;
}

function getPlatformInvoice() {
    if (!_PlatformInvoice) _PlatformInvoice = getPlatformModel(PlatformInvoiceDef);
    return _PlatformInvoice;
}

function getBillingLedger() {
    if (!_BillingLedger) _BillingLedger = getPlatformModel(BillingLedgerDef);
    return _BillingLedger;
}

// ── Grace window for pending_payment contracts (48 hours) ────────────────────
const PENDING_PAYMENT_GRACE_MS = 48 * 60 * 60 * 1000;

/**
 * reconcileBilling
 *
 * Scans an organization's billing state and returns all detected
 * inconsistencies. Returns an empty gaps array when everything is consistent.
 *
 * @param {string|ObjectId} orgId - Organization ID to reconcile
 * @param {object} [options]
 * @param {number} [options.hashChainLimit=500] - Max ledger entries for chain check
 * @returns {Promise<{
 *   organizationId: string,
 *   consistent: boolean,
 *   gaps: Array<{ type: string, severity: string, detail: object }>,
 *   summary: { contracts: number, invoices: number, ledgerEntries: number },
 *   checkedAt: Date
 * }>}
 */
async function reconcileBilling(orgId, options = {}) {
    const { hashChainLimit = 500 } = options;
    const gaps = [];
    const checkedAt = new Date();

    const OrgContract = getOrgContract();
    const PlatformInvoice = getPlatformInvoice();
    const BillingLedger = getBillingLedger();

    // ── Fetch all billing data for the org ────────────────────────────────────
    const [contracts, invoices, ledgerEntries] = await Promise.all([
        OrgContract.find({ organizationId: orgId })
            .select("_id contractStatus lockedPrice planVersionId planCode createdAt effectiveFrom")
            .lean(),
        PlatformInvoice.find({ organizationId: orgId })
            .select("_id contractId status totalAmount amountPaid createdAt")
            .lean(),
        BillingLedger.find({ organizationId: orgId })
            .select("_id eventType contractId invoiceId amount createdAt hash previousHash")
            .sort({ createdAt: 1 })
            .lean()
    ]);

    // ── Build lookup maps ─────────────────────────────────────────────────────
    const invoiceByContractId = new Map();
    for (const inv of invoices) {
        if (inv.contractId) {
            if (!invoiceByContractId.has(String(inv.contractId))) {
                invoiceByContractId.set(String(inv.contractId), []);
            }
            invoiceByContractId.get(String(inv.contractId)).push(inv);
        }
    }

    const ledgerByInvoiceId = new Map();
    const ledgerByContractId = new Map();
    for (const entry of ledgerEntries) {
        if (entry.invoiceId) {
            if (!ledgerByInvoiceId.has(String(entry.invoiceId))) {
                ledgerByInvoiceId.set(String(entry.invoiceId), []);
            }
            ledgerByInvoiceId.get(String(entry.invoiceId)).push(entry);
        }
        if (entry.contractId) {
            if (!ledgerByContractId.has(String(entry.contractId))) {
                ledgerByContractId.set(String(entry.contractId), []);
            }
            ledgerByContractId.get(String(entry.contractId)).push(entry);
        }
    }

    const contractIdSet = new Set(contracts.map(c => String(c._id)));

    // ── CHECK 1: Active paid contracts without invoices ───────────────────────
    for (const contract of contracts) {
        const cid = String(contract._id);
        const isPaid = (contract.lockedPrice || 0) > 0;
        const isActive = contract.contractStatus === "active";

        if (isPaid && isActive) {
            const contractInvoices = invoiceByContractId.get(cid) || [];
            if (contractInvoices.length === 0) {
                gaps.push({
                    type: "ACTIVE_CONTRACT_NO_INVOICE",
                    severity: "CRITICAL",
                    detail: {
                        contractId: cid,
                        lockedPrice: contract.lockedPrice,
                        contractStatus: contract.contractStatus,
                    }
                });
            }
        }
    }

    // ── CHECK 2: Paid invoices without ledger entries ─────────────────────────
    for (const invoice of invoices) {
        const iid = String(invoice._id);
        if (invoice.status === "paid") {
            const invoiceLedgerEntries = ledgerByInvoiceId.get(iid) || [];
            const hasPaymentEvent = invoiceLedgerEntries.some(
                e => e.eventType === "payment.succeeded" || e.eventType === "invoice.created"
            );
            if (!hasPaymentEvent) {
                gaps.push({
                    type: "PAID_INVOICE_NO_LEDGER",
                    severity: "CRITICAL",
                    detail: {
                        invoiceId: iid,
                        contractId: invoice.contractId ? String(invoice.contractId) : null,
                        totalAmount: invoice.totalAmount,
                        amountPaid: invoice.amountPaid,
                    }
                });
            }
        }
    }

    // ── CHECK 3: Ledger hash chain integrity ─────────────────────────────────
    try {
        const chainResult = await verifyChain(orgId, hashChainLimit);
        if (!chainResult.valid) {
            for (const violation of chainResult.violations) {
                gaps.push({
                    type: "LEDGER_HASH_CHAIN_BROKEN",
                    severity: "CRITICAL",
                    detail: {
                        ledgerId: String(violation.ledgerId),
                        eventType: violation.eventType,
                        expectedHash: violation.expectedHash,
                        actualHash: violation.actualHash,
                        createdAt: violation.createdAt,
                    }
                });
            }
        }
    } catch (chainErr) {
        gaps.push({
            type: "LEDGER_CHAIN_VERIFY_FAILED",
            severity: "WARNING",
            detail: { error: chainErr.message }
        });
    }

    // ── CHECK 4: Orphaned invoices (no matching contract) ────────────────────
    for (const invoice of invoices) {
        if (invoice.contractId && !contractIdSet.has(String(invoice.contractId))) {
            gaps.push({
                type: "ORPHANED_INVOICE",
                severity: "WARNING",
                detail: {
                    invoiceId: String(invoice._id),
                    contractId: String(invoice.contractId),
                    status: invoice.status,
                    totalAmount: invoice.totalAmount,
                }
            });
        }
    }

    // ── CHECK 5: Contracts stuck in pending_payment beyond grace ─────────────
    const graceCutoff = new Date(Date.now() - PENDING_PAYMENT_GRACE_MS);
    for (const contract of contracts) {
        if (
            contract.contractStatus === "pending_payment" &&
            contract.createdAt &&
            new Date(contract.createdAt) < graceCutoff
        ) {
            gaps.push({
                type: "STALE_PENDING_PAYMENT",
                severity: "WARNING",
                detail: {
                    contractId: String(contract._id),
                    createdAt: contract.createdAt,
                    hoursStale: Math.round(
                        (Date.now() - new Date(contract.createdAt).getTime()) / (60 * 60 * 1000)
                    ),
                }
            });
        }
    }

    // ── CHECK 6: Zero-value contracts with invoices (should not exist) ───────
    for (const contract of contracts) {
        const cid = String(contract._id);
        if ((contract.lockedPrice || 0) === 0) {
            const contractInvoices = invoiceByContractId.get(cid) || [];
            if (contractInvoices.length > 0) {
                gaps.push({
                    type: "ZERO_VALUE_HAS_INVOICE",
                    severity: "CRITICAL",
                    detail: {
                        contractId: cid,
                        invoiceCount: contractInvoices.length,
                        invoiceIds: contractInvoices.map(i => String(i._id)),
                    }
                });
            }
        }
    }

    // ── CHECK 7: Duplicate ledger entries (same eventType + contractId within 60s) ──
    const seenEvents = new Map(); // key: `${eventType}:${contractId}:${invoiceId}` → timestamp
    for (const entry of ledgerEntries) {
        const key = `${entry.eventType}:${entry.contractId || ""}:${entry.invoiceId || ""}`;
        const prev = seenEvents.get(key);
        if (prev) {
            const timeDiff = Math.abs(
                new Date(entry.createdAt).getTime() - new Date(prev.createdAt).getTime()
            );
            if (timeDiff < 60_000) {
                gaps.push({
                    type: "DUPLICATE_LEDGER_ENTRY",
                    severity: "WARNING",
                    detail: {
                        eventType: entry.eventType,
                        contractId: entry.contractId ? String(entry.contractId) : null,
                        invoiceId: entry.invoiceId ? String(entry.invoiceId) : null,
                        entryA: String(prev._id),
                        entryB: String(entry._id),
                        timeDiffMs: timeDiff,
                    }
                });
            }
        }
        seenEvents.set(key, entry);
    }

    // ── Build result ──────────────────────────────────────────────────────────
    const consistent = gaps.length === 0;
    const criticalCount = gaps.filter(g => g.severity === "CRITICAL").length;

    if (!consistent) {
        logger.warn({
            event: "BILLING_RECONCILIATION_GAPS",
            organizationId: orgId,
            totalGaps: gaps.length,
            criticalGaps: criticalCount,
            gapTypes: [...new Set(gaps.map(g => g.type))],
        }, `[Reconciliation] ${gaps.length} gap(s) found for org ${orgId} (${criticalCount} CRITICAL)`);
    } else {
        logger.info({
            event: "BILLING_RECONCILIATION_CLEAN",
            organizationId: orgId,
            contracts: contracts.length,
            invoices: invoices.length,
            ledgerEntries: ledgerEntries.length,
        }, `[Reconciliation] Org ${orgId} billing state is consistent`);
    }

    return {
        organizationId: String(orgId),
        consistent,
        gaps,
        summary: {
            contracts: contracts.length,
            invoices: invoices.length,
            ledgerEntries: ledgerEntries.length,
            criticalGaps: criticalCount,
            warningGaps: gaps.length - criticalCount,
        },
        checkedAt,
    };
}

module.exports = { reconcileBilling };
