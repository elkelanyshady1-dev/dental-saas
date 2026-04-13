/**
 * sentinelSelfCheck.controller.js
 * Phase 8 — Runtime RBAC Self-Check (Non-Production Only)
 *
 * GET /api/platform/__sentinel/rbac-self-check
 *
 * Returns the current user's resolved capabilities compared against
 * the full contract. Used for debugging capability drift at runtime.
 *
 * ONLY available when NODE_ENV !== 'production'.
 * Protected by platformProtect — requires valid JWT.
 */

const { PLATFORM_CAPABILITIES, PLATFORM_ROLES } = require('@contracts/platformContract.cjs.js');
const { resolvePlatformCapabilities } = require('../../../services/platformCapabilityResolver');

exports.rbacSelfCheck = async (req, res) => {
    // Hard block in production — defense in depth
    if (process.env.NODE_ENV === 'production') {
        return res.status(404).json({ message: 'Not found' });
    }

    try {
        const user = req.platformUser;
        if (!user) return res.status(401).json({ message: 'Unauthorized' });

        const contractCapabilities = Object.values(PLATFORM_CAPABILITIES);
        const resolvedCapabilities = resolvePlatformCapabilities({ role: user.role });
        const resolvedSet = new Set(resolvedCapabilities);
        const contractSet = new Set(contractCapabilities);

        // Capabilities in contract but NOT resolved for this role
        const missing = contractCapabilities.filter(c => !resolvedSet.has(c));

        // Capabilities resolved but NOT in contract (phantom detection)
        const extra = resolvedCapabilities.filter(c => !contractSet.has(c));

        // Role matrix for context
        const roleMatrix = {};
        for (const [role, caps] of Object.entries(PLATFORM_ROLES)) {
            roleMatrix[role] = caps.length;
        }

        res.json({
            role: user.role,
            userId: user._id,
            resolvedCapabilities,
            contractCapabilities,
            missing,
            extra,
            roleMatrix,
            healthy: missing.length === 0 || user.role !== 'superadmin',
            phantomDetected: extra.length > 0,
            timestamp: new Date().toISOString()
        });
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
};
