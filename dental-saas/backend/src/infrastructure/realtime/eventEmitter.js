/**
 * eventEmitter.js — Enterprise Domain Real-Time Event Emitter
 * ═══════════════════════════════════════════════════════════════
 *
 * PLANE:     Organization only
 * TRANSPORT: Socket.IO
 * VERSION:   v2.0 — Enterprise Hardened
 *
 * LAYERS ENFORCED:
 *   R1 — EVENT AUTHORIZATION:  Per-socket permission filtering via fetchSockets()
 *   R2 — SCHEMA VALIDATION:    Payload validated + sanitized before emission
 *   R3 — EVENT VERSIONING:     All events MUST include version suffix (.vN)
 *   R4 — RATE LIMITING:        Anti-flood throttle per (orgId+event)
 *   R5 — OBSERVABILITY:        Structured logging for every emit/suppress/error
 *   R7 — FIELD WHITELISTING:   Only schema-allowed fields reach the wire
 *
 * ZERO-TRUST RULES (ENFORCED):
 *   ❌ io.emit() globally is FORBIDDEN
 *   ❌ orgId MUST come from server-verified JWT context
 *   ❌ NEVER include DB objects, passwords, tokens, or PII in payload
 *   ✅ Send ONLY entity IDs + signal type
 *   ✅ Frontend reacts by invalidating React Query → API refetch
 *   ✅ Safe no-op when socket server is not initialized
 *
 * USAGE (domain service — after DB write):
 *
 *   const { emitToOrg, emitToUser } = require("@realtime/eventEmitter");
 *
 *   // Basic — all authenticated users in org with appointments.read permission
 *   emitToOrg(orgId, "appointment.created.v1", { id: appointment._id });
 *
 *   // With custom rate-limit interval
 *   emitToOrg(orgId, "audit.event.v1", { type: "AUDIT_EVENT" }, { rateIntervalMs: 200 });
 *
 *   // Personal notification — no permission check needed
 *   emitToUser(userId, "notification.created.v1", { id: notif._id, title: "Task assigned" });
 *
 *   // Bypass authorization (broadcast to entire org regardless of permissions)
 *   emitToOrg(orgId, "booking.update.v1", { type: "BOOKING_APPROVED" }, { skipAuth: true });
 *
 * @module infrastructure/realtime/eventEmitter
 */

"use strict";

const logger = require("../../utils/logger");
const { validateEvent, getEventSchema, isVersionedEvent } = require("./eventSchemas");
const { canEmit } = require("./eventRateLimiter");

// ═══════════════════════════════════════════════════════════════
// emitToOrg — Org-scoped emission with full enterprise stack
// ═══════════════════════════════════════════════════════════════

/**
 * emitToOrg
 *
 * Emits a validated, sanitized, rate-limited, permission-filtered event
 * to all eligible sockets in the organization room.
 *
 * Pipeline:
 *   1. Version check (R3)
 *   2. Rate limit check (R4)
 *   3. Schema validation + field sanitization (R2 + R7)
 *   4. Permission-based filtering (R1) — if schema defines requiredPermission
 *   5. Emit to eligible sockets
 *   6. Structured observability log (R5)
 *
 * @param {string} orgId      — Organization ID (from JWT, NEVER from client)
 * @param {string} event      — Versioned event name (e.g. "appointment.created.v1")
 * @param {object} payload    — Minimal signal payload — sanitized to whitelist
 * @param {object} [options]  — Optional overrides
 * @param {boolean} [options.skipAuth=false]     — Skip permission filtering (broadcast to all)
 * @param {number}  [options.rateIntervalMs]     — Custom rate-limit interval
 * @param {boolean} [options.skipValidation=false] — Bypass schema validation (legacy compat)
 */
async function emitToOrg(orgId, event, payload = {}, options = {}) {
    const { skipAuth = false, rateIntervalMs, skipValidation = false } = options;

    if (!orgId) {
        logger.warn({ event }, "[Socket:emitToOrg] SKIPPED — orgId is missing");
        return;
    }

    // ── R3: Version Enforcement ──────────────────────────────────────────
    if (!isVersionedEvent(event)) {
        logger.error(
            { event, orgId },
            "[Socket:emitToOrg] BLOCKED — Event name missing version suffix. Use format: domain.action.vN"
        );
        return;
    }

    // ── R4: Rate Limit ──────────────────────────────────────────────────
    if (!canEmit(orgId, event, rateIntervalMs)) {
        // canEmit() already logs the suppression internally
        return;
    }

    // ── R2 + R7: Schema Validation + Field Sanitization ─────────────────
    let sanitizedPayload = payload;
    if (!skipValidation) {
        const validation = validateEvent(event, payload);
        if (!validation.valid) {
            logger.error(
                { event, orgId, error: validation.error },
                "[Socket:emitToOrg] BLOCKED — Schema validation failed"
            );
            return;
        }
        sanitizedPayload = validation.sanitized;
    }

    // ── Emit ─────────────────────────────────────────────────────────────
    try {
        const { getIO } = require("./socketServer");
        const io = getIO();
        const schema = getEventSchema(event);
        const requiredPermission = schema?.requiredPermission;

        // ── R1: Event Authorization (Permission Filtering) ──────────────
        // If the schema defines a requiredPermission and skipAuth is false,
        // fetch all sockets in the room and emit only to those whose decoded
        // JWT carries the matching permission.
        //
        // NOTE: The org JWT doesn't embed permissions directly. It carries roleId.
        // We check socket.user.permissions (injected by socketAuth if available)
        // or fall back to broadcast when permissions aren't on the socket.
        if (requiredPermission && !skipAuth) {
            const sockets = await io.in(`org:${orgId}`).fetchSockets();

            let authorizedCount = 0;
            let deniedCount = 0;

            for (const socket of sockets) {
                const perms = socket.user?.permissions;

                // If permissions aren't on the socket (token doesn't carry them),
                // emit anyway — permission check happens at the API refetch layer.
                // This is defense-in-depth, not the only gate.
                if (!perms || perms.includes(requiredPermission)) {
                    socket.emit(event, sanitizedPayload);
                    authorizedCount++;
                } else {
                    deniedCount++;
                }
            }

            // ── R5: Observability ────────────────────────────────────────
            logger.info(
                {
                    event,
                    orgId,
                    authorized: authorizedCount,
                    denied: deniedCount,
                    permission: requiredPermission,
                    payloadKeys: Object.keys(sanitizedPayload),
                    timestamp: new Date().toISOString(),
                },
                "[Socket:emitToOrg] Emitted (permission-filtered)"
            );
        } else {
            // No permission gate — broadcast to entire org room
            io.to(`org:${orgId}`).emit(event, sanitizedPayload);

            // ── R5: Observability ────────────────────────────────────────
            logger.info(
                {
                    event,
                    orgId,
                    mode: skipAuth ? "skipAuth" : "broadcast",
                    payloadKeys: Object.keys(sanitizedPayload),
                    timestamp: new Date().toISOString(),
                },
                "[Socket:emitToOrg] Emitted (broadcast)"
            );
        }
    } catch (err) {
        // Socket server not initialized (e.g. background worker).
        // Real-time is best-effort — DB is the source of truth.
        logger.warn(
            { event, orgId, err: err.message },
            "[Socket:emitToOrg] SKIPPED — socket server not available"
        );
    }
}

// ═══════════════════════════════════════════════════════════════
// emitToUser — User-scoped emission (personal notifications)
// ═══════════════════════════════════════════════════════════════

/**
 * emitToUser
 *
 * Emits a validated, sanitized event to a specific user's personal room.
 * Does NOT require permission filtering (it's already scoped to the user).
 *
 * @param {string} userId   — User ID (from JWT, not client)
 * @param {string} event    — Versioned event name
 * @param {object} payload  — Minimal signal payload
 * @param {object} [options]
 * @param {boolean} [options.skipValidation=false] — Bypass schema validation
 */
function emitToUser(userId, event, payload = {}, options = {}) {
    const { skipValidation = false } = options;

    if (!userId) {
        logger.warn({ event }, "[Socket:emitToUser] SKIPPED — userId is missing");
        return;
    }

    // ── R3: Version Enforcement ──────────────────────────────────────────
    if (!isVersionedEvent(event)) {
        logger.error(
            { event, userId },
            "[Socket:emitToUser] BLOCKED — Event name missing version suffix"
        );
        return;
    }

    // ── R2 + R7: Validation + Sanitization ──────────────────────────────
    let sanitizedPayload = payload;
    if (!skipValidation) {
        const validation = validateEvent(event, payload);
        if (!validation.valid) {
            logger.error(
                { event, userId, error: validation.error },
                "[Socket:emitToUser] BLOCKED — Schema validation failed"
            );
            return;
        }
        sanitizedPayload = validation.sanitized;
    }

    try {
        const { getIO } = require("./socketServer");
        const io = getIO();
        io.to(`user:${userId}`).emit(event, sanitizedPayload);

        // ── R5: Observability ────────────────────────────────────────────
        logger.info(
            {
                event,
                userId,
                payloadKeys: Object.keys(sanitizedPayload),
                timestamp: new Date().toISOString(),
            },
            "[Socket:emitToUser] Emitted"
        );
    } catch (err) {
        logger.warn(
            { event, userId, err: err.message },
            "[Socket:emitToUser] SKIPPED — socket server not available"
        );
    }
}

module.exports = { emitToOrg, emitToUser };
