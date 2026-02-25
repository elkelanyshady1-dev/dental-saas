const moduleGuard = (moduleName) => {
    return (req, res, next) => {
        // Skip for platform routes
        if (!req.organization) {
            return next();
        }

        // Core modules shouldn't be blocked by this guard, but 
        // if explicitly guarded, check the configuration.
        const isEnabled = req.organization.modules?.[moduleName];

        if (!isEnabled) {
            return res.status(403).json({
                message: "Module not enabled in your plan"
            });
        }

        next();
    };
};

module.exports = moduleGuard;
