/**
 * authConfig.js
 * v1.1 — Development Authentication Mode Configuration
 *
 * Controls whether external services (SMS OTP, email verification, payment
 * checks) are bypassed during local development.
 *
 * ALL dev-mode checks in auth/signup flows MUST go through this module.
 * Never scatter raw `process.env.NODE_ENV === "development"` checks.
 *
 * Usage:
 *   const { DEV_AUTH_MODE } = require("../../config/authConfig");
 *   if (DEV_AUTH_MODE) { ... bypass ... }
 *
 * Activation:
 *   - AUTO-ENABLED when NODE_ENV=development (no extra env var needed)
 *   - To DISABLE in dev (test production flow): set DEV_AUTH_MODE=false
 *   - In production: always false (NODE_ENV is never "development")
 *
 * DEV behaviour enabled:
 *   - OTP request   : no DB write, no SMS, no email
 *   - OTP verify    : accepts fixed code "123456" without DB lookup
 *   - Signup        : derives region from phone if pricingToken absent/expired
 *   - Rate limiters : all limits bypassed (pass-through middleware)
 *   - Email verify  : skipped — user marked verified immediately
 *   - Payment check : skipped — trial activated without payment provider
 */

"use strict";

// Auto-enable in development unless explicitly set to "false"
const DEV_AUTH_MODE =
    process.env.NODE_ENV === "development" &&
    process.env.DEV_AUTH_MODE !== "false";

if (DEV_AUTH_MODE) {
    console.log("╔══════════════════════════════════════════════════╗");
    console.log("║   🔓 DEV_AUTH_MODE = ACTIVE                      ║");
    console.log("║   OTP bypass: 123456 | Rate limits: OFF          ║");
    console.log("║   Set DEV_AUTH_MODE=false in .env to disable      ║");
    console.log("╚══════════════════════════════════════════════════╝");
}

/**
 * Returns a no-op Express middleware that immediately calls next().
 * Used to replace rate limiters in development.
 */
const devPassThrough = (req, res, next) => next();

module.exports = {
    DEV_AUTH_MODE,
    devPassThrough,
};
