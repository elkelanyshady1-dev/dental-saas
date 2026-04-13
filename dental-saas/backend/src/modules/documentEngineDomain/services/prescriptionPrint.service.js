/**
 * prescriptionPrint.service.js
 * Document Engine — Prescription Print Orchestrator
 *
 * @per-org-transactional — Orchestration-only service.
 * Composes data from RLS-compliant projections and templateService.
 * Direct PrintSetting/PrintLog queries include explicit organizationId from req.
 * No CRUD on tenant data — delegates to already-secured sub-services.
 */
"use strict";

const clinicalProjection = require("../../../projections/clinical/clinical.projection");
const templateService = require("./template.service");
const documentRenderService = require("./documentRender.service");
const PrintSettingDef = require("../models/printSetting.model");
const PrintLogDef = require("../models/printLog.model");
const getModel = require("../../../core/db/getModel");
const { getRole } = require("@utils/auth/getRole");

class PrescriptionPrintService {
    /**
     * printPrescription({ prescriptionId, req })
     * Orchestrates the printing flow for a medical prescription.
     */
    async printPrescription({ prescriptionId, req }) {
        const { organizationId } = req;
        const PrintSetting = getModel(req.dbConnection, PrintSettingDef);
        const PrintLog = getModel(req.dbConnection, PrintLogDef);

        // STEP 1 — Role Validation (DOCTOR ONLY)
        if (!req.user || getRole(req) !== "doctor") {
            throw new Error("Unauthorized: Only doctors are allowed to print prescriptions.");
        }

        // STEP 2 — Fetch Prescription Data via Projection
        const prescriptionData = await clinicalProjection.buildPrescriptionView({
            prescriptionId,
            organizationId,
            dbConnection: req.dbConnection,
        });

        // STEP 3 — Fetch Print Settings (per-org DB: no organizationId filter needed)
        const printSetting = await PrintSetting.findOne({
            branchId: req.branchId || null // Use current context branch
        }).lean() || await PrintSetting.findOne({ branchId: null }).lean();

        // STEP 4 — Fetch Active Template
        const activeTemplate = await templateService.getActiveTemplate(
            "PRESCRIPTION",
            req.branchId || null
        );

        if (!activeTemplate) {
            throw new Error("No active prescription template found for this organization/branch.");
        }

        // STEP 5 — Build Data Payload
        const renderData = {
            ...prescriptionData,
            clinicNameArabic: printSetting?.clinicNameArabic || "",
            clinicNameEnglish: printSetting?.clinicNameEnglish || "",
            addressArabic: printSetting?.addressArabic || "",
            addressEnglish: printSetting?.addressEnglish || "",
            phone: printSetting?.phone || "",
            taxId: printSetting?.taxId || "",
            licenseNumber: printSetting?.licenseNumber || "",
            logoUrl: printSetting?.logoUrl || "",
            // Use doctor-specific signature from settings if projection missing it
            doctorSignature: prescriptionData.doctorSignature || printSetting?.doctorSignatureUrl || ""
        };

        // STEP 6 — Render PDF
        const pdfBuffer = await documentRenderService.renderDocument({
            htmlTemplate: activeTemplate.htmlTemplate,
            cssTemplate: activeTemplate.cssTemplate,
            data: renderData,
            paperSize: activeTemplate.paperSize,
            overlaySettings: activeTemplate.layoutType === "OVERLAY" ? activeTemplate.overlaySettings : {},
            languageMode: activeTemplate.languageMode
        });

        // STEP 7 — Create PrintLog Entry
        await PrintLog.create({
            branchId: req.branchId || null,
            documentType: "PRESCRIPTION",
            documentId: prescriptionId,
            templateVersionId: activeTemplate._id,
            printedByUserId: req.user._id,
            printedAt: new Date(),
            printerType: "PDF",
            paperSize: activeTemplate.paperSize
        });

        return pdfBuffer;
    }
}

module.exports = new PrescriptionPrintService();
