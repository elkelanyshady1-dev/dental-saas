/**
 * verificationChannels.js
 * Config — Channel Fallback Policy for Verification Engine
 * v1.0
 *
 * Defines the delivery channel order for each verification purpose.
 * The verification engine reads this config to determine:
 *   1. Primary channel to attempt first
 *   2. Fallback channel(s) if primary fails
 *
 * Channel options: sms, whatsapp, email
 *
 * PLANE: Shared / Config
 */

"use strict";

const VERIFICATION_CHANNEL_POLICY = {
    /**
     * Phone OTP — used during signup geo-routing
     * Primary: SMS (fastest for phones)
     * Fallback: WhatsApp (most phones have it)
     *
     * IMPORTANT: Email is explicitly excluded from PHONE_OTP fallback.
     * OTP delivery MUST stay on phone channels only for security.
     * If both SMS and WhatsApp fail, the OTP is undelivered
     * and the user must retry.
     */
    PHONE_OTP: {
        primary: "sms",
        fallback: "whatsapp",
        final: null,
    },

    /**
     * Email verification — post-signup email confirmation
     * Primary: Email (only channel that makes sense)
     */
    EMAIL_VERIFY: {
        primary: "email",
        fallback: null,
        final: null,
    },

    /**
     * Password reset — forgot password flow
     * Primary: Email (standard security practice)
     */
    PASSWORD_RESET: {
        primary: "email",
        fallback: null,
        final: null,
    },

    /**
     * Magic login — passwordless auth (future)
     * Primary: Email (link-based)
     */
    MAGIC_LOGIN: {
        primary: "email",
        fallback: null,
        final: null,
    },
};

/**
 * getChannelOrder
 * Returns an ordered array of channels to attempt for a given purpose.
 *
 * @param {string} purpose - One of PHONE_OTP, EMAIL_VERIFY, PASSWORD_RESET, MAGIC_LOGIN
 * @returns {string[]} - Channel names in priority order
 */
function getChannelOrder(purpose) {
    const policy = VERIFICATION_CHANNEL_POLICY[purpose];
    if (!policy) {
        throw new Error(`[VerificationChannels] Unknown purpose: "${purpose}"`);
    }

    const channels = [policy.primary];
    if (policy.fallback) channels.push(policy.fallback);
    if (policy.final) channels.push(policy.final);
    return channels;
}

module.exports = {
    VERIFICATION_CHANNEL_POLICY,
    getChannelOrder,
};
