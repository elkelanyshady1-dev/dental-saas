const crypto = require("crypto");
const logger = require("../utils/logger");

const requestContext = (req, res, next) => {
    const start = Date.now();
    const requestId = crypto.randomUUID();
    req.requestId = requestId;

    // Base logger attached immediately for early request phases
    req.logger = logger.child({ requestId });

    res.on("finish", () => {
        const durationMs = Date.now() - start;
        const userId = req.user?._id || req.platformUser?._id;
        const orgId = req.user?.organizationId || req.organization?._id;

        // Log completed request lifecycle with enriched user identity if available
        req.logger.info({
            method: req.method,
            route: req.originalUrl,
            statusCode: res.statusCode,
            durationMs,
            userId,
            orgId
        }, "Request completed");
    });

    next();
};

module.exports = requestContext;
