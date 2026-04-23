/**
 * country.schema.js
 * Shared — Country Validation (Single Source of Truth)
 *
 * `COUNTRY_CODES` is the ONLY allowlist of accepted country codes across
 * the system. Consumed by:
 *   - POST /api/org/register — Zod validation on req.body.country
 *   - clusterAssignment.service.mapCountryToRegion — mapping input
 *   - Guardian invariant on Organization.country — storage-time check
 *   - /api/meta/countries endpoint (future) — frontend dropdown source
 *
 * Keep this set in sync with clusterAssignment.service.js's region buckets.
 * Adding a new country here without wiring it into `mapCountryToRegion`
 * means orgs from that country route to the MEA default — obviously wrong.
 *
 * PLANE: Shared
 */

"use strict";

const { z } = require("zod");

/**
 * Accepted ISO-3166-1 alpha-2 codes, upper-case. Narrow on purpose —
 * expanding this is a deliberate rollout decision, not a casual add.
 */
const COUNTRY_CODES = new Set([
    "EG",                                                       // MEA anchor
    "US", "CA",                                                 // US region
    "FR", "DE", "IT", "ES", "NL", "BE", "AT",
    "IE", "PT", "GR", "SE", "DK", "FI", "PL",                   // EU region
]);

/**
 * CountrySchema
 * Accepts 2-char input, uppercases it, rejects anything outside the allowlist.
 * Use with `.safeParse()` at controller boundaries.
 */
const CountrySchema = z.string({ required_error: "country is required" })
    .length(2, "country must be ISO-3166-1 alpha-2 (2 characters)")
    .transform((val) => val.toUpperCase())
    .refine((val) => COUNTRY_CODES.has(val), {
        message: "Unsupported country code",
    });

module.exports = {
    CountrySchema,
    COUNTRY_CODES,
};
