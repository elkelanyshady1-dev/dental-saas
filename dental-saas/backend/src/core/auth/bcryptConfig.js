/**
 * bcryptConfig.js — Centralized bcrypt configuration (HIGH-A4)
 *
 * Before this module existed, callers hardcoded `10` or `12` directly into
 * bcrypt.hash() — a mix that left some user classes (org staff, some OTPs)
 * with weaker hashes than others (patient/portal/supervisor). Standardizing
 * on a single cost floor removes that inconsistency.
 *
 * Usage:
 *   const { BCRYPT_ROUNDS, needsRehash } = require("@core/auth/bcryptConfig");
 *   const hash = await bcrypt.hash(password, BCRYPT_ROUNDS);
 *   if (needsRehash(user.password)) user.password = await bcrypt.hash(plaintext, BCRYPT_ROUNDS);
 *
 * PLANE: Shared (auth-layer utility).
 */

"use strict";

const bcrypt = require("bcryptjs");

/**
 * Cost factor for bcrypt hashing.
 *
 * Default 12 (~250–400 ms on current server CPUs). Increase only after
 * measuring login latency impact — raising the cost by 1 doubles hash time.
 * Never set below 10.
 */
const BCRYPT_ROUNDS = Math.max(
    10,
    parseInt(process.env.BCRYPT_ROUNDS || "12", 10)
);

/**
 * Report whether a stored hash was generated with fewer rounds than the
 * current target and should be upgraded on next successful authentication.
 * Callers MUST re-hash only after a successful bcrypt.compare — otherwise
 * a malicious login attempt could force a CPU-bound rehash on every try.
 *
 * @param {string|undefined} storedHash — value currently persisted on the user doc
 * @returns {boolean}
 */
function needsRehash(storedHash) {
    if (!storedHash || typeof storedHash !== "string") return false;
    try {
        return bcrypt.getRounds(storedHash) < BCRYPT_ROUNDS;
    } catch {
        // Malformed hash — treat as "not bcrypt", don't rehash (caller logs).
        return false;
    }
}

module.exports = {
    BCRYPT_ROUNDS,
    needsRehash,
};
