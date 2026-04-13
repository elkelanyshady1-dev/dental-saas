const mongoose = require("mongoose");
const auditService = require("../services/auditService");
const logger = require("../utils/logger");
const { getRequestId } = require("../platform/context/requestContextStore");


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

            const SYSTEM_ID = "000000000000000000000000";
            const organizationId = req.params.id || req.params.orgId || SYSTEM_ID;
            const branchId = req.params.branchId || SYSTEM_ID;

            // Fetch actual regionCode from Org if it's an org-scoped action
            let regionCode = "MEA"; // Default control plane region
            if (mongoose.isValidObjectId(organizationId) && organizationId !== SYSTEM_ID) {
                const Organization = require("../shared/models/Organization").default;
                const org = await Organization.findById(organizationId).select("regionCode");
                if (org) regionCode = org.regionCode;
            }

            // ── Actor snapshot — captures name at write time so renames
            // don't corrupt historical "who did this" attribution (MED-03)
            const actorSnapshot = req.platformUser ? {
                name: req.platformUser.name || null,
                email: req.platformUser.email || null,
                role: req.platformUser.role || null,
            } : undefined;

            // ── correlationId: AsyncLocalStorage > req.requestId > req.correlationId
            const correlationId = getRequestId() || req.requestId || req.correlationId;

            await auditService.createAuditRecord({
                regionCode,
                organizationId: mongoose.isValidObjectId(organizationId) ? organizationId : SYSTEM_ID,
                branchId: mongoose.isValidObjectId(branchId) ? branchId : SYSTEM_ID,
                actorId: req.platformUser._id,
                actorType: "platform_user",
                // v21.0 — Pass actor object for name split + role snapshot
                actor: req.platformUser,
                // v21.0 — Pass req for device/geo extraction
                action: action,
                entity: entity,
                entityType: entity,
                entityId: entityId && mongoose.isValidObjectId(entityId) ? entityId : undefined,
                ipAddress: req.ip,
                userAgent: req.headers["user-agent"],
                statusCode: res.statusCode,
                success: res.statusCode < 400,
                correlationId,
                // ── v2.0 enrichment ──────────────────────────────────────────
                details: {
                    requestPath: req.originalUrl,
                    requestMethod: req.method,
                    ...(actorSnapshot && { actorSnapshot }),
                },
            });



        } catch (error) {
            logger.error({ event: "AUDIT_LOGGER_FAILURE", error: error.message, stack: error.stack }, "Platform audit logger failure");
        }
    });

    next();
};

module.exports = platformAuditLogger;
