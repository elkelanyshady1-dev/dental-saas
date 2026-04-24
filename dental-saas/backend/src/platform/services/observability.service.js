/**
 * observability.service.js
 * Platform Observability — Aggregation + Feed Service
 *
 * Contract: all service methods accept ({ req, ...payload }).
 * Reads only — no writes, so Promise.all is allowed (Section 8.3 of
 * CLAUDE.md restricts Promise.all for WRITES).
 *
 * PLANE: Platform
 */

"use strict";

const { getObservabilityEventModel } = require("../billing/observability/models");

/**
 * Dashboard metrics — counts of each tracked event type over a rolling
 * time window.
 *
 * @param {object} args
 * @param {import("express").Request} args.req
 * @param {number} [args.windowHours=24]
 */
exports.getDashboardMetrics = async ({ req, windowHours = 24 }) => {
    const ObservabilityEvent = getObservabilityEventModel();
    const since = new Date(Date.now() - windowHours * 60 * 60 * 1000);

    const [checkouts, failures, fxUsage, quotaEvents] = await Promise.all([
        ObservabilityEvent.countDocuments({
            eventName: "CHECKOUT_CREATED",
            createdAt: { $gte: since },
        }),
        ObservabilityEvent.countDocuments({
            eventName: "CHECKOUT_FAILED",
            createdAt: { $gte: since },
        }),
        ObservabilityEvent.countDocuments({
            eventName: "FX_RATE_USED",
            createdAt: { $gte: since },
        }),
        ObservabilityEvent.countDocuments({
            eventName: "QUOTA_EXCEEDED_POST_UPLOAD",
            createdAt: { $gte: since },
        }),
    ]);

    return { checkouts, failures, fxUsage, quotaEvents, windowHours };
};

/**
 * Recent events feed. Backed by compound index { createdAt: -1, eventName: 1 }.
 *
 * @param {object} args
 * @param {import("express").Request} args.req
 * @param {number} args.limit
 */
exports.getEventFeed = async ({ req, limit }) => {
    const ObservabilityEvent = getObservabilityEventModel();
    return ObservabilityEvent.find()
        .sort({ createdAt: -1 })
        .limit(limit)
        .lean();
};
