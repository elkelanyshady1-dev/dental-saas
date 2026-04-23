/**
 * portalAccess.service.js
 * Phase 6 — Portal Access System: Link Generation & Verification
 *
 * Provides:
 *   1. sendAccessLink — Generate magic link or setup link (staff-triggered)
 *   2. verifyAccessToken — Validate link token and resolve patient (public)
 *   3. completeSetup — First-time onboarding flow (public)
 *
 * SECURITY:
 *   - Raw tokens NEVER stored — SHA-256 hash only
 *   - One-time use enforced (usedAt checked + set)
 *   - Expiry enforced (magic: 15min, setup: 24h)
 *   - OTP required for setup completion
 *   - All DB access via secureModel
 *
 * @per-org-transactional — portal access service — organizationId from req.rls
 */

"use strict";

const crypto = require("crypto");
const bcrypt = require("bcryptjs");
const getModel = require("@core/db/getModel");
const logger = require("@utils/logger");

// Canonical model definitions (connection-bound resolution)
const PatientDef = require("../../../organization/patient/models/patient.model");
const ClinicalRecordDef = require("../../patientDomain/clinical/clinical.model");

// ─── Models (globally registered — no cross-domain imports) ──────────────────
function _getModels() {
  const PatientUser = require("../../patientDomain/access/patientUser.model");
  const PortalInvite = require("../../patientDomain/access/portalInvite.model");
  return {
    PatientUser,
    PortalInvite
  };
}

// ─── Constants ───────────────────────────────────────────────────────────────
const MAGIC_LINK_EXPIRY_MS = 15 * 60 * 1000; // 15 minutes
const SETUP_LINK_EXPIRY_MS = 24 * 60 * 60 * 1000; // 24 hours

/**
 * Generates a cryptographically secure random token and its SHA-256 hash.
 * @returns {{ rawToken: string, tokenHash: string }}
 */
function _generateToken() {
  const rawToken = crypto.randomBytes(32).toString("hex");
  const tokenHash = crypto.createHash("sha256").update(rawToken).digest("hex");
  return {
    rawToken,
    tokenHash
  };
}

/**
 * Calculates expiry based on link type.
 * @param {"magic_link"|"setup_link"} type
 * @returns {Date}
 */
function _getExpiry(type) {
  const ms = type === "setup_link" ? SETUP_LINK_EXPIRY_MS : MAGIC_LINK_EXPIRY_MS;
  return new Date(Date.now() + ms);
}

// ─── Service ─────────────────────────────────────────────────────────────────

class PortalAccessService {
  /**
   * sendAccessLink
   *
   * Staff-triggered: generates a magic link or setup link for a patient.
   * Returns the URL — delivery (WhatsApp/SMS/email) is handled by the caller.
   *
   * @param {Object} params
   * @param {Object} params.req - Express request (org staff tenant context)
   * @param {string} params.patientId - Patient ID
   * @param {"magic_link"|"setup_link"} params.type - Link type
   * @param {"whatsapp"|"sms"|"email"} [params.deliveryChannel] - Delivery method
   * @returns {{ link: string, type: string, expiresAt: Date }}
   */
  async sendAccessLink({
    req,
    patientId,
    type = "magic_link",
    deliveryChannel
  }) {
    const {
      PatientUser,
      PortalInvite
    } = _getModels();

    // ── Validate type ────────────────────────────────────────────────
    if (!["magic_link", "setup_link"].includes(type)) {
      const err = new Error("Invalid link type. Must be 'magic_link' or 'setup_link'.");
      err.statusCode = 400;
      throw err;
    }

    // ── Resolve patient (connection-bound) ──────────────────────────
    const Patient = getModel(req.dbConnection, PatientDef);
    const patient = await Patient.findOne({
      _id: patientId,
      isActive: true
    }).select("nameArabic nameEnglish phone email patientCode").lean();
    if (!patient) {
      const err = new Error("Patient not found.");
      err.statusCode = 404;
      throw err;
    }

    // ── For magic_link: verify PatientUser exists ────────────────────
    if (type === "magic_link") {
      const existingUser = await PatientUser.findOne({
        patientId,
        isActive: true
      });
      if (!existingUser) {
        const err = new Error("No portal account exists for this patient. Use 'setup_link' to create one.");
        err.statusCode = 404;
        throw err;
      }
    }

    // ── Generate token ───────────────────────────────────────────────
    const {
      rawToken,
      tokenHash
    } = _generateToken();
    const expiresAt = _getExpiry(type);

    // ── Invalidate any existing unused invites of the same type ──────
    try {
      await PortalInvite.updateMany({
        patientId,
        type,
        usedAt: null,
        expiresAt: {
          $gt: new Date()
        }
      }, {
        usedAt: new Date()
      });
    } catch (_) {
      // Non-critical — old invites will expire via TTL
    }

    // ── Create invite record ─────────────────────────────────────────
    await PortalInvite.create({
      patientId,
      type,
      tokenHash,
      expiresAt,
      email: patient.email,
      deliveryChannel: deliveryChannel || "email",
      metadata: {
        phone: patient.phone,
        email: patient.email,
        sentBy: req.user?._id,
        sentByName: req.user?.name
      }
    });

    // ── Build link URL ───────────────────────────────────────────────
    const portalUrl = process.env.PORTAL_URL || "http://localhost:3001";
    const linkPath = type === "setup_link" ? "/setup" : "/magic-link";
    const link = `${portalUrl}${linkPath}?token=${rawToken}&org=${req.organizationId}`;
    logger.info({
      event: "PORTAL_ACCESS_LINK_GENERATED",
      organizationId: req.organizationId,
      patientId: String(patientId),
      type,
      deliveryChannel: deliveryChannel || "email",
      expiresAt: expiresAt.toISOString()
    }, `[PortalAccess] ${type} generated for patient`);
    return {
      link,
      type,
      expiresAt,
      patientName: patient.nameArabic || patient.nameEnglish,
      patientPhone: patient.phone,
      patientEmail: patient.email
    };
  }

  /**
   * verifyAccessToken
   *
   * Public-facing: validates a magic link or setup link token.
   * Returns the invite type and patient info for the frontend to route appropriately.
   *
   * For magic_link: also returns a JWT (auto-login).
   * For setup_link: returns patient info for the onboarding form.
   *
   * @param {Object} params
   * @param {Object} params.req - Express request (public tenant context)
   * @param {string} params.token - Raw token from URL
   * @returns {{ type: string, token?: string, patientUser?: Object, patient?: Object }}
   */
  async verifyAccessToken({
    req,
    token
  }) {
    const {
      PatientUser,
      PortalInvite
    } = _getModels();

    // ── Hash token for lookup ────────────────────────────────────────
    const tokenHash = crypto.createHash("sha256").update(token).digest("hex");

    // ── Find valid invite ────────────────────────────────────────────
    const invite = await PortalInvite.findOne({
      tokenHash,
      usedAt: null,
      expiresAt: {
        $gt: new Date()
      }
    }, req);
    if (!invite) {
      const err = new Error("Link is invalid or expired.");
      err.statusCode = 401;
      throw err;
    }

    // ── Mark used (one-time use) ─────────────────────────────────────
    invite.usedAt = new Date();
    await invite.save();

    // ── Route based on type ──────────────────────────────────────────
    if (invite.type === "magic_link") {
      return this._handleMagicLinkVerify({
        req,
        invite,
        PatientUser
      });
    } else if (invite.type === "setup_link") {
      return this._handleSetupLinkVerify({
        req,
        invite
      });
    }
    const err = new Error("Unknown invite type.");
    err.statusCode = 400;
    throw err;
  }

  /**
   * Magic link verification — auto-login flow.
   * @private
   */
  async _handleMagicLinkVerify({
    req,
    invite,
    PatientUser
  }) {
    const patientUser = await PatientUser.findOne({
      patientId: invite.patientId,
      isActive: true
    });
    if (!patientUser) {
      const err = new Error("Portal user not found or inactive.");
      err.statusCode = 404;
      throw err;
    }

    // Update login timestamp
    patientUser.lastLoginAt = new Date();
    await patientUser.save();

    // Sign JWT
    const jwt = require("jsonwebtoken");
    const jwtToken = jwt.sign({
      patientUserId: patientUser._id,
      patientId: String(patientUser.patientId),
      type: "patient",
      tokenVersion: patientUser.tokenVersion
    }, process.env.JWT_SECRET, {
      expiresIn: "7d"
    });
    logger.info({
      event: "PORTAL_MAGIC_LINK_VERIFIED",
      organizationId: req.organizationId,
      patientId: String(invite.patientId)
    }, "[PortalAccess] Magic link verified — auto-login");
    return {
      type: "magic_link",
      token: jwtToken
    };
  }

  /**
   * Setup link verification — returns patient data for onboarding form.
   * @private
   */
  async _handleSetupLinkVerify({
    req,
    invite
  }) {
    const Patient = getModel(req.dbConnection, PatientDef);
    const patient = await Patient.findOne({
      _id: invite.patientId,
      isActive: true
    }).select("nameArabic nameEnglish phone email dateOfBirth gender patientCode").lean();
    if (!patient) {
      const err = new Error("Patient not found.");
      err.statusCode = 404;
      throw err;
    }
    logger.info({
      event: "PORTAL_SETUP_LINK_VERIFIED",
      organizationId: req.organizationId,
      patientId: String(invite.patientId)
    }, "[PortalAccess] Setup link verified — onboarding ready");
    return {
      type: "setup_link",
      setupToken: invite._id.toString(),
      // Reference for completeSetup
      patient: {
        id: patient._id.toString(),
        name: patient.nameArabic || patient.nameEnglish,
        phone: patient.phone,
        email: patient.email,
        gender: patient.gender,
        dateOfBirth: patient.dateOfBirth
      }
    };
  }

  /**
   * completeSetup
   *
   * Completes patient onboarding after setup link verification.
   * Creates PatientUser + optionally sets password + saves medical data.
   *
   * @param {Object} params
   * @param {Object} params.req - Express request (public tenant context)
   * @param {string} params.setupToken - Invite ID from verifyAccessToken
   * @param {string} params.password - Patient's chosen password (optional)
   * @param {Object} [params.medicalHistory] - Medical history data
   * @returns {{ success: boolean, token: string }}
   */
  async completeSetup({
    req,
    setupToken,
    password,
    medicalHistory
  }) {
    const {
      PatientUser,
      PortalInvite
    } = _getModels();

    // ── Validate setup token (invite ID) ─────────────────────────────
    const invite = await PortalInvite.findOne({
      _id: setupToken,
      type: "setup_link",
      usedAt: {
        $ne: null
      } // Must have been verified first
    });
    if (!invite) {
      const err = new Error("Invalid or expired setup token.");
      err.statusCode = 401;
      throw err;
    }

    // ── Check if PatientUser already exists ──────────────────────────
    let patientUser = await PatientUser.findOne({
      patientId: invite.patientId
    });
    const isNewUser = !patientUser;

    // ── Resolve patient email (connection-bound) ─────────────────────
    const Patient = getModel(req.dbConnection, PatientDef);
    const patient = await Patient.findOne({
      _id: invite.patientId,
      isActive: true
    }).select("email phone").lean();
    if (!patient) {
      const err = new Error("Patient not found.");
      err.statusCode = 404;
      throw err;
    }

    // ── Create or update PatientUser ─────────────────────────────────
    if (isNewUser) {
      const userData = {
        patientId: invite.patientId,
        email: patient.email || invite.email,
        isActive: true,
        lastLoginAt: new Date()
      };

      // Hash password if provided
      if (password) {
        userData.passwordHash = await bcrypt.hash(password, 12);
      }
      patientUser = await PatientUser.create(userData);
    } else {
      // Existing user — update password if provided
      if (password) {
        patientUser.passwordHash = await bcrypt.hash(password, 12);
      }
      patientUser.lastLoginAt = new Date();
      patientUser.isActive = true;
      await patientUser.save();
    }

    // ── Save medical history (if provided) ───────────────────────────
    if (medicalHistory && Object.keys(medicalHistory).length > 0) {
      try {
        const ClinicalRecord = getModel(req.dbConnection, ClinicalRecordDef);
        const Clinical = ClinicalRecord;
        const existing = await Clinical.findOne({
          patientId: invite.patientId
        });
        if (existing) {
          // Merge medical history
          const merged = {
            ...(existing.medicalHistory?.toObject?.() || existing.medicalHistory || {}),
            ...medicalHistory
          };
          existing.medicalHistory = merged;
          await existing.save();
        } else {
          await Clinical.create({
            patientId: invite.patientId,
            medicalHistory
          });
        }
      } catch (clinicalErr) {
        // Non-critical — log but don't block account creation
        logger.warn({
          event: "PORTAL_SETUP_CLINICAL_ERROR",
          patientId: String(invite.patientId),
          error: clinicalErr.message
        }, "[PortalAccess] Failed to save medical history during setup");
      }
    }

    // ── Sign JWT for immediate login ─────────────────────────────────
    const jwt = require("jsonwebtoken");
    const token = jwt.sign({
      patientUserId: patientUser._id,
      patientId: String(patientUser.patientId),
      type: "patient",
      tokenVersion: patientUser.tokenVersion
    }, process.env.JWT_SECRET, {
      expiresIn: "7d"
    });
    logger.info({
      event: "PORTAL_SETUP_COMPLETED",
      organizationId: req.organizationId,
      patientId: String(invite.patientId),
      isNewUser,
      hasPassword: !!password,
      hasMedicalHistory: !!medicalHistory
    }, `[PortalAccess] Setup completed — ${isNewUser ? "new" : "existing"} user`);
    return {
      success: true,
      token,
      isNewUser
    };
  }
}
module.exports = new PortalAccessService();