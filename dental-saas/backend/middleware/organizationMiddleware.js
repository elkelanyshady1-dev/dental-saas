const Organization = require("../models/Organization");

const organizationContext = async (req, res, next) => {
    try {

        if (!req.user.organizationId) {
            return res.status(403).json({ message: "User not assigned to organization" });
        }

        const organization = await Organization.findById(req.user.organizationId);

        if (!organization) {
            return res.status(404).json({ message: "Organization not found" });
        }

        if (!organization.isActive) {
            return res.status(403).json({ message: "Organization is disabled" });
        }

        if (
            organization.subscriptionStatus === "expired" ||
            organization.subscriptionStatus === "suspended"
        ) {
            return res.status(403).json({ message: "Subscription not active" });
        }

        req.organization = organization;

        next();
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

module.exports = organizationContext;