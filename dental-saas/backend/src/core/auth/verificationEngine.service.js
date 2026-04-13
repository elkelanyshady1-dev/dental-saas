/**
 * verificationEngine.service.js
 * Core Auth — Unified Verification Engine (v1.0)
 *
 * Centralized service for all verification flows:
 *   - Phone OTP (signup)
 *   - Email verification (post-signup)
 *   - Password reset
 *   - Magic login (future)
 *
 * Architecture:
 *   requestVerification() → create VerificationToken → emit event → listener delivers via channel
 *   verifyToken()         → validate token → mark used → return result
 *   resendVerification()  → invalidate old → create new → emit event
 *   invalidateToken()     → mark token as used
 *
 * All tokens are stored with bcrypt hash. Raw token/OTP is NEVER persisted.
 *
 * PLANE: Core / Auth
 */

"use strict";

const crypto = require("crypto");
const bcrypt = require("bcryptjs");
const VerificationTokenDef = require("@shared/models/VerificationToken.model");
const { getChannelOrder } = require("@config/verificationChannels");
const eventBus = require("../eventBus");
const logger = require("@utils/logger");

// Per-org DB resolution
const dbManager = require("@core/db/dbManager");
const getModel = require("@core/db/getModel");

// ─── Configuration ────────────────────────────────────────────────────────────
const OTP_LENGTH = 6;
const DEFAULT_EXPIRY_MS = 10 * 60 * 1000;          // 10 minutes
const PASSWORD_RESET_EXPIRY_MS = 60 * 60 * 1000;   // 1 hour
const MAX_ATTEMPTS = 5;
const MAX_REQUESTS_PER_IDENTIFIER = 5;              // rate limit window
const BCRYPT_ROUNDS = 10;

// Purpose-specific expiry
const EXPIRY_MAP = {
    PHONE_OTP: DEFAULT_EXPIRY_MS,
    EMAIL_VERIFY: 24 * 60 * 60 * 1000,             // 24 hours
    PASSWORD_RESET: PASSWORD_RESET_EXPIRY_MS,
    MAGIC_LOGIN: 30 * 60 * 1000,                    // 30 minutes
};

/**
 * Generate a cryptographically secure OTP or token based on purpose.
 * OTP-based flows get a numeric code; link-based flows get a hex token.
 */
function generateRawToken(purpose) {
    if (purpose === "PHONE_OTP") {
        return crypto.randomInt(100000, 999999).toString();
    }
    // Link-based flows (EMAIL_VERIFY, PASSWORD_RESET, MAGIC_LOGIN)
    return crypto.randomBytes(32).toString("hex");
}

class VerificationEngineService {
    /**
     * _resolveModel — Returns VerificationToken model bound to per-org DB
     * or global model if no organizationId is provided.
     */
    _resolveModel(organizationId) {
        if (organizationId) {
            const conn = dbManager.getConnection(String(organizationId));
            return getModel(conn, VerificationTokenDef);
        }
        return VerificationTokenDef.default;
    }

    /**
     * requestVerification
     *
     * Creates a new verification token and emits an event for delivery.
     *
     * @param {Object} options
     * @param {string} options.purpose      - PHONE_OTP | EMAIL_VERIFY | PASSWORD_RESET | MAGIC_LOGIN
     * @param {string} options.identifier   - phone (E.164), email, or userId
     * @param {string} [options.organizationId] - optional org scope
     * @param {Object} [options.metadata]   - extra data (email for fallback, name, resetUrl, etc.)
     * @returns {Promise<{ tokenId: string, rawToken: string, channel: string, expiresAt: Date }>}
     */
    async requestVerification({ purpose, identifier, organizationId = null, metadata = {} }) {
        if (!purpose || !identifier) {
            throw new Error("[VerificationEngine] purpose and identifier are required");
        }

        const VerificationToken = this._resolveModel(organizationId);

        // ── Rate limit: max requests per identifier in the expiry window ──────
        const expiryMs = EXPIRY_MAP[purpose] || DEFAULT_EXPIRY_MS;
        const recentCount = await VerificationToken.countDocuments({
            identifier,
            purpose,
            createdAt: { $gte: new Date(Date.now() - expiryMs) },
        });

        if (recentCount >= MAX_REQUESTS_PER_IDENTIFIER) {
            const err = new Error("Too many verification requests. Please try again later.");
            err.statusCode = 429;
            throw err;
        }

        // ── Generate and hash token ──────────────────────────────────────────
        const rawToken = generateRawToken(purpose);
        const tokenHash = await bcrypt.hash(rawToken, BCRYPT_ROUNDS);

        // ── Determine primary channel ────────────────────────────────────────
        const channelOrder = getChannelOrder(purpose);
        const primaryChannel = channelOrder[0];

        // ── Create VerificationToken document ────────────────────────────────
        const tokenDoc = await VerificationToken.create({
            purpose,
            identifier,
            tokenHash,
            channel: primaryChannel,
            expiresAt: new Date(Date.now() + expiryMs),
            attempts: 0,
            maxAttempts: MAX_ATTEMPTS,
            isUsed: false,
            organizationId,
            metadata,
        });

        // ── DEV: log raw token to console ────────────────────────────────────
        if (process.env.NODE_ENV === "development") {
            console.log(`\n[VerificationEngine] ⚡ DEV ${purpose} for ${identifier.slice(0, 8)}****: ${rawToken}\n`);
        }

        // ── Emit event for delivery ──────────────────────────────────────────
        // Uses Node EventEmitter directly (bypass schemaRegistry) like email.events.js
        const { EventEmitter } = require("events");
        EventEmitter.prototype.emit.call(eventBus, "verification.token.created", {
            tokenId: String(tokenDoc._id),
            purpose,
            identifier,
            rawToken,
            channel: primaryChannel,
            channelOrder,
            organizationId,
            metadata,
            expiresAt: tokenDoc.expiresAt,
        });

        logger.info(
            { purpose, identifier: identifier.slice(0, 8) + "****", channel: primaryChannel },
            "[VerificationEngine] Token created"
        );

        return {
            tokenId: String(tokenDoc._id),
            rawToken,
            channel: primaryChannel,
            expiresAt: tokenDoc.expiresAt,
            expiresInSeconds: Math.floor(expiryMs / 1000),
        };
    }

    /**
     * verifyToken
     *
     * Validates a raw token/OTP against a stored VerificationToken.
     *
     * @param {Object} options
     * @param {string} options.purpose    - PHONE_OTP | EMAIL_VERIFY | PASSWORD_RESET | MAGIC_LOGIN
     * @param {string} options.identifier - phone, email, or userId
     * @param {string} options.rawToken   - the OTP code or hex token
     * @returns {Promise<{ valid: boolean, tokenDoc: Object|null }>}
     */
    async verifyToken({ purpose, identifier, rawToken, organizationId = null }) {
        if (!purpose || !rawToken) {
            const err = new Error("purpose and token are required");
            err.statusCode = 400;
            throw err;
        }

        const VerificationToken = this._resolveModel(organizationId);

        // ── Find latest unused token ─────────────────────────────────────────
        const query = { purpose, isUsed: false };
        if (identifier) query.identifier = identifier;
        const tokenDoc = await VerificationToken.findOne(query).sort({ createdAt: -1 });

        if (!tokenDoc) {
            this._emitMetric("verification.token.failed", { purpose, identifier, reason: "not_found" });
            const err = new Error("No verification token found. Please request a new one.");
            err.statusCode = 400;
            throw err;
        }

        // ── Check expiration ─────────────────────────────────────────────────
        if (tokenDoc.expiresAt < new Date()) {
            this._emitMetric("verification.token.failed", { purpose, identifier, reason: "expired" });
            const err = new Error("Verification token has expired. Please request a new one.");
            err.statusCode = 400;
            throw err;
        }

        // ── Check attempt limit ──────────────────────────────────────────────
        if (tokenDoc.attempts >= tokenDoc.maxAttempts) {
            tokenDoc.isUsed = true;
            await tokenDoc.save();
            this._emitMetric("verification.token.failed", { purpose, identifier, reason: "max_attempts" });
            const err = new Error("Too many failed attempts. Please request a new code.");
            err.statusCode = 429;
            throw err;
        }

        // ── Compare token (bcrypt for OTP, SHA-256 for link tokens) ──────────
        let isMatch = false;
        if (purpose === "PHONE_OTP") {
            // OTP: bcrypt compare
            isMatch = await bcrypt.compare(rawToken, tokenDoc.tokenHash);
        } else {
            // Link tokens: bcrypt compare (all now standardized)
            isMatch = await bcrypt.compare(rawToken, tokenDoc.tokenHash);
        }

        if (!isMatch) {
            tokenDoc.attempts += 1;
            await tokenDoc.save();
            this._emitMetric("verification.token.failed", { purpose, identifier, reason: "invalid" });
            const err = new Error("Invalid verification code.");
            err.statusCode = 400;
            err.attemptsRemaining = tokenDoc.maxAttempts - tokenDoc.attempts;
            throw err;
        }

        // ── Mark as used ─────────────────────────────────────────────────────
        tokenDoc.isUsed = true;
        await tokenDoc.save();

        this._emitMetric("verification.token.verified", { purpose, identifier });

        logger.info(
            { purpose, identifier: identifier.slice(0, 8) + "****" },
            "[VerificationEngine] Token verified"
        );

        return { valid: true, tokenDoc };
    }

    /**
     * resendVerification
     *
     * Invalidates existing tokens and creates a fresh one.
     *
     * @param {Object} options - same as requestVerification
     * @returns {Promise<Object>} - same as requestVerification
     */
    async resendVerification({ purpose, identifier, organizationId = null, metadata = {} }) {
        const VerificationToken = this._resolveModel(organizationId);
        // Invalidate all existing unused tokens for this identifier + purpose
        await VerificationToken.updateMany(
            { identifier, purpose, isUsed: false },
            { isUsed: true }
        );

        // Create a fresh token
        return this.requestVerification({ purpose, identifier, organizationId, metadata });
    }

    /**
     * invalidateToken
     *
     * Marks a specific token as used (e.g., on logout, manual cancel).
     *
     * @param {string} tokenId
     */
    async invalidateToken(tokenId, organizationId = null) {
        const VerificationToken = this._resolveModel(organizationId);
        await VerificationToken.findByIdAndUpdate(tokenId, { isUsed: true });
        logger.info({ tokenId }, "[VerificationEngine] Token invalidated");
    }

    /**
     * _emitMetric — fire-and-forget metric event
     */
    _emitMetric(eventName, data) {
        try {
            const { EventEmitter } = require("events");
            EventEmitter.prototype.emit.call(eventBus, eventName, data);
        } catch { /* non-blocking */ }
    }
}

module.exports = new VerificationEngineService();
