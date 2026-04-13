/**
 * superAdminOnly.js
 * v20.1 Wave 1 Stabilized — Checks req.user.role (not platformRole)
 */
module.exports = (req, res, next) => {
    if (!req.user || req.user.role !== "superadmin") {
        return res.status(403).json({
            success: false,
            error: { code: "FORBIDDEN", message: "Superadmin access required" }
        });
    }
    next();
};