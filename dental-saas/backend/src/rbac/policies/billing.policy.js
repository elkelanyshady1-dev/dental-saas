/**
 * billing.policy.js — Financial Domain PBAC Policies
 * Invoices, Payments, Accounting, Billing Analytics, Ledger, Refunds
 * Split from policyRegistry.js (Phase X.3)
 */

"use strict";

const { P } = require("../orgPermissions");
const {
    isOrgAdmin, isDoctor, isReceptionist,
    isSameBranch, listOrSameBranch, listOrBranchAccess,
    resourceHasStatus,
    allOf, anyOf,
} = require("../policyConditions");

module.exports = {
    // ── Invoices ──────────────────────────────────────────────────────
    [P.INVOICES_CREATE]: [
        { effect: "allow", description: "Org admins can create invoices", condition: isOrgAdmin, priority: 100 },
        { effect: "allow", description: "Doctors can create invoices in their branch", condition: allOf(isDoctor, isSameBranch), priority: 90 },
        { effect: "allow", description: "Receptionists can create invoices in their branch", condition: allOf(isReceptionist, isSameBranch), priority: 80 },
    ],

    [P.INVOICES_UPDATE]: [
        { effect: "deny", description: "Cannot update paid invoices", condition: resourceHasStatus("paid"), priority: 110 },
        { effect: "deny", description: "Cannot update voided invoices", condition: resourceHasStatus("voided"), priority: 110 },
        { effect: "allow", description: "Org admins can update invoices", condition: isOrgAdmin, priority: 100 },
        { effect: "allow", description: "Doctors can update draft/issued invoices in their branch", condition: allOf(isDoctor, isSameBranch), priority: 80 },
    ],

    [P.INVOICES_DELETE]: [
        { effect: "deny", description: "Cannot void paid invoices", condition: resourceHasStatus("paid"), priority: 110 },
        { effect: "deny", description: "Cannot void already voided invoices", condition: resourceHasStatus("voided"), priority: 110 },
        { effect: "allow", description: "Org admins can void invoices", condition: isOrgAdmin, priority: 100 },
    ],

    [P.INVOICES_READ]: [
        { effect: "allow", description: "Org admins can read all invoices", condition: isOrgAdmin, priority: 100 },
        { effect: "allow", description: "Doctors can read invoices in accessible branches", condition: allOf(isDoctor, listOrBranchAccess), priority: 90 },
        { effect: "allow", description: "Staff can read invoices in their branch", condition: allOf(anyOf(isDoctor, isReceptionist), listOrSameBranch), priority: 80 },
    ],

    // ── Payments ──────────────────────────────────────────────────────
    [P.PAYMENTS_CREATE]: [
        { effect: "allow", description: "Org admins can record payments", condition: isOrgAdmin, priority: 100 },
        { effect: "allow", description: "Doctors can record payments in their branch", condition: allOf(isDoctor, isSameBranch), priority: 90 },
        { effect: "allow", description: "Receptionists can record payments in their branch", condition: allOf(isReceptionist, isSameBranch), priority: 80 },
    ],

    [P.PAYMENTS_UPDATE]: [
        { effect: "deny", description: "Cannot update completed payments", condition: resourceHasStatus("completed", "refunded"), priority: 110 },
        { effect: "allow", description: "Org admins can update payments", condition: isOrgAdmin, priority: 100 },
    ],

    [P.PAYMENTS_DELETE]: [
        { effect: "deny", description: "Cannot delete completed or refunded payments", condition: resourceHasStatus("completed", "refunded"), priority: 110 },
        { effect: "allow", description: "Only org admins can delete/void payments", condition: isOrgAdmin, priority: 100 },
    ],

    [P.PAYMENTS_READ]: [
        { effect: "allow", description: "Org admins can read all payments", condition: isOrgAdmin, priority: 100 },
        { effect: "allow", description: "Doctors can read payments in accessible branches", condition: allOf(isDoctor, listOrBranchAccess), priority: 90 },
        { effect: "allow", description: "Staff can read payments in their branch", condition: allOf(anyOf(isDoctor, isReceptionist), listOrSameBranch), priority: 80 },
    ],

    // ── Accounting ───────────────────────────────────────────────────
    [P.ACCOUNTING_CREATE]: [
        { effect: "allow", description: "Org admins can create accounting entries", condition: isOrgAdmin, priority: 100 },
        { effect: "allow", description: "Staff with permission can create entries in their branch", condition: isSameBranch, priority: 80 },
    ],

    [P.ACCOUNTING_UPDATE]: [
        { effect: "deny", description: "Cannot update finalized accounting entries", condition: resourceHasStatus("finalized", "reconciled"), priority: 110 },
        { effect: "allow", description: "Org admins can update accounting entries", condition: isOrgAdmin, priority: 100 },
        { effect: "allow", description: "Staff can update draft entries in their branch", condition: allOf(isSameBranch, resourceHasStatus("draft")), priority: 80 },
    ],

    [P.ACCOUNTING_DELETE]: [
        { effect: "deny", description: "Cannot delete finalized accounting entries", condition: resourceHasStatus("finalized", "reconciled"), priority: 110 },
        { effect: "allow", description: "Only org admins can delete accounting entries", condition: isOrgAdmin, priority: 100 },
    ],

    [P.ACCOUNTING_READ]: [
        { effect: "allow", description: "Org admins can read all accounting and finance analytics", condition: isOrgAdmin, priority: 100 },
        { effect: "allow", description: "Doctors can read finance analytics for accessible branches", condition: allOf(isDoctor, listOrBranchAccess), priority: 90 },
        { effect: "allow", description: "Receptionists can read accounting in their branch", condition: allOf(isReceptionist, listOrSameBranch), priority: 80 },
    ],

    [P.ACCOUNTING_MANAGE]: [
        { effect: "allow", description: "Only org admins can trigger projection rebuilds and manage DLQ", condition: isOrgAdmin, priority: 100 },
    ],

    [P.ACCOUNTING_REPORTS]: [
        { effect: "allow", description: "Org admins can export financial reports", condition: isOrgAdmin, priority: 100 },
    ],

    // ── Settings Hub: Org SaaS Subscription Billing ──────────────────
    // Used by settingsBilling.routes.js (/settings/billing/*)
    // Org reads its own SaaS subscription, invoice history, and quota usage.
    // This is a Bridge layer permission — NOT finance analytics (use ACCOUNTING_READ).
    [P.BILLING_READ]: [
        { effect: "allow", description: "Org admins can view their SaaS subscription and billing history", condition: isOrgAdmin, priority: 100 },
    ],

    // ── Ledger ────────────────────────────────────────────────────────
    [P.LEDGER_READ]: [
        { effect: "allow", description: "Org admins can view the journal ledger", condition: isOrgAdmin, priority: 100 },
    ],

    // ── Refunds ───────────────────────────────────────────────────────
    [P.REFUNDS_CREATE]: [
        { effect: "allow", description: "Org admins can process refunds", condition: isOrgAdmin, priority: 100 },
    ],

    [P.REFUNDS_READ]: [
        { effect: "allow", description: "Org admins can view refund history", condition: isOrgAdmin, priority: 100 },
    ],
};
