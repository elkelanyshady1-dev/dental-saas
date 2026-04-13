/**
 * policyMiddleware.js — Express Middleware for Policy Engine
 *
 * Integrates the PBAC engine into the Express middleware chain.
 * MUST run AFTER orgProtect + organizationContext + requireOrgPermission.
 *
 * Flow:
 *   orgProtect → organizationContext → branchScope →
 *   requireOrgPermission(P.XXX) → policyMiddleware(P.XXX, getResource) → handler
 *
 * The middleware:
 *   1. Fetches the resource via the provided callback (optional)
 *   2. Builds the policy context from req
 *   3. Evaluates the policy
 *   4. Attaches the resource to req for downstream use
 *   5. Denies with 403 if policy evaluation fails
 *
 * SHADOW MODE (v4.0):
 *   When POLICY_SHADOW_MODE=true, policy denials are LOGGED but NOT ENFORCED.
 *   Denials are recorded in denialTracker for dashboard monitoring.
 *   Request proceeds with next() — no 403 response.
 *
 * PLANE: Org only.
 */

"use strict";

const { checkAccess } = require("./policyEngine");
const auditService = require("@services/auditService");
const { isShadowMode, logShadowDenial } = require("./shadowMode");
const { recordDenial, classifyDenial } = require("./denialTracker");

const SYSTEM_ID = "000000000000000000000000";

// ─── Human-Readable Denial Reason Map ────────────────────────────────────────

const REASON_MAP = {
    not_owner: "You can only access your own records.",
    ownership: "You can only modify records you created.",
    branch_mismatch: "This record belongs to another branch.",
    branch: "You do not have access to this branch.",
    after_hours: "This action is only available during working hours.",
    time: "This action is restricted at this time.",
    self_only: "You can only perform this action on your own account.",
    feature_disabled: "This feature is not included in your plan.",
    entitlement: "This feature is not available in your subscription.",
    permission_denied: "You do not have permission to perform this action.",
    admin: "This action requires administrator privileges.",
};

/**
 * Get a user-friendly denial hint from the reason string.
 * @param {string} reason
 * @returns {string}
 */
function getDenialHint(reason) {
    if (!reason) return "Access denied.";
    const lower = reason.toLowerCase();
    for (const [key, message] of Object.entries(REASON_MAP)) {
        if (lower.includes(key)) return message;
    }
    return "Access denied: you do not have sufficient privileges for this resource.";
}

/**
 * Create a policy enforcement middleware.
 *
 * @param {string} permission — the RBAC permission being exercised
 * @param {Function} [getResource] — async function (req) => resource | null
 *   If provided, fetches the resource from DB for ownership/scope checks.
 *   If not provided, evaluates policy without resource context.
 * @param {Object} [options]
 * @param {string} [options.resourceKey="resource"] — key to attach resource on req
 * @param {boolean} [options.optional=false] — if true, missing resource → allow
 * @returns {import("express").RequestHandler}
 *
 * @example
 *   // With resource fetching (ownership check)
 *   const policyMiddleware = require("@rbac/policyMiddleware");
 *   const { P } = require("@rbac/orgPermissions");
 *
 *   router.put("/:id",
 *     orgProtect,
 *     requireOrgPermission(P.PATIENTS_UPDATE),
 *     policyMiddleware(P.PATIENTS_UPDATE, async (req) => {
 *       return await Patient.findById(req.params.id);
 *     }),
 *     controller.updatePatient
 *   );
 *
 * @example
 *   // Without resource (role + branch only)
 *   router.delete("/:id",
 *     orgProtect,
 *     requireOrgPermission(P.PATIENTS_DELETE),
 *     policyMiddleware(P.PATIENTS_DELETE),
 *     controller.deletePatient
 *   );
 */
function policyMiddleware(permission, getResource, options = {}) {
    const {
        resourceKey = "resource",
        optional = false,
    } = options;

    return async function policyGuard(req, res, next) {
        try {
            // 1. Fetch resource if callback provided
            let resource = null;
            if (typeof getResource === "function") {
                resource = await getResource(req);

                if (!resource && !optional) {
                    return res.status(404).json({
                        success: false,
                        error: {
                            code: "RESOURCE_NOT_FOUND",
                            message: "The requested resource was not found.",
                        },
                    });
                }

                // Tenant isolation: verify resource belongs to this org
                if (resource && resource.organizationId) {
                    const resourceOrgId = resource.organizationId.toString();
                    const userOrgId = (req.organizationId || req.user?.organizationId || "").toString();

                    if (resourceOrgId !== userOrgId) {
                        // Silent deny — don't leak existence to other orgs
                        return res.status(404).json({
                            success: false,
                            error: {
                                code: "RESOURCE_NOT_FOUND",
                                message: "The requested resource was not found.",
                            },
                        });
                    }
                }
            }

            // 2. Evaluate policy
            const decision = checkAccess({
                user: req.user,
                permission,
                resource,
                branchId: req.branchId || req.activeBranchId || null,
                organizationId: req.organizationId || req.user?.organizationId,
                method: req.method,
                path: req.route?.path || req.originalUrl,
            });

            // 3. Handle decision
            if (!decision.allowed) {
                const orgId = (req.organizationId || req.user?.organizationId || SYSTEM_ID).toString();
                const endpoint = `${req.method} ${req.route?.path || req.originalUrl}`;
                const userRole = req.user?.roleId?.name || req.user?.role || "unknown";

                // ── Auth Trace: PBAC DENY / SHADOW_DENY ──
                const traceResult = isShadowMode() ? "SHADOW_DENY" : "DENY";
                if (typeof req.addAuthTrace === "function") {
                    req.addAuthTrace({
                        layer: "PBAC",
                        permission,
                        result: traceResult,
                        reason: decision.reason,
                        details: {
                            effect: decision.effect,
                            matchedRule: decision.matchedRule,
                            evaluatedRules: decision.evaluatedRules?.length || 0,
                            shadowMode: isShadowMode(),
                        },
                    });
                }

                // ── Record denial for monitoring dashboard (always) ──
                recordDenial({
                    endpoint,
                    permission,
                    reason: decision.reason,
                    userRole,
                    userId: req.user?._id?.toString(),
                    organizationId: orgId,
                    isShadow: isShadowMode(),
                }).catch(() => {}); // Non-blocking

                // ── SHADOW MODE: log but do NOT enforce ──
                if (isShadowMode()) {
                    logShadowDenial({
                        user: req.user,
                        permission,
                        decision,
                        route: req.originalUrl,
                        method: req.method,
                        requestId: req.requestId,
                        organizationId: orgId,
                        branchId: req.branchId || SYSTEM_ID,
                    });

                    // Audit trail (shadow)
                    auditService.createAuditRecord({
                        actorId: req.user?._id,
                        actorType: "tenant_user",
                        action: "POLICY_SHADOW_DENY",
                        entity: resourceKey,
                        entityId: resource?._id,
                        organizationId: orgId,
                        branchId: req.branchId || SYSTEM_ID,
                        ipAddress: req.ip,
                        userAgent: req.headers["user-agent"],
                        correlationId: req.requestId,
                        success: true, // Shadow mode — request still succeeds
                        details: {
                            permission,
                            reason: decision.reason,
                            effect: decision.effect,
                            matchedRule: decision.matchedRule,
                            route: req.originalUrl,
                            role: userRole,
                            shadowMode: true,
                        },
                    }).catch(() => {}); // Non-blocking

                    // Attach resource + decision, continue to handler
                    if (resource) {
                        req[resourceKey] = resource;
                    }
                    req.policyDecision = { ...decision, shadowMode: true };
                    return next();
                }

                // ── ENFORCEMENT MODE: deny the request ──
                auditService.createAuditRecord({
                    actorId: req.user?._id,
                    actorType: "tenant_user",
                    action: "POLICY_ACCESS_DENIED",
                    entity: resourceKey,
                    entityId: resource?._id,
                    organizationId: orgId,
                    branchId: req.branchId || SYSTEM_ID,
                    ipAddress: req.ip,
                    userAgent: req.headers["user-agent"],
                    correlationId: req.requestId,
                    success: false,
                    details: {
                        permission,
                        reason: decision.reason,
                        effect: decision.effect,
                        matchedRule: decision.matchedRule,
                        route: req.originalUrl,
                        role: userRole,
                    },
                }).catch(() => {}); // Non-blocking

                return res.status(403).json({
                    success: false,
                    error: {
                        code: "POLICY_ACCESS_DENIED",
                        message: getDenialHint(decision.reason),
                    },
                });
            }

            // 4. Attach resource for downstream middleware/controllers
            if (resource) {
                req[resourceKey] = resource;
            }

            // 5. Attach decision for observability
            req.policyDecision = decision;

            // ── Auth Trace: PBAC ALLOW ──
            if (typeof req.addAuthTrace === "function") {
                req.addAuthTrace({
                    layer: "PBAC",
                    permission,
                    result: "ALLOW",
                    reason: decision.reason,
                    details: {
                        effect: decision.effect,
                        matchedRule: decision.matchedRule,
                        evaluatedRules: decision.evaluatedRules?.length || 0,
                    },
                });
            }

            next();

        } catch (err) {
            // Catch errors from resource fetching or policy evaluation
            const logger = require("@utils/logger");
            logger.error({
                event: "POLICY_MIDDLEWARE_ERROR",
                permission,
                requestId: req.requestId,
                err: err.message,
                stack: err.stack,
            }, "[PolicyMiddleware] Unexpected error during policy evaluation");

            return res.status(500).json({
                success: false,
                error: {
                    code: "INTERNAL_ERROR",
                    message: "An error occurred while checking access.",
                },
            });
        }
    };
}

module.exports = policyMiddleware;
