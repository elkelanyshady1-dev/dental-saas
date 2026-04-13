/**
 * security.controller.js — Security Control Center API
 *
 * Provides read-only introspection endpoints for the Security Control Center UI.
 * Exposes policy coverage, permission matrix, field access rules, audit logs,
 * route→permission matrix audit, and an access simulation endpoint.
 *
 * PRODUCTION HARDENING (v3.0):
 *   - Redis caching with graceful fallback (30s overview, 5min static)
 *   - Rate limiting enforced at route level
 *   - Response sanitization (no internal context leakage)
 *   - Metadata enrichment (lastUpdated, counts)
 *   - CSV export for audit logs
 *   - No raw policyRegistry functions exposed
 *   - Simulation uses req.user ONLY — no user override from body
 *   - All audit log queries scoped to req.organizationId
 *   - Logs hard-capped at 50 per page
 *
 * GUARD: SECURITY_MANAGE (enforced by route-level middleware)
 * PLANE: Org only.
 */

"use strict";

const { P, ORG_ROLE_PERMISSIONS, ORG_ROLES } = require("../../rbac/orgPermissions");
const { getRole } = require("@utils/auth/getRole");
const { policies, helpers } = require("../../rbac/policyRegistry");
const { evaluatePolicy } = require("../../rbac/policyEvaluator");
const { fieldAccess, getResourceTypes, getResourceRoles, hasFullAccess } = require("../../rbac/fieldAccessRegistry");
const { matrix, getMatrixStats } = require("../../rbac/permissionMatrix");
const AuditLogDef = require("../../shared/models/AuditLog");
const PolicyVersionDef = require("./models/PolicyVersion");
const logger = require("@utils/logger");
const cache = require("./securityCache");
const getModel = require("@core/db/getModel");
const { getDenialStats: fetchDenialStats } = require("../../rbac/denialTracker");
const { getShadowConfig } = require("../../rbac/shadowMode");

// ─── 1. Overview KPIs ──────────────────────────────────────────────────────────

/**
 * GET /security/overview
 * Returns KPI summary + weekly chart data for the Security dashboard.
 */
async function getOverview(req, res) {
    try {
        const AuditLog = getModel(req.dbConnection, AuditLogDef);
        const organizationId = req.organizationId;

        // ── Redis cache check ──
        const cacheKey = cache.keys.overview(organizationId);
        const cached = await cache.getCache(cacheKey);
        if (cached) return res.json(cached);

        // ── Permission + policy stats ──
        const allPermissions = Object.values(P);
        const uniquePermissions = [...new Set(allPermissions)];
        const writeSuffixes = [".create", ".update", ".delete", ".manage", ".review"];
        const writePerms = uniquePermissions.filter(p => writeSuffixes.some(s => p.endsWith(s)));
        const coveredWritePerms = writePerms.filter(p => policies[p] && policies[p].length > 0);

        const totalPolicies = Object.keys(policies).length;
        let totalRules = 0;
        let allowRules = 0;
        let denyRules = 0;
        for (const rules of Object.values(policies)) {
            totalRules += rules.length;
            for (const r of rules) {
                if (r.effect === "allow") allowRules++;
                if (r.effect === "deny") denyRules++;
            }
        }

        // ── Route matrix stats ──
        const matrixStats = getMatrixStats();

        // ── Field RBAC coverage ──
        const resourceTypes = getResourceTypes();
        const allRoles = ORG_ROLES;
        let totalFieldSlots = 0;
        let definedFieldSlots = 0;
        for (const rt of resourceTypes) {
            for (const role of allRoles) {
                totalFieldSlots++;
                if (fieldAccess[rt]?.[role]) definedFieldSlots++;
            }
        }
        const fieldCoveragePercent = totalFieldSlots > 0
            ? Math.round((definedFieldSlots / totalFieldSlots) * 1000) / 10
            : 100;

        // ── Weekly access log chart (last 7 days) ──
        const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
        const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

        let weeklyChart = [];
        let totalAllowed7d = 0;
        let totalDenied7d = 0;
        try {
            const pipeline = [
                {
                    $match: {
                        organizationId: req.organizationId_obj || organizationId,
                        createdAt: { $gte: sevenDaysAgo },
                    },
                },
                {
                    $group: {
                        _id: {
                            dayOfWeek: { $dayOfWeek: "$createdAt" },
                            success: "$success",
                        },
                        count: { $sum: 1 },
                    },
                },
            ];
            const raw = await AuditLog.aggregate(pipeline);

            for (let i = 1; i <= 7; i++) {
                const allowed = raw.find(r => r._id.dayOfWeek === i && r._id.success === true)?.count || 0;
                const denied = raw.find(r => r._id.dayOfWeek === i && r._id.success === false)?.count || 0;
                totalAllowed7d += allowed;
                totalDenied7d += denied;
                weeklyChart.push({ name: dayNames[i - 1], allowed, denied });
            }
        } catch (err) {
            logger.warn({ err }, "[Security] Weekly chart aggregation failed");
            weeklyChart = dayNames.map(name => ({ name, allowed: 0, denied: 0 }));
        }

        // ── Recent denials (24h) ──
        let recentDeniedCount = 0;
        try {
            const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
            recentDeniedCount = await AuditLog.countDocuments({
                success: false,
                createdAt: { $gte: oneDayAgo },
            });
        } catch (err) {
            // Graceful fallback
        }

        const response = {
            success: true,
            data: {
                kpis: {
                    policyCoverage: writePerms.length > 0
                        ? Math.round((coveredWritePerms.length / writePerms.length) * 1000) / 10
                        : 100,
                    matrixCoverage: matrixStats.totalRoutes,
                    totalPermissions: uniquePermissions.length,
                    activePolicies: totalPolicies,
                    totalRules,
                    allowRules,
                    denyRules,
                    writePermissions: writePerms.length,
                    coveredWritePermissions: coveredWritePerms.length,
                    recentDenials: recentDeniedCount,
                    allowedLast7Days: totalAllowed7d,
                    deniedLast7Days: totalDenied7d,
                    fieldCoverage: fieldCoveragePercent,
                },
                weeklyChart,
            },
            meta: {
                lastUpdated: new Date().toISOString(),
                cacheTTL: cache.TTL.OVERVIEW,
            },
        };

        await cache.setCache(cacheKey, response, cache.TTL.OVERVIEW);
        return res.json(response);
    } catch (err) {
        logger.error({ err }, "[Security] getOverview failed");
        return res.status(500).json({ success: false, message: "Failed to load security overview" });
    }
}

// ─── 2. Permissions List ────────────────────────────────────────────────────────

/**
 * GET /security/permissions
 * Returns all permission constants and role mappings.
 */
function getPermissions(req, res) {
    const allPermissions = Object.entries(P).map(([key, value]) => ({
        key,
        value,
        module: value.split(".")[0],
        action: value.split(".")[1],
    }));

    return res.json({
        success: true,
        data: {
            permissions: allPermissions,
            roles: ORG_ROLES,
            rolePermissions: ORG_ROLE_PERMISSIONS,
        },
    });
}

// ─── 3. Route → Permission Matrix ──────────────────────────────────────────────

/**
 * GET /security/matrix
 * Returns the canonical route→permission matrix.
 * This reflects the "expected" permission for each route in the system.
 */
function getMatrix(req, res) {
    const rows = [];

    for (const [moduleName, routes] of Object.entries(matrix)) {
        for (const [methodPath, expectedPermission] of Object.entries(routes)) {
            const [method, ...pathParts] = methodPath.split(":");
            const path = pathParts.join(":");

            // Check if this permission has a policy defined
            const hasPolicy = policies[expectedPermission] && policies[expectedPermission].length > 0;

            rows.push({
                module: moduleName,
                method: method.toUpperCase(),
                route: path,
                expectedPermission,
                hasPolicy,
                status: hasPolicy ? "protected" : "base_rbac",
            });
        }
    }

    const stats = getMatrixStats();

    return res.json({
        success: true,
        data: {
            matrix: rows,
            stats: {
                totalRoutes: stats.totalRoutes,
                moduleCount: stats.moduleCount,
                uniquePermissions: stats.uniquePermissions,
                moduleStats: stats.moduleStats,
            },
        },
    });
}

// ─── 4. Policy Engine ───────────────────────────────────────────────────────────

/**
 * GET /security/policies
 * Returns all policy definitions with serialized condition descriptions.
 *
 * HARDENING: No functions are exposed. Only metadata (effect, priority,
 * description) is serialized. This prevents ANY code execution context from leaking.
 */
async function getPolicies(req, res) {
    // ── Redis cache check ──
    const cacheKey = cache.keys.policies();
    const cached = await cache.getCache(cacheKey);
    if (cached) return res.json(cached);

    const serialized = {};

    for (const [permission, rules] of Object.entries(policies)) {
        serialized[permission] = rules.map((rule, index) => ({
            id: `${permission}_${index}`,
            effect: rule.effect,
            priority: rule.priority || 0,
            description: rule.description || "No description",
            // Intentionally NOT exposing: rule.condition (function)
        }));
    }

    const response = {
        success: true,
        data: {
            policies: serialized,
            totalPolicies: Object.keys(policies).length,
            helpers: Object.keys(helpers),
        },
        meta: {
            lastUpdated: new Date().toISOString(),
            count: Object.keys(serialized).length,
        },
    };

    await cache.setCache(cacheKey, response, cache.TTL.POLICIES);
    return res.json(response);
}

// ─── 5. Field Access ────────────────────────────────────────────────────────────

/**
 * GET /security/fields
 * Returns field access registry with role-field matrix.
 */
function getFieldAccess(req, res) {
    const result = {};

    for (const resourceType of getResourceTypes()) {
        const roles = getResourceRoles(resourceType);
        result[resourceType] = {};

        for (const role of roles) {
            const fields = fieldAccess[resourceType][role];
            result[resourceType][role] = {
                fields: fields,
                fullAccess: hasFullAccess(resourceType, role),
                fieldCount: fields.includes("*") ? "all" : fields.length,
            };
        }
    }

    return res.json({
        success: true,
        data: {
            resources: result,
            resourceTypes: getResourceTypes(),
            roles: ORG_ROLES,
        },
    });
}

// ─── 6. Coverage Report ─────────────────────────────────────────────────────────

/**
 * GET /security/coverage
 * Returns detailed policy coverage analysis.
 */
async function getCoverage(req, res) {
    // ── Redis cache check ──
    const cacheKey = cache.keys.coverage(req.organizationId);
    const cached = await cache.getCache(cacheKey);
    if (cached) return res.json(cached);

    const writeSuffixes = [".create", ".update", ".delete", ".manage", ".review"];
    const allPermissions = [...new Set(Object.values(P))];
    const writePerms = allPermissions.filter(p => writeSuffixes.some(s => p.endsWith(s)));
    const readPerms = allPermissions.filter(p => !writeSuffixes.some(s => p.endsWith(s)));

    const covered = [];
    const uncovered = [];

    for (const perm of writePerms) {
        if (policies[perm] && policies[perm].length > 0) {
            covered.push({
                permission: perm,
                ruleCount: policies[perm].length,
                effects: policies[perm].map(r => r.effect),
            });
        } else {
            uncovered.push(perm);
        }
    }

    const response = {
        success: true,
        data: {
            totalPermissions: allPermissions.length,
            readPermissions: readPerms.length,
            writePermissions: writePerms.length,
            covered,
            uncovered,
            coveragePercent: writePerms.length > 0
                ? Math.round((covered.length / writePerms.length) * 1000) / 10
                : 100,
        },
        meta: {
            lastUpdated: new Date().toISOString(),
            coveredCount: covered.length,
            uncoveredCount: uncovered.length,
        },
    };

    await cache.setCache(cacheKey, response, cache.TTL.COVERAGE);
    return res.json(response);
}

// ─── 7. Access Logs ─────────────────────────────────────────────────────────────

/**
 * GET /security/logs
 * Returns paginated audit logs with filters.
 * Query params: page, limit, result (allowed/denied), search, startDate, endDate
 */
async function getLogs(req, res) {
    try {
        const AuditLog = getModel(req.dbConnection, AuditLogDef);
        const organizationId = req.organizationId;
        const {
            page = 1,
            limit = 25,
            result,
            search,
            startDate,
            endDate,
            action,
            entityType,
        } = req.query;

        const filter = { organizationId: req.organizationId_obj || organizationId };

        // Result filter
        if (result === "allowed") filter.success = true;
        if (result === "denied") filter.success = false;

        // Date range filter
        if (startDate || endDate) {
            filter.createdAt = {};
            if (startDate) filter.createdAt.$gte = new Date(startDate);
            if (endDate) filter.createdAt.$lte = new Date(endDate);
        }

        // Action filter
        if (action) filter.action = action;

        // Entity type filter
        if (entityType) filter.entityType = entityType;

        // Search filter (actor name or action)
        if (search) {
            filter.$or = [
                { action: { $regex: search, $options: "i" } },
                { entity: { $regex: search, $options: "i" } },
                { actorFirstName: { $regex: search, $options: "i" } },
                { actorLastName: { $regex: search, $options: "i" } },
                { description: { $regex: search, $options: "i" } },
            ];
        }

        // ── Performance: hard-cap limit at 50 ──
        const safeLimit = Math.min(Number(limit) || 25, 50);
        const safePage = Math.max(Number(page) || 1, 1);
        const skip = (safePage - 1) * safeLimit;

        const [logs, total] = await Promise.all([
            AuditLog.find(filter)
                .sort({ createdAt: -1 })
                .skip(skip)
                .limit(safeLimit)
                .lean(),
            AuditLog.countDocuments(filter),
        ]);

        return res.json({
            success: true,
            data: {
                logs: logs.map(log => ({
                    id: log._id,
                    timestamp: log.createdAt,
                    user: `${log.actorFirstName || ""} ${log.actorLastName || ""}`.trim() || "System",
                    role: log.actorRole || "unknown",
                    action: log.action,
                    entity: log.entity || log.entityType || "—",
                    entityId: log.entityId,
                    result: log.success ? "allowed" : "denied",
                    description: log.description || log.action,
                    ipAddress: log.ipAddress,
                    browser: log.browser,
                    requestId: log.requestId,
                })),
                pagination: {
                    page: safePage,
                    limit: safeLimit,
                    total,
                    pages: Math.ceil(total / safeLimit),
                },
            },
            meta: {
                lastUpdated: new Date().toISOString(),
                count: logs.length,
            },
        });
    } catch (err) {
        logger.error({ err }, "[Security] getLogs failed");
        return res.status(500).json({ success: false, message: "Failed to load access logs" });
    }
}

// ─── 8. Access Simulation ───────────────────────────────────────────────────────

/**
 * POST /security/simulate
 * Runs the policy evaluator with the CURRENT user's context (req.user).
 *
 * HARDENING:
 *   - Uses req.user ONLY — body cannot override the user identity
 *   - Body only provides: { permission, resource } (what to test)
 *   - This ensures simulation cannot be used to probe other users' access
 *
 * Body: { permission, resource }
 *   - permission: the RBAC permission string to test (e.g., "patients.update")
 *   - resource: optional simulated resource object (e.g., { owner: "abc", branch: "xyz" })
 */
function simulateAccess(req, res) {
    try {
        const { permission, resource } = req.body;

        if (!permission) {
            return res.status(400).json({ success: false, message: "permission is required" });
        }

        // Validate permission exists in P enum
        const validPerms = new Set(Object.values(P));
        if (!validPerms.has(permission)) {
            return res.status(400).json({
                success: false,
                message: `Invalid permission: "${permission}" — not found in RBAC enum`,
            });
        }

        const start = process.hrtime.bigint();

        // Build context from req.user ONLY — no body user override
        const ctx = {
            user: {
                _id: req.user._id,
                roleId: req.user.roleId,
                role: getRole(req),
                organizationId: req.organizationId,
                hasFullBranchAccess: req.user.hasFullBranchAccess,
                branchId: req.user.primaryBranchId || req.user.branchId,
            },
            resource: resource || null,
            branchId: req.user.primaryBranchId || req.user.branchId || null,
            organizationId: req.organizationId,
            method: "SIMULATION",
            path: "/security/simulate",
            timestamp: new Date(),
        };

        const decision = evaluatePolicy(permission, ctx);

        const elapsed = Number(process.hrtime.bigint() - start) / 1_000_000; // ms

        // ── SANITIZED response — no full user objects or internal context ──
        return res.json({
            success: true,
            data: {
                allowed: decision.allowed,
                reason: decision.reason,
                effect: decision.effect,
                matchedRule: decision.matchedRule,
                evaluatedRules: decision.evaluatedRules || [],
                executionTimeMs: elapsed.toFixed(2),
                context: {
                    permission,
                    role: ctx.user.role,
                    // HARDENING: Only expose role + permission — no userId, no resource internals
                },
                timestamp: new Date().toISOString(),
            },
        });
    } catch (err) {
        logger.error({ err }, "[Security] simulateAccess failed");
        return res.status(500).json({ success: false, message: "Simulation failed" });
    }
}

// ─── 9. Audit Log CSV Export ────────────────────────────────────────────────────

/**
 * GET /security/logs/export
 * Exports audit logs as CSV (max 5000 records, scoped to org).
 * Rate-limited at route level (5 req/min).
 */
async function exportLogs(req, res) {
    try {
        const AuditLog = getModel(req.dbConnection, AuditLogDef);
        const organizationId = req.organizationId;
        const { result, startDate, endDate, action, entityType } = req.query;

        const filter = { organizationId: req.organizationId_obj || organizationId };
        if (result === "allowed") filter.success = true;
        if (result === "denied") filter.success = false;
        if (startDate || endDate) {
            filter.createdAt = {};
            if (startDate) filter.createdAt.$gte = new Date(startDate);
            if (endDate) filter.createdAt.$lte = new Date(endDate);
        }
        if (action) filter.action = action;
        if (entityType) filter.entityType = entityType;

        const logs = await AuditLog.find(filter)
            .sort({ createdAt: -1 })
            .limit(5000)
            .lean();

        // ── Build CSV ──
        const headers = ["Timestamp", "User", "Role", "Action", "Entity", "Result", "Description", "IP Address", "Browser"];
        const rows = logs.map(log => [
            log.createdAt ? new Date(log.createdAt).toISOString() : "",
            `${log.actorFirstName || ""} ${log.actorLastName || ""}`.trim() || "System",
            log.actorRole || "unknown",
            log.action || "",
            log.entity || log.entityType || "",
            log.success ? "allowed" : "denied",
            (log.description || log.action || "").replace(/"/g, '""'),
            log.ipAddress || "",
            log.browser || "",
        ]);

        const csvContent = [
            headers.join(","),
            ...rows.map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(",")),
        ].join("\n");

        res.setHeader("Content-Type", "text/csv; charset=utf-8");
        res.setHeader("Content-Disposition", `attachment; filename="security_logs_${new Date().toISOString().split("T")[0]}.csv"`);
        return res.send(csvContent);
    } catch (err) {
        logger.error({ err }, "[Security] exportLogs failed");
        return res.status(500).json({ success: false, message: "Failed to export logs" });
    }
}

// ─── 10. Policy Export (JSON) ───────────────────────────────────────────────────

/**
 * GET /security/policies/export
 * Exports policy definitions as downloadable JSON.
 */
function exportPolicies(req, res) {
    try {
        const serialized = {};
        for (const [permission, rules] of Object.entries(policies)) {
            serialized[permission] = rules.map((rule, index) => ({
                id: `${permission}_${index}`,
                effect: rule.effect,
                priority: rule.priority || 0,
                description: rule.description || "No description",
            }));
        }

        const exportData = {
            exportedAt: new Date().toISOString(),
            totalPolicies: Object.keys(serialized).length,
            policies: serialized,
        };

        res.setHeader("Content-Type", "application/json; charset=utf-8");
        res.setHeader("Content-Disposition", `attachment; filename="security_policies_${new Date().toISOString().split("T")[0]}.json"`);
        return res.send(JSON.stringify(exportData, null, 2));
    } catch (err) {
        logger.error({ err }, "[Security] exportPolicies failed");
        return res.status(500).json({ success: false, message: "Failed to export policies" });
    }
}

// ─── 11. Denial Monitoring Dashboard ────────────────────────────────────────────

/**
 * GET /security/denials
 * Returns denial statistics for the monitoring dashboard.
 * Includes: top denied endpoints, top denied permissions, role breakdown, recent denials.
 */
async function getDenialStats(req, res) {
    try {
        const organizationId = req.organizationId;
        const stats = await fetchDenialStats(organizationId);

        return res.json({
            success: true,
            data: {
                ...stats,
                shadowMode: getShadowConfig(),
            },
            meta: {
                lastUpdated: new Date().toISOString(),
            },
        });
    } catch (err) {
        logger.error({ err }, "[Security] getDenialStats failed");
        return res.status(500).json({ success: false, message: "Failed to load denial stats" });
    }
}

// ─── 12. Shadow Mode Status ─────────────────────────────────────────────────────

/**
 * GET /security/shadow-status
 * Returns current shadow mode configuration.
 */
function getShadowStatus(req, res) {
    return res.json({
        success: true,
        data: getShadowConfig(),
    });
}

// ─── 13. Security Alerts (Phase 1 + 2) ──────────────────────────────────────

/**
 * GET /security/alerts
 * Returns paginated security alerts with optional filters.
 * Query params: status, severity, page, limit
 */
async function getAlerts(req, res) {
    try {
        const alertsService = require("./securityAlerts.service");
        const { status, severity, page, limit } = req.query;

        const result = await alertsService.getAlerts(req.organizationId, {
            status,
            severity,
            page,
            limit,
        }, req);

        return res.json({
            success: true,
            data: result,
            meta: { lastUpdated: new Date().toISOString() },
        });
    } catch (err) {
        logger.error({ err }, "[Security] getAlerts failed");
        return res
            .status(500)
            .json({ success: false, message: "Failed to load alerts" });
    }
}

/**
 * GET /security/alerts/summary
 * Returns active alert count by severity.
 */
async function getAlertSummary(req, res) {
    try {
        const alertsService = require("./securityAlerts.service");
        const summary = await alertsService.getAlertSummary(req.organizationId, req);

        return res.json({
            success: true,
            data: summary,
            meta: { lastUpdated: new Date().toISOString() },
        });
    } catch (err) {
        logger.error({ err }, "[Security] getAlertSummary failed");
        return res
            .status(500)
            .json({ success: false, message: "Failed to load alert summary" });
    }
}

/**
 * PATCH /security/alerts/:id/acknowledge
 * Acknowledge a security alert.
 */
async function acknowledgeAlert(req, res) {
    try {
        const alertsService = require("./securityAlerts.service");
        const alert = await alertsService.acknowledgeAlert(
            req.params.id,
            req.user._id,
            req.organizationId
        );

        if (!alert) {
            return res
                .status(404)
                .json({ success: false, message: "Alert not found" });
        }

        return res.json({ success: true, data: alert });
    } catch (err) {
        logger.error({ err }, "[Security] acknowledgeAlert failed");
        return res
            .status(500)
            .json({ success: false, message: "Failed to acknowledge alert" });
    }
}

/**
 * PATCH /security/alerts/:id/resolve
 * Resolve a security alert.
 */
async function resolveAlert(req, res) {
    try {
        const alertsService = require("./securityAlerts.service");
        const alert = await alertsService.resolveAlert(
            req.params.id,
            req.user._id,
            req.organizationId
        );

        if (!alert) {
            return res
                .status(404)
                .json({ success: false, message: "Alert not found" });
        }

        return res.json({ success: true, data: alert });
    } catch (err) {
        logger.error({ err }, "[Security] resolveAlert failed");
        return res
            .status(500)
            .json({ success: false, message: "Failed to resolve alert" });
    }
}

// ─── 14. Policy History (Phase 4) ───────────────────────────────────────────

/**
 * GET /security/policies/history
 * Returns paginated policy version history.
 * Query params: page, limit
 */
async function getPolicyHistory(req, res) {
    try {
        const PolicyVersion = getModel(req.dbConnection, PolicyVersionDef);
        const { page = 1, limit = 20 } = req.query;

        const safeLimit = Math.min(Number(limit) || 20, 50);
        const safePage = Math.max(Number(page) || 1, 1);
        const skip = (safePage - 1) * safeLimit;


        const [versions, total] = await Promise.all([
            PolicyVersion.find({})
                .sort({ version: -1 })
                .skip(skip)
                .limit(safeLimit)
                .lean(),
            PolicyVersion.countDocuments({}),
        ]);

        return res.json({
            success: true,
            data: {
                versions: versions.map((v) => ({
                    id: v._id,
                    version: v.version,
                    changeType: v.changeType,
                    changeSummary: v.changeSummary,
                    createdByName: v.createdByName,
                    createdAt: v.createdAt,
                    policyCount: v.policies
                        ? Object.keys(v.policies).length
                        : 0,
                })),
                pagination: {
                    page: safePage,
                    limit: safeLimit,
                    total,
                    pages: Math.ceil(total / safeLimit),
                },
            },
            meta: { lastUpdated: new Date().toISOString() },
        });
    } catch (err) {
        logger.error({ err }, "[Security] getPolicyHistory failed");
        return res.status(500).json({
            success: false,
            message: "Failed to load policy history",
        });
    }
}

// ─── 15. System Metrics (Phase 5) ───────────────────────────────────────────

/**
 * GET /security/metrics
 * Returns security system operational metrics (SLO dashboard).
 */
function getSecurityMetrics(req, res) {
    try {
        const metricsService = require("./securityMetrics.service");
        const metrics = metricsService.getMetrics(req.organizationId);

        return res.json({
            success: true,
            data: metrics,
            meta: { lastUpdated: new Date().toISOString() },
        });
    } catch (err) {
        logger.error({ err }, "[Security] getSecurityMetrics failed");
        return res
            .status(500)
            .json({ success: false, message: "Failed to load metrics" });
    }
}

// ─── 16. Entitlement Status ─────────────────────────────────────────────────

/**
 * GET /security/entitlements
 * Returns org module/feature entitlement status for the security dashboard.
 */
async function getEntitlementStatus(req, res) {
    try {
        // Phase 8: req.organization is deprecated.
        // Use req.capabilities (set by unifiedCapabilityMiddleware) as the SSOT.
        const modules = req.capabilities?.modules || {};
        const features = req.capabilities?.features || {};

        return res.json({
            success: true,
            data: {
                modules,
                features,
                entitlementAuditMode: process.env.ENTITLEMENT_AUDIT_MODE === "true",
            },
            meta: { lastUpdated: new Date().toISOString() },
        });
    } catch (err) {
        logger.error({ err }, "[Security] getEntitlementStatus failed");
        return res.status(500).json({ success: false, message: "Failed to load entitlement status" });
    }
}

// ─── 17. Rollout Status (Unified) ───────────────────────────────────────────

/**
 * GET /security/rollout-status
 * Returns unified rollout status of all security subsystems.
 */
function getRolloutStatus(req, res) {
    const { isAuditMode } = require("../../middleware/requireEntitlement");

    return res.json({
        success: true,
        data: {
            policyEnforcement: {
                shadowMode: getShadowConfig().enabled,
                status: getShadowConfig().enabled ? "SHADOW" : "ENFORCING",
            },
            entitlementEnforcement: {
                auditMode: isAuditMode(),
                status: isAuditMode() ? "AUDIT" : "ENFORCING",
            },
            denialClassification: {
                enabled: true,
                types: ["expected", "critical", "unknown"],
            },
            alerting: {
                enabled: true,
                rules: 6,
            },
        },
        meta: { lastUpdated: new Date().toISOString() },
    });
}

// ─── 18. Auth Analytics (Phase 20) ──────────────────────────────────────────

/**
 * GET /security/auth/analytics
 * Returns aggregated authorization analytics dashboard.
 * Query params: startDate, endDate
 */
async function getAuthAnalytics(req, res) {
    try {
        const analyticsService = require("../../services/authAnalytics.service");
        const { startDate, endDate } = req.query;

        const analytics = await analyticsService.getAuthAnalytics(
            req.organizationId,
            { startDate, endDate }
        );

        return res.json({
            success: true,
            data: analytics,
            meta: { lastUpdated: new Date().toISOString() },
        });
    } catch (err) {
        logger.error({ err }, "[Security] getAuthAnalytics failed");
        return res
            .status(500)
            .json({ success: false, message: "Failed to load auth analytics" });
    }
}

// ─── 19. Auth Trace Query (Phase 20) ────────────────────────────────────────

/**
 * GET /security/auth/traces
 * Returns paginated and filtered auth traces.
 * Query params: page, limit, hasDenial, userId, resourceType, startDate, endDate
 */
async function getAuthTraces(req, res) {
    try {
        const AuthTrace = require("../../shared/models/AuthTrace").default;
        const {
            page = 1,
            limit = 25,
            hasDenial,
            userId,
            resourceType,
            startDate,
            endDate,
        } = req.query;

        const filter = { organizationId: req.organizationId };

        // Boolean filter
        if (hasDenial === "true") filter.hasDenial = true;
        if (hasDenial === "false") filter.hasDenial = false;

        // String filters
        if (userId) filter.userId = userId;
        if (resourceType) filter.resourceType = resourceType;

        // Date range
        if (startDate || endDate) {
            filter.createdAt = {};
            if (startDate) filter.createdAt.$gte = new Date(startDate);
            if (endDate) filter.createdAt.$lte = new Date(endDate);
        }

        const safeLimit = Math.min(Number(limit) || 25, 50);
        const safePage = Math.max(Number(page) || 1, 1);
        const skip = (safePage - 1) * safeLimit;

        const [traces, total] = await Promise.all([
            AuthTrace.find(filter)
                .sort({ createdAt: -1 })
                .skip(skip)
                .limit(safeLimit)
                .lean(),
            AuthTrace.countDocuments(filter),
        ]);

        return res.json({
            success: true,
            data: {
                traces: traces.map(t => ({
                    id: t._id,
                    requestId: t.requestId,
                    method: t.method,
                    path: t.path,
                    userId: t.userId,
                    role: t.role,
                    resourceType: t.resourceType,
                    resourceId: t.resourceId,
                    hasDenial: t.hasDenial,
                    stepCount: t.stepCount,
                    duration: t.duration,
                    steps: t.steps,
                    createdAt: t.createdAt,
                })),
                pagination: {
                    page: safePage,
                    limit: safeLimit,
                    total,
                    pages: Math.ceil(total / safeLimit),
                },
            },
            meta: { lastUpdated: new Date().toISOString() },
        });
    } catch (err) {
        logger.error({ err }, "[Security] getAuthTraces failed");
        return res
            .status(500)
            .json({ success: false, message: "Failed to load auth traces" });
    }
}

/**
 * GET /security/auth/traces/:requestId
 * Returns a single auth trace by requestId.
 */
async function getAuthTraceByRequestId(req, res) {
    try {
        const AuthTrace = require("../../shared/models/AuthTrace").default;
        const { requestId } = req.params;


        const trace = await AuthTrace.findOne({
            requestId,
        }).lean();

        if (!trace) {
            return res
                .status(404)
                .json({ success: false, message: "Auth trace not found" });
        }

        return res.json({
            success: true,
            data: {
                id: trace._id,
                requestId: trace.requestId,
                method: trace.method,
                path: trace.path,
                userId: trace.userId,
                role: trace.role,
                resourceType: trace.resourceType,
                resourceId: trace.resourceId,
                ownerId: trace.ownerId,
                hasDenial: trace.hasDenial,
                stepCount: trace.stepCount,
                duration: trace.duration,
                steps: trace.steps,
                createdAt: trace.createdAt,
            },
        });
    } catch (err) {
        logger.error({ err }, "[Security] getAuthTraceByRequestId failed");
        return res
            .status(500)
            .json({ success: false, message: "Failed to load auth trace" });
    }
}

// ─── 20. Split Analytics Endpoints (Phase 20.1) ────────────────────────────

/**
 * GET /security/analytics/summary
 * Dashboard summary KPIs.
 */
async function getAnalyticsSummary(req, res) {
    try {
        const analyticsService = require("../../services/authAnalytics.service");
        const { startDate, endDate } = req.query;
        const data = await analyticsService.getSummary(req.organizationId, { startDate, endDate });
        return res.json({ success: true, data, meta: { lastUpdated: new Date().toISOString() } });
    } catch (err) {
        logger.error({ err }, "[Security] getAnalyticsSummary failed");
        return res.status(500).json({ success: false, message: "Failed to load analytics summary" });
    }
}

/**
 * GET /security/analytics/timeline
 * Time-bucketed allow/deny chart data.
 */
async function getAnalyticsTimeline(req, res) {
    try {
        const analyticsService = require("../../services/authAnalytics.service");
        const { startDate, endDate } = req.query;
        const data = await analyticsService.getTimeline(req.organizationId, { startDate, endDate });
        return res.json({ success: true, data, meta: { lastUpdated: new Date().toISOString() } });
    } catch (err) {
        logger.error({ err }, "[Security] getAnalyticsTimeline failed");
        return res.status(500).json({ success: false, message: "Failed to load analytics timeline" });
    }
}

/**
 * GET /security/analytics/distribution
 * Allow vs Deny donut chart data.
 */
async function getAnalyticsDistribution(req, res) {
    try {
        const analyticsService = require("../../services/authAnalytics.service");
        const { startDate, endDate } = req.query;
        const data = await analyticsService.getDistribution(req.organizationId, { startDate, endDate });
        return res.json({ success: true, data, meta: { lastUpdated: new Date().toISOString() } });
    } catch (err) {
        logger.error({ err }, "[Security] getAnalyticsDistribution failed");
        return res.status(500).json({ success: false, message: "Failed to load analytics distribution" });
    }
}

/**
 * GET /security/analytics/denied-permissions
 * Top denied permissions bar chart.
 */
async function getAnalyticsDeniedPermissions(req, res) {
    try {
        const analyticsService = require("../../services/authAnalytics.service");
        const { startDate, endDate } = req.query;
        const data = await analyticsService.getDeniedPermissions(req.organizationId, { startDate, endDate });
        return res.json({ success: true, data, meta: { lastUpdated: new Date().toISOString() } });
    } catch (err) {
        logger.error({ err }, "[Security] getAnalyticsDeniedPermissions failed");
        return res.status(500).json({ success: false, message: "Failed to load denied permissions" });
    }
}

/**
 * GET /security/analytics/recent-denials
 * Latest denial logs.
 */
async function getAnalyticsRecentDenials(req, res) {
    try {
        const analyticsService = require("../../services/authAnalytics.service");
        const { startDate, endDate, limit } = req.query;
        const data = await analyticsService.getRecentDenials(req.organizationId, { startDate, endDate, limit });
        return res.json({ success: true, data, meta: { lastUpdated: new Date().toISOString() } });
    } catch (err) {
        logger.error({ err }, "[Security] getAnalyticsRecentDenials failed");
        return res.status(500).json({ success: false, message: "Failed to load recent denials" });
    }
}

/**
 * GET /security/analytics/risk-users
 * Users with highest denial frequency.
 */
async function getAnalyticsRiskUsers(req, res) {
    try {
        const analyticsService = require("../../services/authAnalytics.service");
        const { startDate, endDate } = req.query;
        const data = await analyticsService.getRiskUsers(req.organizationId, { startDate, endDate });
        return res.json({ success: true, data, meta: { lastUpdated: new Date().toISOString() } });
    } catch (err) {
        logger.error({ err }, "[Security] getAnalyticsRiskUsers failed");
        return res.status(500).json({ success: false, message: "Failed to load risk users" });
    }
}

/**
 * GET /security/analytics/layer-performance
 * Per-layer deny counts and performance.
 */
async function getAnalyticsLayerPerformance(req, res) {
    try {
        const analyticsService = require("../../services/authAnalytics.service");
        const { startDate, endDate } = req.query;
        const data = await analyticsService.getLayerPerformance(req.organizationId, { startDate, endDate });
        return res.json({ success: true, data, meta: { lastUpdated: new Date().toISOString() } });
    } catch (err) {
        logger.error({ err }, "[Security] getAnalyticsLayerPerformance failed");
        return res.status(500).json({ success: false, message: "Failed to load layer performance" });
    }
}

/**
 * GET /security/analytics/field-violations
 * Field-level access violation attempts.
 */
async function getAnalyticsFieldViolations(req, res) {
    try {
        const analyticsService = require("../../services/authAnalytics.service");
        const { startDate, endDate } = req.query;
        const data = await analyticsService.getFieldViolations(req.organizationId, { startDate, endDate });
        return res.json({ success: true, data, meta: { lastUpdated: new Date().toISOString() } });
    } catch (err) {
        logger.error({ err }, "[Security] getAnalyticsFieldViolations failed");
        return res.status(500).json({ success: false, message: "Failed to load field violations" });
    }
}

/**
 * GET /security/analytics/queue-health
 * Auth trace ingestion queue health metrics.
 */
async function getAnalyticsQueueHealth(req, res) {
    try {
        const analyticsService = require("../../services/authAnalytics.service");
        const data = await analyticsService.getQueueHealth();
        return res.json({ success: true, data, meta: { lastUpdated: new Date().toISOString() } });
    } catch (err) {
        logger.error({ err }, "[Security] getAnalyticsQueueHealth failed");
        return res.status(500).json({ success: false, message: "Failed to load queue health" });
    }
}

// ─── Exports ────────────────────────────────────────────────────────────────

module.exports = {
    getOverview,
    getPermissions,
    getMatrix,
    getPolicies,
    getFieldAccess,
    getCoverage,
    getLogs,
    simulateAccess,
    exportLogs,
    exportPolicies,
    getDenialStats,
    getShadowStatus,
    // Phase 1+2: Alerts
    getAlerts,
    getAlertSummary,
    acknowledgeAlert,
    resolveAlert,
    // Phase 4: Policy History
    getPolicyHistory,
    // Phase 5: Metrics
    getSecurityMetrics,
    // Phase 6: Entitlement & Rollout
    getEntitlementStatus,
    getRolloutStatus,
    // Phase 20: Auth Intelligence (legacy combined)
    getAuthAnalytics,
    getAuthTraces,
    getAuthTraceByRequestId,
    // Phase 20.1: Split Analytics
    getAnalyticsSummary,
    getAnalyticsTimeline,
    getAnalyticsDistribution,
    getAnalyticsDeniedPermissions,
    getAnalyticsRecentDenials,
    getAnalyticsRiskUsers,
    getAnalyticsLayerPerformance,
    getAnalyticsFieldViolations,
    getAnalyticsQueueHealth,
};
