/**
 * payment.dto.js — Org Finance Patient-Payment DTO Builder
 *
 * Backend-authoritative shape for payment rows exposed to the org finance UI.
 * Never returns raw Mongoose documents.
 *
 * PLANE: Org only.
 */

"use strict";

function round2(n) {
    return Math.round(Number(n || 0) * 100) / 100;
}

function buildPaymentDTO(payment) {
    if (!payment) return null;

    const invoice = payment.invoiceId && typeof payment.invoiceId === "object"
        ? {
            _id: payment.invoiceId._id || null,
            invoiceNumber: payment.invoiceId.invoiceNumber || null,
            totalAmount: round2(payment.invoiceId.totalAmount),
            status: payment.invoiceId.status || null,
        }
        : { _id: payment.invoiceId || null, invoiceNumber: null, totalAmount: null, status: null };

    const patient = payment.patientId && typeof payment.patientId === "object"
        ? {
            _id: payment.patientId._id || payment.patientId,
            firstName: payment.patientId.firstName || null,
            lastName: payment.patientId.lastName || null,
            displayName:
                [payment.patientId.firstName, payment.patientId.lastName].filter(Boolean).join(" ").trim() ||
                payment.patientId.nameEnglish ||
                null,
        }
        : { _id: payment.patientId || null, firstName: null, lastName: null, displayName: null };

    return {
        _id: payment._id,
        branchId: payment.branchId || null,
        invoice,
        patient,
        amount: round2(payment.amount),
        amountMinor: payment.amountMinor ?? null,
        currency: payment.currency || "EGP",
        paymentMethod: payment.paymentMethod,
        status: payment.status,
        collectedByUserId: payment.collectedByUserId || null,
        createdAt: payment.createdAt,
        updatedAt: payment.updatedAt,
        version: payment.version ?? 0,
    };
}

module.exports = { buildPaymentDTO };
