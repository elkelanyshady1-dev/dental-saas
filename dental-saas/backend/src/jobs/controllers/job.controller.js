/**
 * job.controller.js
 * QStash webhook receiver for the communication dispatcher.
 *
 * SECURITY INVARIANTS (all must hold; any failure = 401/500 and NO dispatch):
 *   1. Raw body: `express.raw({ type: "application/json" })` MUST be mounted
 *      on this route BEFORE `express.json()`. Signature verification runs
 *      against bytes-on-wire — a JSON-parsed body re-serialized here will
 *      NOT round-trip byte-exact (key ordering, whitespace) and signatures
 *      will fail in production.
 *   2. Signature: verified via @upstash/qstash Receiver with currentSigningKey
 *      and nextSigningKey (to survive key rotation).
 *   3. API key (PROD): `x-internal-key` MUST equal INTERNAL_API_KEY when
 *      NODE_ENV === "production". Defense-in-depth beyond the signature.
 *   4. Forced SYNC: the dispatch MUST pass { hint: "sync" }. If we allowed
 *      ASYNC routing here we would re-publish to QStash and loop forever.
 *
 * Failure mode: return 500 on any post-verification error so QStash retries
 * with its configured backoff. Return 401 on auth failure (no retry needed —
 * it will never succeed).
 *
 * @per-plane Infrastructure
 */

"use strict";

const getSharedModel = require("@core/db/getSharedModel");
const logger = require("@utils/logger");
const {
  dispatch
} = require("../../infrastructure/communication/communication.dispatcher");
const IdempotencyKeyDef = require("@core/IdempotencyKey.model");
const IdempotencyKey = getSharedModel(IdempotencyKeyDef);
let _receiver = null;
function _getReceiver() {
  if (_receiver) return _receiver;
  const currentSigningKey = process.env.QSTASH_CURRENT_SIGNING_KEY;
  const nextSigningKey = process.env.QSTASH_NEXT_SIGNING_KEY;
  if (!currentSigningKey || !nextSigningKey) return null;
  // eslint-disable-next-line no-restricted-modules -- sanctioned QStash receiver entry point
  const {
    Receiver
  } = require("@upstash/qstash");
  _receiver = new Receiver({
    currentSigningKey,
    nextSigningKey
  });
  return _receiver;
}
async function handleCommunicationJob(req, res) {
  const qstashMessageId = req.get("upstash-message-id") || null;
  const idempotencyKeyValue = qstashMessageId ? `job:${qstashMessageId}` : null;

  // Phase F soft enforcement: log when the upstash-message-id header is
  // missing so we can see WHO is calling the receiver without the QStash
  // contract (legitimate reasons: local manual replay, test fixtures).
  // When all callers are verified to go through QStash this can be
  // promoted to a hard throw (QSTASH_MESSAGE_ID_REQUIRED); until then
  // the handler stays tolerant and just runs without dedup.
  if (!qstashMessageId) {
    logger.warn({
      event: "QSTASH_MESSAGE_ID_MISSING",
      path: req.path
    }, "[qstash.receiver] missing upstash-message-id — proceeding without idempotency key");
  }

  // 1. Raw body guard — refuse to process a JSON-parsed body.
  if (!Buffer.isBuffer(req.body)) {
    logger.error("[qstash.receiver] req.body is not a Buffer — raw body middleware not wired");
    return res.status(500).json({
      error: "webhook misconfigured"
    });
  }

  // 2. API key check — MANDATORY in production, optional elsewhere.
  const expectedApiKey = process.env.INTERNAL_API_KEY;
  const providedKey = req.get("x-internal-key");
  if (process.env.NODE_ENV === "production") {
    if (!expectedApiKey || providedKey !== expectedApiKey) {
      logger.warn("[qstash.receiver] API key mismatch (prod) — rejecting");
      return res.status(401).json({
        error: "unauthorized"
      });
    }
  } else if (expectedApiKey && providedKey !== expectedApiKey) {
    // Non-prod: if both sides set a key, still enforce. If neither, skip.
    logger.warn("[qstash.receiver] API key mismatch (non-prod) — rejecting");
    return res.status(401).json({
      error: "unauthorized"
    });
  }

  // 3. QStash signature verification (against raw bytes).
  const receiver = _getReceiver();
  if (!receiver) {
    logger.error("[qstash.receiver] signing keys missing — cannot verify");
    return res.status(500).json({
      error: "webhook misconfigured"
    });
  }
  const signature = req.get("upstash-signature");
  if (!signature) {
    logger.warn("[qstash.receiver] missing upstash-signature header");
    return res.status(401).json({
      error: "unauthorized"
    });
  }
  const bodyString = req.body.toString("utf8");
  try {
    const valid = await receiver.verify({
      signature,
      body: bodyString
    });
    if (!valid) {
      logger.warn("[qstash.receiver] signature verification failed");
      return res.status(401).json({
        error: "unauthorized"
      });
    }
  } catch (err) {
    logger.warn({
      err: err.message
    }, "[qstash.receiver] signature verification threw");
    return res.status(401).json({
      error: "unauthorized"
    });
  }

  // 3b. Distributed QStash message dedup — Mongo-backed, multi-instance safe.
  // Replaces a per-process Map that would let two app instances each process
  // the same messageId once.
  //
  // Placement: AFTER signature verification only — pre-verify, an attacker
  // could pollute the IdempotencyKey collection with forged messageIds.
  //
  // Lifecycle:
  //   claim → dispatch
  //           ├─ 200 → mark "completed" with cached body so any retry
  //           │        replays the same response without re-dispatching.
  //           ├─ 400 (bad payload) → delete the claim. QStash won't retry
  //           │        4xx by default; leaving it would lock the key for
  //           │        the 24h TTL with no benefit.
  //           └─ 500 (dispatch threw) → delete the claim so QStash's retry
  //                    can re-acquire on the next attempt.
  //
  // If the initial insert collides (E11000) the retry already ran or is
  // in flight: replay the completed row, otherwise 409 IN_FLIGHT (QStash
  // retries with backoff; whichever instance finishes first wins).
  if (idempotencyKeyValue) {
    const existing = await IdempotencyKey.findOne({
      key: idempotencyKeyValue
    }).lean();
    if (existing?.status === "completed") {
      logger.info({
        event: "JOB_IDEMPOTENT_REPLAY",
        key: idempotencyKeyValue,
        qstashMessageId
      }, "[qstash.receiver] replaying cached response for duplicate messageId");
      return res.status(200).json(existing.response?.body || {
        ok: true,
        duplicate: true
      });
    }
    try {
      await IdempotencyKey.create({
        key: idempotencyKeyValue,
        scope: "job",
        organizationId: "platform",
        status: "in-flight"
      });
      logger.info({
        event: "JOB_IDEMPOTENT_EXECUTION",
        key: idempotencyKeyValue,
        qstashMessageId
      }, "[qstash.receiver] claimed idempotency key — proceeding to dispatch");
    } catch (err) {
      if (err?.code !== 11000) throw err;
      const row = await IdempotencyKey.findOne({
        key: idempotencyKeyValue
      }).lean();
      if (row?.status === "completed") {
        return res.status(200).json(row.response?.body || {
          ok: true,
          duplicate: true
        });
      }
      logger.warn({
        event: "JOB_IN_FLIGHT",
        key: idempotencyKeyValue,
        qstashMessageId
      }, "[qstash.receiver] concurrent processing — returning 409");
      return res.status(409).json({
        error: "JOB_ALREADY_IN_PROGRESS"
      });
    }
  }

  // Observability only — not an auth check. Presence confirms the request
  // path is dispatcher → QStash → receiver and aids debugging.
  const loopMarker = req.get("x-qstash-processed");
  if (loopMarker !== "true") {
    logger.warn({
      loopMarker
    }, "[qstash.receiver] missing/unexpected x-qstash-processed marker (signature still valid)");
  }

  // 4. Parse only after signature succeeds.
  let job;
  try {
    job = JSON.parse(bodyString);
  } catch (err) {
    logger.error({
      err: err.message
    }, "[qstash.receiver] body is not valid JSON");
    if (idempotencyKeyValue) {
      await IdempotencyKey.deleteOne({
        key: idempotencyKeyValue,
        status: "in-flight"
      });
    }
    return res.status(400).json({
      error: "invalid payload"
    });
  }
  const {
    channel,
    type,
    payload
  } = job || {};
  if (!channel || !type) {
    logger.error({
      job
    }, "[qstash.receiver] missing channel/type");
    if (idempotencyKeyValue) {
      await IdempotencyKey.deleteOne({
        key: idempotencyKeyValue,
        status: "in-flight"
      });
    }
    return res.status(400).json({
      error: "invalid payload"
    });
  }

  // 5. Forced SYNC — non-negotiable loop-prevention invariant.
  //    dispatcher signature is dispatch({channel,type,payload}, options).
  try {
    const result = await dispatch({
      channel,
      type,
      payload
    }, {
      hint: "sync"
    });
    const responseBody = {
      ok: true,
      mode: result?.mode || "sync"
    };
    if (idempotencyKeyValue) {
      await IdempotencyKey.updateOne({
        key: idempotencyKeyValue
      }, {
        $set: {
          status: "completed",
          "response.statusCode": 200,
          "response.body": responseBody
        }
      });
    }
    return res.status(200).json(responseBody);
  } catch (err) {
    logger.error({
      channel,
      type,
      err: err.message
    }, "[qstash.receiver] dispatch failed — returning 500 for QStash retry");
    if (idempotencyKeyValue) {
      await IdempotencyKey.deleteOne({
        key: idempotencyKeyValue,
        status: "in-flight"
      });
    }
    return res.status(500).json({
      error: "dispatch failed"
    });
  }
}
module.exports = {
  handleCommunicationJob
};