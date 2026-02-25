const authMiddleware = require("./authMiddleware");

const platformProtect = [
    authMiddleware,
    (req, res, next) => {
        if (req.user.type !== "platform") {
            return res.status(403).json({
                success: false,
                error: { code: "FORBIDDEN", message: "Platform token required" }
            });
        }
        next();
    }
];

module.exports = platformProtect;