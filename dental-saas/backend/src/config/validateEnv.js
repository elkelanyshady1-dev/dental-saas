/**
 * validateEnv.js
 * Centralised env validation for the 3-layer DB architecture (v9.4.1).
 *
 * Fails fast at boot if any required variable is missing, before any
 * module that depends on env reaches require-time side effects.
 *
 * Called from the top of server.js, BEFORE any other project import.
 *
 * PLANE: Platform / Bootstrap
 */

"use strict";

const REQUIRED = [
    "MONGO_URI_PLATFORM",
    "MONGO_URI_SHARED",
    "MONGO_URI_MEA_EG_1",
    "STRIPE_SECRET_KEY",
    "STRIPE_WEBHOOK_SECRET",
    "JWT_SECRET",
];

function validateEnv() {
    const missing = REQUIRED.filter((k) => !process.env[k]);
    if (missing.length) {
        console.error(
            `CRITICAL: Missing env vars: ${missing.join(", ")}`
        );
        process.exit(1);
    }
}

module.exports = { validateEnv, REQUIRED };
