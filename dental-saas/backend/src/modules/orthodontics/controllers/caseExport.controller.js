/**
 * caseExport.controller.js — HTTP surface for U-CAP §5 ZIP bundle export.
 * Thin — business logic lives in caseExport.service.js.
 *
 * POST /org/orthodontic-cases/:caseId/export
 *   body: { assetIds?: string[], includeManifest?: boolean }
 *
 * Response is a streamed application/zip; the service writes into res
 * directly.
 */

"use strict";

const mongoose = require("mongoose");
const { authorize } = require("../../../utils/authorize");
const logger   = require("@utils/logger");
const { exportCaseBundle } = require("../services/caseExport.service");

async function exportCase(req, res) {
    try {
        authorize(req, "orthodontics.read");

        const { caseId } = req.params;
        if (!mongoose.isValidObjectId(caseId)) {
            return res.status(400).json({
                success: false,
                error: { code: "INVALID_ID", message: "caseId must be a valid ObjectId" },
            });
        }

        const { assetIds, includeManifest } = req.body || {};
        if (assetIds !== undefined && !Array.isArray(assetIds)) {
            return res.status(400).json({
                success: false,
                error: { code: "INVALID_ASSET_IDS", message: "assetIds must be an array (or omit for full case)" },
            });
        }

        // Attachment headers BEFORE streaming so the browser treats the
        // response as a download.
        const filename = `case-${caseId}-${new Date().toISOString().slice(0, 10)}.zip`;
        res.setHeader("Content-Type",        "application/zip");
        res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);

        // The service pipes the zip into res and resolves when finalized.
        await exportCaseBundle(
            req,
            { caseId, assetIds, includeManifest: includeManifest !== false },
            res,
        );
        // Nothing else to send — the stream already finished. Don't call
        // res.json / res.end; archiver.finalize() closes the response.
    } catch (err) {
        logger.error({
            event: "CASE_EXPORT_ERROR",
            err:   err.message,
            code:  err.code,
        }, "[caseExport.controller] failed");

        // If we already started streaming, headers are sent — just end.
        if (res.headersSent) {
            try { res.end(); } catch { /* noop */ }
            return;
        }

        return res.status(err.statusCode ?? 500).json({
            success: false,
            error: {
                code:    err.code ?? "CASE_EXPORT_ERROR",
                message: err.message,
                ...(err.details ? { details: err.details } : {}),
            },
        });
    }
}

module.exports = { exportCase };
