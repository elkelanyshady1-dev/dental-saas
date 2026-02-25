const mongoose = require("mongoose");
const AuditLog = require("../models/AuditLog");

const platformAuditLogger = async (req, res, next) => {
    res.on("finish", async () => {
        try {
            // Only log if the platform user exists
            if (!req.platformUser) {
                return;
            }

            // Do not log pure GET requests (reads) to avoid database spam, unless explicitly wanting full read history.
            // Usually we just log mutating actions.
            const method = req.method.toUpperCase();
            if (!["POST", "PUT", "PATCH", "DELETE"].includes(method)) {
                return;
            }

            // Determine entity from originalUrl (e.g. /api/platform/organizations/:id -> organizations)
            const urlParts = req.originalUrl.split("?")[0].split("/");
            let entity = "unknown";
            // usually /api/platform/collectionName -> urlParts[3] is collectionName
            if (urlParts.length > 3) {
                entity = urlParts[3];
            }

            let action = method;
            if (method === "POST") action = "CREATE";
            if (method === "PUT" || method === "PATCH") action = "UPDATE";
            if (method === "DELETE") action = "DELETE";

            // Try to extract entityId (e.g. userId, organizationId) from params
            const entityId = req.params.id || req.params.userId || req.params.orgId || req.params.branchId;

            await AuditLog.create({
                actorId: req.platformUser._id,
                actorType: "platform_user",
                action: action,
                entity: entity,
                entityId: entityId && mongoose.isValidObjectId(entityId) ? entityId : undefined,
                ipAddress: req.ip,
                userAgent: req.headers["user-agent"],
                statusCode: res.statusCode,
                success: res.statusCode < 400
            });
        } catch (error) {
            console.error("Platform Audit Logger Error:", error);
        }
    });

    next();
};

module.exports = platformAuditLogger;
