/**
 * documents.policy.js — Document Module PBAC Policies
 * AUDIT-003 — X-Rays, Scans & Legal Consent Forms
 */

"use strict";

const { P } = require("../orgPermissions");
const {
    isOrgAdmin, isDoctor, isAssistant, isReceptionist,
    isSameBranch, hasBranchAccess,
    allOf, anyOf,
} = require("../policyConditions");

module.exports = {
    [P.DOCUMENTS_READ]: [
        { effect: "allow", description: "Org admins can read all documents", condition: isOrgAdmin, priority: 100 },
        { effect: "allow", description: "Doctors can read documents in their branch", condition: allOf(isDoctor, hasBranchAccess), priority: 90 },
        { effect: "allow", description: "Staff can read documents in their branch", condition: isSameBranch, priority: 80 },
    ],

    [P.DOCUMENTS_CREATE]: [
        { effect: "allow", description: "Org admins can upload documents", condition: isOrgAdmin, priority: 100 },
        { effect: "allow", description: "Doctors can upload documents", condition: allOf(isDoctor, hasBranchAccess), priority: 90 },
        { effect: "allow", description: "Assistants and receptionists can upload in their branch", condition: allOf(anyOf(isAssistant, isReceptionist), isSameBranch), priority: 80 },
    ],

    [P.DOCUMENTS_MANAGE]: [
        { effect: "allow", description: "Only org admins can manage (delete/organize) documents", condition: isOrgAdmin, priority: 100 },
    ],
};
