/**
 * edgeRouter.js
 * v14.0 Edge & Geo Traffic Governance — Edge Plane Router
 * 
 * Purpose: Enforces geopolitical sovereignty at the network boundary.
 * Resolves regionCode from host, headers, or GeoIP.
 */
"use strict";

// v31.1 — Region config now comes from in-memory regionRegistry (no DB lookup).
const { getRegionConfig } = require("../regions/regionRegistry");

const logger = require("../../utils/logger");
const { metrics } = require("@infra/metrics/metrics");
const { getFailoverRegion } = require("./regionFailoverPolicy");

/**
 * edgeRouter
 * Middleware to normalize regionCode for every incoming request.
 *
 * Resolution priority (dev):
 *   1. NODE_ENV !== "production" + localhost host → short-circuit with DEV_DEFAULT_REGION
 *   2. x-region-code header (explicit, highest trust in prod too)
 *   3. Subdomain parsing (e.g. eg.api.dental.saas → EG)
 *   4. GeoIP stub (development fallback) → MEA
 *   5. Region DB validation + failover
 */
const edgeRouter = async (req, res, next) => {
    try {
        // ── Hostname Resolution ────────────────────────────────────────────────
        // Source priority: X-Forwarded-Host (set by reverse proxies & Vite) >
        // req.hostname (Express-parsed, port-stripped) > Host header (raw)
        const xForwardedHost = req.headers["x-forwarded-host"];
        const rawHost        = req.headers.host || "";
        const currentHost    = xForwardedHost
            ? xForwardedHost.split(":")[0].trim()
            : req.hostname || rawHost.split(":")[0].trim();

        // ── Dev Short-Circuit ──────────────────────────────────────────────────
        // Fire whenever we are NOT in production, OR when the hostname is
        // localhost / loopback. Vite's dev proxy rewrites Host → localhost:5000
        // so we must match any loopback variant.
        const isNotProduction = process.env.NODE_ENV !== "production";
        const devHosts = ["localhost", "127.0.0.1", "::1", "[::1]"];
        const isLoopback = devHosts.some(h => currentHost === h || rawHost.startsWith(h));

        if (isNotProduction || isLoopback) {
            const devRegion = process.env.DEV_DEFAULT_REGION || "EG";
            req.hostType  = "platform";
            req.regionCode = devRegion;

            logger.debug(
                { hostname: currentHost, rawHost, region: req.regionCode, isNotProduction, isLoopback },
                "[EDGE] Dev/loopback short-circuit applied"
            );

            return next();
        }

        // ── Production Safety Guard ───────────────────────────────────────────
        if (process.env.NODE_ENV === "production") {
            if (currentHost === "localhost" || currentHost === "127.0.0.1") {
                return res.status(400).json({
                    success: false,
                    message: "Invalid production host"
                });
            }
        }

        let derivedRegion = null;

        // 1. Explicit header — TRUSTED INFRASTRUCTURE ONLY (v31.0)
        // x-region-code is only accepted when accompanied by x-edge-secret
        // from the load balancer or internal services. Without the secret,
        // the header is silently ignored to prevent injection attacks.
        const headerRegion = req.headers["x-region-code"];
        const edgeSecret = req.headers["x-edge-secret"];
        if (headerRegion && edgeSecret && edgeSecret === process.env.EDGE_TRUST_SECRET) {
            derivedRegion = headerRegion.toUpperCase();
        } else if (headerRegion) {
            // Log the untrusted header attempt for monitoring
            logger.warn({
                event: "EDGE_UNTRUSTED_HEADER",
                header: headerRegion,
                ip: req.ip,
                host: rawHost,
            }, "[Edge] x-region-code header rejected — missing or invalid x-edge-secret");
        }

        // 2. Subdomain (e.g. eg.api.dental.saas → "EG")
        if (!derivedRegion) {
            const host  = req.get("host") || "";
            const parts = host.split(".");
            if (parts.length >= 3) {
                derivedRegion = parts[0].toUpperCase();
            }
        }

        // 3. GeoIP Resolution (v31.0 — production-grade)
        // Prefer Cloudflare CF-IPCountry header (set at CDN edge),
        // then normalize country → region via regionNormalizer.
        if (!derivedRegion) {
            derivedRegion = resolveGeoIP(req);
        }

        // 4. Validate Against Registry (v31.1 — O(1) in-memory lookup)
        let region;
        try {
            region = getRegionConfig(derivedRegion);
        } catch (_lookupErr) {
            region = null;
        }

        // Only accept ACTIVE regions
        if (!region || region.status !== "ACTIVE") {
            const failover = await getFailoverRegion(derivedRegion);
            if (failover) {
                logger.info({ from: derivedRegion, to: failover }, "[Edge] Traffic failed over to alternative region");
                derivedRegion = failover;
            } else {
                metrics.region_routing_resolution_total?.inc({ method: "failed" });
                logger.warn({ derivedRegion, host: rawHost, ip: req.ip }, "[Edge] Region not allowed or inactive");
                return res.status(403).json({
                    success: false,
                    error: { code: "REGION_NOT_ALLOWED", message: "Geopolitical boundary access denied." }
                });
            }
        }

        // 5. Final Normalization
        req.regionCode = derivedRegion;
        res.setHeader("x-resolved-region", derivedRegion);

        // RC-2 FIX: hostType was never set in the production path (only in dev short-circuit).
        // Derive from the resolved hostname:
        //   admin.<domain> | platform.<domain>  → "platform" (admin console traffic)
        //   All other hosts (app., <slug>., etc.) → "org"   (tenant traffic)
        req.hostType = (
            currentHost.startsWith("admin.") ||
            currentHost.startsWith("platform.")
        ) ? "platform" : "org";

        res.setHeader("x-host-type", req.hostType);

        metrics.edge_requests_total?.inc({ regionCode: derivedRegion });
        metrics.region_routing_resolution_total?.inc({ method: "successful" });

        next();
    } catch (err) {
        logger.error({ err }, "[Edge] Internal routing failure");
        res.status(500).json({ error: "Edge routing failure" });
    }
};

/**
 * resolveGeoIP (v31.0 — Production-Grade)
 * Resolution priority:
 *   1. CF-IPCountry header (Cloudflare CDN — trusted infrastructure)
 *   2. X-Vercel-IP-Country (Vercel — trusted infrastructure)
 *   3. Fallback: "MEA" (default region)
 *
 * Returns a platform region code (MEA, EU, US, APAC).
 */
function resolveGeoIP(req) {
    const { normalizeRegion } = require("@shared/utils/regionNormalizer");

    // Cloudflare sets CF-IPCountry automatically at the CDN edge
    const cfCountry = req.headers["cf-ipcountry"];
    if (cfCountry && cfCountry !== "XX" && cfCountry !== "T1") {
        const region = normalizeRegion(cfCountry);
        if (region) return region;
    }

    // Vercel sets X-Vercel-IP-Country
    const vercelCountry = req.headers["x-vercel-ip-country"];
    if (vercelCountry) {
        const region = normalizeRegion(vercelCountry);
        if (region) return region;
    }

    // No geo signal — warn and fallback
    logger.debug({ ip: typeof req === "string" ? req : req.ip }, "[Edge] No GeoIP signal available — defaulting to MEA");
    return "MEA";
}

module.exports = edgeRouter;
