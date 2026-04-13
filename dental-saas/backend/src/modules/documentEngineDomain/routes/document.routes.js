/**
 * document.routes.js — Document Engine HTTP Exposure
 *
 * AUDIT-003 Remediation: Exposes documentEngineDomain via HTTP API.
 * Guard chain: orgProtect → requireEntitlement("documents") → requireOrgPermission → policyMiddleware
 *
 * Routes:
 *   GET  /documents/templates          — list available templates
 *   GET  /documents/templates/:id      — get single template
 *   POST /documents/templates/:id/render — render to PDF (returns buffer)
 *
 * PLANE: Org only.
 */

"use strict";

const express              = require("express");
const templateService      = require("../services/template.service");
const documentRender       = require("../services/documentRender.service");
const orgProtect           = require("@middleware/orgProtect");
const requireEntitlement   = require("@middleware/requireEntitlement");
const requireOrgPermission = require("@middleware/requireOrgPermission");
const policyMiddleware     = require("@rbac/policyMiddleware");
const { P }                = require("@rbac/orgPermissions");

const router = express.Router();

// Full guard chain on all routes
router.use(orgProtect);
router.use(requireEntitlement("documents"));

// ── Template Catalog ──────────────────────────────────────────────────────
router.get(
    "/templates",
    requireOrgPermission(P.DOCUMENTS_READ),
    policyMiddleware(P.DOCUMENTS_READ),
    async (req, res) => {
        try {
            const templates = await templateService.listTemplates(req);
            res.json({ data: templates });
        } catch (err) {
            res.status(err.statusCode || 500).json({ error: err.message });
        }
    }
);

router.get(
    "/templates/:id",
    requireOrgPermission(P.DOCUMENTS_READ),
    policyMiddleware(P.DOCUMENTS_READ),
    async (req, res) => {
        try {
            const template = await templateService.getTemplate(req, req.params.id);
            res.json({ data: template });
        } catch (err) {
            res.status(err.statusCode || 500).json({ error: err.message });
        }
    }
);

// ── Document Render ───────────────────────────────────────────────────────
router.post(
    "/templates/:id/render",
    requireOrgPermission(P.DOCUMENTS_READ),
    policyMiddleware(P.DOCUMENTS_READ),
    async (req, res) => {
        try {
            const { data = {}, paperSize = "A4", languageMode = "EN" } = req.body;

            const template = await templateService.getTemplate(req, req.params.id);

            const pdfBuffer = await documentRender.renderDocument({
                htmlTemplate: template.htmlContent,
                cssTemplate:  template.cssContent,
                data,
                paperSize,
                languageMode,
            });

            res.set("Content-Type", "application/pdf");
            res.set("Content-Disposition", `attachment; filename="document-${req.params.id}.pdf"`);
            res.send(pdfBuffer);
        } catch (err) {
            res.status(err.statusCode || 500).json({ error: err.message });
        }
    }
);

module.exports = router;
