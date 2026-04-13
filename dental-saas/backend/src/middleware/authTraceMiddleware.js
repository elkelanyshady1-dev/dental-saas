/**
 * authTraceMiddleware.js — Authorization Trace Context + Debug Response
 *
 * Initializes a per-request authorization trace that captures every
 * ALLOW/DENY decision across all auth layers:
 *   - RBAC (requireOrgPermission)
 *   - Entitlement (requireEntitlement)
 *   - PBAC (policyMiddleware)
 *   - Field Write Guard (fieldWriteGuardMiddleware)
 *   - Field Read Filter (fieldFilterMiddleware)
 *
 * Three concerns in one middleware:
 *   1. `authTraceMiddleware` — sets up req.authTrace + req.addAuthTrace()
 *   2. Attaches response lifecycle hook to log + persist the full trace on finish
 *   3. `authDebugMiddleware` — injects _authTrace into JSON responses (DEV only)
 *
 * Phase 20 additions:
 *   - Async persistence to MongoDB (TASK-AUTH-INT-001)
 *   - Resource context injection via req.setAuthResource() (TASK-AUTH-INT-002)
 *
 * Phase A+ additions:
 *   - Capability snapshot logging (TASK-AUTH-HARD-002)
 *
 * Phase A++ additions:
 *   - Capability hash + version in trace (consistency fingerprint)
 *   - Trace sampling: 100% for denials, 20% for successes (~80% volume reduction)
 *   - Request duration (durationMs) for performance monitoring
 *   - Route group derivation for per-module latency insights
 *
 * PLANE: Org only.
 * SECURITY: Debug response injection is controlled by AUTH_DEBUG env var
 *           and is force-disabled in production.
 */

"use strict";

const { logAuthTrace } = require("@utils/authAuditLogger");
const { persistTraceAsync } = require("@services/authTracePersistence.service");
const { getRole } = require("@utils/auth/getRole");

// Phase A++: Trace sampling rate for successful requests.
// 100% of denials/errors are ALWAYS logged.
// Successful requests are sampled at this rate (0.2 = 20%).
const AUTH_TRACE_SAMPLE_RATE = 0.2;

// ─── Auth Trace Context Middleware ──────────────────────────────────────────

/**
 * Initialize the authorization trace context on the request.
 * Must be mounted BEFORE any auth middleware in the chain.
 *
 * @returns {import("express").RequestHandler}
 */
function authTraceMiddleware(req, res, next) {
    // Generate a unique trace ID for this request
    const traceId = (req.requestId || req.correlationId || `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`);

    req.authTrace = {
        requestId: traceId,
        method: req.method,
        path: req.originalUrl,
        steps: [],
        startTime: Date.now(),
    };

    /**
     * Add an authorization decision step to the trace.
     *
     * @param {Object} step
     * @param {string} step.layer — Auth layer name: RBAC, ENTITLEMENT, PBAC, FIELD_WRITE, FIELD_READ
     * @param {string} step.result — Decision: ALLOW, DENY, FILTER_APPLIED
     * @param {string} [step.permission] — Permission key checked
     * @param {string} [step.resource] — Resource type involved
     * @param {string} [step.reason] — Reason for deny/allow
     * @param {Object} [step.details] — Additional context
     */
    req.addAuthTrace = function addAuthTrace(step) {
        if (!req.authTrace) return;
        req.authTrace.steps.push({
            ...step,
            timestamp: Date.now(),
            elapsed: Date.now() - req.authTrace.startTime,
        });
    };

    /**
     * Set resource context for the auth trace (TASK-AUTH-INT-002).
     * Call from route handlers or service layer — NOT middleware.
     *
     * @param {Object} resource
     * @param {string} resource.resourceType — e.g., "patient", "treatment"
     * @param {string} resource.resourceId — the resource's _id
     * @param {string} [resource.ownerId] — the resource owner's userId
     */
    req.setAuthResource = function setAuthResource({ resourceType, resourceId, ownerId }) {
        if (!req.authTrace) return;
        if (resourceType) req.authTrace.resourceType = resourceType;
        if (resourceId) req.authTrace.resourceId = String(resourceId);
        if (ownerId) req.authTrace.ownerId = ownerId;
    };

    // Attach response lifecycle hook to log + persist the full trace on completion
    res.on("finish", () => {
        if (req.authTrace && req.authTrace.steps.length > 0) {
            req.authTrace.endTime = Date.now();
            req.authTrace.duration = req.authTrace.endTime - req.authTrace.startTime;
            req.authTrace.statusCode = res.statusCode;

            // Phase A++: Request duration for performance monitoring
            req.authTrace.durationMs = req.startTime
                ? Date.now() - req.startTime
                : req.authTrace.duration;

            // Phase A++: Route group derivation for per-module latency insights
            // Extracts the first path segment after /org/ or /v1/ as the module name
            const pathMatch = req.originalUrl.match(/\/(?:org|v1)\/([a-zA-Z-]+)/);
            req.authTrace.routeGroup = pathMatch ? pathMatch[1] : "unknown";

            // Phase A++: Capability hash + version (compact fingerprint)
            if (req.capabilityHash) {
                req.authTrace.capabilityHash = req.capabilityHash;
            }
            if (req.capabilitiesVersion) {
                req.authTrace.capabilitiesVersion = req.capabilitiesVersion;
            }

            // Phase A+: Snapshot capabilities for entitlement debugging
            // Phase A++: Only log modules + features (reduced payload)
            if (req.capabilities) {
                req.authTrace.capabilities = {
                    modules: req.capabilities.modules || {},
                    features: req.capabilities.features || {},
                };
            }

            // ─── Phase B.2: Decision Summary ────────────────────────────────
            // Structured summary of per-layer verdicts for dashboard drill-down
            const steps = req.authTrace.steps;
            const layerVerdicts = {};
            const denialReasons = [];

            for (const step of steps) {
                const layer = step.layer || "UNKNOWN";
                if (!layerVerdicts[layer]) {
                    layerVerdicts[layer] = { allow: 0, deny: 0, filter: 0 };
                }
                if (step.result === "ALLOW") layerVerdicts[layer].allow++;
                else if (step.result === "DENY") {
                    layerVerdicts[layer].deny++;
                    denialReasons.push({
                        layer,
                        permission: step.permission || null,
                        reason: step.reason || "unspecified",
                    });
                }
                else if (step.result === "FILTER_APPLIED") layerVerdicts[layer].filter++;
            }

            const hasDenial = steps.some(s => s.result === "DENY");
            req.authTrace.summary = {
                outcome: hasDenial ? "DENIED" : "ALLOWED",
                totalSteps: steps.length,
                layerVerdicts,
                denialReasons,
                moduleAccessed: req.authTrace.routeGroup,
            };

            // ─── Phase B.2: Timing Breakdown ────────────────────────────────
            // Per-layer latency for performance tuning
            const layerTimings = {};
            for (const step of steps) {
                const layer = step.layer || "UNKNOWN";
                if (!layerTimings[layer]) {
                    layerTimings[layer] = { firstMs: step.elapsed, lastMs: step.elapsed, count: 0 };
                }
                layerTimings[layer].lastMs = step.elapsed;
                layerTimings[layer].count++;
            }

            // Calculate per-layer duration (last - first)
            for (const [layer, timing] of Object.entries(layerTimings)) {
                timing.durationMs = timing.lastMs - timing.firstMs;
            }

            req.authTrace.timing = {
                totalMs: req.authTrace.durationMs,
                layers: layerTimings,
            };

            // Phase A++: Trace sampling — 100% for errors/denials, sampled for successes
            const isError = hasDenial || res.statusCode >= 400;

            if (isError || Math.random() < AUTH_TRACE_SAMPLE_RATE) {
                // Phase 19: structured logging
                logAuthTrace(req);

                // Phase 20: async persistence (non-blocking)
                persistTraceAsync(req);
            }
        }
    });

    next();
}

// ─── Auth Debug Response Middleware ─────────────────────────────────────────

/**
 * DEV-ONLY middleware that injects the auth trace into JSON responses.
 * Controlled by AUTH_DEBUG=true environment variable.
 * Force-disabled in production regardless of env var.
 *
 * Hardening (TASK-AUTH-INT-008):
 *   - Production safety gate: NODE_ENV=production → always skip
 *   - AUTH_DEBUG must be explicitly "true"
 *   - Role gate: only org_admin (or superadmin) can see debug output
 *   - Warning log emitted when debug injection is active
 *   - X-Auth-Debug response header set for DevTools visibility
 *
 * WARNING: Never enable in production — exposes internal auth decisions.
 *
 * @returns {import("express").RequestHandler}
 */
function authDebugMiddleware(req, res, next) {
    // Production safety gate — never inject debug data in prod
    if (process.env.NODE_ENV === "production") {
        return next();
    }

    // Only inject if AUTH_DEBUG is explicitly "true"
    if (process.env.AUTH_DEBUG !== "true") {
        return next();
    }

    // TASK-AUTH-INT-008: Role gate — only org_admin can see debug output
    const userRole = getRole(req);
    if (!userRole || !["org_admin", "superadmin"].includes(userRole)) {
        return next();
    }

    // Set debug response header
    res.setHeader("X-Auth-Debug", "enabled");

    // Wrap res.json to inject trace data
    const originalJson = res.json.bind(res);
    res.json = function authDebugJson(body) {
        if (req.authTrace && typeof body === "object" && body !== null) {
            body._authTrace = {
                requestId: req.authTrace.requestId,
                method: req.authTrace.method,
                path: req.authTrace.path,
                duration: Date.now() - req.authTrace.startTime,
                steps: req.authTrace.steps,
                stepCount: req.authTrace.steps.length,
                // Phase 20: resource context
                resourceType: req.authTrace.resourceType || null,
                resourceId: req.authTrace.resourceId || null,
            };
        }
        return originalJson(body);
    };

    next();
}

// ─── Exports ────────────────────────────────────────────────────────────────

module.exports = {
    authTraceMiddleware,
    authDebugMiddleware,
};
