const jwt = require("jsonwebtoken");
const User = require("../models/User");
const PlatformUser = require("../models/PlatformUser");

/**
 * Core authentication middleware (v1.3.1)
 * Validates JWT, checks database state, and attaches user context.
 * DOES NOT enforce token type (delegates to orgProtect/platformProtect).
 */
const authMiddleware = async (req, res, next) => {
    try {
        const authHeader = req.headers.authorization;

        if (!authHeader || !authHeader.startsWith("Bearer ")) {
            return res.status(401).json({
                success: false,
                error: { code: "UNAUTHORIZED", message: "No token provided" }
            });
        }

        const token = authHeader.split(" ")[1];
        const decoded = jwt.verify(token, process.env.JWT_SECRET);

        let user;
        const isPlatform = decoded.type === "platform";

        if (isPlatform) {
            user = await PlatformUser.findById(decoded.userId || decoded.id);
        } else {
            user = await User.findById(decoded.userId).populate("roleId");
        }

        if (!user || user.isActive === false) {
            return res.status(401).json({
                success: false,
                error: { code: "UNAUTHORIZED", message: "User not found or inactive" }
            });
        }

        // Verify tokenVersion (v1.1.0 hardened rule)
        if (decoded.tokenVersion !== user.tokenVersion) {
            return res.status(401).json({
                success: false,
                error: { code: "UNAUTHORIZED", message: "Session expired due to security update" }
            });
        }

        // ─── Post-Auth Context Injection ─────────────────

        req.user = user;
        req.user.type = isPlatform ? "platform" : "org";

        if (isPlatform) {
            req.platformUser = user;
        } else {
            // Build flat permission Set for O(1) RBAC lookup
            const permissionSet = new Set();
            if (user.roleId && user.roleId.permissions) {
                const perms = user.roleId.permissions;
                for (const module in perms) {
                    if (typeof perms[module] === 'object') {
                        for (const action in perms[module]) {
                            if (perms[module][action] === true) {
                                permissionSet.add(`${module}.${action}`);
                            }
                        }
                    }
                }
            }
            req.user.permissionSet = permissionSet;
            req.organizationId = user.organizationId;
        }

        next();
    } catch (error) {
        return res.status(401).json({
            success: false,
            error: { code: "UNAUTHORIZED", message: "Invalid or expired token" }
        });
    }
};

module.exports = authMiddleware;
