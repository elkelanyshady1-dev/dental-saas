/**
 * clinicBillingSettings.validator.js — Zod schemas for clinic billing settings (Phase 2 D3)
 *
 * Contract:
 *   - All write payloads are strict (no unknown keys).
 *   - PATCH requires expectedVersion (optimistic concurrency surface).
 *   - Every field is optional on PATCH — the service merges into the singleton.
 *   - Currency + payment method enums are duplicated from the model so that
 *     validation fails fast (before touching Mongoose).
 */

"use strict";

const { z } = require("zod");
const {
    SUPPORTED_CURRENCIES,
    PAYMENT_METHODS,
    NUMBERING_RESET_CADENCES,
} = require("../organizationFinance/models/ClinicBillingSettings.model");

// ─── Sub-schemas ─────────────────────────────────────────────────────

const currencyCode = z.enum(SUPPORTED_CURRENCIES);
const paymentMethod = z.enum(PAYMENT_METHODS);
const resetCadence = z.enum(NUMBERING_RESET_CADENCES);

const taxRateSchema = z.object({
    code: z.string().trim().min(1).max(32),
    label: z.string().trim().min(1).max(100),
    percent: z.number().min(0).max(100),
    isDefault: z.boolean().optional().default(false),
}).strict();

const numberingSchemeSchema = z.object({
    prefix: z.string().trim().min(1).max(16).optional(),
    padding: z.number().int().min(1).max(12).optional(),
    resetCadence: resetCadence.optional(),
    // nextSequence is intentionally NOT user-writable via PATCH — managed by the service.
}).strict();

const invoiceTemplateSchema = z.object({
    clinicName: z.string().trim().max(200).optional(),
    headerLine: z.string().trim().max(500).optional(),
    footerText: z.string().trim().max(2000).optional(),
    paymentTerms: z.string().trim().max(1000).optional(),
    logoUrl: z.string().trim().max(1000).url().optional(),
    showTaxBreakdown: z.boolean().optional(),
}).strict();

const discountPolicySchema = z.object({
    maxDiscountPercent: z.number().min(0).max(100).optional(),
    requireReasonAbovePercent: z.number().min(0).max(100).optional(),
    allowLineItemDiscounts: z.boolean().optional(),
}).strict();

// ─── Top-level PATCH schema ──────────────────────────────────────────

const patchBillingSettingsSchema = z.object({
    expectedVersion: z.number().int().min(0),

    defaultCurrency: currencyCode.optional(),
    supportedCurrencies: z.array(currencyCode).min(1).optional(),

    taxRates: z.array(taxRateSchema).max(20).optional()
        .refine(
            (arr) => !arr || arr.filter((t) => t.isDefault).length <= 1,
            { message: "At most one taxRate may be marked isDefault" }
        ),

    numberingScheme: numberingSchemeSchema.optional(),
    invoiceTemplate: invoiceTemplateSchema.optional(),

    paymentMethods: z.array(paymentMethod).min(1).optional(),

    discountPolicy: discountPolicySchema.optional(),

    // Quotation numbering + defaults
    quotationNumberingScheme: numberingSchemeSchema.optional(),
    quotationDefaults: z.object({
        defaultExpiryDays: z.number().int().min(1).max(365).optional(),
    }).strict().optional(),

    // Phase 2 D4 — Invoice auto-email
    emailInvoiceOnCreate: z.boolean().optional(),
    includeInvoicePdfAttachment: z.boolean().optional(),
}).strict().refine(
    // Require at least ONE field beyond expectedVersion (otherwise PATCH is a noop).
    (obj) => Object.keys(obj).some((k) => k !== "expectedVersion"),
    { message: "PATCH must include at least one field to update" }
);

// ─── Helper ──────────────────────────────────────────────────────────

function parse(schema, payload) {
    const result = schema.safeParse(payload);
    if (result.success) return result.data;
    const err = new Error("VALIDATION_ERROR");
    err.code = "VALIDATION_ERROR";
    err.status = 400;
    err.details = result.error.issues.map((i) => ({
        path: i.path,
        message: i.message,
        code: i.code,
    }));
    throw err;
}

module.exports = {
    patchBillingSettingsSchema,
    taxRateSchema,
    numberingSchemeSchema,
    invoiceTemplateSchema,
    discountPolicySchema,
    parse,
};
