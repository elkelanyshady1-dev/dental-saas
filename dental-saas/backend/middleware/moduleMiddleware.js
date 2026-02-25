const Organization = require("../models/Organization");

const checkModuleAccess = (moduleName) => {
    return async (req, res, next) => {
        try {

            // 1️⃣ Platform bypass
            if (
                req.user.platformRole === "superadmin" ||
                req.user.platformRole === "platform_admin"
            ) {
                return next();
            }

            // 2️⃣ Ensure organization exists
            if (!req.user.organizationId) {
                return res.status(403).json({ message: "No organization assigned" });
            }

            const organization = await Organization.findById(req.user.organizationId);

            if (!organization) {
                return res.status(404).json({ message: "Organization not found" });
            }

            // 3️⃣ Check org active
            if (!organization.isActive) {
                return res.status(403).json({ message: "Organization is disabled" });
            }

            // 4️⃣ Check subscription status
            if (
                organization.subscriptionStatus === "expired" ||
                organization.subscriptionStatus === "suspended"
            ) {
                return res.status(403).json({ message: "Subscription inactive" });
            }

            // 5️⃣ Check module enabled
            if (!organization.modules[moduleName]) {
                return res.status(403).json({
                    message: `Module '${moduleName}' not enabled in subscription`,
                });
            }

            next();

        } catch (error) {
            res.status(500).json({ message: error.message });
        }
    };
};

module.exports = checkModuleAccess;