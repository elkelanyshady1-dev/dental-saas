/**
 * user.policy.js — User, Staff, Branch Management PBAC Policies
 * Split from policyRegistry.js (Phase X.3)
 */

"use strict";

const { P } = require("../orgPermissions");
const {
    isOrgAdmin,
    isOwner,
    listOrBranchAccess,
    allOf,
} = require("../policyConditions");

module.exports = {
    // ── Users ─────────────────────────────────────────────────────────
    [P.USERS_CREATE]: [
        { effect: "allow", description: "Only org admins can create users", condition: isOrgAdmin, priority: 100 },
    ],

    [P.USERS_UPDATE]: [
        { effect: "deny", description: "Users cannot escalate their own role", condition: (ctx) => isOwner(ctx) && ctx.resource?._selfRoleChange === true, priority: 110 },
        { effect: "allow", description: "Org admins can update any user", condition: isOrgAdmin, priority: 100 },
    ],

    [P.USERS_DELETE]: [
        { effect: "deny", description: "Cannot delete yourself", condition: isOwner, priority: 110 },
        { effect: "allow", description: "Only org admins can delete users", condition: isOrgAdmin, priority: 100 },
    ],

    [P.USERS_READ]: [
        { effect: "allow", description: "Org admins can read all users", condition: isOrgAdmin, priority: 100 },
        { effect: "allow", description: "Staff can read users in accessible branches", condition: listOrBranchAccess, priority: 80 },
    ],

    // ── Staff ─────────────────────────────────────────────────────────
    [P.STAFF_MANAGE]: [
        { effect: "allow", description: "Only org admins can manage staff", condition: isOrgAdmin, priority: 100 },
    ],

    // ── Branches ──────────────────────────────────────────────────────
    [P.BRANCHES_CREATE]: [
        { effect: "allow", description: "Only org admins can create branches", condition: isOrgAdmin, priority: 100 },
    ],

    [P.BRANCHES_UPDATE]: [
        { effect: "allow", description: "Only org admins can update branches", condition: isOrgAdmin, priority: 100 },
    ],

    [P.BRANCHES_DELETE]: [
        { effect: "allow", description: "Only org admins can delete branches", condition: isOrgAdmin, priority: 100 },
    ],

    [P.BRANCHES_READ]: [
        { effect: "allow", description: "Org admins can read all branches", condition: isOrgAdmin, priority: 100 },
        { effect: "allow", description: "All staff can read branches they access", condition: listOrBranchAccess, priority: 80 },
    ],
};
