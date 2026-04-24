/**
 * quotation.policy.js — Patient Quotation PBAC Policies
 * Branch-scoped rules for quotation lifecycle operations.
 *
 * PLANE: Organization
 */

"use strict";

const { P } = require("../orgPermissions");
const {
    isOrgAdmin, isDoctor, isReceptionist, isAssistant,
    isSameBranch, listOrSameBranch, listOrBranchAccess,
    resourceHasStatus,
    allOf, anyOf,
} = require("../policyConditions");

module.exports = {
    // ── Read ─────────────────────────────────────────────────────────
    [P.QUOTATIONS_READ]: [
        { effect: "allow", description: "Org admins can read all quotations", condition: isOrgAdmin, priority: 100 },
        { effect: "allow", description: "Doctors can read quotations in accessible branches", condition: allOf(isDoctor, listOrBranchAccess), priority: 90 },
        { effect: "allow", description: "Staff can read quotations in their branch", condition: allOf(anyOf(isAssistant, isReceptionist), listOrSameBranch), priority: 80 },
    ],

    // ── Create ───────────────────────────────────────────────────────
    [P.QUOTATIONS_CREATE]: [
        { effect: "allow", description: "Org admins can create quotations", condition: isOrgAdmin, priority: 100 },
        { effect: "allow", description: "Doctors can create quotations in their branch", condition: allOf(isDoctor, isSameBranch), priority: 90 },
        { effect: "allow", description: "Assistants can create quotations in their branch", condition: allOf(isAssistant, isSameBranch), priority: 80 },
        { effect: "allow", description: "Receptionists can create quotations in their branch", condition: allOf(isReceptionist, isSameBranch), priority: 80 },
    ],

    // ── Update (covers send, accept, reject) ─────────────────────────
    [P.QUOTATIONS_UPDATE]: [
        { effect: "deny", description: "Cannot modify converted quotations", condition: resourceHasStatus("converted"), priority: 110 },
        { effect: "deny", description: "Cannot modify expired quotations", condition: resourceHasStatus("expired"), priority: 110 },
        { effect: "deny", description: "Cannot modify rejected quotations", condition: resourceHasStatus("rejected"), priority: 110 },
        { effect: "allow", description: "Org admins can update quotations", condition: isOrgAdmin, priority: 100 },
        { effect: "allow", description: "Doctors can update quotations in their branch", condition: allOf(isDoctor, isSameBranch), priority: 90 },
        { effect: "allow", description: "Assistants can update quotations in their branch", condition: allOf(isAssistant, isSameBranch), priority: 80 },
    ],

    // ── Convert (accepted → invoice) ─────────────────────────────────
    [P.QUOTATIONS_CONVERT]: [
        { effect: "deny", description: "Cannot convert expired quotations", condition: resourceHasStatus("expired"), priority: 110 },
        { effect: "deny", description: "Cannot convert rejected quotations", condition: resourceHasStatus("rejected"), priority: 110 },
        { effect: "deny", description: "Cannot convert already-converted quotations", condition: resourceHasStatus("converted"), priority: 110 },
        { effect: "allow", description: "Org admins can convert quotations", condition: isOrgAdmin, priority: 100 },
        { effect: "allow", description: "Doctors can convert quotations in their branch", condition: allOf(isDoctor, isSameBranch), priority: 90 },
        { effect: "allow", description: "Receptionists can convert quotations in their branch", condition: allOf(isReceptionist, isSameBranch), priority: 80 },
    ],
};
