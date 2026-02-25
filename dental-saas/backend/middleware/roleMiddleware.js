const authorize = (...allowedRoles) => {
    return (req, res, next) => {

        // Platform bypass — superadmins/platform_admins skip role checks
        if (
            req.user.platformRole === "superadmin" ||
            req.user.platformRole === "platform_admin"
        ) {
            return next();
        }

        if (!req.user || !req.user.roleId) {
            return res.status(403).json({
                message: "Access denied. No role assigned."
            });
        }

        const userRole = req.user.roleId.name;

        if (!allowedRoles.includes(userRole)) {
            return res.status(403).json({
                message: "Access denied. Insufficient permissions."
            });
        }

        next();
    };
};

module.exports = authorize;