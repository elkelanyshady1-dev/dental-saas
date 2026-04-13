/**
 * support.policy.js — Support, Security, Dashboard, Analytics, Communication, Storage PBAC Policies
 * Split from policyRegistry.js (Phase X.3)
 */

"use strict";

const { P } = require("../orgPermissions");
const {
    isOrgAdmin, isDoctor, isAssistant, isReceptionist, isLabTechnician,
    isOwner,
    isSameBranch, hasBranchAccess, listOrSameBranch, listOrBranchAccess,
    allOf, anyOf,
} = require("../policyConditions");

module.exports = {
    // ── Security ─────────────────────────────────────────────────────
    [P.SECURITY_MANAGE]: [
        { effect: "allow", description: "Only org admins can manage security settings", condition: isOrgAdmin, priority: 100 },
    ],

    [P.SECURITY_READ]: [
        { effect: "allow", description: "Only org admins can read security settings", condition: isOrgAdmin, priority: 100 },
    ],

    // ── Communication ────────────────────────────────────────────────
    [P.COMMUNICATION_READ]: [
        { effect: "allow", description: "Org admins can read all communications", condition: isOrgAdmin, priority: 100 },
        { effect: "allow", description: "Staff can read communications in their branch", condition: listOrSameBranch, priority: 80 },
    ],

    [P.COMMUNICATION_SEND]: [
        { effect: "allow", description: "Org admins can send communications", condition: isOrgAdmin, priority: 100 },
        { effect: "allow", description: "Doctors can send communications", condition: allOf(isDoctor, hasBranchAccess), priority: 90 },
        { effect: "allow", description: "Receptionists can send communications in their branch", condition: allOf(isReceptionist, isSameBranch), priority: 80 },
    ],

    [P.COMMUNICATION_MANAGE]: [
        { effect: "allow", description: "Only org admins can manage communication settings", condition: isOrgAdmin, priority: 100 },
    ],

    // ── Analytics ─────────────────────────────────────────────────────
    [P.ANALYTICS_READ]: [
        { effect: "allow", description: "Org admins can read all analytics", condition: isOrgAdmin, priority: 100 },
        { effect: "allow", description: "Doctors can read analytics for their branch", condition: allOf(isDoctor, listOrBranchAccess), priority: 90 },
    ],

    [P.ANALYTICS_EXPORT]: [
        { effect: "allow", description: "Only org admins can export analytics data", condition: isOrgAdmin, priority: 100 },
    ],

    // ── Dashboard ────────────────────────────────────────────────────
    [P.DASHBOARD_READ]: [
        { effect: "allow", description: "Org admins can read full dashboard", condition: isOrgAdmin, priority: 100 },
        { effect: "allow", description: "All staff can read their dashboard", condition: anyOf(isDoctor, isAssistant, isReceptionist, isLabTechnician), priority: 80 },
    ],

    [P.DASHBOARD_MANAGE]: [
        { effect: "allow", description: "Only org admins can manage dashboard settings", condition: isOrgAdmin, priority: 100 },
    ],

    // ── Support ──────────────────────────────────────────────────────
    [P.SUPPORT_READ]: [
        { effect: "allow", description: "Org admins can read all support tickets", condition: isOrgAdmin, priority: 100 },
        { effect: "allow", description: "Staff can read their own support tickets", condition: isOwner, priority: 80 },
    ],

    [P.SUPPORT_CREATE]: [
        { effect: "allow", description: "Org admins can create support tickets", condition: isOrgAdmin, priority: 100 },
        { effect: "allow", description: "All staff can create support tickets", condition: anyOf(isDoctor, isAssistant, isReceptionist, isLabTechnician), priority: 80 },
    ],

    [P.SUPPORT_WRITE]: [
        { effect: "allow", description: "Org admins can write on all org support tickets", condition: isOrgAdmin, priority: 100 },
        { effect: "allow", description: "Staff can write on tickets they created", condition: allOf(anyOf(isDoctor, isAssistant, isReceptionist, isLabTechnician), isOwner), priority: 80 },
    ],

    // ── Storage ──────────────────────────────────────────────────────
    [P.STORAGE_READ]: [
        { effect: "allow", description: "Org admins can read all storage usage", condition: isOrgAdmin, priority: 100 },
        { effect: "allow", description: "All staff can read their storage usage", condition: anyOf(isDoctor, isAssistant, isReceptionist, isLabTechnician), priority: 80 },
    ],
};
