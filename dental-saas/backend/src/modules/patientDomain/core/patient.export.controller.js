/**
 * patient.export.controller.js — Patient CSV Export
 *
 * GET /patient/domain/internal/patients/export?format=csv
 *
 * Exports a paginated or full patient list as CSV.
 * Capped at 5000 rows to prevent memory exhaustion.
 *
 * Security: authorize(req, P.PATIENTS_READ)
 * PLANE: Org only.
 *
 * @per-org-transactional — read-only, no mutations
 */

"use strict";

const PatientDef = require("../../../organization/patient/models/patient.model");
const getModel = require("../../../core/db/getModel");
const { authorize } = require("@utils/authorize");
const { P } = require("@rbac/orgPermissions");
const { errorResponse } = require("@utils/responseFormatter");
const logger = require("@utils/logger");

const MAX_EXPORT_ROWS = 5000;

/**
 * Escape a CSV field value.
 * Wraps in quotes if it contains commas, quotes, or newlines.
 */
function csvEscape(val) {
    if (val == null) return "";
    const str = String(val);
    if (str.includes(",") || str.includes('"') || str.includes("\n")) {
        return '"' + str.replace(/"/g, '""') + '"';
    }
    return str;
}

class PatientExportController {
    /**
     * GET /patient/domain/internal/patients/export
     *
     * Query params:
     *   - format: "csv" (only supported format)
     *   - search: optional search filter
     *   - careType: optional PRIVATE|ACADEMIC filter
     */
    async exportCSV(req, res) {
        try {
            authorize(req, P.PATIENTS_READ);

            const format = req.query.format || "csv";
            if (format !== "csv") {
                return errorResponse(res, "Only CSV format is supported", "VALIDATION_ERROR", 400);
            }

            const Patient = getModel(req.dbConnection, PatientDef);

            // Build query
            const query = { isActive: true };

            // Optional careType filter
            const careType = req.query.careType;
            if (careType && ["PRIVATE", "ACADEMIC"].includes(careType)) {
                query.careType = careType;
            }

            // Optional search filter (simple name/phone)
            const search = req.query.search?.trim();
            if (search) {
                const escaped = search.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
                query.$or = [
                    { nameArabic: new RegExp(escaped, "i") },
                    { nameEnglish: new RegExp(escaped, "i") },
                    { phone: new RegExp(escaped, "i") },
                    { patientCode: new RegExp(escaped, "i") },
                ];
            }

            const patients = await Patient.find(query)
                .select("patientCode nameArabic nameEnglish phone email dateOfBirth gender address nationality insurance.provider primaryBranchId careType createdAt")
                .sort({ createdAt: -1 })
                .limit(MAX_EXPORT_ROWS)
                .lean();

            // CSV headers
            const headers = [
                "Patient Code",
                "Name (Arabic)",
                "Name (English)",
                "Phone",
                "Email",
                "Date of Birth",
                "Gender",
                "Address",
                "Nationality",
                "Insurance Provider",
                "Care Type",
                "Created At",
            ];

            // Build CSV rows
            const rows = patients.map((p) => [
                csvEscape(p.patientCode),
                csvEscape(p.nameArabic),
                csvEscape(p.nameEnglish),
                csvEscape(p.phone),
                csvEscape(p.email),
                csvEscape(p.dateOfBirth ? new Date(p.dateOfBirth).toISOString().split("T")[0] : ""),
                csvEscape(p.gender),
                csvEscape(p.address),
                csvEscape(p.nationality),
                csvEscape(p.insurance?.provider),
                csvEscape(p.careType || "PRIVATE"),
                csvEscape(p.createdAt ? new Date(p.createdAt).toISOString() : ""),
            ]);

            const csvContent = [
                headers.join(","),
                ...rows.map((r) => r.join(",")),
            ].join("\n");

            // Add BOM for Excel UTF-8 compatibility
            const bom = "\uFEFF";

            res.setHeader("Content-Type", "text/csv; charset=utf-8");
            res.setHeader("Content-Disposition", `attachment; filename="patients-export-${Date.now()}.csv"`);
            res.status(200).send(bom + csvContent);

            logger.info(
                { count: patients.length, },
                "[PatientExport] CSV export completed"
            );
        } catch (error) {
            logger.error({ err: error }, "[PatientExport] Export failed");
            return errorResponse(res, error.message, "EXPORT_FAILED", 400);
        }
    }
}

module.exports = new PatientExportController();
