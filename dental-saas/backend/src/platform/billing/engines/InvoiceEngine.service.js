/**
 * InvoiceEngine.service.js
 * v22.0 — Phase 3: Formal Invoice Engine
 *
 * PURPOSE:
 * Owns the full PlatformInvoice lifecycle. All invoice transitions must
 * flow through this engine so they are enforced by invoiceStateMachine.js.
 *
 * ── Responsibilities ─────────────────────────────────────────────────────────
 *   generateInvoice       → invoiceEngine.service (generatePlatformInvoice)
 *   voidInvoice           → direct DB + assertVoidable (Safety Rule 4)
 *   markUncollectible     → direct DB + assertTransition
 *   updatePaymentStatus   → derived from invoice amounts (no direct status write)
 *   getInvoice            → direct DB query (convenience method)
 *
 * ── State machine ────────────────────────────────────────────────────────────
 *   Uses invoiceStateMachine.js for all transition assertions.
 *   assertVoidable enforces Safety Rule 4 (no void after amountPaid > 0).
 *
 * ── Caller hierarchy ─────────────────────────────────────────────────────────
 *   BillingOrchestrator → InvoiceEngine → invoiceEngine.service / PlatformInvoice model
 *   Controllers should call BillingOrchestrator, not this engine directly.
 *
 * SENTINEL PRE-CHECK:
 *   Contract impact:  None
 *   RBAC impact:      None
 *   Plane isolation:  Platform only
 *   Regression risk:  LOW — additive facade
 *
 * PLANE: Platform
 */

"use strict";

const logger = require("@utils/logger");
const {
    assertTransition,
    assertVoidable
} = require("../services/invoiceStateMachine");

// ── Lazy model references ────────────────────────────────────────────────────
// Bound to the platform connection via getPlatformModel (Step 5f).
const getPlatformModel = require("@core/db/getPlatformModel");
const PlatformInvoiceDef = require("../models/PlatformInvoice.model");

let _PlatformInvoice, _invoiceEngineService;

function getPlatformInvoice() {
    if (!_PlatformInvoice) {
        _PlatformInvoice = getPlatformModel(PlatformInvoiceDef);
    }
    return _PlatformInvoice;
}

function getInvoiceEngineService() {
    if (!_invoiceEngineService) _invoiceEngineService = require("../services/invoiceEngine.service");
    return _invoiceEngineService;
}

// ─── Invoice Engine ───────────────────────────────────────────────────────────

const InvoiceEngine = {

    /**
     * generateInvoice
     * Generates a PlatformInvoice for a contract.
     * Idempotent — returns existing open invoice if one already exists for the contract.
     *
     * @param {string} contractId
     * @param {object} [options]
     * @returns {Promise<{ invoice: PlatformInvoice, isNew: boolean }>}
     */
    async generateInvoice(contractId, options = {}) {
        logger.info({ contractId }, "[InvoiceEngine] generateInvoice");
        return getInvoiceEngineService().generatePlatformInvoice(contractId, options);
    },

    /**
     * voidInvoice
     * Voids a PlatformInvoice.
     * Safety Rule 4: amountPaid must be 0 before voiding.
     *
     * @param {string} invoiceId
     * @param {object} [opts]
     * @param {string} [opts.reason]       - Human-readable void reason
     * @param {string} [opts.actorId]      - Who triggered the void
     * @returns {Promise<PlatformInvoice>}
     * @throws {Error} CANNOT_VOID_PAID_INVOICE (422) if amountPaid > 0
     * @throws {Error} INVALID_INVOICE_TRANSITION (409) if status not voidable
     */
    async voidInvoice(invoiceId, opts = {}) {
        const { reason = "", actorId } = opts;

        const PlatformInvoice = getPlatformInvoice();
        const invoice = await PlatformInvoice.findById(invoiceId);
        if (!invoice) {
            const err = new Error(`PlatformInvoice ${invoiceId} not found`);
            err.status = 404;
            err.code = "INVOICE_NOT_FOUND";
            throw err;
        }

        // Safety Rule 4 — must run before state machine check
        assertVoidable(invoice, invoiceId);
        assertTransition(invoice.status, "void", invoiceId);

        const previousStatus = invoice.status;
        invoice.status = "void";
        invoice.voidedAt = new Date();
        if (reason) invoice.metadata?.set("voidReason", reason);
        await invoice.save();

        logger.info(
            { invoiceId, from: previousStatus, to: "void", actorId },
            "[InvoiceEngine] Invoice voided"
        );

        return invoice;
    },

    /**
     * markUncollectible
     * Moves an invoice to uncollectible (after dunning exhausted).
     * Allowed from: open, partial, overdue.
     *
     * @param {string} invoiceId
     * @param {object} [opts]
     * @param {string} [opts.reason]
     * @param {string} [opts.actorId]
     * @returns {Promise<PlatformInvoice>}
     */
    async markUncollectible(invoiceId, opts = {}) {
        const { reason = "", actorId } = opts;

        const PlatformInvoice = getPlatformInvoice();
        const invoice = await PlatformInvoice.findById(invoiceId);
        if (!invoice) {
            const err = new Error(`PlatformInvoice ${invoiceId} not found`);
            err.status = 404;
            err.code = "INVOICE_NOT_FOUND";
            throw err;
        }

        assertTransition(invoice.status, "uncollectible", invoiceId);

        const previousStatus = invoice.status;
        invoice.status = "uncollectible";
        if (reason) invoice.metadata?.set("uncollectibleReason", reason);
        await invoice.save();

        logger.info(
            { invoiceId, from: previousStatus, to: "uncollectible", actorId },
            "[InvoiceEngine] Invoice marked uncollectible"
        );

        return invoice;
    },

    /**
     * markProcessing
     * Transitions an invoice to "processing" for async payment providers (v22.0).
     * Allowed from: issued.
     *
     * @param {string} invoiceId
     * @param {object} [opts]
     * @returns {Promise<PlatformInvoice>}
     */
    async markProcessing(invoiceId, opts = {}) {
        const { actorId, providerRef } = opts;

        const PlatformInvoice = getPlatformInvoice();
        const invoice = await PlatformInvoice.findById(invoiceId);
        if (!invoice) {
            const err = new Error(`PlatformInvoice ${invoiceId} not found`);
            err.status = 404;
            err.code = "INVOICE_NOT_FOUND";
            throw err;
        }

        assertTransition(invoice.status, "processing", invoiceId);

        const previousStatus = invoice.status;
        invoice.status = "processing";
        if (providerRef) invoice.metadata?.set("providerRef", providerRef);
        await invoice.save();

        logger.info(
            { invoiceId, from: previousStatus, to: "processing", actorId },
            "[InvoiceEngine] Invoice marked processing (async payment)"
        );

        return invoice;
    },

    /**
     * resolveProcessing
     * Resolves a "processing" invoice to "paid" or "failed" (v22.0).
     *
     * @param {string} invoiceId
     * @param {"paid"|"failed"} outcome
     * @param {object} [opts]
     * @returns {Promise<PlatformInvoice>}
     */
    async resolveProcessing(invoiceId, outcome, opts = {}) {
        if (!["paid", "failed"].includes(outcome)) {
            const err = new Error(`Invalid outcome for resolveProcessing: "${outcome}". Must be paid or failed.`);
            err.status = 400;
            throw err;
        }

        const PlatformInvoice = getPlatformInvoice();
        const invoice = await PlatformInvoice.findById(invoiceId);
        if (!invoice) {
            const err = new Error(`PlatformInvoice ${invoiceId} not found`);
            err.status = 404;
            err.code = "INVOICE_NOT_FOUND";
            throw err;
        }

        assertTransition(invoice.status, outcome, invoiceId);

        const previousStatus = invoice.status;
        invoice.status = outcome;
        if (outcome === "paid") invoice.paidAt = new Date();
        await invoice.save();

        logger.info(
            { invoiceId, from: previousStatus, to: outcome },
            `[InvoiceEngine] Processing resolved → ${outcome}`
        );

        return invoice;
    },

    /**
     * updatePaymentStatus
     * Derives and applies the correct invoice status based on current amounts.
     * Does NOT directly write a status string — uses the state machine.
     *
     * This is the canonical method to call after a payment is applied.
     * Called by PaymentEngine after recording a payment.
     *
     * @param {string} invoiceId
     * @param {object} amounts         - { amountPaid, amountRemaining, totalAmount }
     * @returns {Promise<{ invoice: PlatformInvoice, newStatus: string }>}
     */
    async updatePaymentStatus(invoiceId, amounts) {
        const { amountPaid, amountRemaining, totalAmount } = amounts;
        const PlatformInvoice = getPlatformInvoice();
        const invoice = await PlatformInvoice.findById(invoiceId);
        if (!invoice) {
            const err = new Error(`PlatformInvoice ${invoiceId} not found`);
            err.status = 404; err.code = "INVOICE_NOT_FOUND";
            throw err;
        }

        let newStatus = invoice.status;

        if (amountPaid >= totalAmount) {
            newStatus = "paid";
        } else if (amountPaid > 0 && amountPaid < totalAmount) {
            newStatus = "partial";
        }

        if (newStatus !== invoice.status) {
            assertTransition(invoice.status, newStatus, invoiceId);
            invoice.status = newStatus;
            if (newStatus === "paid") invoice.paidAt = new Date();
        }

        invoice.amountPaid = amountPaid;
        invoice.amountRemaining = amountRemaining;
        await invoice.save();

        logger.info(
            { invoiceId, from: invoice.status, to: newStatus },
            "[InvoiceEngine] updatePaymentStatus"
        );

        return { invoice, newStatus };
    },


    /**
     * issueInvoice
     * Section 4 — Orchestrator upgrade sequence step.
     *
     * Transitions a draft PlatformInvoice → issued, making it visible to the
     * payer and enabling payment capture.
     *
     * SAFE NO-OP: If the invoice is already in an open/issued/paid payable state
     * (e.g. generateInvoice already created it as "open"), this method returns the
     * invoice unchanged without error — the orchestrator can always call this step.
     *
     * State machine: draft → issued
     * Allowed no-ops: issued, open, partial, paid (already past this step)
     *
     * @param {string} invoiceId
     * @param {object} [opts]
     * @param {string} [opts.actorId]
     * @param {mongoose.ClientSession} [opts.session]
     * @returns {Promise<PlatformInvoice>}
     */
    async issueInvoice(invoiceId, opts = {}) {
        const { actorId, session } = opts;
        const PlatformInvoice = getPlatformInvoice();

        const query = PlatformInvoice.findById(invoiceId);
        if (session) query.session(session);
        const invoice = await query;

        if (!invoice) {
            const err = new Error(`PlatformInvoice ${invoiceId} not found`);
            err.status = 404; err.code = "INVOICE_NOT_FOUND"; throw err;
        }

        // Already past draft (open, issued, partial, paid, etc.) — safe no-op
        const PRE_ISSUED_STATUSES = new Set(["issued", "open", "partial", "paid", "processing", "overdue"]);
        if (PRE_ISSUED_STATUSES.has(invoice.status)) {
            logger.info({ invoiceId, currentStatus: invoice.status }, "[InvoiceEngine] issueInvoice — no-op (already past draft)");
            return invoice;
        }

        assertTransition(invoice.status, "issued", invoiceId);
        invoice.status = "issued";
        invoice.issuedAt = new Date();
        if (actorId) invoice.issuedBy = actorId;
        await invoice.save({ session: session || undefined });

        logger.info({ invoiceId, actorId }, "[InvoiceEngine] issueInvoice — draft → issued");
        return invoice;
    },

    /**
     * getInvoice
     * Convenience fetch — returns the invoice or null.
     *
     * @param {string} invoiceId
     * @returns {Promise<PlatformInvoice|null>}
     */
    async getInvoice(invoiceId) {
        const PlatformInvoice = getPlatformInvoice();
        return PlatformInvoice.findById(invoiceId).lean();
    }
};

module.exports = InvoiceEngine;
