/**
 * clinicBillingSettings.dto.js — Response shaping for clinic billing settings (Phase 2 D3)
 *
 * Hides internals that must not leak to the client:
 *   - singletonKey (implementation detail)
 *   - organizationId inside per-org DB (already implied by context)
 *   - __v (Mongoose internal)
 *
 * Normalizes dates to ISO strings so that FE doesn't need to construct Date()
 * objects from plain JSON.
 */

"use strict";

const BILLING_SETTINGS_DTO_VERSION = "1.0.0";

function iso(d) {
    if (!d) return null;
    try { return new Date(d).toISOString(); } catch { return null; }
}

function _taxRate(t) {
    if (!t) return null;
    return {
        code: t.code,
        label: t.label,
        percent: t.percent,
        isDefault: !!t.isDefault,
    };
}

function _numberingScheme(n) {
    if (!n) return null;
    return {
        prefix: n.prefix ?? "INV",
        padding: n.padding ?? 6,
        nextSequence: n.nextSequence ?? 1,
        resetCadence: n.resetCadence ?? "yearly",
        lastResetAt: iso(n.lastResetAt),
    };
}

function _invoiceTemplate(t) {
    if (!t) return null;
    return {
        clinicName: t.clinicName ?? null,
        headerLine: t.headerLine ?? null,
        footerText: t.footerText ?? null,
        paymentTerms: t.paymentTerms ?? null,
        logoUrl: t.logoUrl ?? null,
        showTaxBreakdown: t.showTaxBreakdown !== false,
    };
}

function _discountPolicy(d) {
    if (!d) return null;
    return {
        maxDiscountPercent: d.maxDiscountPercent ?? 25,
        requireReasonAbovePercent: d.requireReasonAbovePercent ?? 10,
        allowLineItemDiscounts: d.allowLineItemDiscounts !== false,
    };
}

function buildBillingSettingsDTO(settings) {
    if (!settings) return null;
    return {
        defaultCurrency: settings.defaultCurrency,
        supportedCurrencies: Array.isArray(settings.supportedCurrencies)
            ? [...settings.supportedCurrencies]
            : [settings.defaultCurrency],
        taxRates: Array.isArray(settings.taxRates)
            ? settings.taxRates.map(_taxRate).filter(Boolean)
            : [],
        numberingScheme: _numberingScheme(settings.numberingScheme),
        invoiceTemplate: _invoiceTemplate(settings.invoiceTemplate),
        paymentMethods: Array.isArray(settings.paymentMethods)
            ? [...settings.paymentMethods]
            : [],
        discountPolicy: _discountPolicy(settings.discountPolicy),
        quotationNumberingScheme: _numberingScheme(settings.quotationNumberingScheme) || {
            prefix: "QUO", padding: 6, nextSequence: 1, resetCadence: "yearly", lastResetAt: null,
        },
        quotationDefaults: {
            defaultExpiryDays: settings.quotationDefaults?.defaultExpiryDays ?? 30,
        },
        emailInvoiceOnCreate: !!settings.emailInvoiceOnCreate,
        includeInvoicePdfAttachment: settings.includeInvoicePdfAttachment !== false,
        version: settings.version ?? 0,
        updatedAt: iso(settings.updatedAt),
        createdAt: iso(settings.createdAt),
    };
}

function envelope(data) {
    return {
        success: true,
        version: BILLING_SETTINGS_DTO_VERSION,
        data,
    };
}

module.exports = {
    BILLING_SETTINGS_DTO_VERSION,
    buildBillingSettingsDTO,
    envelope,
};
