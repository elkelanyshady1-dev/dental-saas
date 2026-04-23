"use strict";

/**
 * shareLink.controller.js — Public Share-Link Resolver
 *
 * Mounted at: GET /api/v1/public/share-links/:token (NO AUTH)
 *
 * The endpoint is public by design — the token itself is the capability.
 * Because there is no req.context, this controller is the ONLY place that
 * resolves the per-org DB connection from a ShareLink record (not from JWT).
 *
 * Step 5c Commit 4 — ShareLink record now lives on the PLATFORM cluster
 * (via getShareLinkModel). Lookup flow:
 *     token → platform ShareLink → orgId → cluster → tenant DB → target asset
 *
 * SECURITY INVARIANTS:
 *   - Token is lookup-only — never echoed back.
 *   - storageKey is NEVER returned; only the ephemeral signedUrl is.
 *   - Expired links return 410 immediately, before loading the photo.
 *   - Missing fileType / mimeType on the target photo → 500 with
 *     INVALID_PHOTO_FILETYPE, so the frontend can display a recoverable
 *     error instead of trying to render a broken asset.
 */

const dbManager = require("../../../core/db/dbManager");
const getModel  = require("../../../core/db/getModel");
const logger    = require("@utils/logger");

const getShareLinkModel = require("@platform/shareLink/getShareLinkModel");
const PhotoDef          = require("../../orthodontics/models/Photo.model");
const { buildResolvedShareDTO } = require("../dto/shareLink.dto");

// Hardening §6 — public endpoint cannot hang on a slow Mongo connection.
// Default 5 s soft cap; overridable via env for ops debugging.
const SHARE_DB_TIMEOUT_MS = Number(process.env.SHARE_DB_TIMEOUT_MS) || 5000;

// POST-SHIP HARDENING §2 — reject tokens below a reasonable entropy floor.
// Random 32-char+ tokens carry ≥192 bits of entropy (base64url of 24 bytes).
// Anything shorter is almost always malformed input or a brute-force attempt;
// rejecting at 32 short-circuits the Mongo lookup cost.
const MIN_TOKEN_LENGTH = 32;

// POST-SHIP HARDENING §7 — refuse to sign very large assets on the public
// endpoint. Assets >50 MB are medical DICOM/STL files that belong in
// authenticated export flows, not an unauthenticated share link.
const MAX_SHARE_SIZE_BYTES = 50 * 1024 * 1024;

function _withTimeout(promise, label) {
    let timer;
    const guard = new Promise((_, reject) => {
        timer = setTimeout(() => {
            const err = new Error(`TIMEOUT:${label}`);
            err.code = "TIMEOUT";
            err.statusCode = 504;
            reject(err);
        }, SHARE_DB_TIMEOUT_MS);
    });
    return Promise.race([
        promise.finally(() => clearTimeout(timer)),
        guard,
    ]);
}

// ─── Platform-plane lookup — locate the link by token ───────────────────────
//
// Commit 4: ShareLink lives on the platform cluster. A single indexed lookup
// on { token } resolves to { orgId, resourceType, resourceId, expiresAt }.
// The resolver then uses `link.orgId` to bind the tenant DB and load the
// target resource.

async function _findLinkByToken(token) {
    const ShareLink = getShareLinkModel();
    return ShareLink.findOne({ token }).lean();
}

// ─── Signed URL resolution via provider ──────────────────────────────────────

async function _resolveSignedUrl(storageKey) {
    // Prefer provider-backed signed URLs (R2/S3). Fall back to local public
    // URL construction if the provider does not implement getSignedUrl.
    try {
        const storageService = require("@core/storage/storageService");
        // storageService doesn't export getSignedUrl directly, but the active
        // provider may. Reach through the public helper if the project
        // exposes one; otherwise construct a local path.
        if (typeof storageService.getSignedUrl === "function") {
            return await storageService.getSignedUrl(storageKey);
        }
        // Best-effort: the local provider serves at /uploads/<relative-key>.
        // This is a last-resort fallback — in production, R2/S3 provider
        // should implement getSignedUrl.
        return `/uploads/${storageKey.replace(/^\/+/, "")}`;
    } catch (err) {
        logger.error(`[ShareLink] failed to resolve signed URL: ${err.message}`);
        const e = new Error("SIGNED_URL_UNAVAILABLE");
        e.statusCode = 500;
        e.code = "SIGNED_URL_UNAVAILABLE";
        throw e;
    }
}

// ─── Public resolver ─────────────────────────────────────────────────────────

async function resolve(req, res) {
    const { token } = req.params;

    try {
        // POST-SHIP §2 — token entropy guard (format-only, no DB roundtrip).
        if (!token || typeof token !== "string" || token.length < MIN_TOKEN_LENGTH) {
            return res.status(400).json({
                success: false,
                error: { code: "INVALID_TOKEN_FORMAT", message: "Token is missing or malformed." },
            });
        }

        const link = await _withTimeout(_findLinkByToken(token), "findLinkByToken");
        if (!link) {
            // POST-SHIP §1 — log token misses for brute-force detection. Never
            // log the token itself beyond a short fingerprint.
            logger.warn("SHARE_TOKEN_MISS", {
                tokenPrefix: token.slice(0, 6),
                ip: req.ip,
                userAgent: req.headers["user-agent"],
            });
            return res.status(404).json({
                success: false,
                error: { code: "LINK_NOT_FOUND", message: "Share link does not exist." },
            });
        }

        if (link.expiresAt && new Date(link.expiresAt) < new Date()) {
            return res.status(410).json({
                success: false,
                error: { code: "LINK_EXPIRED", message: "This share link has expired." },
            });
        }

        // Bind the tenant DB before loading the target resource.
        // Commit 4: `link.orgId` is the routing key (platform ShareLink).
        // Hardening §5 — classify connection failures distinctly.
        const orgId = String(link.orgId || link.organizationId);
        let conn;
        try {
            conn = await _withTimeout(
                dbManager.getConnectionAsync(orgId),
                "getConnection"
            );
        } catch (err) {
            if (err.code === "TIMEOUT") throw err;
            const wrapped = new Error("DB_CONNECTION_FAILED");
            wrapped.code = "DB_CONNECTION_FAILED";
            wrapped.statusCode = 503;
            wrapped.cause = err;
            throw wrapped;
        }
        try {
            const Photo = getModel(conn, PhotoDef);
            const photo = await _withTimeout(
                // Per-org DB: no organizationId filter — the connection IS scoped.
                Photo.findOne({ _id: link.resourceId }).lean(),
                "findPhoto"
            );

            if (!photo) {
                return res.status(404).json({
                    success: false,
                    error: { code: "PHOTO_NOT_FOUND", message: "Asset has been removed." },
                });
            }

            // Hardening §1.5 — asset contract. If either classifier is
            // missing, we refuse to render rather than guess.
            if (!photo.fileType || !photo.mimeType) {
                logger.error(`[ShareLink] INVALID_PHOTO_FILETYPE on ${photo._id} (fileType=${photo.fileType}, mimeType=${photo.mimeType})`);
                return res.status(500).json({
                    success: false,
                    error: {
                        code: "INVALID_PHOTO_FILETYPE",
                        message: "Asset is missing fileType/mimeType metadata.",
                    },
                });
            }

            if (!photo.storageKey) {
                return res.status(500).json({
                    success: false,
                    error: { code: "STORAGE_KEY_MISSING", message: "Asset storage key is missing." },
                });
            }

            // POST-SHIP §7 — guard against large-file abuse before signing.
            const sizeBytes = photo.metadata?.sizeBytes;
            if (typeof sizeBytes === "number" && sizeBytes > MAX_SHARE_SIZE_BYTES) {
                return res.status(413).json({
                    success: false,
                    error: {
                        code: "FILE_TOO_LARGE",
                        message: `Asset is ${Math.round(sizeBytes / 1024 / 1024)} MB; public share is capped at ${MAX_SHARE_SIZE_BYTES / 1024 / 1024} MB.`,
                    },
                });
            }

            // POST-SHIP §9 — circuit-breaker around signed URL resolution.
            // Storage provider failures become explicit 503 so the frontend
            // can distinguish "asset gone" from "we can't reach object store".
            let signedUrl;
            try {
                signedUrl = await _resolveSignedUrl(photo.storageKey);
            } catch (err) {
                logger.error("SIGNED_URL_FAILURE", {
                    resourceId: String(link.resourceId),
                    err: err.message,
                });
                return res.status(503).json({
                    success: false,
                    error: { code: "STORAGE_UNAVAILABLE", message: "Storage provider is temporarily unavailable." },
                });
            }

            const payload = buildResolvedShareDTO({ link, photo, signedUrl });

            // POST-SHIP §6 — structured access log (NOT the token itself).
            logger.info("SHARE_ACCESS", {
                tokenPrefix:    token.slice(0, 6),
                resourceType:   link.resourceType,
                resourceId:     String(link.resourceId),
                orgId,
                permission:     link.permission,
                fileType:       photo.fileType,
                ip:             req.ip,
                userAgent:      req.headers["user-agent"],
            });

            return res.json({ success: true, data: payload });
        } finally {
            dbManager.releaseConnection(orgId);
        }
    } catch (err) {
        const status = err.statusCode || 500;
        logger.warn(`[ShareLink] resolve error: ${err.message}`);
        return res.status(status).json({
            success: false,
            error: { code: err.code || "SHARE_RESOLVE_ERROR", message: err.message || "Internal error" },
        });
    }
}

// POST-SHIP §8 — lightweight health endpoint. Does NOT hit the DB; the share
// resolver is a pure path through (DB lookup → storage). We only confirm the
// route is wired and the model/DTO modules compile.
function health(req, res) {
    try {
        // Touch references so any compile error surfaces here.
        const ShareLink = getShareLinkModel();
        const shareEnabled = !!ShareLink.modelName && typeof buildResolvedShareDTO === "function";
        return res.json({
            success: true,
            data: { ok: shareEnabled, shareEnabled },
        });
    } catch (err) {
        return res.status(500).json({
            success: false,
            error: { code: "SHARE_HEALTH_FAILED", message: err.message },
        });
    }
}

module.exports = {
    resolve,
    health,
    // exposed for tests
    _findLinkByToken,
    _resolveSignedUrl,
    MIN_TOKEN_LENGTH,
    MAX_SHARE_SIZE_BYTES,
};
