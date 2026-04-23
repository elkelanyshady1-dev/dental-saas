/**
 * invitation.controller.js — Supervisor Invitation Controller
 *
 * Endpoints:
 *   GET  /supervisor/invitations               — List pending invitations for authenticated supervisor
 *   POST /supervisor/invitations/:id/accept     — Accept invitation → creates CaseAccess
 *   POST /supervisor/invitations/:id/decline    — Decline invitation
 *   POST /supervisor/invitations/accept-by-token — Accept via token (link-based flow)
 *
 * ORG-SIDE endpoints (mounted separately):
 *   POST /org/orthodontic-cases/:id/invite-supervisor — Create invitation
 *   GET  /org/orthodontic-cases/:id/supervisors       — List case invitations
 *
 * PLANE: Supervisor (list/accept/decline) + Org (create/revoke).
 */

"use strict";

const invitationService = require("../services/invitation.service");
const logger = require("@utils/logger");

// ═══════════════════════════════════════════════════════════════════════════════
// Supervisor-Plane Endpoints
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * GET /supervisor/invitations
 * List pending invitations for the authenticated supervisor.
 */
async function listMyInvitations(req, res) {
  try {
    const invitations = await invitationService.listPendingInvitations(req.supervisor.email);
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
 * POST /supervisor/invitations/:id/accept
 * Accept a pending invitation.
 */
async function acceptInvitation(req, res) {
  try {
    const result = await invitationService.acceptInvitation({
      invitationId: req.params.id,
      supervisorId: req.supervisor.supervisorId
    });
    res.json({
      success: true,
      data: result
    });
  } catch (error) {
    logger.error({
      event: "INVITATION_ACCEPT_ERROR",
      error: error.message,
      invitationId: req.params.id,
      supervisorId: req.supervisor?.supervisorId
    });
    const statusCode = error.statusCode || 500;
    res.status(statusCode).json({
      success: false,
      error: error.message
    });
  }
}

/**
 * POST /supervisor/invitations/:id/decline
 * Decline a pending invitation.
 */
async function declineInvitation(req, res) {
  try {
    const result = await invitationService.declineInvitation({
      invitationId: req.params.id,
      supervisorId: req.supervisor.supervisorId
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

/**
 * POST /supervisor/invitations/accept-by-token
 * Accept invitation via token (email link flow).
 * Body: { token }
 */
async function acceptByToken(req, res) {
  try {
    const {
      token
    } = req.body;
    if (!token) {
      return res.status(400).json({
        success: false,
        error: "token is required."
      });
    }
    const result = await invitationService.acceptByToken({
      token,
      supervisorId: req.supervisor.supervisorId
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

// ═══════════════════════════════════════════════════════════════════════════════
// Org-Plane Endpoints (called by doctors)
// ═══════════════════════════════════════════════════════════════════════════════

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
    const invitation = await invitationService.createInvitation({
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
    const invitations = await invitationService.listCaseInvitations({
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
    const result = await invitationService.revokeInvitation({
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
  // Supervisor-plane
  listMyInvitations,
  acceptInvitation,
  declineInvitation,
  acceptByToken,
  // Org-plane
  createInvitation,
  listCaseInvitations,
  revokeInvitation
};