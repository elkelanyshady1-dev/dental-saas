/**
 * idempotency.middleware.js
 * Domain: cross-cutting / request idempotency
 *
 * Opt-in per route. Clients that send an Idempotency-Key header get:
 *   - atomic dedup: two concurrent requests with the same key cannot both hit
 *     the controller. One wins the insert and proceeds; the other sees the
 *     "in-flight" row and returns 409 IN_FLIGHT.
 *   - safe replay: once a request finishes, its final response is captured
 *     and stored on the row. Any subsequent retry with the same key replays
 *     that response verbatim (including 4xx / 5xx — so the client sees the
 *     same error twice, not a silent "oh we already did that" success).
 *
 * Clients that do NOT send the header pass through unchanged — preserves
 * backward compatibility for existing routes.
 *
 * PIPELINE ORDER (see TDS § Enforced Pipeline Order):
 *   ... auth / permissions / policy …
 *   → idempotency          ← attach HERE
 *   → quotaGuard (multer buffers will be wasted if mounted before replay path)
 *   → multer.array(...)
 *   → multerErrorHandler
 *   → controller
 */

"use strict";

const getSharedModel = require("@core/db/getSharedModel");
const IdempotencyKeyDef = require("@core/IdempotencyKey.model");
let _IdempotencyKey_cache = null;
function IdempotencyKey() {
    return _IdempotencyKey_cache || (_IdempotencyKey_cache = getSharedModel(IdempotencyKeyDef));
}
const logger = require("@utils/logger");
const HEADER_KEY = "Idempotency-Key";

// sha256-hex style keys: max 128 chars of unreserved ASCII (safe)
const SAFE_KEY_PATTERN = /^[A-Za-z0-9\-_]{8,128}$/;
function isValidKey(value) {
  return typeof value === "string" && SAFE_KEY_PATTERN.test(value);
}
function buildEnvelope(code, message, req, location, statusCode, extra) {
  return {
    success: false,
    error: {
      code,
      message,
      traceId: req?.requestId || req?.traceId || null,
      location,
      timestamp: new Date().toISOString(),
      ...(extra || {})
    },
    ...(statusCode ? {
      statusCode
    } : {})
  };
}

/**
 * @param {Object} options
 * @param {string} options.scope   — stable label for the protected operation, e.g. "imagePool.bulkUpload"
 * @param {(req: any, cached: { statusCode: number, body: any }) => Promise<{ statusCode?: number, body: any } | null>} [options.onReplay]
 *   Optional per-scope hook invoked when a cached response is about to be
 *   replayed (status "completed" or "failed"). The hook MUST re-query the
 *   authoritative DB state and return a body that reflects it. The cached
 *   response is used as the baseline; returning null means "cache is still
 *   accurate, replay as-is" (H2).
 *
 *   Contract:
 *     - Throws are treated as "skip merge" — we fall back to the cached
 *       body so a broken resolver cannot make the route unavailable.
 *     - Return { body: newBody }     → replay with merged body, original status.
 *     - Return { body, statusCode }  → override both.
 *     - Return null | undefined      → replay cached response verbatim.
 * @returns {import("express").RequestHandler}
 */
function idempotency({
  scope,
  onReplay
}) {
  if (!scope || typeof scope !== "string") {
    throw new Error("idempotency(): scope is required");
  }
  if (onReplay !== undefined && typeof onReplay !== "function") {
    throw new Error("idempotency(): onReplay must be a function if provided");
  }
  return async function _idempotency(req, res, next) {
    const rawKey = req.get(HEADER_KEY) || req.get(HEADER_KEY.toLowerCase());
    if (!rawKey) {
      // Opt-in: no header → proceed without idempotency.
      return next();
    }
    if (!isValidKey(rawKey)) {
      return res.status(400).json({
        success: false,
        error: {
          code: "INVALID_IDEMPOTENCY_KEY",
          message: "Idempotency-Key must be 8–128 chars of [A-Za-z0-9-_]",
          traceId: req.requestId || null,
          location: "idempotency",
          timestamp: new Date().toISOString()
        }
      });
    }
    const organizationId = String(req.context?.organizationId || req.organizationId || "");
    if (!organizationId) {
      logger.warn({
        traceId: req.requestId,
        scope
      }, "[Idempotency] Missing organizationId — skipping idempotency enforcement");
      return next();
    }
    const userId = req.context?.userId ? String(req.context.userId) : null;
    const now = new Date();
    let existing;
    try {
      // Atomic upsert — no TOCTOU window between "check" and "insert".
      // If a doc already existed we get it back via returnDocument: "before".
      // If we inserted, the result is null and we own the "in-flight" row.
      existing = await IdempotencyKey().findOneAndUpdate({
        key: rawKey
      }, {
        $setOnInsert: {
          key: rawKey,
          scope,
          organizationId,
          userId,
          status: "in-flight",
          createdAt: now
        }
      }, {
        upsert: true,
        new: false,
        setDefaultsOnInsert: true,
        projection: {
          __v: 0
        }
      }).lean();
    } catch (err) {
      // If the upsert itself blew up (Mongo unreachable, etc.) — fail open so
      // we don't brick the upload. Log loudly; the controller still runs.
      logger.error({
        traceId: req.requestId,
        scope,
        err: err?.message
      }, "[Idempotency] Upsert failed — proceeding without idempotency protection");
      return next();
    }

    // Inserted fresh → proceed, attach the response capture below.
    if (!existing) {
      attachCapture(req, res, {
        key: rawKey,
        scope
      });
      return next();
    }

    // Defensive org-scope: never replay another tenant's response — if the
    // existing row is bound to a different org, treat as a fresh miss and
    // overwrite. In practice a UUIDv4 Idempotency-Key collision across two
    // orgs is astronomically unlikely, but we must not leak cross-tenant.
    if (String(existing.organizationId) !== organizationId) {
      logger.warn({
        traceId: req.requestId,
        scope,
        conflictOrg: existing.organizationId,
        requestOrg: organizationId
      }, "[Idempotency] Cross-org key collision — treating as fresh insert");
      try {
        await IdempotencyKey().updateOne({
          key: rawKey
        }, {
          $set: {
            scope,
            organizationId,
            userId,
            status: "in-flight",
            response: {
              statusCode: null,
              body: null
            },
            createdAt: now
          }
        });
      } catch (err) {
        logger.error({
          err: err?.message
        }, "[Idempotency] Cross-org rewrite failed");
      }
      attachCapture(req, res, {
        key: rawKey,
        scope
      });
      return next();
    }
    if (existing.status === "in-flight") {
      return res.status(409).json(buildEnvelope("IDEMPOTENCY_IN_FLIGHT", "A request with this Idempotency-Key is currently being processed", req, "idempotency", 409));
    }
    if (existing.status === "completed" || existing.status === "failed") {
      const cached = existing.response || {};
      const defaultStatus = cached.statusCode || (existing.status === "completed" ? 200 : 500);
      res.setHeader("X-Idempotency-Replay", "true");

      // H2 — re-hydrate the cached body from authoritative state before
      // replaying. A resolver throw must NOT break replay; we fall back
      // to the cached body as the safe default.
      let replayStatus = defaultStatus;
      let replayBody = cached.body ?? {};
      if (onReplay) {
        try {
          const merged = await onReplay(req, {
            statusCode: defaultStatus,
            body: cached.body ?? {}
          });
          if (merged && typeof merged === "object") {
            if (merged.body !== undefined) replayBody = merged.body;
            if (typeof merged.statusCode === "number") replayStatus = merged.statusCode;
            res.setHeader("X-Idempotency-Replay", "rehydrated");
          }
        } catch (err) {
          logger.warn({
            traceId: req.requestId,
            scope,
            err: err?.message
          }, "[Idempotency] onReplay resolver threw — replaying cached body as-is");
        }
      }
      return res.status(replayStatus).json(replayBody);
    }

    // Unknown status — fail open rather than loop.
    return next();
  };
}

/**
 * Patches res.json + res.on("finish") to capture the final response body and
 * persist it on the idempotency row so the next retry can replay.
 */
function attachCapture(req, res, {
  key,
  scope
}) {
  let capturedBody = null;
  const originalJson = res.json.bind(res);
  res.json = function captureJson(body) {
    capturedBody = body;
    return originalJson(body);
  };
  res.on("finish", () => {
    const statusCode = res.statusCode;
    const isSuccess = statusCode < 400;
    IdempotencyKey().updateOne({
      key
    }, {
      $set: {
        status: isSuccess ? "completed" : "failed",
        response: {
          statusCode,
          body: capturedBody
        }
      }
    }).catch(err => {
      logger.warn({
        traceId: req.requestId,
        scope,
        err: err?.message
      }, "[Idempotency] Failed to persist final response");
    });
  });
}
module.exports = idempotency;