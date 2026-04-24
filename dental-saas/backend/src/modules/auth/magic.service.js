"use strict";

/**
 * magic.service.js
 * Passwordless magic-link auth — token lifecycle.
 *
 * Flow:
 *   createMagicLink(email)
 *     1. Generate raw token (crypto.randomBytes)
 *     2. Store HMAC-SHA256 hash + expiry (10 min)
 *     3. Dispatch email via sendCommunication (NEVER direct provider call)
 *
 *   verifyMagicToken(token)
 *     1. Hash incoming token
 *     2. Find matching record (constant-time compared via timingSafeEqual)
 *     3. Expiry enforced by TTL index + explicit check
 *     4. Delete record on success (single-use)
 *     5. Return { email }
 *
 * Security:
 *   - Raw token never persisted — only HMAC-SHA256 with MAGIC_SECRET
 *   - timingSafeEqual comparison of the hash
 *   - Single-use: record removed atomically on verify
 *   - No enumeration: createMagicLink succeeds whether or not the email
 *     exists (caller should not branch on that)
 */

const crypto = require("crypto");
const getPlatformModel = require("@core/db/getPlatformModel");
const MagicTokenDef = require("./magicToken.model");
const MagicToken = getPlatformModel(MagicTokenDef);
const { sendCommunication } = require("@services/communicationService");
const { checkRateLimit } = require("./rateLimiter");
const logger = require("@utils/logger");

// ─── Constants ───────────────────────────────────────────────────────────────
const TOKEN_BYTES     = 32;                  // 256-bit entropy
const TOKEN_TTL_MS    = 10 * 60 * 1000;      // 10 minutes
const RATE_LIMIT_MS   = 60 * 1000;            // 60s between links per email
const EMAIL_RE        = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// ─── Error helper ─────────────────────────────────────────────────────────────
function makeError(message, statusCode, errorCode) {
    const err = new Error(message);
    err.statusCode = statusCode;
    err.errorCode = errorCode;
    return err;
}

// ─── Token primitives ─────────────────────────────────────────────────────────
function generateToken() {
    return crypto.randomBytes(TOKEN_BYTES).toString("hex");
}

function hashToken(token) {
    const secret = process.env.MAGIC_SECRET;
    if (!secret) throw new Error("MAGIC_SECRET environment variable is not set");
    return crypto.createHmac("sha256", secret).update(token).digest("hex");
}

function timingSafeMatch(a, b) {
    const bufA = Buffer.from(a, "hex");
    const bufB = Buffer.from(b, "hex");
    return bufA.length === bufB.length && crypto.timingSafeEqual(bufA, bufB);
}

function normalizeEmail(raw) {
    if (typeof raw !== "string") throw makeError("Invalid email", 400, "INVALID_EMAIL");
    const email = raw.trim().toLowerCase();
    if (!EMAIL_RE.test(email)) throw makeError("Invalid email format", 400, "INVALID_EMAIL");
    return email;
}

function buildLink(token, redirect) {
    const base = process.env.APP_URL || process.env.FRONTEND_URL;
    if (!base) throw new Error("APP_URL (or FRONTEND_URL) environment variable is not set");
    // Template path — frontend route that calls GET /api/auth/magic-login?token=...
    let url = `${base.replace(/\/$/, "")}/auth/magic?token=${encodeURIComponent(token)}`;
    if (redirect) url += `&redirect=${encodeURIComponent(redirect)}`;
    return url;
}

// ─── Public API ──────────────────────────────────────────────────────────────

/**
 * createMagicLink — issue a new magic login link for the given email.
 *
 * Rate-limited per email (60s). Does NOT check whether the email maps to
 * an actual account — that resolution happens on verify, so this endpoint
 * cannot be used to enumerate users.
 *
 * Email dispatch goes through sendCommunication (dispatcher → EmailService
 * → providerRouter → smtp.provider). Template: magicLink.hbs.
 *
 * @param {string} rawEmail
 * @param {{ ipAddress?: string, redirect?: string, _skipRateLimit?: boolean, _skipSendEmail?: boolean }} [meta]
 * @returns {Promise<{ magicUrl: string }>}
 */
async function createMagicLink(rawEmail, meta = {}) {
    const email = normalizeEmail(rawEmail);

    // Skip rate limiting when called as OTP fallback (to avoid double-gating)
    if (!meta._skipRateLimit) {
        // Sliding-window rate limit (5 per 10 minutes per email)
        await checkRateLimit("magic", email);

        // Rate limit — one link per 60 seconds per email
        const cutoff = new Date(Date.now() - RATE_LIMIT_MS);
        const recent = await MagicToken.findOne({ email, createdAt: { $gt: cutoff } })
            .sort({ createdAt: -1 })
            .lean();

        if (recent) {
            const retryAfterSec = Math.ceil(
                (recent.createdAt.getTime() + RATE_LIMIT_MS - Date.now()) / 1000
            );
            throw makeError(
                `Please wait ${retryAfterSec} seconds before requesting another link`,
                429,
                "MAGIC_RATE_LIMITED"
            );
        }
    }

    // Generate token — plaintext lives only in this scope and the email body
    const token = generateToken();
    const link = buildLink(token, meta.redirect);

    // When called from OTP service, skip sending a separate email — the OTP
    // email already contains the magic link.
    if (!meta._skipSendEmail) {
        // Dispatch FIRST — don't persist a link we never delivered.
        // Uses the existing MAGIC_LINK type (already mapped in EmailService to
        // magicLink.hbs, already included in dispatcher SYNC_TYPES).
        await sendCommunication({
            channel: "email",
            type: "MAGIC_LINK",
            payload: {
                email,
                link,
                requestedAt: new Date(),
                ipAddress: meta.ipAddress || null,
            },
        });
    }

    // Replace any prior unexpired tokens for this email (defense against
    // multiple in-flight links). TTL index cleans up naturally too.
    await MagicToken.deleteMany({ email });

    await MagicToken.create({
        email,
        tokenHash: hashToken(token),
        expiresAt: new Date(Date.now() + TOKEN_TTL_MS),
    });

    logger.info(
        { email: _maskEmail(email) },
        "Magic link dispatched"
    );

    return { magicUrl: link };
}

/**
 * verifyMagicToken — consume a magic link token.
 *
 * @param {string} rawToken
 * @returns {Promise<{ email: string }>}
 * @throws 400/401 on invalid or expired token
 */
async function verifyMagicToken(rawToken) {
    if (typeof rawToken !== "string" || rawToken.length < 16) {
        throw makeError("Invalid token", 400, "INVALID_TOKEN");
    }

    const inputHash = hashToken(rawToken);

    // We hold the tokenHash index; find by hash directly. timingSafeEqual is
    // used on the retrieved record's hash as a belt-and-braces check against
    // timing leaks via the DB index path (driver-level differences).
    const record = await MagicToken.findOne({ tokenHash: inputHash });

    if (!record) {
        throw makeError("Invalid or expired token", 401, "MAGIC_INVALID");
    }

    if (!timingSafeMatch(inputHash, record.tokenHash)) {
        // Should never happen — findOne matched on the exact hash — but
        // keeps the property-level invariant explicit.
        throw makeError("Invalid or expired token", 401, "MAGIC_INVALID");
    }

    if (record.expiresAt < new Date()) {
        await MagicToken.deleteOne({ _id: record._id });
        throw makeError("Magic link has expired", 401, "MAGIC_EXPIRED");
    }

    // Single-use — delete before returning. Atomic on a single doc.
    await MagicToken.deleteOne({ _id: record._id });

    logger.info(
        { email: _maskEmail(record.email) },
        "Magic link verified"
    );

    return { email: record.email };
}

// ─── Internal ────────────────────────────────────────────────────────────────
function _maskEmail(email) {
    const [local, domain] = email.split("@");
    if (!domain) return "***";
    const head = local.slice(0, Math.min(2, local.length));
    return `${head}***@${domain}`;
}

module.exports = {
    createMagicLink,
    verifyMagicToken,
    // exported for tests
    generateToken,
    hashToken,
};
