/**
 * supervisorInvitation.facade.js — Shared facade for supervisor invitation service.
 *
 * Allows org-plane code to call supervisor invitation service functions
 * without importing directly from the supervisor plane.
 *
 * PLANE: Shared (bridges org-plane → supervisor-plane invitation service)
 */
"use strict";

const invitationService = require("@modules/supervisor/services/invitation.service");

module.exports = {
    createInvitation: invitationService.createInvitation,
    listCaseInvitations: invitationService.listCaseInvitations,
    revokeInvitation: invitationService.revokeInvitation,
};
