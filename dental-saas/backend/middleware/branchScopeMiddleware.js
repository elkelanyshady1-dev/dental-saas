const branchScope = async (req, res, next) => {
    try {

        // 1️⃣ Platform bypass — superadmins are unrestricted
        if (
            req.user.platformRole === "superadmin" ||
            req.user.platformRole === "platform_admin"
        ) {
            req.allowedBranches = null;
            return next();
        }

        // 2️⃣ Full branch access — org_admin level
        if (req.user.hasFullBranchAccess) {
            req.allowedBranches = null;
            return next();
        }

        // 3️⃣ No branches assigned → block entirely
        if (!req.user.branchAccess || req.user.branchAccess.length === 0) {
            return res.status(403).json({
                message: "No branch access assigned",
            });
        }

        // 4️⃣ Restricted user — keep as native ObjectIds (no toString)
        req.allowedBranches = req.user.branchAccess;

        next();

    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

module.exports = branchScope;
