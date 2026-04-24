/**
 * SupervisorInvitation.js — Token-Based Supervisor Onboarding
 *
 * Created by org-plane doctors to invite an external supervisor
 * to review specific orthodontic cases.
 *
 * Flow: Doctor → create invitation → email sent → supervisor accepts → CaseAccess created
 *
 * PLANE: Bridge (created by org, consumed by supervisor).
 * SENTINEL: organizationId + caseId from JWT context, never from body.
 */

"use strict";

const mongoose = require("mongoose");
const supervisorInvitationSchema = new mongoose.Schema({
  caseId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "OrthodonticCase",
    required: true,
    index: true
  },
  // Org-plane user who created the invitation
  invitedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true
  },
  // Email of the invited supervisor
  inviteeEmail: {
    type: String,
    required: true,
    lowercase: true,
    trim: true,
    maxlength: 200
  },
  // If supervisor already exists, link them
  supervisorId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "SupervisorUser",
    default: null
  },
  role: {
    type: String,
    enum: ["SUPERVISOR", "OBSERVER"],
    default: "SUPERVISOR"
  },
  permissions: {
    canComment: {
      type: Boolean,
      default: true
    },
    canApprove: {
      type: Boolean,
      default: true
    },
    canViewAnalysis: {
      type: Boolean,
      default: true
    },
    canDownload: {
      type: Boolean,
      default: false
    }
  },
  status: {
    type: String,
    enum: ["PENDING", "ACCEPTED", "DECLINED", "EXPIRED", "REVOKED"],
    default: "PENDING"
  },
  // Secure token for accepting the invitation
  token: {
    type: String,
    required: true,
    unique: true,
    index: true
  },
  expiresAt: {
    type: Date,
    required: true
    // TTL index declared via schema.index({ expiresAt: 1 }, { expireAfterSeconds: ... }) below
  },
  acceptedAt: {
    type: Date,
    default: null
  }
}, {
  timestamps: true,
  collection: "supervisorInvitations"
});

// ─── Indexes ────────────────────────────────────────────────────────────────
supervisorInvitationSchema.index({
  inviteeEmail: 1,
  status: 1
});
supervisorInvitationSchema.index({
  caseId: 1,
  inviteeEmail: 1
});

// TTL index — auto-delete expired invitations after 30 days
supervisorInvitationSchema.index({
  expiresAt: 1
}, {
  expireAfterSeconds: 2592000
});
const modelName = "SupervisorInvitation";
module.exports = {
  modelName,
  schema: supervisorInvitationSchema
};