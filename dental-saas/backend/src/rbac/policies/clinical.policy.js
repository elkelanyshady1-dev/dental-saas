/**
 * clinical.policy.js — Clinical Domain PBAC Policies
 * Treatments, Procedures, Orthodontics
 * Split from policyRegistry.js (Phase X.3)
 */

"use strict";

const { P } = require("../orgPermissions");
const {
    isOrgAdmin, isDoctor, isLabTechnician, isAssistant, isReceptionist,
    isOwner, isAssignedDoctor, isOwnerOrAssigned,
    isSameBranch, listOrSameBranch, listOrBranchAccess,
    resourceHasStatus,
    allOf, anyOf,
} = require("../policyConditions");

module.exports = {
    // ── Treatments ───────────────────────────────────────────────────
    [P.TREATMENTS_CREATE]: [
        { effect: "allow", description: "Org admins can create treatments", condition: isOrgAdmin, priority: 100 },
        { effect: "allow", description: "Doctors can create treatments", condition: isDoctor, priority: 90 },
    ],

    [P.TREATMENTS_UPDATE]: [
        { effect: "allow", description: "Org admins can update any treatment", condition: isOrgAdmin, priority: 100 },
        { effect: "allow", description: "Assigned doctor can update their treatments", condition: allOf(isDoctor, isOwnerOrAssigned), priority: 90 },
    ],

    [P.TREATMENTS_DELETE]: [
        { effect: "allow", description: "Only org admins can delete treatments", condition: isOrgAdmin, priority: 100 },
    ],

    [P.TREATMENTS_READ]: [
        { effect: "allow", description: "Org admins can read all treatments", condition: isOrgAdmin, priority: 100 },
        { effect: "allow", description: "Doctors can read treatments in accessible branches", condition: allOf(isDoctor, listOrBranchAccess), priority: 90 },
        { effect: "allow", description: "Staff can read treatments in their branch", condition: allOf(anyOf(isAssistant, isReceptionist), listOrSameBranch), priority: 80 },
    ],

    // ── Procedures ───────────────────────────────────────────────────
    [P.PROCEDURES_CREATE]: [
        { effect: "allow", description: "Org admins can create procedures", condition: isOrgAdmin, priority: 100 },
        { effect: "allow", description: "Doctors can create procedures", condition: isDoctor, priority: 90 },
    ],

    [P.PROCEDURES_UPDATE]: [
        { effect: "allow", description: "Org admins can update procedures", condition: isOrgAdmin, priority: 100 },
        { effect: "allow", description: "Doctors can update procedures they created", condition: allOf(isDoctor, isOwner), priority: 90 },
    ],

    [P.PROCEDURES_DELETE]: [
        { effect: "allow", description: "Only org admins can delete procedures", condition: isOrgAdmin, priority: 100 },
    ],

    [P.PROCEDURES_READ]: [
        { effect: "allow", description: "Org admins can read all procedures", condition: isOrgAdmin, priority: 100 },
        { effect: "allow", description: "All clinical staff can read procedure catalog", condition: anyOf(isDoctor, isAssistant, isReceptionist, isLabTechnician), priority: 80 },
    ],

    // ── Orthodontics — Phase 30 FINAL: two-permission model ─────────────────
    // orthodontics.full  — all clinical mutations (create / update / delete / admin)
    // orthodontics.read  — all clinical reads
    [P.ORTHO_FULL]: [
        { effect: "allow", description: "Org admins have full orthodontic case access", condition: isOrgAdmin, priority: 100 },
        { effect: "allow", description: "Doctors can perform all clinical orthodontic operations", condition: isDoctor, priority: 90 },
        { effect: "allow", description: "Lab techs can perform write operations on assigned cases", condition: allOf(isLabTechnician, isAssignedDoctor), priority: 85 },
    ],

    [P.ORTHO_READ]: [
        { effect: "allow", description: "Org admins can read all orthodontic cases", condition: isOrgAdmin, priority: 100 },
        { effect: "allow", description: "Doctors can read orthodontic cases", condition: allOf(isDoctor, listOrBranchAccess), priority: 90 },
        { effect: "allow", description: "Lab technicians can read orthodontic cases in their branch", condition: allOf(isLabTechnician, listOrSameBranch), priority: 85 },
    ],
};
