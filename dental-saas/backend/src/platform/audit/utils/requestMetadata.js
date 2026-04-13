/**
 * requestMetadata.js
 * Platform Audit — Request Metadata Extractor
 *
 * Extracts device, browser, OS, and IP metadata from an HTTP request.
 * Used by the audit service to enrich audit log entries with context
 * that allows analysts to identify the actor's environment.
 *
 * geoip-lite is optional — if unavailable, geoLocation falls back to "Unknown".
 *
 * PLANE: Platform (utility — used from both platform and shared audit paths)
 */

"use strict";

const logger = require("@utils/logger");

// ─── geoip-lite (optional dependency) ────────────────────────────────────────
let geoip = null;
try {
    geoip = require("geoip-lite");
} catch {
    // Not installed — geoLocation will be "Unknown"
}

// ─── UA parser (optional — graceful degradation) ──────────────────────────────
// ua-parser-js is a lightweight UA parser. If not installed we fall back to
// simple regex-based detection which covers the most common browser/OS combos.
let UAParser = null;
try {
    UAParser = require("ua-parser-js");
} catch {
    // Fallback to regex parser below
}

// ─── Simple regex fallback UA parser ─────────────────────────────────────────

const BROWSER_PATTERNS = [
    { name: "Edge", re: /Edg\/|Edge\// },
    { name: "Chrome", re: /Chrome\/(?!.*Chromium)/ },
    { name: "Firefox", re: /Firefox\// },
    { name: "Safari", re: /Safari\/(?!.*Chrome)/ },
    { name: "Opera", re: /OPR\/|Opera\// },
];

const OS_PATTERNS = [
    { name: "Windows", re: /Windows NT/ },
    { name: "macOS", re: /Mac OS X/ },
    { name: "iOS", re: /iPhone|iPad/ },
    { name: "Android", re: /Android/ },
    { name: "Linux", re: /Linux/ },
];

const DEVICE_PATTERNS = [
    { name: "Mobile", re: /Mobile|Android|iPhone/ },
    { name: "Tablet", re: /iPad|Tablet/ },
];

function _parseUaFallback(ua) {
    if (!ua) return { browser: "Unknown", os: "Unknown", device: "Desktop" };

    const browser = BROWSER_PATTERNS.find(p => p.re.test(ua))?.name || "Unknown";
    const os = OS_PATTERNS.find(p => p.re.test(ua))?.name || "Unknown";
    const device = DEVICE_PATTERNS.find(p => p.re.test(ua))?.name || "Desktop";

    return { browser, os, device };
}

function _parseUa(ua) {
    if (UAParser) {
        try {
            const parsed = new UAParser(ua).getResult();
            const browser = parsed.browser?.name || "Unknown";
            const os = parsed.os?.name || "Unknown";
            const device = parsed.device?.type
                ? parsed.device.type.charAt(0).toUpperCase() + parsed.device.type.slice(1)
                : "Desktop";
            return { browser, os, device };
        } catch {
            return _parseUaFallback(ua);
        }
    }
    return _parseUaFallback(ua);
}

// ─── GeoIP lookup ─────────────────────────────────────────────────────────────

function _resolveGeo(ip) {
    if (!geoip || !ip || ip === "::1" || ip === "127.0.0.1") return "Unknown";
    try {
        const cleanIp = ip.startsWith("::ffff:") ? ip.slice(7) : ip;
        const geo = geoip.lookup(cleanIp);
        if (!geo) return "Unknown";

        // Country name from city db if available, else country code
        const parts = [];
        if (geo.city) parts.push(geo.city);
        if (geo.country) parts.push(geo.country);
        return parts.join(", ") || "Unknown";
    } catch (err) {
        logger.debug({ err, ip }, "[requestMetadata] geoip lookup failed");
        return "Unknown";
    }
}

// ─── Main export ──────────────────────────────────────────────────────────────

/**
 * extractRequestMetadata
 *
 * Extracts device, browser, OS, IP, and geo information from an Express request.
 *
 * @param {import("express").Request} req
 * @returns {{
 *   ipAddress: string,
 *   geoLocation: string,
 *   browser: string,
 *   os: string,
 *   device: string,
 *   userAgent: string
 * }}
 */
function extractRequestMetadata(req) {
    if (!req) {
        return {
            ipAddress: "Unknown",
            geoLocation: "Unknown",
            browser: "Unknown",
            os: "Unknown",
            device: "Unknown",
            userAgent: "Unknown"
        };
    }

    const ua = req.headers?.["user-agent"] || "";
    const ip = req.ip || req.socket?.remoteAddress || "Unknown";
    const { browser, os, device } = _parseUa(ua);
    const geoLocation = _resolveGeo(ip);

    return {
        ipAddress: ip,
        geoLocation,
        browser,
        os,
        device,
        userAgent: ua || "Unknown"
    };
}

module.exports = { extractRequestMetadata };
