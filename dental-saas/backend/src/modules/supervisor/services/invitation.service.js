/**
 * invitation.service.js — Supervisor Invitation Service
 *
 * Handles the full invitation lifecycle:
 *   1. Doctor creates invitation (org-plane) → token generated
 *   2. Email sent with invitation link
 *   3. Supervisor accepts invitation → CaseAccess record created
 *   4. Optional: decline / expire / revoke
 *
 * PLANE: Bridge (created by org, consumed by supervisor).
 */

"use strict";

const crypto = require("crypto");
const SupervisorInvitationDef = require("../models/SupervisorInvitation");
const CaseAccessDef = require("../models/CaseAccess");
const SupervisorUserDef = require("../models/SupervisorUser");
const OrthodonticCaseDef = require("../../orthodontics/models/orthodonticCase.model"); // ✅ Phase 4 — canonical domain
const getModel = require("../../../core/db/getModel");
const {
  getPlatformConnection
} = require("../../../core/db/dbResolver");
const dbManager = require("../../../core/db/dbManager");
const logger = require("@utils/logger");

// Platform-level models (supervisor plane)
function _getPlatformModels() {
  const conn = getPlatformConnection();
  return {
    SupervisorInvitation: getModel(conn, SupervisorInvitationDef),
    CaseAccess: getModel(conn, CaseAccessDef),
    SupervisorUser: getModel(conn, SupervisorUserDef)
  };
}

// Org-level model — needs org connection for case lookup
async function _getOrthoCase(organizationId) {
  const conn = await dbManager.getConnection(organizationId);
  return getModel(conn, OrthodonticCaseDef);
}
const DEFAULT_INVITATION_EXPIRY_HOURS = 72;
class InvitationService {
  /**
   * Create a supervisor invitation (called from org-plane).
   *
   * @param {{
   *   caseId: string,
   *   organizationId: string,
   *   invitedBy: string,
   *   inviteeEmail: string,
   *   role?: string,
   *   permissions?: object,
   * }} params
   * @returns {object} invitation
   */
  async createInvitation({
    caseId,
    organizationId,
    invitedBy,
    inviteeEmail,
    role,
    permissions
  }) {
    const {
      SupervisorInvitation,
      CaseAccess,
      SupervisorUser
    } = _getPlatformModels();
    const OrthodonticCase = await _getOrthoCase(organizationId);

    // Verify case exists and belongs to this org
    // @rls-supervisor-plane — separate auth model, no org-scoped req context
    const orthoCase = await OrthodonticCase.findOne({
      _id: caseId
    }).lean();
    if (!orthoCase) {
      const err = new Error("Orthodontic case not found in this organization.");
      err.statusCode = 404;
      throw err;
    }

    // Check for existing pending invitation for the same email + case
    // @rls-supervisor-plane — separate auth model, no org-scoped req context
    const existing = await SupervisorInvitation.findOne({
      caseId,
      inviteeEmail: inviteeEmail.toLowerCase(),
      status: "PENDING"
    }).lean();
    if (existing) {
      const err = new Error("A pending invitation already exists for this email and case.");
      err.statusCode = 409;
      throw err;
    }

    // Check if supervisor already has access
    // @rls-supervisor-plane — separate auth model, no org-scoped req context
    const existingSupervisor = await SupervisorUser.findOne({
      email: inviteeEmail.toLowerCase()
    }).lean();
    if (existingSupervisor) {
      // @rls-supervisor-plane — separate auth model, no org-scoped req context
      const existingAccess = await CaseAccess.findOne({
        supervisorId: existingSupervisor._id,
        caseId,
        status: "ACTIVE"
      }).lean();
      if (existingAccess) {
        const err = new Error("This supervisor already has active access to this case.");
        err.statusCode = 409;
        throw err;
      }
    }

    // Generate secure invitation token
    const token = crypto.randomBytes(32).toString("hex");
    const expiresAt = new Date(Date.now() + DEFAULT_INVITATION_EXPIRY_HOURS * 60 * 60 * 1000);
    const invitation = await SupervisorInvitation.create({
      caseId,
      invitedBy,
      inviteeEmail: inviteeEmail.toLowerCase(),
      supervisorId: existingSupervisor?._id || null,
      role: role || "SUPERVISOR",
      permissions: {
        canComment: permissions?.canComment !== false,
        canApprove: permissions?.canApprove !== false,
        canViewAnalysis: permissions?.canViewAnalysis !== false,
        canDownload: permissions?.canDownload || false
      },
      token,
      expiresAt
    });
    logger.info({
      event: "SUPERVISOR_INVITATION_CREATED",
      invitationId: invitation._id,
      caseId,
      organizationId,
      invitedBy,
      inviteeEmail: inviteeEmail.toLowerCase()
    });

    // TODO: Emit event for email notification
    // eventBus.emit("supervisor.invited", { invitation, caseId, organizationId });

    return invitation;
  }

  /**
   * Accept a supervisor invitation.
   * Creates a CaseAccess record bridging the supervisor to the case.
   *
   * @param {{ invitationId: string, supervisorId: string }} params
   * @returns {{ invitation: object, access: object }}
   */
  async acceptInvitation({
    invitationId,
    supervisorId
  }) {
    const {
      SupervisorInvitation,
      CaseAccess,
      SupervisorUser
    } = _getPlatformModels();
    // @rls-supervisor-plane — separate auth model, no org-scoped req context
    const invitation = await SupervisorInvitation.findById(invitationId);
    if (!invitation) {
      const err = new Error("Invitation not found.");
      err.statusCode = 404;
      throw err;
    }
    if (invitation.status !== "PENDING") {
      const err = new Error(`Invitation is ${invitation.status.toLowerCase()} — cannot accept.`);
      err.statusCode = 400;
      throw err;
    }
    if (invitation.expiresAt < new Date()) {
      invitation.status = "EXPIRED";
      await invitation.save();
      const err = new Error("This invitation has expired.");
      err.statusCode = 410;
      throw err;
    }

    // Verify the accepting supervisor matches the invitation email
    // @rls-supervisor-plane — separate auth model, no org-scoped req context
    const supervisor = await SupervisorUser.findById(supervisorId).lean();
    if (!supervisor) {
      const err = new Error("Supervisor account not found.");
      err.statusCode = 404;
      throw err;
    }
    if (supervisor.email !== invitation.inviteeEmail) {
      const err = new Error("This invitation was sent to a different email address.");
      err.statusCode = 403;
      throw err;
    }

    // Create CaseAccess record — THE SECURITY BRIDGE
    const access = await CaseAccess.create({
      supervisorId,
      caseId: invitation.caseId,
      grantedBy: invitation.invitedBy,
      role: invitation.role,
      permissions: invitation.permissions
    });

    // Update invitation status
    invitation.status = "ACCEPTED";
    invitation.acceptedAt = new Date();
    invitation.supervisorId = supervisorId;
    await invitation.save();
    logger.info({
      event: "SUPERVISOR_INVITATION_ACCEPTED",
      invitationId: invitation._id,
      caseId: invitation.caseId,
      supervisorId,
      accessId: access._id
    });
    return {
      invitation,
      access
    };
  }

  /**
   * Accept an invitation by token (for unauthenticated flow).
   *
   * @param {{ token: string, supervisorId: string }} params
   * @returns {{ invitation: object, access: object }}
   */
  async acceptByToken({
    token,
    supervisorId
  }) {
    const {
      SupervisorInvitation
    } = _getPlatformModels();
    // @rls-supervisor-plane — separate auth model, no org-scoped req context
    const invitation = await SupervisorInvitation.findOne({
      token
    });
    if (!invitation) {
      const err = new Error("Invalid or expired invitation link.");
      err.statusCode = 404;
      throw err;
    }
    return this.acceptInvitation({
      invitationId: invitation._id,
      supervisorId
    });
  }

  /**
   * Decline an invitation.
   *
   * @param {{ invitationId: string, supervisorId: string }} params
   */
  async declineInvitation({
    invitationId,
    supervisorId
  }) {
    const {
      SupervisorInvitation,
      SupervisorUser
    } = _getPlatformModels();
    // @rls-supervisor-plane — separate auth model, no org-scoped req context
    const invitation = await SupervisorInvitation.findById(invitationId);
    if (!invitation) {
      const err = new Error("Invitation not found.");
      err.statusCode = 404;
      throw err;
    }
    if (invitation.status !== "PENDING") {
      const err = new Error(`Invitation is already ${invitation.status.toLowerCase()}.`);
      err.statusCode = 400;
      throw err;
    }

    // Verify the declining supervisor matches the invitation email
    // @rls-supervisor-plane — separate auth model, no org-scoped req context
    const supervisor = await SupervisorUser.findById(supervisorId).lean();
    if (supervisor?.email !== invitation.inviteeEmail) {
      const err = new Error("This invitation was sent to a different email.");
      err.statusCode = 403;
      throw err;
    }
    invitation.status = "DECLINED";
    invitation.supervisorId = supervisorId;
    await invitation.save();
    logger.info({
      event: "SUPERVISOR_INVITATION_DECLINED",
      invitationId: invitation._id,
      supervisorId
    });
    return invitation;
  }

  /**
   * List pending invitations for a supervisor email.
   *
   * @param {string} email
   * @returns {object[]} invitations
   */
  async listPendingInvitations(email) {
    const {
      SupervisorInvitation
    } = _getPlatformModels();
    // @rls-supervisor-plane — separate auth model, no org-scoped req context
    return SupervisorInvitation.find({
      inviteeEmail: email.toLowerCase(),
      status: "PENDING",
      expiresAt: {
        $gt: new Date()
      }
    }).populate("caseId", "patientId status caseType malocclusionClass").sort({
      createdAt: -1
    }).lean();
  }

  /**
   * List all invitations for a specific case (org-plane view).
   *
   * @param {{ caseId: string, organizationId: string }} params
   * @returns {object[]} invitations
   */
  async listCaseInvitations({
    caseId
  }) {
    const {
      SupervisorInvitation
    } = _getPlatformModels();
    // @rls-supervisor-plane — separate auth model, no org-scoped req context
    return SupervisorInvitation.find({
      caseId
    }).sort({
      createdAt: -1
    }).lean();
  }

  /**
   * Revoke an invitation (org-plane action).
   *
   * @param {{ invitationId: string, organizationId: string, revokedBy: string }} params
   */
  async revokeInvitation({
    invitationId,
    organizationId,
    revokedBy
  }) {
    const {
      SupervisorInvitation
    } = _getPlatformModels();
    // @rls-supervisor-plane — separate auth model, no org-scoped req context
    const invitation = await SupervisorInvitation.findOne({
      _id: invitationId
    });
    if (!invitation) {
      const err = new Error("Invitation not found.");
      err.statusCode = 404;
      throw err;
    }
    if (invitation.status !== "PENDING") {
      const err = new Error(`Cannot revoke — invitation is ${invitation.status.toLowerCase()}.`);
      err.statusCode = 400;
      throw err;
    }
    invitation.status = "REVOKED";
    await invitation.save();
    logger.info({
      event: "SUPERVISOR_INVITATION_REVOKED",
      invitationId: invitation._id,
      organizationId,
      revokedBy
    });
    return invitation;
  }
}
module.exports = new InvitationService();