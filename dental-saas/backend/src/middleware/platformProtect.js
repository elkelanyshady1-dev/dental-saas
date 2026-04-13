const authMiddleware = require("./authMiddleware");

const platformProtect = [
    authMiddleware,
    (req, res, next) => {
        if (!req.user || req.user.type !== "platform") {
            return res.status(403).json({
                success: false,
                error: { code: "FORBIDDEN", message: "Platform token required" }
            });
        }
        // v21.0 — authMiddleware now hydrates req.platformUser from DB.
        // This fallback ensures backward compatibility.
        if (!req.platformUser) {
            req.platformUser = req.user;
        }
        next();
    }
];

module.exports = platformProtect;