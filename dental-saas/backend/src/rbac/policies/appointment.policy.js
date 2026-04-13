/**
 * appointment.policy.js — Appointment & Calendar PBAC Policies
 * Split from policyRegistry.js (Phase X.3)
 */

"use strict";

const { P } = require("../orgPermissions");
const {
    isOrgAdmin, isDoctor, isAssistant, isReceptionist,
    isAssignedDoctor,
    isSameBranch, listOrSameBranch, listOrBranchAccess,
    allOf, anyOf,
} = require("../policyConditions");

module.exports = {
    [P.APPOINTMENTS_CREATE]: [
        { effect: "allow", description: "Org admins can create appointments", condition: isOrgAdmin, priority: 100 },
        { effect: "allow", description: "Doctors can create appointments", condition: isDoctor, priority: 90 },
        { effect: "allow", description: "Receptionists and assistants can create appointments in their branch", condition: anyOf(isReceptionist, isAssistant), priority: 80 },
    ],

    [P.APPOINTMENTS_UPDATE]: [
        { effect: "allow", description: "Org admins can update any appointment", condition: isOrgAdmin, priority: 100 },
        { effect: "allow", description: "Assigned doctor can update their appointments", condition: allOf(isDoctor, isAssignedDoctor), priority: 90 },
        { effect: "allow", description: "Receptionists can update appointments in their branch", condition: allOf(isReceptionist, isSameBranch), priority: 80 },
    ],

    [P.APPOINTMENTS_DELETE]: [
        { effect: "allow", description: "Org admins can cancel any appointment", condition: isOrgAdmin, priority: 100 },
        { effect: "allow", description: "Assigned doctor can cancel their appointments", condition: allOf(isDoctor, isAssignedDoctor), priority: 90 },
    ],

    [P.APPOINTMENTS_READ]: [
        { effect: "allow", description: "Org admins can read all appointments", condition: isOrgAdmin, priority: 100 },
        { effect: "allow", description: "Doctors can read appointments in accessible branches", condition: allOf(isDoctor, listOrBranchAccess), priority: 90 },
        { effect: "allow", description: "Staff can read appointments in their branch", condition: allOf(anyOf(isAssistant, isReceptionist), listOrSameBranch), priority: 80 },
    ],

    [P.CALENDAR_READ]: [
        { effect: "allow", description: "Org admins can read full calendar", condition: isOrgAdmin, priority: 100 },
        { effect: "allow", description: "All staff can read calendar in their branch", condition: listOrSameBranch, priority: 80 },
    ],

    [P.CALENDAR_MULTI_BRANCH]: [
        { effect: "allow", description: "Only org admins can view multi-branch calendar", condition: isOrgAdmin, priority: 100 },
    ],

    [P.CALENDAR_SELF_FILTER]: [
        { effect: "allow", description: "Doctors see only their own appointments", condition: isDoctor, priority: 90 },
    ],
};
