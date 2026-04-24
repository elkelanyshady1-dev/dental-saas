/**
 * observabilityController.js
 * Platform Observability — Controller
 *
 * Thin HTTP layer. All errors are forwarded to the global error handler
 * via next() — no manual res.status(...).json for error paths.
 *
 * PLANE: Platform
 */

"use strict";

const service = require("../services/observability.service");

exports.getDashboard = async (req, res, next) => {
    try {
        const { windowHours } = req.query;
        const data = await service.getDashboardMetrics({ req, windowHours });
        res.json({ success: true, data });
    } catch (err) {
        next(err);
    }
};

exports.getFeed = async (req, res, next) => {
    try {
        const { limit } = req.query;
        const data = await service.getEventFeed({ req, limit });
        res.json({ success: true, data });
    } catch (err) {
        next(err);
    }
};
