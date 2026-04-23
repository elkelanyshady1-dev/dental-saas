/**
 * clusterAssignment.service.js
 * Platform Plane — Deterministic Cluster Assignment (Day-1)
 *
 * ASSIGNMENT RULE (soft-launch, deterministic, no DB reads, no load math):
 *
 *     IP → suggestedCountry (surfaced via GET /api/meta/country)
 *     User confirms country → region → priority-first-ACTIVE cluster
 *     → persist {country, region, cluster, routingVersion, routingEpoch=1}
 *
 * The assignment is set ONCE and never drifts. Future algorithms
 * (load-based, geo-latency) land as a new `assignClusterByLoad()` picker
 * behind an incremented `routingVersion`; no other system changes required.
 *
 * COMPLIANCE:
 *   - IP is a SUGGESTION only; authoritative country comes from the user.
 *   - VPN / travel / office-behind-proxy are all safe.
 *   - Egypt is the soft-launch anchor and MEA default.
 *
 * PLANE: Platform
 */

"use strict";

const clusterRegistry = require("@core/db/clusterRegistry");

// routingVersion = 1 ≡ "priority-first-ACTIVE" (this file).
// Bump when the picker algorithm changes (load-based, geo-latency, etc.).
const ROUTING_VERSION = 1;

// ─── 1. IP → suggested country (header-driven, sync) ────────────────────────
// Primary:  Cloudflare's cf-ipcountry
// Fallback: x-country (generic reverse-proxy / local test header)
// Default:  EG (soft-launch anchor)

function getSuggestedCountry(req) {
    const headers = (req && req.headers) || {};
    return (
        headers["cf-ipcountry"] ||
        headers["x-country"] ||
        "EG"
    ).toUpperCase();
}

// ─── 2. Country → Region (static table — extend deliberately) ───────────────

const EU = new Set([
    "FR", "DE", "IT", "ES", "NL", "BE", "AT",
    "IE", "PT", "GR", "SE", "DK", "FI", "PL",
]);
const US = new Set(["US", "CA"]);

function mapCountryToRegion(country) {
    const code = String(country || "").toUpperCase();
    if (code === "EG") return "MEA";      // explicit anchor
    if (EU.has(code)) return "EU";
    if (US.has(code)) return "US";
    return "MEA";                          // deterministic default
}

// ─── 3. Cluster assignment — priority-first-ACTIVE scan ─────────────────────
// Registry returns a list pre-sorted by priority (see clusterRegistry.js).
// We iterate in that order and take the first cluster whose status is
// ACTIVE (or unset — ENV-seeded entries lack status until the DB refresh
// has decorated them, and the safe default is ACTIVE so ENV-only ops works).

function assignCluster(region) {
    const regionClusters = clusterRegistry.getByRegion(region);

    for (const cluster of regionClusters) {
        if ((cluster.status ?? "ACTIVE") === "ACTIVE") {
            return cluster.key;
        }
    }

    throw new Error(`[Provisioning] No ACTIVE clusters in region ${region}`);
}

// ─── 4. Provisioning entry point ────────────────────────────────────────────
// Takes the USER-CONFIRMED country from the request body (never from IP)
// and returns an org document payload ready to persist. The actual create
// happens in the org registration controller — this service just returns
// the routing fields so the caller can merge them into its own Organization
// payload.

function buildProvisioningFields({ country }) {
    if (!country) {
        throw new Error("[Provisioning] country is required — it must be user-confirmed, not IP-derived");
    }
    const normalizedCountry = String(country).toUpperCase();
    const region = mapCountryToRegion(normalizedCountry);
    const cluster = assignCluster(region);

    return {
        country: normalizedCountry,
        regionCode: region,                // matches existing Organization schema field
        cluster,
        routingVersion: ROUTING_VERSION,
        routingEpoch: 1,
    };
}

module.exports = {
    getSuggestedCountry,
    mapCountryToRegion,
    assignCluster,
    buildProvisioningFields,
    ROUTING_VERSION,
    // Exposed for governance / guardian invariants.
    EU_COUNTRIES: EU,
    US_COUNTRIES: US,
};
