const authMiddleware = require("./authMiddleware");

const orgProtect = [
    authMiddleware,
    (req, res, next) => {
        if (req.user.type !== "org") {
            return res.status(403).json({
                success: false,
                error: { code: "FORBIDDEN", message: "Organization token required" }
            });
        }

        // Inject organization context safely from verified token/user
        req.organizationId = req.user.organizationId;

        next();
    }
];

module.exports = orgProtect;
