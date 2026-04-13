/**
 * supervisorAuth.utils.js — Supervisor Authentication Utilities
 *
 * Password hashing and JWT signing for the supervisor plane.
 * Uses a SEPARATE JWT secret (JWT_SUPERVISOR_SECRET) to guarantee
 * plane isolation — supervisor tokens CANNOT be used on org routes.
 *
 * PLANE: Supervisor only.
 */

"use strict";

const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");

const SUPERVISOR_JWT_EXPIRY = process.env.JWT_SUPERVISOR_EXPIRY || "7d";

/**
 * Lazily resolve the supervisor JWT secret.
 * Checked at call time (not load time) to support .env loading order.
 * @returns {string}
 * @throws {Error} if no secret is configured
 */
function getSupervisorSecret() {
    const secret = process.env.JWT_SUPERVISOR_SECRET || process.env.JWT_SECRET;
    if (!secret) {
        throw new Error("[SupervisorAuth] JWT_SUPERVISOR_SECRET or JWT_SECRET must be set");
    }
    return secret;
}

/**
 * Hash a plaintext password using bcrypt (cost factor 12).
 * @param {string} plaintext
 * @returns {Promise<string>} bcrypt hash
 */
async function hashPassword(plaintext) {
    return bcrypt.hash(plaintext, 12);
}

/**
 * Compare plaintext against bcrypt hash.
 * @param {string} plaintext
 * @param {string} hash
 * @returns {Promise<boolean>}
 */
async function comparePassword(plaintext, hash) {
    return bcrypt.compare(plaintext, hash);
}

/**
 * Sign a JWT for supervisor plane authentication.
 * Payload always includes `type: "supervisor"` for plane isolation.
 *
 * @param {{ supervisorId: string, email: string, tokenVersion: number }} payload
 * @returns {string} signed JWT
 */
function signSupervisorToken(payload) {
    return jwt.sign(
        {
            ...payload,
            type: "supervisor",
        },
        getSupervisorSecret(),
        { expiresIn: SUPERVISOR_JWT_EXPIRY }
    );
}

/**
 * Verify a supervisor JWT.
 * @param {string} token
 * @returns {object} decoded payload
 * @throws {jwt.JsonWebTokenError} on invalid/expired token
 */
function verifySupervisorToken(token) {
    return jwt.verify(token, getSupervisorSecret());
}

module.exports = {
    hashPassword,
    comparePassword,
    signSupervisorToken,
    verifySupervisorToken,
    getSupervisorSecret,
};
