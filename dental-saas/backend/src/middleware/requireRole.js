// NOTE: Org users have a role string stored directly on req.user or populate a Role document.
// In the current SAAS architecture, req.user typically comes from authMiddleware
// and holds the user object for that specific organization.
module.exports = function requireRole(roles = []) {
    return (req, res, next) => {
        // If the org-level user has a role directly on their model
        const userRole = req.user?.role || req.user?.roleId?.name;

        if (!userRole) {
            return res.status(401).json({ message: "User role missing." });
        }

        if (!roles.includes(userRole)) {
            return res.status(403).json({
                message: "Access denied. Insufficient role for this action.",
            });
        }
        next();
    };
};
