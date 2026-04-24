/**
 * files.policy.js — File Module PBAC Policies
 * Phase v27 — Storage + Infra Hardening
 *
 * Defines access control policies for the files module permissions:
 *   files.read, files.create, files.delete, files.manage
 *
 * PLANE: Organization
 */

"use strict";

const { P } = require("../orgPermissions");

const {
    isOrgAdmin,
    isDoctor,
    isAssistant,
    isReceptionist,
    hasBranchAccess,
} = require("../policyConditions");

module.exports = {
    [P.FILES_READ]: [
        {
            effect: "allow",
            description: "Org admins can read all files",
            condition: isOrgAdmin,
            priority: 100,
        },
        {
            effect: "allow",
            description: "Doctors can read all files within their branch scope",
            condition: (ctx) => isDoctor(ctx) && hasBranchAccess(ctx),
            priority: 80,
        },
        {
            effect: "allow",
            description: "Assistants can read files within branch scope",
            condition: (ctx) => isAssistant(ctx) && hasBranchAccess(ctx),
            priority: 60,
        },
        {
            effect: "allow",
            description: "Receptionists can read files within branch scope",
            condition: (ctx) => isReceptionist(ctx) && hasBranchAccess(ctx),
            priority: 40,
        },
        {
            effect: "deny",
            description: "Default deny for file read",
            condition: () => true,
            priority: 0,
        },
    ],

    [P.FILES_CREATE]: [
        {
            effect: "allow",
            description: "Org admins can create files",
            condition: isOrgAdmin,
            priority: 100,
        },
        {
            effect: "allow",
            description: "Doctors can upload files",
            condition: (ctx) => isDoctor(ctx) && hasBranchAccess(ctx),
            priority: 80,
        },
        {
            effect: "allow",
            description: "Assistants can upload files",
            condition: (ctx) => isAssistant(ctx) && hasBranchAccess(ctx),
            priority: 60,
        },
        {
            effect: "deny",
            description: "Default deny for file create",
            condition: () => true,
            priority: 0,
        },
    ],

    [P.FILES_DELETE]: [
        {
            effect: "allow",
            description: "Org admins can delete any file",
            condition: isOrgAdmin,
            priority: 100,
        },
        {
            effect: "allow",
            description: "Doctors can delete files they uploaded or within their cases",
            condition: (ctx) => isDoctor(ctx) && hasBranchAccess(ctx),
            priority: 80,
        },
        {
            effect: "deny",
            description: "Default deny for file delete",
            condition: () => true,
            priority: 0,
        },
    ],

    [P.FILES_MANAGE]: [
        {
            effect: "allow",
            description: "Org admins can manage all files (bulk ops, purge)",
            condition: isOrgAdmin,
            priority: 100,
        },
        {
            effect: "deny",
            description: "Default deny for file manage",
            condition: () => true,
            priority: 0,
        },
    ],
};
