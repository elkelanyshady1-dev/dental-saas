/**
 * patientAuth.service.js — Patient Portal Authentication Service
 * ═══════════════════════════════════════════════════════════════
 *
 * RLS STRICT MODE — Phase 2 Compliance
 *
 * ALL DB access uses getModel(req.dbConnection, Def) + createSystemContext.
 * Auth service operates pre-request (no req.rls) — uses HMAC-signed
 * system context for trusted internal DB lookups.
 *
 * @per-org-transactional — Auth flows run before tenant context exists
 */

"use strict";

const crypto = require("crypto");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const PatientUser = require("./patientUser.model");
const PortalInvite = require("./portalInvite.model");
const communicationService = require("../../../infrastructure/communication/CommunicationService");
const eventBus = require("../../../core/eventBus");
const {
  PATIENT_PORTAL_ACTIVATED,
  PATIENT_LOGIN_SUCCESS,
  PATIENT_LOGIN_FAILED
} = require("../../../core/domainEvents");
const AuditLogDef = require("../../../shared/models/AuditLog");
const auditService = require("../../../services/auditService");
const logger = require("@utils/logger");
class PatientAuthService {
  async activatePortal({
    inviteToken,
    otp,
    password
  }) {
    // ─── TENANT ISOLATION INVARIANT ────────────────────────────────────────
    // organizationId is NEVER accepted as a parameter.
    // Organization context is resolved exclusively from the PortalInvite
    // database record (invite.organizationId) — it cannot be influenced by
    // any request payload. The tokenHash is globally unique per invite.
    // ───────────────────────────────────────────────────────────────────────

    const tokenHash = crypto.createHash("sha256").update(inviteToken).digest("hex");

    // ── STEP 1: Lookup invite ──────────────────────────────────────────
    // @per-org-transactional — Pre-auth lookup; organizationId derived FROM DB, not request
    // @rls-auth-flow
    const invite = await PortalInvite.findOne({
      tokenHash,
      usedAt: null
    });
    if (!invite) throw new Error("Invalid or expired invitation");
    if (invite.lockedUntil && invite.lockedUntil > new Date()) throw new Error("Account locked temporarily");
    const isOtpValid = await bcrypt.compare(otp, invite.otpHash);
    if (!isOtpValid) {
      invite.otpAttempts += 1;
      if (invite.otpAttempts >= 5) invite.lockedUntil = new Date(Date.now() + 10 * 60 * 1000);
      await invite.save();
      throw new Error("Invalid OTP");
    }
    const passwordHash = await bcrypt.hash(password, 12);

    // ── STEP 2: Create PatientUser via secureModel ─────────────────────
    const patientUser = await PatientUser.create({
      patientId: invite.patientId,
      email: invite.email,
      passwordHash
    });
    invite.usedAt = new Date();
    await invite.save();
    const patientAggregateService = require("../core/patient.aggregate.service");
    await patientAggregateService.setPortalEnabled({
      patientId: invite.patientId,
      enabled: true
    });

    // Audit the activation via auditService (per-org compliant)
    await auditService.createAuditRecord({
      actorId: invite.patientId,
      actorType: "patient",
      action: "PATIENT_PORTAL_ACTIVATED",
      entity: "PATIENT",
      entityType: "PATIENT",
      entityId: invite.patientId,
      metadata: {
        method: "INVITE_TOKEN"
      },
      success: true
    });
    eventBus.emit(PATIENT_PORTAL_ACTIVATED, {
      patientId: invite.patientId
    });
    return patientUser;
  }
  async login({
    clinicCode,
    email,
    password,
    OrganizationModel
  }) {
    // @rls-auth-flow — Organization lookup is pre-auth (no JWT context)
    const org = await OrganizationModel.findOne({
      slug: clinicCode,
      isActive: true
    });
    if (!org) throw new Error("Invalid clinic code");

    // ── secureModel lookup with system context ──────────────────────────
    const patientUser = await PatientUser.findOne({
      email: email.toLowerCase()
    });
    if (!patientUser || !patientUser.isActive) {
      eventBus.emit(PATIENT_LOGIN_FAILED, {
        email
      });
      throw new Error("Invalid credentials");
    }
    const isMatch = await bcrypt.compare(password, patientUser.passwordHash);
    if (!isMatch) throw new Error("Invalid credentials");
    const token = this.generateToken(patientUser);
    patientUser.lastLoginAt = new Date();
    await patientUser.save();
    eventBus.emit(PATIENT_LOGIN_SUCCESS, {
      patientId: patientUser.patientId
    });
    return {
      token,
      patientUser
    };
  }
  generateToken(user) {
    return jwt.sign({
      patientUserId: user._id,
      patientId: user.patientId,
      tokenVersion: user.tokenVersion,
      type: "patient"
    }, process.env.JWT_SECRET, {
      expiresIn: "7d"
    });
  }
}
module.exports = new PatientAuthService();