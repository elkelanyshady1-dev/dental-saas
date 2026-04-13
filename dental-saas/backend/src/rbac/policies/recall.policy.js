/**
 * recall.policy.js — Recalls & Families PBAC Policies
 * Split from policyRegistry.js (Phase X.3)
 */

"use strict";

const { P } = require("../orgPermissions");
const {
    isOrgAdmin, isDoctor, isAssistant, isReceptionist,
    isOwner,
    isSameBranch, listOrSameBranch, listOrBranchAccess,
    allOf, anyOf,
} = require("../policyConditions");

module.exports = {
    // ── Recalls ──────────────────────────────────────────────────────
    [P.RECALLS_CREATE]: [
        { effect: "allow", description: "Org admins can create recalls", condition: isOrgAdmin, priority: 100 },
        { effect: "allow", description: "Doctors can create recalls for their patients", condition: isDoctor, priority: 90 },
        { effect: "allow", description: "Receptionists can create recalls in their branch", condition: isReceptionist, priority: 80 },
    ],

    [P.RECALLS_UPDATE]: [
        { effect: "allow", description: "Org admins can update any recall", condition: isOrgAdmin, priority: 100 },
        { effect: "allow", description: "Doctors can update recalls they created", condition: allOf(isDoctor, isOwner), priority: 90 },
        { effect: "allow", description: "Receptionists can update recalls in their branch", condition: allOf(isReceptionist, isSameBranch), priority: 80 },
    ],

    [P.RECALLS_DELETE]: [
        { effect: "allow", description: "Only org admins can delete recalls", condition: isOrgAdmin, priority: 100 },
    ],

    [P.RECALLS_READ]: [
        { effect: "allow", description: "Org admins can read all recalls", condition: isOrgAdmin, priority: 100 },
        { effect: "allow", description: "Doctors can read recalls in accessible branches", condition: allOf(isDoctor, listOrBranchAccess), priority: 90 },
        { effect: "allow", description: "Staff can read recalls in their branch", condition: allOf(anyOf(isAssistant, isReceptionist), listOrSameBranch), priority: 80 },
    ],

    // ── Families ─────────────────────────────────────────────────────
    [P.FAMILIES_CREATE]: [
        { effect: "allow", description: "Org admins can create family links", condition: isOrgAdmin, priority: 100 },
        { effect: "allow", description: "Doctors can create family links", condition: isDoctor, priority: 90 },
        { effect: "allow", description: "Receptionists can create family links in their branch", condition: isReceptionist, priority: 80 },
    ],

    [P.FAMILIES_UPDATE]: [
        { effect: "allow", description: "Org admins can update family links", condition: isOrgAdmin, priority: 100 },
        { effect: "allow", description: "Doctors can update family links", condition: isDoctor, priority: 90 },
        { effect: "allow", description: "Receptionists can update family links in their branch", condition: allOf(isReceptionist, isSameBranch), priority: 80 },
    ],

    [P.FAMILIES_DELETE]: [
        { effect: "allow", description: "Only org admins can delete family links", condition: isOrgAdmin, priority: 100 },
    ],

    [P.FAMILIES_READ]: [
        { effect: "allow", description: "Org admins can read all family links", condition: isOrgAdmin, priority: 100 },
        { effect: "allow", description: "Doctors can read family links", condition: allOf(isDoctor, listOrBranchAccess), priority: 90 },
        { effect: "allow", description: "Staff can read family links in their branch", condition: allOf(anyOf(isAssistant, isReceptionist), listOrSameBranch), priority: 80 },
    ],
};
