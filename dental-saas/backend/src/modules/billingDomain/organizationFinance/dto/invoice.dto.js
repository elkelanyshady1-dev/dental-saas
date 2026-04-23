/**
 * invoice.dto.js — Org Finance Invoice DTO Builders
 *
 * Backend is the SINGLE source of truth for financial calculations.
 * Frontends MUST consume the fields on these DTOs directly and never
 * recompute `balance` / `displayStatus` client-side.
 *
 * Computed fields:
 *   totalPaid      Sum of active payments allocated to this invoice.
 *   balance        totalAmount − totalPaid (>= 0).
 *   displayStatus  Derived UI status: pending | partial | paid | voided | refunded.
 *   isOverdue      true when balance > 0 and dueDate < now (if present).
 *   daysOverdue    0 when not overdue, else floor((now − dueDate)/1d).
 *
 * PLANE: Org only.
 */

"use strict";

const DAY_MS = 86_400_000;

/**
 * Derive the UI-facing status from schema status + payments.
 * The schema enum is: draft | issued | partially_paid | paid | voided.
 * UI needs:          pending | partial | paid | voided | refunded | overdue.
 */
function deriveDisplayStatus(invoice, totalPaid, hasActiveRefund) {
    if (invoice.status === "voided") return "voided";
    if (hasActiveRefund) return "refunded";
    if (invoice.status === "paid") return "paid";
    if (invoice.status === "partially_paid" || (totalPaid > 0 && totalPaid < Number(invoice.totalAmount || 0))) {
        return "partial";
    }
    // draft and issued both surface as "pending" until a payment is recorded.
    return "pending";
}

function computeOverdue(invoice, balance) {
    const dueDate = invoice.dueDate ? new Date(invoice.dueDate) : null;
    if (!dueDate || !(balance > 0)) return { isOverdue: false, daysOverdue: 0 };
    const now = Date.now();
    const due = dueDate.getTime();
    if (due >= now) return { isOverdue: false, daysOverdue: 0 };
    return { isOverdue: true, daysOverdue: Math.floor((now - due) / DAY_MS) };
}

function round2(n) {
    return Math.round(Number(n || 0) * 100) / 100;
}

/**
 * Light-weight row for the invoices list table.
 *
 * @param {Object} invoice              — Lean PatientInvoice doc (may have populated patientId).
 * @param {Object} [opts]
 * @param {number} [opts.totalPaid=0]   — Ledger-sourced sum of Cash DR for this invoice.
 * @param {boolean}[opts.hasRefund=false] — Whether the ledger shows refund cash credits for this invoice.
 * @param {number} [opts.ledgerBalance] — Ledger-sourced AR balance. When provided (it always is in
 *                                        production paths), it supersedes any `total − paid` math.
 */
function buildInvoiceListRowDTO(invoice, { totalPaid = 0, hasRefund = false, ledgerBalance } = {}) {
    if (!invoice) return null;

    const total = Number(invoice.totalAmount || 0);
    const paid = round2(totalPaid);
    // Balance is ledger-authoritative. Only if a caller deliberately omits
    // the ledger value (legacy paths) do we fall back to the simple identity.
    const balance = typeof ledgerBalance === "number"
        ? round2(ledgerBalance)
        : round2(Math.max(0, total - paid));
    const displayStatus = deriveDisplayStatus(invoice, paid, hasRefund);
    const { isOverdue, daysOverdue } = computeOverdue(invoice, balance);

    const patient = invoice.patientId && typeof invoice.patientId === "object"
        ? {
            _id: invoice.patientId._id || invoice.patientId,
            firstName: invoice.patientId.firstName || null,
            lastName: invoice.patientId.lastName || null,
            displayName:
                [invoice.patientId.firstName, invoice.patientId.lastName].filter(Boolean).join(" ").trim() ||
                invoice.patientId.nameEnglish ||
                null,
        }
        : { _id: invoice.patientId || null, firstName: null, lastName: null, displayName: null };

    return {
        _id: invoice._id,
        invoiceNumber: invoice.invoiceNumber || null,
        patient,
        branchId: invoice.branchId || null,
        createdAt: invoice.createdAt,
        dueDate: invoice.dueDate || null,
        currency: invoice.currency || "EGP",

        totalAmount: round2(total),
        totalPaid: paid,
        balance,

        status: invoice.status,
        displayStatus,
        isOverdue,
        daysOverdue,
    };
}

/**
 * Full invoice detail DTO used by the drawer / invoice-viewer.
 *
 * Financial values (`totalPaid`, `balance`) are provided by the caller
 * after they've been read from the ledger. The payments array is ONLY
 * used for history display and refund-status detection — never for
 * financial totals.
 *
 * @param {Object}   invoice
 * @param {Object[]} [payments=[]] — Payments linked to this invoice (active + refunded), history only.
 * @param {Object}   [ledger]      — Ledger-sourced totals for this invoice.
 * @param {number}   [ledger.totalPaid] — Sum of Cash DR for invoice-linked payments.
 * @param {number}   [ledger.balance]   — AR balance for this invoice.
 */
function buildInvoiceDetailDTO(invoice, payments = [], ledger = {}) {
    if (!invoice) return null;

    const refundedOrPartial = payments.some(
        (p) => p && (p.status === "refunded" || p.status === "partially_refunded")
    );

    // Financial source of truth = ledger. `payments` stays metadata-only.
    const totalPaid = typeof ledger.totalPaid === "number" ? ledger.totalPaid : 0;

    const row = buildInvoiceListRowDTO(invoice, {
        totalPaid,
        hasRefund: refundedOrPartial,
        ledgerBalance: ledger.balance,
    });

    return {
        ...row,
        treatments: (invoice.treatments || []).map((t) => ({
            _id: t._id,
            treatmentId: t.treatmentId || null,
            procedureName: t.procedureName,
            toothNumber: t.toothNumber || null,
            unitPrice: round2(t.unitPrice),
            quantity: t.quantity || 1,
            subtotal: round2(t.subtotal),
        })),
        charges: (invoice.charges || []).map((c) => ({
            _id: c._id,
            type: c.type,
            description: c.description || null,
            amount: round2(c.amount),
            appointmentId: c.appointmentId || null,
        })),
        subtotal: round2(invoice.subtotal),
        tax: round2(invoice.tax),
        discount: round2(invoice.discount),
        insuranceCovered: round2(invoice.insuranceCovered),
        downpaymentAmount: round2(invoice.downpaymentAmount),
        payments: payments.map((p) => ({
            _id: p._id,
            amount: round2(p.amount),
            currency: p.currency || invoice.currency || "EGP",
            paymentMethod: p.paymentMethod,
            status: p.status,
            createdAt: p.createdAt,
        })),
        version: invoice.version,
        voidedByUserId: invoice.voidedByUserId || null,
        voidedReason: invoice.voidedReason || null,
        voidedAt: invoice.voidedAt || null,
    };
}

module.exports = {
    buildInvoiceListRowDTO,
    buildInvoiceDetailDTO,
    deriveDisplayStatus,
    computeOverdue,
};
