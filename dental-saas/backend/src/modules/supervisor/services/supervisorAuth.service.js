/**
 * supervisorAuth.service.js — Supervisor Authentication Service
 *
 * Handles registration, login, and token management for supervisors.
 * Uses a separate SupervisorUser model — completely isolated from org User.
 *
 * PLANE: Supervisor only.
 */

"use strict";

const SupervisorUserDef = require("../models/SupervisorUser");
const getModel = require("../../../core/db/getModel");
const { getPlatformConnection } = require("../../../core/db/dbResolver");
const { hashPassword, comparePassword, signSupervisorToken } = require("../utils/supervisorAuth.utils");
const logger = require("@utils/logger");

// Platform-level model — supervisor plane uses platform connection
function _getSupervisorUser() {
    return getModel(getPlatformConnection(), SupervisorUserDef);
}

// Brute-force protection constants
const MAX_FAILED_ATTEMPTS = 5;
const LOCK_DURATION_MS = 15 * 60 * 1000; // 15 minutes

class SupervisorAuthService {

    /**
     * Register a new supervisor account.
     * @param {{ email: string, password: string, name: string, title?: string, institution?: string }} data
     * @returns {{ token: string, supervisor: object }}
     */
    async register({ email, password, name, title, institution }) {
        // Check for existing supervisor
        // @rls-supervisor-plane — separate auth model, no org-scoped req context
        const existing = await _getSupervisorUser().findOne({ email }).lean();
        if (existing) {
            const err = new Error("A supervisor account with this email already exists.");
            err.statusCode = 409;
            throw err;
        }

        // Validate password strength
        if (!password || password.length < 8) {
            const err = new Error("Password must be at least 8 characters.");
            err.statusCode = 400;
            throw err;
        }

        const hashedPassword = await hashPassword(password);

        const supervisor = await _getSupervisorUser().create({
            email,
            password: hashedPassword,
            name,
            title: title || null,
            institution: institution || null,
        });

        const token = signSupervisorToken({
            supervisorId: supervisor._id,
            email: supervisor.email,
            tokenVersion: supervisor.tokenVersion,
        });

        logger.info({
            event: "SUPERVISOR_REGISTERED",
            supervisorId: supervisor._id,
            email: supervisor.email,
        });

        // Return safe user object (no password)
        const { password: _, ...supervisorSafe } = supervisor.toObject();
        return { token, supervisor: supervisorSafe };
    }

    /**
     * Authenticate a supervisor and return JWT.
     * @param {{ email: string, password: string }} credentials
     * @returns {{ token: string, supervisor: object }}
     */
    async login({ email, password }) {
        // @rls-supervisor-plane — separate auth model, no org-scoped req context
        const supervisor = await _getSupervisorUser().findOne({ email }).select("+password");
        if (!supervisor) {
            const err = new Error("Invalid email or password.");
            err.statusCode = 401;
            throw err;
        }

        // ─── Account Lock Check ─────────────────────────────────────────
        if (supervisor.accountLockedUntil && supervisor.accountLockedUntil > new Date()) {
            const err = new Error("Account temporarily locked due to too many failed attempts. Try again later.");
            err.statusCode = 423;
            throw err;
        }

        if (!supervisor.isActive) {
            const err = new Error("Supervisor account has been deactivated.");
            err.statusCode = 403;
            throw err;
        }

        // ─── Password Verification ──────────────────────────────────────
        const isValid = await comparePassword(password, supervisor.password);
        if (!isValid) {
            // Increment failed attempts
            const updates = { $inc: { failedLoginAttempts: 1 } };
            if (supervisor.failedLoginAttempts + 1 >= MAX_FAILED_ATTEMPTS) {
                updates.$set = {
                    accountLockedUntil: new Date(Date.now() + LOCK_DURATION_MS),
                };
                logger.warn({
                    event: "SUPERVISOR_ACCOUNT_LOCKED",
                    supervisorId: supervisor._id,
                    email: supervisor.email,
                    failedAttempts: supervisor.failedLoginAttempts + 1,
                });
            }
            // @rls-supervisor-plane — separate auth model, no org-scoped req context
            await _getSupervisorUser().updateOne({ _id: supervisor._id }, updates);

            const err = new Error("Invalid email or password.");
            err.statusCode = 401;
            throw err;
        }

        // ─── Reset Failed Attempts + Update Last Login ──────────────────
        await _getSupervisorUser().updateOne(
            { _id: supervisor._id },
            {
                $set: {
                    failedLoginAttempts: 0,
                    accountLockedUntil: null,
                    lastLoginAt: new Date(),
                },
            }
        );

        const token = signSupervisorToken({
            supervisorId: supervisor._id,
            email: supervisor.email,
            tokenVersion: supervisor.tokenVersion,
        });

        logger.info({
            event: "SUPERVISOR_LOGIN_SUCCESS",
            supervisorId: supervisor._id,
            email: supervisor.email,
        });

        const { password: _, ...supervisorSafe } = supervisor.toObject();
        return { token, supervisor: supervisorSafe };
    }

    /**
     * Get supervisor profile by ID.
     * @param {string} supervisorId
     * @returns {object} supervisor
     */
    async getProfile(supervisorId) {
        // @rls-supervisor-plane — separate auth model, no org-scoped req context
        const supervisor = await _getSupervisorUser().findById(supervisorId).lean();
        if (!supervisor) {
            const err = new Error("Supervisor not found.");
            err.statusCode = 404;
            throw err;
        }
        return supervisor;
    }

    /**
     * Update supervisor profile.
     * @param {string} supervisorId
     * @param {{ name?: string, title?: string, institution?: string }} updates
     * @returns {object} updated supervisor
     */
    async updateProfile(supervisorId, updates) {
        const allowedFields = ["name", "title", "institution"];
        const sanitized = {};
        for (const key of allowedFields) {
            if (updates[key] !== undefined) sanitized[key] = updates[key];
        }

        const supervisor = await _getSupervisorUser().findByIdAndUpdate(
            supervisorId,
            { $set: sanitized },
            { new: true, runValidators: true }
        ).lean();

        if (!supervisor) {
            const err = new Error("Supervisor not found.");
            err.statusCode = 404;
            throw err;
        }

        return supervisor;
    }
}

module.exports = new SupervisorAuthService();
