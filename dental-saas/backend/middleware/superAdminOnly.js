module.exports = (req, res, next) => {
    if (!req.user || req.user.type !== "platform") {
        return res.status(403).json({
            success: false,
            error: { code: "FORBIDDEN", message: "Platform access required" }
        });
    }

    if (req.user.platformRole !== "superadmin") {
        return res.status(403).json({
            success: false,
            error: { code: "FORBIDDEN", message: "Superadmin access required" }
        });
    }

    next();
};