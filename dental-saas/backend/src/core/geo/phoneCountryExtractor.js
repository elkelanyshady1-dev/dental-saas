/**
 * phoneCountryExtractor.js
 * Core Geo — Phone-Based Country Resolution
 * v1.0
 *
 * Extracts ISO country code from an E.164 phone number
 * using libphonenumber-js (already a project dependency).
 *
 * Sentinel §4: Only ISO 3166-1 alpha-2 codes are returned.
 *
 * PLANE: Shared
 */

"use strict";

const { parsePhoneNumberFromString } = require("libphonenumber-js");

/**
 * extractCountryFromPhone
 *
 * @param {string} phone - Phone number in E.164 format (e.g. "+201234567890")
 * @returns {{ country: string|null, isValid: boolean, nationalNumber: string|null }}
 *   country = ISO 3166-1 alpha-2 (e.g. "EG", "US", "GB") or null if unparseable
 */
function extractCountryFromPhone(phone) {
    if (!phone || typeof phone !== "string") {
        return { country: null, isValid: false, nationalNumber: null };
    }

    // Ensure leading +
    const normalized = phone.startsWith("+") ? phone : `+${phone}`;

    try {
        const parsed = parsePhoneNumberFromString(normalized);

        if (!parsed) {
            return { country: null, isValid: false, nationalNumber: null };
        }

        return {
            country: parsed.country || null,      // ISO 3166-1 alpha-2
            isValid: parsed.isValid(),
            nationalNumber: parsed.nationalNumber || null,
        };
    } catch {
        return { country: null, isValid: false, nationalNumber: null };
    }
}

module.exports = { extractCountryFromPhone };
