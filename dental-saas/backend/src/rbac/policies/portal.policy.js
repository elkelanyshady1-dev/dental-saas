/**
 * portal.policy.js — Portal & Monitoring PBAC Policies
 * Split from policyRegistry.js (Phase X.3)
 */

"use strict";

const { P } = require("../orgPermissions");
const {
    isOrgAdmin, isDoctor, isAssistant, isReceptionist,
    listOrSameBranch,
    allOf, anyOf,
} = require("../policyConditions");

module.exports = {
    [P.PORTAL_MANAGE]: [
        { effect: "allow", description: "Org admins can manage portal settings", condition: isOrgAdmin, priority: 100 },
        { effect: "allow", description: "Doctors can manage portal for their patients", condition: isDoctor, priority: 90 },
    ],

    [P.MONITORING_REVIEW]: [
        { effect: "allow", description: "Org admins can review monitoring data", condition: isOrgAdmin, priority: 100 },
        { effect: "allow", description: "Doctors can review monitoring for their patients", condition: isDoctor, priority: 90 },
    ],

    [P.PORTAL_READ]: [
        { effect: "allow", description: "Org admins can read portal data", condition: isOrgAdmin, priority: 100 },
        { effect: "allow", description: "Doctors can read portal data", condition: isDoctor, priority: 90 },
        { effect: "allow", description: "Staff can read portal data in their branch", condition: allOf(anyOf(isAssistant, isReceptionist), listOrSameBranch), priority: 80 },
    ],
};
