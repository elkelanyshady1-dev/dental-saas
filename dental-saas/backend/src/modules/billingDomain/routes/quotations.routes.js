/**
 * quotations.routes.js
 * Billing Domain — Patient Quotation Routes
 *
 * Mounted at: /api/v1/org/quotations
 * Guards: orgProtect → organizationContext → requireEntitlement("finance") → autoAudit → requireOrgPermission → policyMiddleware
 *
 * PLANE: Organization (per-org DB)
 */

"use strict";

const express = require("express");
const router = express.Router();

const orgProtect = require("@middleware/orgProtect");
const organizationContext = require("@middleware/organizationMiddleware");
const requireOrgPermission = require("@middleware/requireOrgPermission");
const requireEntitlement = require("@middleware/requireEntitlement");
const { autoAudit } = require("@middleware/auditInterceptor");
const policyMiddleware = require("@rbac/policyMiddleware");
const validate = require("@middleware/validate");
const { P } = require("@rbac/orgPermissions");

const quotationOrchestrator = require("../organizationFinance/services/quotation.orchestrator.service");
const quotationReadService = require("../organizationFinance/services/quotation.read.service");
const {
    buildQuotationDTO,
    buildQuotationListDTO,
    envelope,
} = require("../organizationFinance/dto/quotation.dto");
const {
    createQuotationSchema,
    updateQuotationSchema,
    rejectQuotationSchema,
    convertQuotationSchema,
    parse,
} = require("../validators/quotation.validator");
const logger = require("@utils/logger");

// ─── Error → HTTP mapper ───────────────────────────────────────────
function sendError(res, err, fallbackCode) {
    if (err.name === "VersionConflictError" || err.code === "VERSION_CONFLICT") {
        return res.status(409).json({
            success: false,
            error: {
                code: "VERSION_CONFLICT",
                message: err.message || "Quotation was modified concurrently",
                currentVersion: err.currentVersion ?? null,
            },
        });
    }
    const status = err.statusCode || err.status || 400;
    return res.status(status).json({
        success: false,
        error: { code: err.code || fallbackCode, message: err.message },
    });
}

// ─── Shared middleware chain ────────────────────────────────────────
router.use(orgProtect, organizationContext, requireEntitlement("finance"), autoAudit("Quotation"));

// ─── GET / — List quotations ────────────────────────────────────────
router.get(
    "/",
    requireOrgPermission(P.QUOTATIONS_READ),
    policyMiddleware(P.QUOTATIONS_READ),
    async (req, res) => {
        try {
            const { patientId, status, branchId } = req.query;
            const filter = {};
            if (patientId) filter.patientId = patientId;
            if (branchId) filter.branchId = branchId;
            if (status) filter.status = status;

            const limit = Math.min(parseInt(req.query.limit) || 50, 200);
            const page = parseInt(req.query.page) || 1;

            const result = await quotationReadService.listQuotations(req, filter, {
                limit,
                skip: (page - 1) * limit,
            });

            return res.json(envelope({
                quotations: result.docs.map(buildQuotationListDTO),
                total: result.total,
                page,
                limit,
            }));
        } catch (err) {
            return sendError(res, err, "LIST_ERROR");
        }
    }
);

// ─── GET /:id — Get quotation detail ───────────────────────────────
router.get(
    "/:id",
    requireOrgPermission(P.QUOTATIONS_READ),
    policyMiddleware(P.QUOTATIONS_READ),
    async (req, res) => {
        try {
            const doc = await quotationReadService.getQuotationById(req, req.params.id);
            if (!doc) {
                return res.status(404).json({ success: false, error: { code: "NOT_FOUND", message: "Quotation not found" } });
            }
            return res.json(envelope(buildQuotationDTO(doc)));
        } catch (err) {
            return sendError(res, err, "GET_ERROR");
        }
    }
);

// ─── POST / — Create quotation ─────────────────────────────────────
router.post(
    "/",
    requireOrgPermission(P.QUOTATIONS_CREATE),
    policyMiddleware(P.QUOTATIONS_CREATE),
    async (req, res) => {
        try {
            const data = parse(createQuotationSchema, req.body);
            const doc = await quotationOrchestrator.createQuotation(data, req);

            logger.info(`[Quotations] Created quotation for patient ${data.patientId} in org ${req.organizationId}`);
            return res.status(201).json(envelope(buildQuotationDTO(doc)));
        } catch (err) {
            return sendError(res, err, "CREATE_ERROR");
        }
    }
);

// ─── PATCH /:id — Update quotation (draft/sent only) ───────────────
router.patch(
    "/:id",
    requireOrgPermission(P.QUOTATIONS_UPDATE),
    policyMiddleware(P.QUOTATIONS_UPDATE),
    async (req, res) => {
        try {
            const data = parse(updateQuotationSchema, req.body);
            const doc = await quotationOrchestrator.updateQuotation(req.params.id, data, req);

            return res.json(envelope(buildQuotationDTO(doc)));
        } catch (err) {
            return sendError(res, err, "UPDATE_ERROR");
        }
    }
);

// ─── POST /:id/send — Send quotation (draft → sent) ────────────────
router.post(
    "/:id/send",
    requireOrgPermission(P.QUOTATIONS_UPDATE),
    policyMiddleware(P.QUOTATIONS_UPDATE),
    async (req, res) => {
        try {
            const doc = await quotationOrchestrator.sendQuotation(req.params.id, req);
            return res.json(envelope(buildQuotationDTO(doc)));
        } catch (err) {
            return sendError(res, err, "SEND_ERROR");
        }
    }
);

// ─── POST /:id/accept — Staff verbal acceptance (sent → accepted) ──
router.post(
    "/:id/accept",
    requireOrgPermission(P.QUOTATIONS_UPDATE),
    policyMiddleware(P.QUOTATIONS_UPDATE),
    async (req, res) => {
        try {
            const doc = await quotationOrchestrator.acceptQuotation(
                req.params.id,
                { acceptedByType: "staff_verbal" },
                req
            );
            return res.json(envelope(buildQuotationDTO(doc)));
        } catch (err) {
            return sendError(res, err, "ACCEPT_ERROR");
        }
    }
);

// ─── POST /:id/reject — Reject quotation ───────────────────────────
router.post(
    "/:id/reject",
    requireOrgPermission(P.QUOTATIONS_UPDATE),
    policyMiddleware(P.QUOTATIONS_UPDATE),
    async (req, res) => {
        try {
            const data = parse(rejectQuotationSchema, req.body);
            const doc = await quotationOrchestrator.rejectQuotation(req.params.id, data.reason, req);
            return res.json(envelope(buildQuotationDTO(doc)));
        } catch (err) {
            return sendError(res, err, "REJECT_ERROR");
        }
    }
);

// ─── POST /:id/convert — Convert to invoice (accepted → converted) ─
router.post(
    "/:id/convert",
    requireOrgPermission(P.QUOTATIONS_CONVERT),
    policyMiddleware(P.QUOTATIONS_CONVERT),
    async (req, res) => {
        try {
            const data = parse(convertQuotationSchema, req.body);
            const result = await quotationOrchestrator.convertToInvoice(req.params.id, data.expectedVersion, req);

            return res.json(envelope({
                quotation: buildQuotationDTO(result.quotation),
                invoice: result.invoice,
            }));
        } catch (err) {
            return sendError(res, err, "CONVERT_ERROR");
        }
    }
);

module.exports = router;
