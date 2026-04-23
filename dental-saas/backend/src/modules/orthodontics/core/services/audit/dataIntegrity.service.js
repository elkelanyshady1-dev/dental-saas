/**
 * dataIntegrity.service.js
 * Domain: orthodontic-cases
 * Layer: Services > Audit
 *
 * Checks referential integrity between:
 *   VisitRecord ←→ ClinicalSnapshot
 *   CasePhase ←→ OrthodonticCase
 *
 * CRITICAL CORRECTION FROM PROMPT:
 *   Prompt checked: snapshot.visitId === visit._id
 *   INCORRECT — ClinicalSnapshot has NO visitId field.
 *   The correct direction is:
 *     VisitRecord.snapshotId → ClinicalSnapshot._id (forward ref)
 *
 * SAFETY:
 *   Runs with limit (max 500 checks per collection) to avoid memory exhaustion.
 *   Audit is READ-ONLY — no writes, no mutations.
 *
 * MULTI-TENANCY:
 *   Uses req.dbConnection + req.context.organizationId.
 *   Scopes all queries to the org's isolated database.
 */

"use strict";

const getModel           = require("../../../../../core/db/getModel");
const OrthodonticCaseDef = require("../../../models/orthodonticCase.model");
const CasePhaseDef       = require("../../../models/CasePhase.model");
const VisitRecordDef     = require("../../../models/VisitRecord.model");
const SnapshotDef        = require("../../../models/ClinicalSnapshot.model");

const AUDIT_LIMIT = 500; // max documents to check per collection

function check(name, passed, detail) {
    return { name, passed, detail: detail ?? (passed ? "OK" : "FAILED") };
}

// ─────────────────────────────────────────────────────────────────────────────
// VisitRecord → ClinicalSnapshot integrity
// ─────────────────────────────────────────────────────────────────────────────

async function checkVisitSnapshotIntegrity(req) {
    const results = [];
    const VisitRecord      = getModel(req.dbConnection, VisitRecordDef);
    const ClinicalSnapshot = getModel(req.dbConnection, SnapshotDef);

    const visits = await VisitRecord.find({
        })
    .select("_id snapshotId caseId visitNumber")
    .limit(AUDIT_LIMIT)
    .lean();

    results.push(check(
        `VisitRecord collection accessible (${visits.length} records scanned)`,
        true,
        `Checked ${visits.length} records`
    ));

    for (const visit of visits) {
        // 1. Every VisitRecord MUST have a snapshotId
        if (!visit.snapshotId) {
            results.push(check(
                `VisitRecord ${visit._id} has snapshotId`,
                false,
                "snapshotId is null or missing — orphan visit record"
            ));
            continue;
        }

        // 2. The referenced ClinicalSnapshot must exist (ORG-SCOPED)
        const snapshot = await ClinicalSnapshot.findOne({
            _id:            visit.snapshotId,
            }).select("_id caseId").lean();

        results.push(check(
            `VisitRecord ${visit._id} → Snapshot ${visit.snapshotId} exists`,
            !!snapshot,
            snapshot ? "OK" : "BROKEN REFERENCE — snapshot not found in this org"
        ));

        // 3. Snapshot must belong to the same case as the visit
        if (snapshot && visit.caseId) {
            const caseIdMatch = snapshot.caseId?.toString() === visit.caseId.toString();
            results.push(check(
                `VisitRecord ${visit._id} and Snapshot have matching caseId`,
                caseIdMatch,
                caseIdMatch
                    ? "OK"
                    : `Mismatch: visit.caseId=${visit.caseId} ≠ snapshot.caseId=${snapshot.caseId}`
            ));
        }
    }

    return results;
}

// ─────────────────────────────────────────────────────────────────────────────
// CasePhase ←→ OrthodonticCase integrity
// ─────────────────────────────────────────────────────────────────────────────

async function checkPhaseIntegrity(req) {
    const results = [];
    const OrthodonticCase = getModel(req.dbConnection, OrthodonticCaseDef);
    const CasePhase       = getModel(req.dbConnection, CasePhaseDef);

    const cases = await OrthodonticCase.find({
        phases: { $exists: true, $ne: [] }, // only cases that have phases (Phase 3 cases)
    })
    .select("_id status phases activePhaseId")
    .limit(AUDIT_LIMIT)
    .lean();

    results.push(check(
        `OrthodonticCase collection accessible (${cases.length} cases with phases scanned)`,
        true,
        `Checked ${cases.length} cases`
    ));

    for (const orthoCase of cases) {
        const phases = await CasePhase.find({
            caseId:         orthoCase._id,
            }).select("_id order name status").lean();

        // Each case should have exactly 4 phases
        results.push(check(
            `Case ${orthoCase._id} has 4 phases`,
            phases.length === 4,
            `Found ${phases.length} phases`
        ));

        // Phases should be ordered 1–4 contiguously
        const orders = phases.map((p) => p.order).sort((a, b) => a - b);
        results.push(check(
            `Case ${orthoCase._id} phases have valid orders [1,2,3,4]`,
            JSON.stringify(orders) === "[1,2,3,4]",
            `Orders: [${orders.join(",")}]`
        ));

        // exacty one phase should be "active"
        const activePhases = phases.filter((p) => p.status === "active");
        if (orthoCase.status !== "completed" && orthoCase.status !== "cancelled") {
            results.push(check(
                `Case ${orthoCase._id} has exactly 1 active phase`,
                activePhases.length === 1,
                `Active phase count: ${activePhases.length}`
            ));
        }

        // activePhaseId should point to an actual phase
        if (orthoCase.activePhaseId) {
            const activeExists = phases.some(
                (p) => p._id.toString() === orthoCase.activePhaseId.toString()
            );
            results.push(check(
                `Case ${orthoCase._id} activePhaseId resolves to a real phase`,
                activeExists,
                activeExists ? "OK" : `activePhaseId=${orthoCase.activePhaseId} not in phases[]`
            ));
        }
    }

    return results;
}

// ─────────────────────────────────────────────────────────────────────────────
// visitNumber uniqueness within a case
// ─────────────────────────────────────────────────────────────────────────────

async function checkVisitNumberUniqueness(req) {
    const results = [];
    const VisitRecord = getModel(req.dbConnection, VisitRecordDef);

    // Use aggregation to detect duplicate visitNumbers within a case
    const duplicates = await VisitRecord.aggregate([
        { $match: { isActive: true } },
        { $group: { _id: { caseId: "$caseId", visitNumber: "$visitNumber" }, count: { $sum: 1 } } },
        { $match: { count: { $gt: 1 } } },
        { $limit: 50 },
    ]);

    results.push(check(
        "No duplicate visitNumbers within any case",
        duplicates.length === 0,
        duplicates.length > 0
            ? `Found ${duplicates.length} cases with duplicate visitNumbers`
            : "OK"
    ));

    return results;
}

// ─────────────────────────────────────────────────────────────────────────────
// checkDataIntegrity — master export
// ─────────────────────────────────────────────────────────────────────────────

async function checkDataIntegrity(req) {
    const [visitSnapshotChecks, phaseChecks, visitNumberChecks] = await Promise.all([
        checkVisitSnapshotIntegrity(req),
        checkPhaseIntegrity(req),
        checkVisitNumberUniqueness(req),
    ]);

    return [
        ...visitSnapshotChecks,
        ...phaseChecks,
        ...visitNumberChecks,
    ];
}

module.exports = { checkDataIntegrity };
