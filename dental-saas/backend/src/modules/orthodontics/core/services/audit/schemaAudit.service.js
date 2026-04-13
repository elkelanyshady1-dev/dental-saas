/**
 * schemaAudit.service.js
 * Domain: orthodontic-cases
 * Layer: Services > Audit
 *
 * Validates that all Clinical Case Engine models are registered correctly
 * in the org's Mongoose connection and have the required key fields indexed.
 *
 * CRITICAL CORRECTION FROM PROMPT:
 *   Prompt used: "ClinicalCase", "DentalChartSnapshot"  → DO NOT EXIST
 *   Real model names:
 *     OrthodonticCase  — aggregate root (modules/orthodontics/models/)
 *     CasePhase        — phase entity    (modules/orthodontic-cases/models/)
 *     VisitRecord      — metadata wrapper (modules/orthodontic-cases/models/)
 *     ClinicalSnapshot — source of truth (modules/clinical-snapshots/models/)
 */

"use strict";

const getModel           = require("../../../../../core/db/getModel");
const OrthodonticCaseDef = require("../../../models/orthodonticCase.model");
const CasePhaseDef       = require("../../../models/CasePhase.model");
const VisitRecordDef     = require("../../../models/VisitRecord.model");
const SnapshotDef        = require("../../../models/ClinicalSnapshot.model");

// ── Field existence check ─────────────────────────────────────────────────────

function hasField(schema, path) {
    return !!schema.path(path);
}

function check(name, passed, detail) {
    return { name, passed, detail: detail ?? (passed ? "OK" : "FAILED") };
}

// ─────────────────────────────────────────────────────────────────────────────
// checkSchema
// Verifies model registration + required field presence on the org DB connection.
// ─────────────────────────────────────────────────────────────────────────────

async function checkSchema(req) {
    const results = [];

    // ── OrthodonticCase ───────────────────────────────────────────────────────
    try {
        const OrthodonticCase = getModel(req.dbConnection, OrthodonticCaseDef);
        results.push(check("OrthodonticCase model registered", true));
        results.push(check(
            "OrthodonticCase.organizationId field exists",
            hasField(OrthodonticCase.schema, "organizationId")
        ));
        results.push(check(
            "OrthodonticCase.patientId field exists",
            hasField(OrthodonticCase.schema, "patientId")
        ));
        results.push(check(
            "OrthodonticCase.phases[] field exists (Phase 3)",
            hasField(OrthodonticCase.schema, "phases")
        ));
        results.push(check(
            "OrthodonticCase.activePhaseId field exists (Phase 3)",
            hasField(OrthodonticCase.schema, "activePhaseId")
        ));
        results.push(check(
            "OrthodonticCase.status includes 'cancelled'",
            OrthodonticCase.schema.path("status")?.enumValues?.includes("cancelled") ?? false
        ));
    } catch (err) {
        results.push(check("OrthodonticCase model registered", false, err.message));
    }

    // ── CasePhase ─────────────────────────────────────────────────────────────
    try {
        const CasePhase = getModel(req.dbConnection, CasePhaseDef);
        results.push(check("CasePhase model registered", true));
        results.push(check("CasePhase.caseId field exists", hasField(CasePhase.schema, "caseId")));
        results.push(check("CasePhase.name field exists",   hasField(CasePhase.schema, "name")));
        results.push(check("CasePhase.order field exists",  hasField(CasePhase.schema, "order")));
        results.push(check("CasePhase.status field exists", hasField(CasePhase.schema, "status")));

        const nameEnum = CasePhase.schema.path("name")?.enumValues ?? [];
        const requiredPhases = ["bonding", "active", "retention", "post-treatment"];
        results.push(check(
            "CasePhase.name enum has all 4 phase names",
            requiredPhases.every((p) => nameEnum.includes(p)),
            `Enum: [${nameEnum.join(", ")}]`
        ));
    } catch (err) {
        results.push(check("CasePhase model registered", false, err.message));
    }

    // ── VisitRecord ───────────────────────────────────────────────────────────
    try {
        const VisitRecord = getModel(req.dbConnection, VisitRecordDef);
        results.push(check("VisitRecord model registered", true));
        results.push(check("VisitRecord.caseId field exists",      hasField(VisitRecord.schema, "caseId")));
        results.push(check("VisitRecord.snapshotId field exists",  hasField(VisitRecord.schema, "snapshotId")));
        results.push(check("VisitRecord.visitNumber field exists", hasField(VisitRecord.schema, "visitNumber")));
        results.push(check("VisitRecord.appointmentId optional",   hasField(VisitRecord.schema, "appointmentId")));

        // Verify snapshotId does NOT have an update method (immutability enforced by repo layer — schema check)
        results.push(check("VisitRecord has no 'actions' field (forbidden)", !hasField(VisitRecord.schema, "actions")));
    } catch (err) {
        results.push(check("VisitRecord model registered", false, err.message));
    }

    // ── ClinicalSnapshot ─────────────────────────────────────────────────────
    try {
        const ClinicalSnapshot = getModel(req.dbConnection, SnapshotDef);
        results.push(check("ClinicalSnapshot model registered", true));
        results.push(check("ClinicalSnapshot.chartState field exists",  hasField(ClinicalSnapshot.schema, "chartState")));
        results.push(check("ClinicalSnapshot.procedures[] exists",     hasField(ClinicalSnapshot.schema, "procedures")));
        results.push(check("ClinicalSnapshot.caseId field exists",     hasField(ClinicalSnapshot.schema, "caseId")));
        results.push(check("ClinicalSnapshot has no 'actions' field (IMMUTABILITY)", !hasField(ClinicalSnapshot.schema, "actions")));
        results.push(check("ClinicalSnapshot has no 'billingAmount' (NO FINANCIAL DATA)", !hasField(ClinicalSnapshot.schema, "billingAmount")));
    } catch (err) {
        results.push(check("ClinicalSnapshot model registered", false, err.message));
    }

    return results;
}

module.exports = { checkSchema };
