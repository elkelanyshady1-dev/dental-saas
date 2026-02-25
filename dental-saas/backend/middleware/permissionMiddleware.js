// Checks embedded permissions on the populated Role document
// Usage: authorizePermission("patients.read")
const authorizePermission = (permissionKey) => {
    return (req, res, next) => {
        try {

            // 1️⃣ Platform bypass
            if (
                req.user.platformRole === "superadmin" ||
                req.user.platformRole === "platform_admin"
            ) {
                return next();
            }

            // 2️⃣ Role validation
            if (!req.user.roleId || !req.user.permissionSet) {
                return res.status(403).json({ message: "No role assigned" });
            }

            // 3️⃣ Check O(1) Set permissions
            if (!req.user.permissionSet.has(permissionKey)) {
                return res.status(403).json({ message: "Permission denied" });
            }

            next();

        } catch (error) {
            res.status(500).json({ message: error.message });
        }
    };
};

module.exports = authorizePermission;