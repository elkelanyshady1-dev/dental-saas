/**
 * authorizePlatformPermission.js
 * v20.2 — Strict capability enforcement + structured pino logging + AuditLog record.
 */
const { resolvePlatformCapabilities } = require('../services/platformCapabilityResolver');
const auditService = require('../services/auditService');

const PLATFORM_SENTINEL_ID = "000000000000000000000000";

const authorizePlatformPermission = (requiredCapability) => {
    return (req, res, next) => {
        if (!req.platformUser) {
            return res.status(401).json({ message: "Platform user not authenticated" });
        }

        const { capabilitySet } = resolvePlatformCapabilities({ role: req.platformUser.role });

        if (capabilitySet.has(requiredCapability)) {
            return next();
        }


        // v20.2 — Structured pino log (replaces console.warn)
        req.logger.warn({
            event: "CAPABILITY_DENIED",
            userId: req.platformUser._id,
            role: req.platformUser.role,
            requiredCapability,
            route: req.originalUrl,
            correlationId: req.correlationId,
            ipAddress: req.ip,
        }, "Platform capability denied");

        // Persist AuditLog record — fire-and-forget
        auditService.createAuditRecord({
            actorId: req.platformUser._id,
            actorType: "platform_user",
            action: "CAPABILITY_DENIED",
            entity: "PlatformRoute",
            organizationId: PLATFORM_SENTINEL_ID,
            branchId: PLATFORM_SENTINEL_ID,
            ipAddress: req.ip,
            userAgent: req.headers["user-agent"],
            correlationId: req.correlationId,
            success: false,
            details: { capability: requiredCapability, route: req.originalUrl },
            signatureVersion: 1,
        }).catch(() => { });

        return res.status(403).json({
            message: `Forbidden: requires platform capability '${requiredCapability}'`
        });
    };
};

module.exports = authorizePlatformPermission;
