/**
 * inventory.policy.js — Inventory & Lab Module PBAC Policies
 * Split from policyRegistry.js (Phase X.3)
 */

"use strict";

const { P } = require("../orgPermissions");
const {
    isOrgAdmin, isDoctor, isLabTechnician, isAssistant, isReceptionist,
    isOwnerOrAssigned,
    isSameBranch, listOrSameBranch, listOrBranchAccess,
    resourceHasStatus,
    allOf, anyOf,
} = require("../policyConditions");

module.exports = {
    // ── Inventory ────────────────────────────────────────────────────
    [P.INVENTORY_READ]: [
        { effect: "allow", description: "Org admins can read all inventory", condition: isOrgAdmin, priority: 100 },
        { effect: "allow", description: "Staff can read inventory in their branch", condition: allOf(anyOf(isAssistant, isReceptionist), listOrSameBranch), priority: 80 },
    ],

    [P.INVENTORY_CREATE]: [
        { effect: "allow", description: "Only org admins can create inventory items", condition: isOrgAdmin, priority: 100 },
    ],

    [P.INVENTORY_UPDATE]: [
        { effect: "allow", description: "Only org admins can update inventory", condition: isOrgAdmin, priority: 100 },
    ],

    [P.INVENTORY_DELETE]: [
        { effect: "allow", description: "Only org admins can delete inventory items", condition: isOrgAdmin, priority: 100 },
    ],

    // ── Lab ──────────────────────────────────────────────────────────
    [P.LAB_READ]: [
        { effect: "allow", description: "Org admins can read all lab orders", condition: isOrgAdmin, priority: 100 },
        { effect: "allow", description: "Doctors can read lab orders", condition: allOf(isDoctor, listOrBranchAccess), priority: 90 },
        { effect: "allow", description: "Lab technicians can read lab orders in their branch", condition: allOf(isLabTechnician, listOrSameBranch), priority: 85 },
    ],

    [P.LAB_CREATE]: [
        { effect: "allow", description: "Org admins can create lab orders", condition: isOrgAdmin, priority: 100 },
        { effect: "allow", description: "Doctors can create lab orders", condition: isDoctor, priority: 90 },
        { effect: "allow", description: "Lab technicians can create lab orders in their branch", condition: allOf(isLabTechnician, isSameBranch), priority: 85 },
    ],

    [P.LAB_UPDATE]: [
        { effect: "deny", description: "Cannot update completed or delivered lab orders", condition: resourceHasStatus("completed", "delivered"), priority: 110 },
        { effect: "allow", description: "Org admins can update lab orders", condition: isOrgAdmin, priority: 100 },
        { effect: "allow", description: "Doctors can update their own lab orders", condition: allOf(isDoctor, isOwnerOrAssigned), priority: 90 },
        { effect: "allow", description: "Lab technicians can update lab orders in their branch", condition: allOf(isLabTechnician, isSameBranch), priority: 85 },
    ],

    [P.LAB_DELETE]: [
        { effect: "deny", description: "Cannot delete completed or delivered lab orders", condition: resourceHasStatus("completed", "delivered"), priority: 110 },
        { effect: "allow", description: "Only org admins can delete lab orders", condition: isOrgAdmin, priority: 100 },
        { effect: "allow", description: "Lab technicians can delete draft lab orders in their branch", condition: allOf(isLabTechnician, isSameBranch, resourceHasStatus("draft")), priority: 85 },
    ],
};
