/**
 * accounts.js — Chart of Accounts (Double-Entry Accounting)
 * Billing Domain — Phase C
 *
 * Defines the canonical account names used in JournalEntry line items.
 * These are the SSOT for all ledger operations — never use raw strings.
 *
 * ACCOUNT CLASSIFICATION:
 *   Asset accounts     → increase with DEBIT,  decrease with CREDIT
 *   Liability accounts → increase with CREDIT, decrease with DEBIT
 *   Revenue accounts   → increase with CREDIT, decrease with DEBIT
 *   Expense accounts   → increase with DEBIT,  decrease with CREDIT
 *
 * PLANE: Org only.
 */

"use strict";

const ACCOUNTS = Object.freeze({
    // ── Asset Accounts ─────────────────────────────────────────────────────
    /** Patient owes clinic — increases on invoice, decreases on payment */
    ACCOUNTS_RECEIVABLE: "accounts_receivable",

    /** Cash/bank received — increases on payment */
    CASH: "cash",

    /** Insurance company owes clinic — increases on insurance-covered invoices */
    INSURANCE_RECEIVABLE: "insurance_receivable",

    // ── Revenue Accounts ───────────────────────────────────────────────────
    /** Clinic earned revenue — increases on invoice */
    REVENUE: "revenue",

    // ── Contra-Revenue / Expense Accounts ──────────────────────────────────
    /** Refund issued to patient — increases on refund */
    REFUNDS: "refunds",

    /** Discount given to patient — increases on discounted invoice */
    DISCOUNT_EXPENSE: "discount_expense",

    // ── Liability Accounts ─────────────────────────────────────────────────
    /** Prepaid patient wallet balance — clinic owes patient */
    WALLET_LIABILITY: "wallet_liability",
});

/**
 * Account metadata for reporting and classification.
 * normalBalance: the side that increases the account.
 */
const ACCOUNT_META = Object.freeze({
    [ACCOUNTS.ACCOUNTS_RECEIVABLE]: { type: "asset", normalBalance: "debit", label: "Accounts Receivable" },
    [ACCOUNTS.CASH]:                 { type: "asset", normalBalance: "debit", label: "Cash / Bank" },
    [ACCOUNTS.INSURANCE_RECEIVABLE]: { type: "asset", normalBalance: "debit", label: "Insurance Receivable" },
    [ACCOUNTS.REVENUE]:              { type: "revenue", normalBalance: "credit", label: "Treatment Revenue" },
    [ACCOUNTS.REFUNDS]:              { type: "contra_revenue", normalBalance: "debit", label: "Patient Refunds" },
    [ACCOUNTS.DISCOUNT_EXPENSE]:     { type: "expense", normalBalance: "debit", label: "Discounts Given" },
    [ACCOUNTS.WALLET_LIABILITY]:     { type: "liability", normalBalance: "credit", label: "Patient Wallet Liability" },
});

module.exports = { ACCOUNTS, ACCOUNT_META };
