"use strict";

/**
 * magic.controller.js
 * Passwordless magic-link auth — HTTP endpoints.
 *
 * POST /api/auth/magic-link
 *   body: { email }
 *   → 200 always (whether the email maps to an account or not — no enumeration)
 *
 * GET  /api/auth/magic-login?token=<hex>
 *   → 200 SINGLE_ORG  { accessToken, refreshToken, user, organizationId }
 *   → 200 MULTI_ORG   { type: "MULTI_ORG", orgs: [...] }   (client shows picker)
 *   → 401 on invalid / expired / already-used token
 *   → 404 when no account exists for the verified email
 */
const asyncHandler = require("@utils/asyncHandler");
const magicService = require("./magic.service");
const authService = require("@services/authService");
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// ─── POST /magic-link ─────────────────────────────────────────────────────────
exports.requestMagicLink = asyncHandler(async (req, res) => {
  const {
    email
  } = req.body || {};
  if (!email || typeof email !== "string" || !EMAIL_RE.test(email.trim())) {
    return res.status(400).json({
      success: false,
      message: "A valid email is required",
      errorCode: "INVALID_EMAIL"
    });
  }

  // Never reveal whether the email maps to a real account — rate-limit
  // errors still bubble (429) because they're behavioural, not presence-based.
  await magicService.createMagicLink(email, {
    ipAddress: req.ip || req.headers["x-forwarded-for"] || null
  });
  res.status(200).json({
    success: true,
    message: "If an account exists for that email, a magic link has been sent."
  });
});

// ─── GET /magic-login ─────────────────────────────────────────────────────────
exports.consumeMagicLink = asyncHandler(async (req, res) => {
  const {
    token,
    redirect
  } = req.query || {};
  if (!token || typeof token !== "string") {
    return res.status(400).json({
      success: false,
      message: "token query parameter is required",
      errorCode: "MISSING_TOKEN"
    });
  }

  // Sanitize redirect — must be a relative path to prevent open redirect
  const safeRedirect = typeof redirect === "string" && redirect.startsWith("/") ? redirect : null;

  // 1. Verify + consume (single-use) the magic token
  const {
    email
  } = await magicService.verifyMagicToken(token);

  // 2. Resolve the user → issue org session (handled by authService)
  const result = await authService.issueOrgTokenByEmail(email, {
    ipAddress: req.ip || req.headers["x-forwarded-for"] || null,
    userAgent: req.headers["user-agent"] || null
  });
  if (result.type === "MULTI_ORG") {
    // Client must call the existing /select-org flow, or we could add a
    // dedicated magic-select-org endpoint in a follow-up. For now, return
    // the list and a short-lived proof is NOT re-issued — user must
    // request a new magic link after picking an org. Intentionally safe.
    return res.status(200).json({
      success: true,
      type: "MULTI_ORG",
      message: "Email matches multiple organizations — please pick one and request a fresh link per org.",
      orgs: result.orgs,
      redirect: safeRedirect
    });
  }

  // SINGLE_ORG — full session issued
  return res.status(200).json({
    success: true,
    type: "SINGLE_ORG",
    accessToken: result.accessToken,
    refreshToken: result.refreshToken,
    user: result.user,
    redirect: safeRedirect
  });
});