/**
 * assertDTO.js — Global DTO Bypass Detection Middleware
 *
 * Intercepts res.json() to warn when a controller sends a response
 * without marking req.context.dtoUsed = true.
 *
 * This is a DETECTION mechanism, not a hard block — it logs warnings
 * to surface DTO bypass during development and in production logs.
 *
 * Mount BEFORE route handlers so the interceptor is in place
 * before any controller calls res.json().
 *
 * PLANE: Org only (Platform uses separate response pipeline).
 */

"use strict";

const logger = require("@utils/logger");

module.exports = function assertDTO(req, res, next) {
    const originalJson = res.json.bind(res);

    res.json = function (data) {
        if (data && data.success === true && !req.context?._dtoUsed) {
            logger.warn({
                event:  "DTO_BYPASS_DETECTED",
                method: req.method,
                url:    req.originalUrl,
                userId: req.context?.userId?.toString() ?? "unknown",
            }, "[assertDTO] Controller returned success response without DTO builder");
        }
        return originalJson(data);
    };

    next();
};
