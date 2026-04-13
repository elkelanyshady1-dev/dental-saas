/**
 * Centralized feature flag helper for DentalSaaS
 */

/**
 * Determines if phone verification is required based on environment and feature flags.
 * - In production, it is ALWAYS required.
 * - In development/staging, it follows the REQUIRE_PHONE_VERIFICATION env variable.
 */
exports.isPhoneVerificationRequired = () => {
    const env = process.env.NODE_ENV;
    const flag = process.env.REQUIRE_PHONE_VERIFICATION === "true";

    // In production, force verification for safety
    if (env === "production") return true;

    // Otherwise, follow the manually configured flag
    return flag;
};
