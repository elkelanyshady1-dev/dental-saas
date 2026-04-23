/**
 * quotation.dto.js — Response shaping for patient quotations
 *
 * Hides internals (organizationId, __v) and normalizes dates to ISO strings.
 * Mirrors billingSettings.dto.js envelope pattern.
 *
 * PLANE: Organization (billing domain)
 */

"use strict";

function iso(d) {
    if (!d) return null;
    try { return new Date(d).toISOString(); } catch { return null; }
}

function _treatment(t) {
    if (!t) return null;
    return {
        treatmentId: t.treatmentId?.toString() || null,
        procedureName: t.procedureName,
        toothNumber: t.toothNumber || null,
        unitPrice: t.unitPrice,
        quantity: t.quantity,
        subtotal: t.subtotal,
    };
}

function _charge(c) {
    if (!c) return null;
    return {
        type: c.type,
        description: c.description || null,
        amount: c.amount,
        appointmentId: c.appointmentId?.toString() || null,
    };
}

function buildQuotationDTO(doc) {
    if (!doc) return null;
    return {
        id: (doc._id || doc.id)?.toString(),
        branchId: doc.branchId?.toString(),
        patientId: doc.patientId?.toString(),

        treatments: Array.isArray(doc.treatments)
            ? doc.treatments.map(_treatment).filter(Boolean)
            : [],
        charges: Array.isArray(doc.charges)
            ? doc.charges.map(_charge).filter(Boolean)
            : [],

        subtotal: doc.subtotal,
        subtotalMinor: doc.subtotalMinor ?? null,
        tax: doc.tax ?? 0,
        taxMinor: doc.taxMinor ?? 0,
        discount: doc.discount ?? 0,
        discountMinor: doc.discountMinor ?? 0,
        insuranceCovered: doc.insuranceCovered ?? 0,
        insuranceCoveredMinor: doc.insuranceCoveredMinor ?? 0,
        totalAmount: doc.totalAmount,
        totalAmountMinor: doc.totalAmountMinor ?? null,
        currency: doc.currency,

        quotationNumber: doc.quotationNumber || null,
        status: doc.status,
        expiresAt: iso(doc.expiresAt),

        acceptedAt: iso(doc.acceptedAt),
        acceptedByType: doc.acceptedByType || null,
        acceptedByPatient: !!doc.acceptedByPatient,
        rejectedAt: iso(doc.rejectedAt),
        rejectedReason: doc.rejectedReason || null,

        convertedAt: iso(doc.convertedAt),
        convertedInvoiceId: doc.convertedInvoiceId?.toString() || null,

        createdByUserId: doc.createdByUserId?.toString() || null,
        treatmentOperatorId: doc.treatmentOperatorId?.toString() || null,
        notes: doc.notes || null,
        regionCode: doc.regionCode || null,

        version: doc.version ?? 0,
        createdAt: iso(doc.createdAt),
        updatedAt: iso(doc.updatedAt),
    };
}

function buildQuotationListDTO(doc) {
    if (!doc) return null;
    return {
        id: (doc._id || doc.id)?.toString(),
        patientId: doc.patientId?.toString(),
        branchId: doc.branchId?.toString(),
        quotationNumber: doc.quotationNumber || null,
        status: doc.status,
        totalAmount: doc.totalAmount,
        totalAmountMinor: doc.totalAmountMinor ?? null,
        currency: doc.currency,
        expiresAt: iso(doc.expiresAt),
        createdAt: iso(doc.createdAt),
        version: doc.version ?? 0,
    };
}

function envelope(data) {
    return {
        success: true,
        data,
    };
}

module.exports = {
    buildQuotationDTO,
    buildQuotationListDTO,
    envelope,
};
