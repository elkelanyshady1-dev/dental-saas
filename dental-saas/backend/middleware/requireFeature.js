module.exports = function requireFeature(featureKey) {
    return (req, res, next) => {
        const org = req.organization;
        if (!org) {
            return res.status(401).json({ message: "Organization context missing." });
        }

        if (!org.features?.get(featureKey)?.enabled) {
            return res.status(403).json({
                message: `Feature '${featureKey}' is disabled for this organization.`,
            });
        }

        next();
    };
};
