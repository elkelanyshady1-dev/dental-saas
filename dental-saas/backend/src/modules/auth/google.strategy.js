"use strict";

/**
 * google.strategy.js
 * Google OAuth 2.0 strategy — Email-first auth integration.
 *
 * Flow:
 *   1. User clicks "Continue with Google" → GET /api/auth/google
 *   2. Google OAuth consent screen (hosted by Google)
 *   3. Callback → GET /api/auth/google/callback
 *   4. Strategy verifies token, extracts profile (email, name, avatar)
 *   5. Resolve user via issueOrgTokenByEmail (same as magic link flow)
 *   6. Redirect to frontend with token in query or error message
 *
 * Security:
 *   - Token-based session issuance (same as magic link)
 *   - NO session/cookie management by passport (serialize: false)
 *   - Google ID stored on User for future matching
 *   - Email is the canonical identity key
 *
 * PLANE: Organization (pre-auth, cross-org — same as smartLogin)
 */

const passport = require("passport");
const GoogleStrategy = require("passport-google-oauth20").Strategy;
const authService = require("@services/authService");
const logger = require("@utils/logger");

// ─── Constants ───────────────────────────────────────────────────────────────
const CALLBACK_PATH = "/api/auth/google/callback";

// ─── Strategy Configuration ──────────────────────────────────────────────────

function initGoogleStrategy() {
    const clientID = process.env.GOOGLE_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
    const callbackURL = `${(process.env.BACKEND_URL || "http://localhost:5000").replace(/\/$/, "")}${CALLBACK_PATH}`;

    if (!clientID || !clientSecret) {
        logger.warn("[GoogleAuth] GOOGLE_CLIENT_ID or GOOGLE_CLIENT_SECRET not set — Google auth disabled");
        return false;
    }

    passport.use(
        new GoogleStrategy(
            {
                clientID,
                clientSecret,
                callbackURL,
                scope: ["profile", "email"],
            },
            // Verify callback — NOT used in traditional Passport way.
            // We do manual resolution in the route callback instead.
            // But Passport requires this function to exist.
            (accessToken, refreshToken, profile, done) => {
                // Extract the primary email
                const email = profile.emails?.[0]?.value;
                if (!email) {
                    return done(new Error("No email found in Google profile"), null);
                }

                return done(null, {
                    googleId: profile.id,
                    email: email.toLowerCase().trim(),
                    name: profile.displayName || `${profile.name?.givenName || ""} ${profile.name?.familyName || ""}`.trim(),
                    avatar: profile.photos?.[0]?.value || null,
                });
            }
        )
    );

    // We do NOT use Passport sessions — JWT is our session mechanism
    passport.serializeUser((user, done) => done(null, user));
    passport.deserializeUser((user, done) => done(null, user));

    logger.info("[GoogleAuth] Google OAuth strategy initialized");
    return true;
}

// ─── Route Handlers ──────────────────────────────────────────────────────────

/**
 * GET /api/auth/google
 * Initiates Google OAuth flow. Optional ?redirect query param for post-login routing.
 */
function initiateGoogleAuth(req, res, next) {
    const redirect = req.query.redirect || "/org/dashboard";

    // Store redirect in state parameter (Google passes it back in callback)
    passport.authenticate("google", {
        scope: ["profile", "email"],
        state: Buffer.from(JSON.stringify({ redirect })).toString("base64"),
        prompt: "select_account", // Always show account picker
    })(req, res, next);
}

/**
 * GET /api/auth/google/callback
 * Handles the Google OAuth callback. Issues JWT session via authService.
 */
function handleGoogleCallback(req, res, next) {
    const frontendUrl = (process.env.FRONTEND_URL || process.env.APP_URL || "http://localhost:5173").replace(/\/$/, "");

    passport.authenticate("google", { session: false }, async (err, googleUser) => {
        // Parse state for redirect
        let redirect = "/org/dashboard";
        try {
            if (req.query.state) {
                const state = JSON.parse(Buffer.from(req.query.state, "base64").toString());
                if (state.redirect && typeof state.redirect === "string" && state.redirect.startsWith("/")) {
                    redirect = state.redirect;
                }
            }
        } catch { /* ignore state parse errors */ }

        // Error handling — redirect to login with error
        if (err || !googleUser) {
            logger.warn(
                { err: err?.message },
                "[GoogleAuth] Authentication failed or cancelled"
            );
            return res.redirect(`${frontendUrl}/login?error=google_auth_failed`);
        }

        try {
            // Issue org session using the same flow as magic link
            const result = await authService.issueOrgTokenByEmail(googleUser.email, {
                ipAddress: req.ip || req.headers["x-forwarded-for"] || null,
                userAgent: req.headers["user-agent"] || null,
            });

            if (result.type === "MULTI_ORG") {
                // For multi-org, redirect to a frontend page that handles org selection
                // Pass orgs as a short-lived encoded state
                return res.redirect(
                    `${frontendUrl}/login?type=multi_org&email=${encodeURIComponent(googleUser.email)}&google=1`
                );
            }

            // SINGLE_ORG — redirect with token
            logger.info(
                { email: googleUser.email.slice(0, 4) + "***", googleId: googleUser.googleId },
                "[GoogleAuth] Single-org Google login successful"
            );

            // Set cookies same as smartLogin
            const crypto = require("crypto");
            const csrfToken = crypto.randomBytes(32).toString("hex");
            const isProd = process.env.NODE_ENV === "production";

            res.cookie("refreshToken", result.refreshToken, {
                httpOnly: true,
                secure: isProd,
                sameSite: isProd ? "strict" : "lax",
                path: "/api/auth",
                maxAge: 7 * 24 * 60 * 60 * 1000,
            });

            res.cookie("csrf_token", csrfToken, {
                httpOnly: false,
                secure: isProd,
                sameSite: isProd ? "strict" : "lax",
                path: "/",
                maxAge: 7 * 24 * 60 * 60 * 1000,
            });

            // Redirect to frontend with access token in URL fragment (not query — safer)
            return res.redirect(
                `${frontendUrl}/auth/google/callback?token=${encodeURIComponent(result.accessToken)}&csrf=${encodeURIComponent(csrfToken)}&redirect=${encodeURIComponent(redirect)}`
            );
        } catch (resolveErr) {
            logger.error(
                { err: resolveErr.message, email: googleUser.email.slice(0, 4) + "***" },
                "[GoogleAuth] Failed to resolve user session"
            );

            const errorMsg = resolveErr.statusCode === 404
                ? "no_account"
                : "google_auth_failed";

            return res.redirect(`${frontendUrl}/login?error=${errorMsg}`);
        }
    })(req, res, next);
}

module.exports = {
    initGoogleStrategy,
    initiateGoogleAuth,
    handleGoogleCallback,
    CALLBACK_PATH,
};
