/**
 * receiptPrint.service.js
 * Document Engine — Receipt Print Orchestrator
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
const {
  getRole
} = require("@utils/auth/getRole");
class ReceiptPrintService {
  /**
   * printReceipt({ paymentId, format, req })
   * Orchestrates the printing flow for a payment receipt.
   */
  async printReceipt({
    paymentId,
    format = "PDF",
    req
  }) {
    const {
      organizationId
    } = req;
    const PrintSetting = getModel(req.dbConnection, PrintSettingDef);
    const PrintLog = getModel(req.dbConnection, PrintLogDef);

    // STEP 1 — Role Validation
    const allowedRoles = ["org_admin", "receptionist", "assistant", "doctor"];
    if (!req.user || !allowedRoles.includes(getRole(req))) {
      throw new Error("Unauthorized: Only authorized personnel can print receipts.");
    }

    // STEP 2 — Fetch Payment Data via Projection
    const receiptData = await financialProjection.buildPaymentPrintView({
      paymentId
    });

    // STEP 3 — Fetch Print Settings (per-org DB: no organizationId filter needed)
    const printSetting = (await PrintSetting.findOne({
      branchId: req.branchId || null
    }).lean()) || (await PrintSetting.findOne({
      branchId: null
    }).lean());

    // STEP 4 — Fetch Active Template
    const activeTemplate = await templateService.getActiveTemplate("RECEIPT", req.branchId || null);
    if (!activeTemplate) {
      throw new Error("No active receipt template found for this organization/branch.");
    }

    // STEP 5 — Build Data Payload
    const renderData = {
      ...receiptData,
      clinicNameArabic: printSetting?.clinicNameArabic || "",
      clinicNameEnglish: printSetting?.clinicNameEnglish || "",
      addressArabic: printSetting?.addressArabic || "",
      addressEnglish: printSetting?.addressEnglish || "",
      phone: printSetting?.phone || "",
      taxId: printSetting?.taxId || "",
      logoUrl: printSetting?.logoUrl || ""
    };

    // STEP 6 — Determine Paper Size / Rendering Format
    let paperSize = activeTemplate.paperSize;
    if (format === "THERMAL_80MM" || activeTemplate.paperSize === "THERMAL_80MM") {
      paperSize = "THERMAL_80MM";
    }

    // STEP 7 — Render PDF
    const pdfBuffer = await documentRenderService.renderDocument({
      htmlTemplate: activeTemplate.htmlTemplate,
      cssTemplate: activeTemplate.cssTemplate,
      data: renderData,
      paperSize: paperSize,
      overlaySettings: activeTemplate.layoutType === "OVERLAY" ? activeTemplate.overlaySettings : {},
      languageMode: activeTemplate.languageMode
    });

    // STEP 8 — Create PrintLog Entry
    await PrintLog.create({
      branchId: req.branchId || null,
      documentType: "RECEIPT",
      documentId: paymentId,
      templateVersionId: activeTemplate._id,
      printedByUserId: req.user._id,
      printedAt: new Date(),
      printerType: format === "THERMAL_80MM" ? "THERMAL" : "PDF",
      paperSize: paperSize
    });
    return pdfBuffer;
  }
}
module.exports = new ReceiptPrintService();