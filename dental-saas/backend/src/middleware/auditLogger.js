// AuditLog model is NOT used here — audit writes go through auditService
const auditService = require("../services/auditService");
const logger = require("../utils/logger");

const auditLogger = async (req, res, next) => {
    // We attach this to fire when the response finishes,
    // so `req.user` is guaranteed to be populated by `protect` middleware
    // regardless of where `auditLogger` is mounted in the chain.

    res.on("finish", async () => {
        try {
            // Only log if user exists and we have org context (ensures it's an org route and authenticated)
            const orgId = req.context?.organizationId || req.organizationId;
            if (!req.user || !orgId) {
                return;
            }

            // Do not log GET requests
            const method = req.method.toUpperCase();
            if (!["POST", "PUT", "PATCH", "DELETE"].includes(method)) {
                return;
            }

            // Do not log login route
            if (req.originalUrl.includes("/login")) {
                return;
            }

            // Determine entity from originalUrl (e.g. /api/patients/:id -> patients)
            const urlParts = req.originalUrl.split("/");
            let entity = "unknown";
            // usually /api/collectionName -> urlParts[2] is collectionName
            if (urlParts.length > 2) {
                entity = urlParts[2];
            }

            let action = method; // Default to HTTP method
            if (method === "POST") action = "CREATE";
            if (method === "PUT" || method === "PATCH") action = "UPDATE";
            if (method === "DELETE") action = "DELETE";

            await auditService.createAuditRecord({
                regionCode: req.regionCode || req.context?.regionCode || "MEA",
                organizationId: orgId,
                branchId: req.activeBranchId || req.context?.branchId || req.user.primaryBranchId,
                userId: req.user._id,
                actorId: req.user._id,
                actorType: "tenant_user",
                action: action,
                entity: entity,
                // Optional: attempt to grab resource ID from params or body if useful
                // entityId: req.params.id || null, 
                ipAddress: req.ip,
                userAgent: req.headers["user-agent"],
                statusCode: res.statusCode,
                success: res.statusCode < 400
            });
        } catch (error) {
            logger.error({ event: "AUDIT_LOGGER_FAILURE", error: error.message, stack: error.stack }, "Audit logger failure");
        }
    });

    next();
};

module.exports = auditLogger;
