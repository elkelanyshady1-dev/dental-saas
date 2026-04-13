/**
 * Platform Governance Routes (Sentinel Diagnostics)
 * Non-production only — diagnostics and self-checks
 * Auto-split from platformRoutes.js
 */
const express = require("express");
const router = express.Router();
const platformProtect = require("../../middleware/platformProtect");

if (process.env.NODE_ENV !== 'production') {
    const { rbacSelfCheck } = require("../../platform/domain/controllers/platformSentinelSelfCheck.controller");

    /**
     * @swagger
     * /api/platform/__sentinel/rbac-self-check:
     *   get:
     *     summary: RBAC self-check diagnostic
     *     description: Non-production diagnostic. Verifies RBAC invariants. AUTH_ONLY.
     *     tags: [Platform Sentinel]
     *     security:
     *       - platformToken: []
     *     responses:
     *       200:
     *         description: RBAC check result
     *         content:
     *           application/json:
     *             schema:
     *               type: object
     */
    router.get("/__sentinel/rbac-self-check", platformProtect, rbacSelfCheck);

    /**
     * @swagger
     * /api/platform/__sentinel/api-integrity:
     *   get:
     *     summary: API integrity diagnostic
     *     description: Non-production diagnostic. Returns route graph summary. AUTH_ONLY.
     *     tags: [Platform Sentinel]
     *     security:
     *       - platformToken: []
     *     responses:
     *       200:
     *         description: API integrity status
     *         content:
     *           application/json:
     *             schema:
     *               type: object
     *               properties:
     *                 available:
     *                   type: boolean
     *                 totalRoutes:
     *                   type: integer
     *                 platformRoutes:
     *                   type: integer
     *                 duplicates:
     *                   type: integer
     *                 unguardedRoutes:
     *                   type: integer
     */
    // Phase 9 — API Integrity summary
    router.get("/__sentinel/api-integrity", platformProtect, (req, res) => {
        const fs = require('fs');
        const graphPath = require('path').resolve(__dirname, '../../governance/reports/routeGraph.json');

        if (!fs.existsSync(graphPath)) {
            return res.json({
                available: false,
                message: 'Run "npm run validate:api-graph" first to generate routeGraph.json'
            });
        }

        const graph = JSON.parse(fs.readFileSync(graphPath, 'utf8'));
        const platformRoutes = graph.routes.filter(r => r.fullPath.startsWith('/api/platform'));

        const unguarded = platformRoutes.filter(r =>
            !r.middleware.includes('platformProtect') &&
            !r.middleware.some(m => m.startsWith('...'))
        );

        res.json({
            available: true,
            generated: graph.generated,
            totalRoutes: graph.totalRoutes,
            platformRoutes: platformRoutes.length,
            duplicates: graph.duplicates,
            unguardedRoutes: unguarded.length,
            timestamp: new Date().toISOString()
        });
    });

    /**
     * @swagger
     * /api/platform/__sentinel/response-schema-drift:
     *   get:
     *     summary: Response schema drift diagnostic
     *     description: Non-production diagnostic. Returns schema drift status. AUTH_ONLY.
     *     tags: [Platform Sentinel]
     *     security:
     *       - platformToken: []
     *     responses:
     *       200:
     *         description: Schema drift status
     *         content:
     *           application/json:
     *             schema:
     *               type: object
     *               properties:
     *                 available:
     *                   type: boolean
     *                 controllerRoutes:
     *                   type: integer
     *                 swaggerDocumentedRoutes:
     *                   type: integer
     */
    // Phase 10 — Response Schema Drift summary
    router.get("/__sentinel/response-schema-drift", platformProtect, (req, res) => {
        const fs = require('fs');
        const shapesPath = require('path').resolve(__dirname, '../../governance/reports/controllerResponseShapes.json');
        const swaggerPath = require('path').resolve(__dirname, '../../governance/reports/swaggerResponseSchemas.json');

        if (!fs.existsSync(shapesPath) || !fs.existsSync(swaggerPath)) {
            return res.json({
                available: false,
                message: 'Run "npm run validate:response-extract" and "npm run validate:swagger-response-extract" first'
            });
        }

        const shapes = JSON.parse(fs.readFileSync(shapesPath, 'utf8'));
        const swagger = JSON.parse(fs.readFileSync(swaggerPath, 'utf8'));

        res.json({
            available: true,
            controllerRoutes: shapes.totalRoutes,
            resolvedHandlers: shapes.resolvedHandlers,
            unresolvedHandlers: shapes.unresolvedHandlers,
            swaggerDocumentedRoutes: swagger.totalDocumentedRoutes,
            swaggerWithSchema: swagger.routesWithSchema,
            timestamp: new Date().toISOString()
        });
    });

    /**
     * @swagger
     * /api/platform/__sentinel/openapi-runtime-status:
     *   get:
     *     summary: OpenAPI runtime validation status
     *     description: Non-production diagnostic. Returns OpenAPI runtime status. AUTH_ONLY.
     *     tags: [Platform Sentinel]
     *     security:
     *       - platformToken: []
     *     responses:
     *       200:
     *         description: OpenAPI runtime status
     *         content:
     *           application/json:
     *             schema:
     *               type: object
     *               properties:
     *                 enabled:
     *                   type: boolean
     *                 strictMode:
     *                   type: boolean
     *                 initialized:
     *                   type: boolean
     *                 compiledSchemas:
     *                   type: integer
     */
    // Phase 12 — Runtime OpenAPI Validation status
    router.get("/__sentinel/openapi-runtime-status", platformProtect, (req, res) => {
        const openApiValidator = require("../../platform/domain/services/platformOpenApiValidator.service");

        res.json({
            enabled: process.env.RUNTIME_OPENAPI_VALIDATION === "true",
            strictMode: process.env.OPENAPI_RUNTIME_STRICT === "true",
            initialized: openApiValidator.isInitialized,
            compiledSchemas: openApiValidator.schemaCount,
            timestamp: new Date().toISOString()
        });
    });
}

module.exports = router;
