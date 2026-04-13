const { resolvePlatformCapabilities } = require("../services/platformCapabilityResolver");
const auditService = require("../services/auditService");
const { PLATFORM_FEATURE_FLAGS } = require("../config/platformFeatureFlags");
const { isEnterprise } = require("../config/platformMode");
const crypto = require("crypto");

// ─── Shared Utility: Deterministic Capability Hash ─────────────────────────
// Key-sorted to prevent hash mismatch from object key ordering differences.
// MUST be the same function used at token issuance (platformAuthController).
function computeCapabilityHash(capabilities) {
    const normalized = Object.keys(capabilities)
        .sort()
        .reduce((acc, key) => { acc[key] = capabilities[key]; return acc; }, {});
    return crypto.createHash("sha256").update(JSON.stringify(normalized)).digest("hex");
}

// Export for reuse in platformAuthController during token issuance
exports.computeCapabilityHash = computeCapabilityHash;

/**
 * GET /api/platform/capabilities
 * Returns deterministic capability map + metadata.
 * v19.0 — Enterprise mode: validates capabilityHash from JWT claims.
 */
exports.getCapabilities = async (req, res) => {
    try {
        const user = req.platformUser;
        if (!user) return res.status(401).json({ message: "Unauthorized" });

        const result = resolvePlatformCapabilities({
            role: user.role,
            accountStatus: user.isActive ? "active" : "suspended"
        });

        // Normalize: resolver returns string[], ensure we always work with an array
        const capabilities = Array.isArray(result) ? result : (result.capabilities || []);
        const capabilityHash = computeCapabilityHash(capabilities);

        // Phase 5: Multi-region safe cache headers
        res.setHeader("Cache-Control", "private, must-revalidate");
        res.setHeader("Vary", "Authorization");

        // Phase 2: Capability Snapshot Verification (Enterprise mode only)
        if (isEnterprise() && user.capabilityHash) {
            if (capabilityHash !== user.capabilityHash) {
                // v22.0 — Structured observability (PART 4)
                console.warn(JSON.stringify({
                    event: "CAPABILITY_HASH_MISMATCH",
                    userId: String(user._id),
                    role: user.role,
                    expectedHash: user.capabilityHash?.slice(0, 16) + "...",
                    actualHash: capabilityHash?.slice(0, 16) + "...",
                    timestamp: Date.now()
                }));
                return res.status(409).json({
                    message: "Capability snapshot mismatch. Please re-authenticate.",
                    code: "CAPABILITY_HASH_MISMATCH"
                });
            }
        }

        // v21.0 — Response shape: { role, capabilities, capabilityHash }
        // Frontend PlatformCapabilitiesProvider expects data.capabilities (array)
        res.json({
            role: user.role,
            capabilities,
            capabilityHash
        });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

/**
 * GET /api/platform/feature-flags
 * Returns active feature flags with ETag + Phase 5 cache headers.
 * v19.0 — HTTP Compliant, Cache-Safe.
 */
exports.getFeatureFlags = async (req, res) => {
    try {
        const flags = PLATFORM_FEATURE_FLAGS;

        // Generate deterministic ETag from current flag state
        const hash = crypto
            .createHash("sha256")
            .update(JSON.stringify(flags))
            .digest("hex");
        const etag = `"${hash}"`;

        // 304 Not Modified: Client already has the current version
        if (req.headers["if-none-match"] === etag) {
            return res.status(304).end();
        }

        // Phase 5: Multi-region safe cache headers
        res.setHeader("Cache-Control", "private, must-revalidate");
        res.setHeader("Vary", "Authorization");
        res.setHeader("ETag", etag);
        res.json({ flags, version: "v1.0" });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

/**
 * POST /api/platform/audit/frontend-event
 * Logs frontend actions to the backend audit ledger
 */
exports.logAudit = async (req, res) => {
    try {
        const { action, targetId, metadata } = req.body;
        const user = req.platformUser;

        await auditService.createAuditRecord({
            organizationId: "000000000000000000000000", // Platform level
            branchId: "000000000000000000000000",
            actorId: user._id,
            actorType: "platform_user",
            action: action || "FRONTEND_EVENT",
            entity: "PlatformUI",
            entityId: targetId || user._id,
            success: true,
            details: {
                ...metadata,
                clientVersion: "v19.0",
                actorRole: user.role
            }
        });

        res.status(204).send();
    } catch (error) {
        console.error("[PlatformObservability] Audit log failed:", error);
        res.status(500).json({ message: "Telemetry reception error" });
    }
};

/**
 * POST /api/platform/performance-metric
 * Tracks route-level performance
 */
exports.logPerformance = async (req, res) => {
    try {
        const { featureKey, loadDuration } = req.body;
        const user = req.platformUser;

        console.log(`[PlatformPerformance] ${featureKey} loaded in ${loadDuration}ms for user ${user._id}`);
        res.status(204).send();
    } catch (error) {
        res.status(500).json({ message: "Performance telemetry failure" });
    }
};
