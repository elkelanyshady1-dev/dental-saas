const roleDefaults = {
    superadmin: ["*"],
    finance_admin: [
        "platform.analytics.revenue",
        "platform.billing.read",
        "platform.billing.update"
    ],
    operations_admin: [
        "platform.analytics.organizations",
        "platform.analytics.clinical"
    ],
    analyst: [
        "platform.analytics.revenue",
        "platform.analytics.organizations",
        "platform.analytics.clinical",
        "platform.billing.read"
    ]
};

/**
 * Middleware to check if the platform user has the required permission.
 * Eliminates dynamic user overrides; purely role-based.
 */
const authorizePlatformPermission = (requiredPermission) => {
    return (req, res, next) => {
        if (!req.platformUser) {
            return res.status(403).json({ message: "Platform user not authenticated" });
        }

        const { role } = req.platformUser;

        // Superadmin always has access
        if (role === "superadmin") {
            return next();
        }

        const defaultPerms = roleDefaults[role] || [];
        const effectivePermissions = new Set(defaultPerms);

        // Check if user has explicit permission or wildcard
        if (effectivePermissions.has("*") || effectivePermissions.has(requiredPermission)) {
            return next();
        }

        return res.status(403).json({
            message: `Forbidden: requires platform permission '${requiredPermission}'`
        });
    };
};

module.exports = authorizePlatformPermission;
