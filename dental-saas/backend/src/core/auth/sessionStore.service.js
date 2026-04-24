/**
 * sessionStore.service.js — Session lifecycle operations (S3)
 *
 * Thin wrapper around the Session model so auth controllers never talk
 * to the mongoose model directly. All calls are idempotent where the
 * shape allows, and every mutation logs a structured event for audit.
 *
 * Exports:
 *   createSession   — called from login / refresh after new token issuance
 *   lookupSession   — derive (userId, organizationId) from sessionId + tokenHash
 *   revokeSession   — explicit revoke on logout
 *
 * None of these functions throw on missing data — callers get `null`
 * and decide how to degrade. Throwing would couple the refresh endpoint
 * to session availability before the feature has fully rolled out.
 *
 * PLANE: Shared (auth core).
 */

"use strict";

const getPlatformModel = require("@core/db/getPlatformModel");
const crypto = require("crypto");
const SessionDef = require("../../shared/models/Session.model");
let _Session_cache = null;
function Session() {
    return _Session_cache || (_Session_cache = getPlatformModel(SessionDef));
}
const logger = require("../../utils/logger");

// Session lifetime mirrors the refresh token lifetime — no divergence.
const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

/**
 * Create a new session row and return the opaque sessionId to put in
 * the client cookie.
 *
 * @param {Object} params
 * @param {string|mongoose.ObjectId} params.userId
 * @param {string|mongoose.ObjectId} params.organizationId
 * @param {string} params.rawRefreshToken — the plain (unhashed) refresh token
 * @param {string} [params.userAgent]
 * @param {string} [params.ipAddress]
 * @returns {Promise<{sessionId: string, expiresAt: Date}|null>}
 */
async function createSession({
  userId,
  organizationId,
  rawRefreshToken,
  userAgent,
  ipAddress
}) {
  if (!userId || !organizationId || !rawRefreshToken) {
    logger.warn({
      userId: !!userId,
      organizationId: !!organizationId,
      rawRefreshToken: !!rawRefreshToken
    }, "[SessionStore] createSession called with missing fields");
    return null;
  }
  const sessionId = crypto.randomUUID();
  const tokenHash = crypto.createHash("sha256").update(rawRefreshToken).digest("hex");
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);
  try {
    await Session().create({
      sessionId,
      userId,
      organizationId,
      tokenHash,
      userAgent: userAgent || null,
      ipAddress: ipAddress || null,
      expiresAt
    });
    return {
      sessionId,
      expiresAt
    };
  } catch (err) {
    logger.error({
      err: err.message,
      userId: String(userId)
    }, "[SessionStore] createSession failed — client continues without session cookie");
    return null;
  }
}

/**
 * Look up an active session by sessionId + refresh-token hash and return
 * the associated tenant context. Returns null if no active match.
 *
 * The (sessionId, tokenHash) pair check detects cookie-swap attacks where
 * a stolen sessionId is paired with a different refreshToken.
 *
 * @param {Object} params
 * @param {string} params.sessionId
 * @param {string} params.rawRefreshToken
 * @returns {Promise<{userId: string, organizationId: string}|null>}
 */
async function lookupSession({
  sessionId,
  rawRefreshToken
}) {
  if (!sessionId || !rawRefreshToken) return null;
  const tokenHash = crypto.createHash("sha256").update(rawRefreshToken).digest("hex");
  const doc = await Session().findOne({
    sessionId,
    tokenHash,
    revokedAt: null,
    expiresAt: {
      $gt: new Date()
    }
  }).lean();
  if (!doc) return null;
  return {
    userId: String(doc.userId),
    organizationId: String(doc.organizationId)
  };
}

/**
 * Mark a session revoked. Idempotent — repeated calls are no-ops.
 *
 * @param {Object} params
 * @param {string} params.sessionId
 */
async function revokeSession({
  sessionId
}) {
  if (!sessionId) return;
  try {
    await Session().updateOne({
      sessionId,
      revokedAt: null
    }, {
      $set: {
        revokedAt: new Date()
      }
    });
  } catch (err) {
    logger.warn({
      err: err.message,
      sessionId
    }, "[SessionStore] revokeSession failed");
  }
}

/**
 * Revoke every session for a given user (logout-all / password-change).
 *
 * @param {string|mongoose.ObjectId} userId
 */
async function revokeAllSessionsForUser(userId) {
  if (!userId) return;
  try {
    await Session().updateMany({
      userId,
      revokedAt: null
    }, {
      $set: {
        revokedAt: new Date()
      }
    });
  } catch (err) {
    logger.warn({
      err: err.message,
      userId: String(userId)
    }, "[SessionStore] revokeAllSessionsForUser failed");
  }
}
module.exports = {
  createSession,
  lookupSession,
  revokeSession,
  revokeAllSessionsForUser,
  SESSION_TTL_MS
};