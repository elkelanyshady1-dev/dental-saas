/**
 * portalAuth.service.js
 * Phase 2 — secureModel Migration: Authentication Service
 *
 * Auth methods: email+password, magic-link, OTP.
 * All tokens carry: organizationId, patientId, type="patient".
 *
 * RLS ENFORCEMENT:
 *   - Public auth routes (login, OTP, magic-link): req.rls has role="public", userId=null
 *   - per-org DB connection provides tenant isolation from req.rls
 *   - Logout route: req.rls has role="patient", full authenticated context
 *
 * @per-org-public-access — portal auth service — pre-auth queries use public tenant context
 */

"use strict";

const jwt = require("jsonwebtoken");
const bcrypt = require("bcryptjs");
const crypto = require("crypto");
const PatientUser = require("../../patientDomain/access/patientUser.model");
const PortalInvite = require("../../patientDomain/access/portalInvite.model");
const { enqueueEmail } = require("../../../infrastructure/queues/emailQueue");
const logger = require("@utils/logger");

const JWT_SECRET = process.env.JWT_SECRET;
const TOKEN_EXPIRY = "7d";
const MAGIC_LINK_EXPIRY_MS = 30 * 60 * 1000;   // 30 minutes
const OTP_EXPIRY_MS = 10 * 60 * 1000;            // 10 minutes
const OTP_MAX_ATTEMPTS = 5;

// ─── Secure Model Wrappers ───────────────────────────────────────────────────

// ─── Token factory ────────────────────────────────────────────────────────────

function signPortalToken(patientUser) {
    return jwt.sign(
        {
            patientUserId: patientUser._id,
            organizationId: String(patientUser.organizationId),
            patientId: String(patientUser.patientId),
            type: "patient",
            tokenVersion: patientUser.tokenVersion
        },
        JWT_SECRET,
        { expiresIn: TOKEN_EXPIRY }
    );
}

// ─── Service ──────────────────────────────────────────────────────────────────

class PortalAuthService {

    /**
     * loginWithPassword
     * Authenticates a patient using email + password.
     * @per-org-public-access — pre-auth query, req.rls.role = "public"
     */
    async loginWithPassword({ req, email, password }) {
        const patientUser = await PatientUser.findOne({
            email: email.toLowerCase().trim(),
            isActive: true
        }, req);

        if (!patientUser || !patientUser.passwordHash) {
            const err = new Error("Invalid credentials.");
            err.statusCode = 401;
            throw err;
        }

        const valid = await bcrypt.compare(password, patientUser.passwordHash);
        if (!valid) {
            const err = new Error("Invalid credentials.");
            err.statusCode = 401;
            throw err;
        }

        patientUser.lastLoginAt = new Date();
        await patientUser.save();

        const token = signPortalToken(patientUser);
        logger.info({ organizationId: req.organizationId, patientId: patientUser.patientId }, "[PortalAuth] LOGIN_SUCCESS");

        return { token, patientUser };
    }

    /**
     * requestMagicLink
     * Sends a time-limited magic link to the patient's email.
     * @per-org-public-access — pre-auth query, req.rls.role = "public"
     */
    async requestMagicLink({ req, email }) {
        const patientUser = await PatientUser.findOne({
            email: email.toLowerCase().trim(),
            isActive: true
        }, req);

        if (!patientUser) {
            // Respond identically to avoid user enumeration
            return { sent: true };
        }

        const rawToken = crypto.randomBytes(32).toString("hex");
        const tokenHash = crypto.createHash("sha256").update(rawToken).digest("hex");
        const expiresAt = new Date(Date.now() + MAGIC_LINK_EXPIRY_MS);

        await PortalInvite.create({
            patientId: patientUser.patientId,
            email: patientUser.email,
            type: "magic_link",
            tokenHash,
            expiresAt
        });

        await enqueueEmail("MAGIC_LINK", {
            email: patientUser.email,
            magicLink: `${process.env.PORTAL_URL || "http://localhost:3001"}/auth/magic?token=${rawToken}&org=${req.organizationId}`,
            patientName: email
        });

        logger.info({ organizationId: req.organizationId }, "[PortalAuth] Magic link sent");
        return { sent: true };
    }

    /**
     * generateMagicLink
     * Staff-facing: generates a magic link URL for a patient by patientId.
     * Returns the URL directly — does NOT send email.
     * Used by the org frontend "Portal" button.
     * @per-org-public-access — staff-triggered, uses org req.rls
     */
    async generateMagicLink({ req, patientId }) {
        const patientUser = await PatientUser.findOne({
            patientId,
            isActive: true
        });

        if (!patientUser) {
            const err = new Error("No portal account for this patient.");
            err.statusCode = 404;
            throw err;
        }

        const rawToken = crypto.randomBytes(32).toString("hex");
        const tokenHash = crypto.createHash("sha256").update(rawToken).digest("hex");
        const expiresAt = new Date(Date.now() + MAGIC_LINK_EXPIRY_MS);

        await PortalInvite.create({
            patientId: patientUser.patientId,
            email: patientUser.email,
            type: "magic_link",
            tokenHash,
            expiresAt
        });

        const portalUrl = process.env.PORTAL_URL || "http://localhost:3001";
        const magicLink = `${portalUrl}/magic-link?token=${rawToken}&org=${req.organizationId}`;

        logger.info({ organizationId: req.organizationId, patientId: String(patientId) }, "[PortalAuth] Magic link generated (staff)");
        return { magicLink };
    }

    /**
     * verifyMagicLink
     * Validates the magic link token and returns a JWT.
     * @per-org-public-access — pre-auth query, req.rls.role = "public"
     */
    async verifyMagicLink({ req, token }) {
        const tokenHash = crypto.createHash("sha256").update(token).digest("hex");

        const invite = await PortalInvite.findOne({
            tokenHash,
            usedAt: null,
            expiresAt: { $gt: new Date() }
        }, req);

        if (!invite) {
            const err = new Error("Magic link is invalid or expired.");
            err.statusCode = 401;
            throw err;
        }

        const patientUser = await PatientUser.findOne({
            patientId: invite.patientId,
            isActive: true
        });

        if (!patientUser) {
            const err = new Error("Portal user not found.");
            err.statusCode = 404;
            throw err;
        }

        // Mark token as used
        invite.usedAt = new Date();
        await invite.save();

        patientUser.lastLoginAt = new Date();
        await patientUser.save();

        const jwt_token = signPortalToken(patientUser);
        logger.info({ organizationId: req.organizationId, patientId: patientUser.patientId }, "[PortalAuth] MAGIC_LINK_VERIFIED");

        return { token: jwt_token, patientUser };
    }

    /**
     * requestOtp
     * Sends a numeric OTP to the patient's email.
     * @per-org-public-access — pre-auth query, req.rls.role = "public"
     */
    async requestOtp({ req, email }) {
        const patientUser = await PatientUser.findOne({
            email: email.toLowerCase().trim(),
            isActive: true
        }, req);

        if (!patientUser) {
            return { sent: true };
        }

        const otp = Math.floor(100000 + Math.random() * 900000).toString();
        const otpHash = crypto.createHash("sha256").update(otp).digest("hex");
        const otpExpiresAt = new Date(Date.now() + OTP_EXPIRY_MS);

        // Upsert a portal invite for OTP
        await PortalInvite.create({
            patientId: patientUser.patientId,
            email: patientUser.email,
            type: "otp",
            tokenHash: crypto.randomBytes(16).toString("hex"),
            otpHash,
            otpExpiresAt,
            expiresAt: otpExpiresAt
        }, req);

        await enqueueEmail("EMAIL_OTP", {
            email: patientUser.email,
            otp,
            expiresInMinutes: 10
        });

        logger.info({ organizationId: req.organizationId }, "[PortalAuth] OTP sent");
        return { sent: true };
    }

    /**
     * verifyOtp
     * Validates the OTP and returns a JWT.
     * @per-org-public-access — pre-auth query, req.rls.role = "public"
     */
    async verifyOtp({ req, email, otp }) {
        const patientUser = await PatientUser.findOne({
            email: email.toLowerCase().trim(),
            isActive: true
        }, req);

        if (!patientUser) {
            const err = new Error("Invalid OTP.");
            err.statusCode = 401;
            throw err;
        }

        const otpHash = crypto.createHash("sha256").update(otp).digest("hex");

        const invite = await PortalInvite.findOne({
            patientId: patientUser.patientId,
            otpHash,
            usedAt: null,
            otpExpiresAt: { $gt: new Date() },
            otpAttempts: { $lt: OTP_MAX_ATTEMPTS }
        }, req);

        if (!invite) {
            const err = new Error("Invalid or expired OTP.");
            err.statusCode = 401;
            throw err;
        }

        // Mark as used
        invite.usedAt = new Date();
        await invite.save();

        patientUser.lastLoginAt = new Date();
        await patientUser.save();

        const token = signPortalToken(patientUser);
        logger.info({ organizationId: req.organizationId, patientId: patientUser.patientId }, "[PortalAuth] OTP_VERIFIED");

        return { token, patientUser };
    }

    /**
     * logout
     * Increments tokenVersion to invalidate all existing JWTs.
     * @per-org-transactional — authenticated portal route, req.rls.role = "patient"
     */
    async logout({ req, patientId }) {
        await PatientUser.updateOne(
            { patientId },
            { $inc: { tokenVersion: 1 } }
        );
        logger.info({ organizationId: req.organizationId, patientId }, "[PortalAuth] LOGOUT");
        return { success: true };
    }
}

module.exports = new PortalAuthService();
