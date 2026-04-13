/**
 * invoicePrint.service.js
 * Document Engine — Invoice Print Orchestrator
 *
 * @per-org-transactional — Orchestration-only service.
 * Composes data from RLS-compliant projections and templateService.
 * Direct PrintSetting/PrintLog queries include explicit organizationId from req.
 * No CRUD on tenant data — delegates to already-secured sub-services.
 */
"use strict";

const financialProjection = require("../../billingDomain/projections/printViews/financial.projection");
const templateService = require("./template.service");
const documentRenderService = require("./documentRender.service");
const PrintSettingDef = require("../models/printSetting.model");
const PrintLogDef = require("../models/printLog.model");
const getModel = require("../../../core/db/getModel");
const { getRole } = require("@utils/auth/getRole");

class InvoicePrintService {
    /**
     * printInvoice({ invoiceId, req })
     * Orchestrates the printing flow for an invoice.
     */
    async printInvoice({ invoiceId, req }) {
        const { organizationId } = req;
        const PrintSetting = getModel(req.dbConnection, PrintSettingDef);
        const PrintLog = getModel(req.dbConnection, PrintLogDef);

        // STEP 1 — Role Validation
        const allowedRoles = ["org_admin", "doctor", "assistant", "receptionist"];
        if (!req.user || !allowedRoles.includes(getRole(req))) {
            throw new Error("Unauthorized: Insufficient permissions to print invoices.");
        }

        // STEP 2 — Fetch Invoice Data via Projection
        const invoiceData = await financialProjection.buildInvoicePrintView({
            invoiceId,
            organizationId
        });

        // STEP 3 — Fetch Print Settings (per-org DB: no organizationId filter needed)
        const printSetting = await PrintSetting.findOne({
            branchId: invoiceId.branchId || req.branchId // Use invoice branch or context
        }).lean() || await PrintSetting.findOne({ branchId: null }).lean(); // Fallback to org default

        // STEP 4 — Fetch Active Template
        const activeTemplate = await templateService.getActiveTemplate(
            "INVOICE",
            invoiceId.branchId || null
        );

        if (!activeTemplate) {
            throw new Error("No active invoice template found for this organization/branch.");
        }

        // STEP 5 — Build Data DTO for Render
        const renderData = {
            ...invoiceData,
            clinicNameArabic: printSetting?.clinicNameArabic || "",
            clinicNameEnglish: printSetting?.clinicNameEnglish || "",
            addressArabic: printSetting?.addressArabic || "",
            addressEnglish: printSetting?.addressEnglish || "",
            phone: printSetting?.phone || "",
            taxId: printSetting?.taxId || "",
            licenseNumber: printSetting?.licenseNumber || "",
            logoUrl: printSetting?.logoUrl || "",
            voidWatermark: ""
        };

        // STEP 6 — VOID Watermark Injection
        if (invoiceData.status === "voided" && printSetting?.showWatermarkOnVoid !== false) {
            renderData.voidWatermark = `
                <div style="
                    position: absolute;
                    top: 50%;
                    left: 50%;
                    transform: translate(-50%, -50%) rotate(-45deg);
                    font-size: 150pt;
                    color: rgba(255, 0, 0, 0.2);
                    border: 15px solid rgba(255, 0, 0, 0.2);
                    padding: 20px;
                    z-index: 1000;
                    pointer-events: none;
                    font-weight: bold;
                    letter-spacing: 10px;
                ">VOID</div>
            `;

            // Append watermark to htmlTemplate body
            // activeTemplate.htmlTemplate += renderData.voidWatermark; // Risky if template is complex
            // Better: We inject it as a placeholder {{voidWatermark}} in the service
        }

        // STEP 7 — Render PDF
        const pdfBuffer = await documentRenderService.renderDocument({
            htmlTemplate: activeTemplate.htmlTemplate + (renderData.voidWatermark || ""),
            cssTemplate: activeTemplate.cssTemplate,
            data: renderData,
            paperSize: activeTemplate.paperSize,
            overlaySettings: activeTemplate.layoutType === "OVERLAY" ? activeTemplate.overlaySettings : {},
            languageMode: activeTemplate.languageMode
        });

        // STEP 8 — Create PrintLog Entry
        await PrintLog.create({
            branchId: invoiceId.branchId || req.branchId || null,
            documentType: "INVOICE",
            documentId: invoiceId,
            templateVersionId: activeTemplate._id,
            printedByUserId: req.user._id,
            printerType: "PDF",
            paperSize: activeTemplate.paperSize
        });

        return pdfBuffer;
    }
}

module.exports = new InvoicePrintService();
