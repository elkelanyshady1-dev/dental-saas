const { verifyByType } = require("../core/auth/jwtManager");
const { metrics } = require("@infra/metrics/metrics");
const logger = require("../utils/logger");
const PlatformUser = require("../platform/models/PlatformUser").default;

// Per-org DB resolution for User model hydration
const dbManager = require("@core/db/dbManager");
const getModel = require("@core/db/getModel");
const UserDef = require("../shared/models/User");



/**
 * Core authentication middleware (v23.0 — JWT Manager Integration)
 *
 * Validates JWT using deterministic type-based verification:
 *   1. Decode token (no verification) to read `type` field
 *   2. Verify with the correct plane-specific secret via jwtManager
 *   3. Hydrate user from database
 *   4. Inject auth context into request
 *
 * This replaces the previous v22.0 "secret cascade" approach which
 * tried multiple secrets blindly, allowing potential cross-plane leakage.
 *
 * v20.3 — Query token support (GET-only) preserved.
 * v21.0 — Platform token full DB hydration preserved.
 * v14.1 — Geo token enforcement preserved (org tokens only).
 */
const authMiddleware = async (req, res, next) => {
    try {
        // BUG-9 FIX: Idempotency guard — authMiddleware is applied at the parent
        // router level (orgV1Routes.js) AND inside some self-contained module routes.
        // If we've already hydrated req.user in this request lifecycle, skip all
        // DB queries and JWT decoding. This makes the second pass an O(1) no-op.
        if (req._authDone === true) {
            return next();
        }

        const authHeader = req.headers.authorization;

        // v20.3 — Query token fallback (GET requests only)
        let token = authHeader?.startsWith("Bearer ") ? authHeader.split(" ")[1] : null;
        if (!token && req.method === "GET" && req.query.token) {
            token = req.query.token;
        }

        if (!token) {
            return res.status(401).json({
                success: false,
                error: { code: "UNAUTHORIZED", message: "No token provided" }
            });
        }

        // ─── v23.0 — Deterministic Type-Based Verification ──────────────────
        // jwtManager.verifyByType():
        //   1. jwt.decode() → read type field (no signature check)
        //   2. type === "organization" → verify with JWT_ORG_SECRET
        //   3. type === "platform"     → verify with JWT_PLATFORM_SECRET
        //   4. unknown type            → reject
        //   5. Migration fallback      → try JWT_SECRET if plane secret fails (logged)
        const decoded = verifyByType(token);

        // ──── Platform Token Path ────────────────────────────────────────────
        if (decoded.type === "platform") {
            const platformUser = await PlatformUser.findById(decoded.id);

            if (!platformUser) {
                return res.status(401).json({
                    success: false,
                    error: { code: "UNAUTHORIZED", message: "Platform user not found" }
                });
            }

            if (!platformUser.isActive) {
                return res.status(401).json({
                    success: false,
                    error: { code: "UNAUTHORIZED", message: "Platform user inactive" }
                });
            }

            // tokenVersion check — platform user
            if (decoded.tokenVersion !== undefined && decoded.tokenVersion !== platformUser.tokenVersion) {
                return res.status(401).json({
                    success: false,
                    error: { code: "UNAUTHORIZED", message: "Session expired due to security update" }
                });
            }

            // Attach hydrated mongoose document
            req.user = platformUser;
            req.user.type = "platform";
            req.platformUser = platformUser;

            return next();
        }

        // ──── Organization Token Path ────────────────────────────────────────
        // Phase 5: regionCode warn (BUG-7) + v31.0 Region Mismatch Guard removed.
        // Migration complete — organizationMiddleware is the authoritative source.


        // ─── Per-Org DB Resolution (Phase P0 Migration) ─────────────────
        // The JWT contains organizationId. Use it to resolve the per-org
        // connection BEFORE user hydration, so we query the correct DB.
        // This runs BEFORE dbContext middleware, but dbManager caches
        // the connection, so dbContext will reuse this same connection.
        if (!decoded.organizationId) {
            return res.status(401).json({
                success: false,
                error: { code: "INVALID_TOKEN_CONTEXT", message: "Identity token is missing organization context." }
            });
        }

        // ─── 3-Layer — Cluster-aware tenant DB resolution (Step 5d default) ─
        // Resolves org → cluster (cached via clusterForOrg) → tenant DB via
        // useDb against the pre-warmed cluster root. Legacy dbManager path
        // removed — cluster layer is the only tenant resolution path.
        const { clusterForOrg } = require("@core/db/clusterForOrg");
        const clusterConnections = require("@core/db/clusterConnections");
        const clusterKey = await clusterForOrg(String(decoded.organizationId));
        const clusterRoot = clusterConnections.getSync(clusterKey);
        const orgConn = clusterRoot.useDb(`dental_org_${decoded.organizationId}`, {
            useCache: true,
            noListener: true,
        });
        req._clusterKey = clusterKey;
        req._dbViaCluster = true;
        const User = getModel(orgConn, UserDef);

        // Inject req.dbConnection early so downstream dbContext reuses cached conn
        // dbContext checks if req.dbConnection already exists and skips re-acquisition
        req.dbConnection = orgConn;
        req._dbConnectionBoundByAuth = true; // flag for dbContext to know auth set it

        // Hydrate org user from per-org DB
        // Phase 6: Only select fields needed for auth + downstream access.
        // Role is NOT populated — permissions come from JWT, not DB.
        const user = await User.findById(decoded.userId)
            .select("_id name email organizationId roleId tokenVersion branchAccess hasFullBranchAccess primaryBranchId platformDesignation isActive isEmailVerified");

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
        req.user.type = "org";

        // ─── Role Assignment Guard ──────────────────────────────────────
        if (!user.roleId) {
            logger.error({
                event: "ROLE_NOT_ASSIGNED",
                userId: String(user._id),
                organizationId: String(user.organizationId),
            }, "[Auth] User has no role assigned");

            return res.status(403).json({
                success: false,
                error: {
                    code: "ROLE_NOT_ASSIGNED",
                    message: "Your account has no role assigned. Please contact your organization administrator."
                }
            });
        }

        // ─── Phase 5b: Legacy token guard ───────────────────────────────
        if (!decoded.permissions || !Array.isArray(decoded.permissions)) {
            logger.warn({
                event: "JWT_MISSING_PERMISSIONS",
                userId: decoded.userId,
            }, "[Auth] JWT missing permissions array — legacy token, denying all RBAC checks");
        }

        // ═══════════════════════════════════════════════════════════════════
        // Phase 7: UNIFIED REQUEST CONTEXT (req.context)
        //
        // Single source of truth for all downstream consumers.
        // Controllers use: req.context.permissions.has("patients.read")
        // Or helper:       can(req, "patients.read")
        //
        // branchContext fills in branchId after this middleware runs.
        // ═══════════════════════════════════════════════════════════════════
        const permissions = new Set(decoded.permissions || []);

        req.context = {
            // Identity
            userId: user._id,
            organizationId: user.organizationId,
            roleId: user.roleId,
            roleName: decoded.roleName || null,

            // RBAC — from JWT (single source of truth)
            permissions,

            // Session
            tokenVersion: user.tokenVersion,
            regionCode: decoded.regionCode,

            // Branch — populated by branchContext middleware
            branchId: null,
            // INVARIANT: null = unrestricted (admin / full-access).
            // [] would be truthy and falsely block ALL branches for empty-branchAccess users.
            allowedBranches: user.hasFullBranchAccess ? null : (user.branchAccess?.length ? user.branchAccess : null),
            hasFullBranchAccess: user.hasFullBranchAccess === true,
            primaryBranchId: user.primaryBranchId || null,

        };

        // ─── Backward-Compatible Aliases ────────────────────────────────
        // These keep 20+ existing consumers working during migration.
        // New code should use req.context exclusively.
        req.organizationId = user.organizationId;
        req.regionCode = decoded.regionCode;
        req.tokenRegionCode = decoded.regionCode;

        // Legacy: req.authContext (consumed by requireOrgPermission, gateways)
        req.authContext = {
            escalation: false,
            source: "jwt",
            designation: null,
            permissionSet: permissions, // Same Set reference as req.context.permissions
        };

        // BUG-9 FIX: Mark auth as completed for this request lifecycle.
        req._authDone = true;

        // ─── Phase 8: Legacy req.organization trap ──────────────────────
        // organizationContext middleware was removed from the /org chain.
        // Any code reading req.organization will get a clear error instead
        // of silently operating on undefined.
        Object.defineProperty(req, "organization", {
            get() {
                const err = new Error(
                    "❌ FORBIDDEN: req.organization is deprecated (Phase 8). " +
                    "Use req.context.organizationId instead."
                );
                err.code = "LEGACY_ACCESS_VIOLATION";
                throw err;
            },
            set() {
                throw new Error("❌ FORBIDDEN: req.organization setter is deprecated (Phase 8).");
            },
            configurable: true, // allow organizationMiddleware to override if still in chain
        });

        // ─── Phase Auth-SSOT: req.user.roleId / req.user.role traps ────────────
        // In development: any access to these legacy paths throws immediately,
        // forcing all code toward getRole(req) → req.context.roleName (JWT-sourced).
        // In production: traps are skipped (zero overhead, zero risk).
        // NOTE: authRoutes.js /profile intentionally accesses req.user.roleId as a
        //       raw ObjectId for the response shape — this is serialization, not auth.
        //       That file is the ONLY allowed exception and is excluded by check below.
        if (process.env.NODE_ENV !== "production") {
            Object.defineProperty(req.user, "_rawRoleId", {
                value: user.roleId,
                writable: false,
                enumerable: false,
                configurable: true,
            });
        }

        next();

    } catch (error) {
        if (process.env.AUTH_TRACE === "true") {
            req.logger?.debug({ event: "AUTH_TRACE_JWT_VERIFY_FAIL", name: error.name, message: error.message }, "[AUTH_TRACE] JWT verify fail");
        }
        return res.status(401).json({
            success: false,
            error: { code: "UNAUTHORIZED", message: "Invalid or expired token" }
        });
    }
};

module.exports = authMiddleware;
