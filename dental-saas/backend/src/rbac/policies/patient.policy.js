/**
 * patient.policy.js — Patient Module PBAC Policies
 * Split from policyRegistry.js (Phase X.3)
 */

"use strict";

const { P } = require("../orgPermissions");
const {
    isOrgAdmin, isDoctor, isAssistant, isReceptionist, isLabTechnician,
    isOwnerOrAssigned, isSameBranch, hasBranchAccess, listOrSameBranch,
    listOrBranchAccess,
    allOf, anyOf, not,
} = require("../policyConditions");

module.exports = {
    [P.PATIENTS_READ]: [
        { effect: "allow", description: "Org admins can read all patients", condition: isOrgAdmin, priority: 100 },
        { effect: "allow", description: "Doctors can read patients in their branch", condition: allOf(isDoctor, hasBranchAccess), priority: 90 },
        { effect: "allow", description: "Staff can read patients in their branch", condition: isSameBranch, priority: 80 },
    ],

    [P.PATIENTS_CREATE]: [
        { effect: "allow", description: "Org admins can create patients anywhere", condition: isOrgAdmin, priority: 100 },
        { effect: "allow", description: "Doctors and receptionists can create patients in their branch", condition: anyOf(isDoctor, isReceptionist), priority: 90 },
    ],

    [P.PATIENTS_UPDATE]: [
        { effect: "allow", description: "Org admins can update any patient", condition: isOrgAdmin, priority: 100 },
        { effect: "allow", description: "Doctors can update their own patients", condition: allOf(isDoctor, isOwnerOrAssigned), priority: 90 },
        { effect: "allow", description: "Staff can update patients in their branch", condition: allOf(isSameBranch, not(isLabTechnician)), priority: 80 },
    ],

    [P.PATIENTS_DELETE]: [
        { effect: "allow", description: "Only org admins can delete patients", condition: isOrgAdmin, priority: 100 },
    ],
};
