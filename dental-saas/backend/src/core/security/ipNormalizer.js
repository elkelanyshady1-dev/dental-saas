/**
 * ipNormalizer.js — IPv6-Safe IP Key Normalization
 * Phase F.6 — Rate Limiter IPv6 Bypass Prevention
 *
 * PURPOSE:
 * Prevents rate limiter bypass via IPv6 address rotation.
 * IPv6 clients can cycle through 2^64 addresses within a /64 prefix,
 * making per-IP rate limiting trivially bypassable without normalization.
 *
 * STRATEGY:
 *   - IPv4: use full address (4.3 billion addresses — acceptable)
 *   - IPv6: collapse to /64 prefix (network portion only)
 *   - IPv4-mapped IPv6 (::ffff:x.x.x.x): extract IPv4
 *   - Loopback/unknown: normalize to constant
 *
 * USAGE:
 *   const { normalizeIP } = require("@core/security/ipNormalizer");
 *   const key = normalizeIP(req.ip);
 *
 * INVARIANT: normalizeIP NEVER returns undefined/null — always a string key.
 *
 * @module core/security/ipNormalizer
 */

"use strict";

/**
 * Normalize an IP address for rate limiting key generation.
 *
 * @param {string|undefined} ip - Raw IP from req.ip or req.connection.remoteAddress
 * @returns {string} Normalized IP string suitable for rate limit keys
 *
 * @example
 *   normalizeIP("192.168.1.1")                → "192.168.1.1"
 *   normalizeIP("::ffff:192.168.1.1")          → "192.168.1.1"
 *   normalizeIP("2001:db8:1234:5678::1")       → "2001:db8:1234:5678"
 *   normalizeIP("2001:db8:1234:5678:abcd:ef01:2345:6789") → "2001:db8:1234:5678"
 *   normalizeIP(undefined)                      → "unknown"
 */
function normalizeIP(ip) {
    if (!ip || typeof ip !== "string") {
        return "unknown";
    }

    // Trim whitespace
    const trimmed = ip.trim();
    if (trimmed.length === 0) {
        return "unknown";
    }

    // ── IPv4-mapped IPv6 (::ffff:192.168.1.1) ─────────────────────────
    // Express behind some proxies/load balancers wraps IPv4 in IPv6 format
    const v4MappedMatch = trimmed.match(/^::ffff:(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})$/i);
    if (v4MappedMatch) {
        return v4MappedMatch[1];
    }

    // ── Pure IPv4 ─────────────────────────────────────────────────────
    if (/^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(trimmed)) {
        return trimmed;
    }

    // ── Loopback ──────────────────────────────────────────────────────
    if (trimmed === "::1" || trimmed === "127.0.0.1") {
        return "127.0.0.1";
    }

    // ── IPv6 → collapse to /64 prefix ─────────────────────────────────
    // A /64 prefix is the first 4 groups in a full IPv6 address.
    // This prevents clients from rotating through 2^64 addresses
    // within their allocated subnet.
    if (trimmed.includes(":")) {
        // Expand :: shorthand to full groups for consistent /64 extraction
        const expanded = expandIPv6(trimmed);
        const groups = expanded.split(":");
        // Take first 4 groups = /64 prefix
        return groups.slice(0, 4).join(":");
    }

    // ── Fallback ──────────────────────────────────────────────────────
    return trimmed;
}

/**
 * Expand IPv6 :: shorthand to full 8-group notation.
 *
 * @param {string} ip - IPv6 address (possibly abbreviated)
 * @returns {string} Full 8-group IPv6 string
 */
function expandIPv6(ip) {
    // Remove zone ID (e.g., %eth0)
    const clean = ip.split("%")[0];

    const parts = clean.split("::");
    if (parts.length === 1) {
        // No :: abbreviation — pad each group to be present
        const groups = clean.split(":");
        while (groups.length < 8) {
            groups.push("0");
        }
        return groups.slice(0, 8).join(":");
    }

    // Has :: — need to fill in missing groups
    const left = parts[0] ? parts[0].split(":") : [];
    const right = parts[1] ? parts[1].split(":") : [];
    const fillCount = 8 - left.length - right.length;
    const fill = Array(Math.max(0, fillCount)).fill("0");

    return [...left, ...fill, ...right].slice(0, 8).join(":");
}

module.exports = {
    normalizeIP,
    expandIPv6,
};
