/**
 * supervisorInvitation.controller.js — Org-side supervisor invitation handlers.
 *
 * Extracted from supervisor/controllers/invitation.controller.js to eliminate
 * cross-plane import (org-plane → supervisor-plane).
 *
 * These handlers are mounted on org-plane routes:
 *   POST   /org/orthodontic-cases/:id/invite-supervisor
 *   GET    /org/orthodontic-cases/:id/supervisors
 *   DELETE /org/orthodontic-cases/:id/supervisors/:invitationId
 *
 * PLANE: Organization
 */

"use strict";

const invitationFacade = require("@shared/services/supervisorInvitation.facade");
const logger = require("@utils/logger");

/**
 * POST /org/orthodontic-cases/:id/invite-supervisor
 * Create a supervisor invitation for a case.
 * Requires: orgProtect, requireOrgPermission("orthodontics.full")
 */
async function createInvitation(req, res) {
  try {
    const {
      email,
      role,
      permissions
    } = req.body;
    if (!email) {
      return res.status(400).json({
        success: false,
        error: "Supervisor email is required."
      });
    }
    const invitation = await invitationFacade.createInvitation({
      caseId: req.params.id,
      invitedBy: req.user._id,
      inviteeEmail: email,
      role,
      permissions
    });
    res.status(201).json({
      success: true,
      data: invitation
    });
  } catch (error) {
    logger.error({
      event: "INVITATION_CREATE_ERROR",
      error: error.message,
      caseId: req.params.id
    });
    const statusCode = error.statusCode || 500;
    res.status(statusCode).json({
      success: false,
      error: error.message
    });
  }
}

/**
 * GET /org/orthodontic-cases/:id/supervisors
 * List invitations for a specific case.
 * Requires: orgProtect, requireOrgPermission("orthodontics.read")
 */
async function listCaseInvitations(req, res) {
  try {
    const invitations = await invitationFacade.listCaseInvitations({
      caseId: req.params.id
    });
    res.json({
      success: true,
      data: invitations
    });
  } catch (error) {
    const statusCode = error.statusCode || 500;
    res.status(statusCode).json({
      success: false,
      error: error.message
    });
  }
}

/**
 * DELETE /org/orthodontic-cases/:id/supervisors/:invitationId
 * Revoke a pending invitation.
 * Requires: orgProtect, requireOrgPermission("orthodontics.full")
 */
async function revokeInvitation(req, res) {
  try {
    const result = await invitationFacade.revokeInvitation({
      invitationId: req.params.invitationId,
      revokedBy: req.user._id
    });
    res.json({
      success: true,
      data: result
    });
  } catch (error) {
    const statusCode = error.statusCode || 500;
    res.status(statusCode).json({
      success: false,
      error: error.message
    });
  }
}
module.exports = {
  createInvitation,
  listCaseInvitations,
  revokeInvitation
};