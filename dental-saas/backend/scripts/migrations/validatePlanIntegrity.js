"use strict";

/**
 * validatePlanIntegrity.js — post-migration / pre-release integrity check
 *
 * Walks every OrthodonticCase in every org DB and asserts:
 *   A. At most ONE version has isApproved=true        (single-approved invariant)
 *   B. At most ONE version has isActive=true           (single-active invariant)
 *   C. case.approvedPlanVersionId points to an isApproved=true row (if set)
 *   D. case.activePlanVersionId   points to an isActive=true   row (if set)
 *   E. case.__planVersionCounter >= max(version)       (counter never regresses)
 *   F. Every non-root version has a parentVersionId pointing to a sibling
 *
 * Hardening §8.1 / §9 — run this before declaring release readiness, and
 * again after every backfill. Exit code: 0 = clean, 1 = violations found.
 *
 * Usage:
 *   node backend/scripts/migrations/validatePlanIntegrity.js
 *   node backend/scripts/migrations/validatePlanIntegrity.js --org=<id>
 *   node backend/scripts/migrations/validatePlanIntegrity.js --fail-on-warn
 */

require("dotenv").config();
require("module-alias/register"); // hardening §0 — resolve @utils/*, @core/* aliases
const mongoose = require("mongoose");

// The Organization model module exports a wrapper `{ modelName, schema, default }`.
// Destructure to the compiled model so `.find` resolves. Fail-fast below.
const { default: Organization } = require("../../src/shared/models/Organization");
const dbManager                 = require("../../src/core/db/dbManager");

const OrthodonticCaseDef      = require("../../src/modules/orthodontics/models/orthodonticCase.model");
const TreatmentPlanVersionDef = require("../../src/modules/orthodontics/models/TreatmentPlanVersion.model");

// ── Hardening §1.1 — fail fast on broken model imports ─────────────────────
// Scripts like this one are easy to break when a model export shape changes.
// We refuse to start rather than let Jest-style "is not a function" errors
// surface from deep inside a loop.
if (typeof Organization?.find !== "function") {
    throw new Error("INVALID_MODEL_IMPORT: Organization model did not compile — check shared/models/Organization export shape");
}
if (!OrthodonticCaseDef?.modelName || !OrthodonticCaseDef?.schema) {
    throw new Error("INVALID_MODEL_IMPORT: OrthodonticCase model def missing { modelName, schema }");
}
if (!TreatmentPlanVersionDef?.modelName || !TreatmentPlanVersionDef?.schema) {
    throw new Error("INVALID_MODEL_IMPORT: TreatmentPlanVersion model def missing { modelName, schema }");
}

const args = process.argv.slice(2);
const ORG_ARG = args.find((a) => a.startsWith("--org="));
const ORG_ID  = ORG_ARG ? ORG_ARG.split("=")[1] : null;
const FAIL_ON_WARN = args.includes("--fail-on-warn");

function _issue(level, code, detail) {
    return { level, code, detail };
}

async function _checkCase(models, caseDoc) {
    const issues = [];
    const versions = await models.TreatmentPlanVersion
        .find({ caseId: caseDoc._id, organizationId: caseDoc.organizationId })
        .sort({ version: 1 })
        .lean();

    if (!versions.length) return issues; // un-migrated case — not a violation.

    // A. single-approved
    const approvedRows = versions.filter((v) => v.isApproved);
    if (approvedRows.length > 1) {
        issues.push(_issue("ERROR", "MULTIPLE_APPROVED", `${approvedRows.length} approved versions on case ${caseDoc._id}`));
    }

    // B. single-active
    const activeRows = versions.filter((v) => v.isActive);
    if (activeRows.length > 1) {
        issues.push(_issue("ERROR", "MULTIPLE_ACTIVE", `${activeRows.length} active versions on case ${caseDoc._id}`));
    }

    // C. approvedPlanVersionId pointer integrity
    if (caseDoc.approvedPlanVersionId) {
        const target = versions.find((v) => String(v._id) === String(caseDoc.approvedPlanVersionId));
        if (!target)       issues.push(_issue("ERROR", "APPROVED_POINTER_DANGLING",  `approvedPlanVersionId ${caseDoc.approvedPlanVersionId} not found on case ${caseDoc._id}`));
        else if (!target.isApproved) issues.push(_issue("ERROR", "APPROVED_POINTER_MISMATCH", `approvedPlanVersionId ${caseDoc.approvedPlanVersionId} points to a non-approved version`));
    }

    // D. activePlanVersionId pointer integrity
    if (caseDoc.activePlanVersionId) {
        const target = versions.find((v) => String(v._id) === String(caseDoc.activePlanVersionId));
        if (!target)       issues.push(_issue("ERROR", "ACTIVE_POINTER_DANGLING",  `activePlanVersionId ${caseDoc.activePlanVersionId} not found on case ${caseDoc._id}`));
        else if (!target.isActive) issues.push(_issue("ERROR", "ACTIVE_POINTER_MISMATCH", `activePlanVersionId ${caseDoc.activePlanVersionId} points to a non-active version`));
    }

    // E. counter never regresses
    const maxVersion = versions[versions.length - 1].version;
    const counter = caseDoc.__planVersionCounter ?? 0;
    if (counter < maxVersion) {
        issues.push(_issue("ERROR", "COUNTER_REGRESSION", `__planVersionCounter=${counter} but max(version)=${maxVersion} on case ${caseDoc._id}`));
    }

    // F. parent chain integrity
    const byId = new Map(versions.map((v) => [String(v._id), v]));
    for (const v of versions) {
        if (v.version === 1) {
            if (v.parentVersionId) issues.push(_issue("WARN", "ROOT_HAS_PARENT", `v1 on case ${caseDoc._id} has parentVersionId=${v.parentVersionId}`));
        } else {
            if (!v.parentVersionId) {
                issues.push(_issue("ERROR", "ORPHAN_REVISION", `v${v.version} on case ${caseDoc._id} has no parentVersionId`));
            } else if (!byId.has(String(v.parentVersionId))) {
                issues.push(_issue("ERROR", "PARENT_DANGLING", `v${v.version} parentVersionId=${v.parentVersionId} not found`));
            }
        }
    }

    // G. Version gaps (1 → 3 without 2) — violates monotonic allocation invariant.
    //    The __planVersionCounter $inc guarantees sequential versions; a gap
    //    means either a delete-without-counter-reset or an out-of-service write.
    for (let i = 0; i < versions.length - 1; i++) {
        const expected = versions[i].version + 1;
        const actual   = versions[i + 1].version;
        if (actual !== expected) {
            issues.push(_issue(
                "ERROR",
                "VERSION_GAP",
                `case ${caseDoc._id} has v${versions[i].version} → v${actual} (expected v${expected})`,
            ));
        }
    }

    // H. Multiple children pointing at the same parent — revision chain must
    //    be linear per case. Two revisions with the same parentVersionId means
    //    a concurrent-revision race bypassed the single-active invariant.
    const childCount = new Map();
    for (const v of versions) {
        if (!v.parentVersionId) continue;
        const k = String(v.parentVersionId);
        childCount.set(k, (childCount.get(k) || 0) + 1);
    }
    for (const [parentId, count] of childCount) {
        if (count > 1) {
            issues.push(_issue(
                "ERROR",
                "PARENT_MULTIPLE_CHILDREN",
                `case ${caseDoc._id}: parent ${parentId} has ${count} direct children (chain must be linear)`,
            ));
        }
    }

    return issues;
}

async function _checkOrphans(models, orgId) {
    // I. Orphan versions — TreatmentPlanVersion rows whose caseId no longer
    //    resolves to an OrthodonticCase. Indicates an incomplete case delete
    //    or a cross-org leak. Reported per-org, not per-case, so we emit here.
    const caseIds = await models.OrthodonticCase.distinct("_id");
    const caseIdSet = new Set(caseIds.map(String));
    const versions = await models.TreatmentPlanVersion
        .find({}, { _id: 1, caseId: 1, version: 1 })
        .lean();

    const issues = [];
    for (const v of versions) {
        if (!caseIdSet.has(String(v.caseId))) {
            issues.push(_issue(
                "ERROR",
                "ORPHAN_VERSION",
                `version ${v._id} (v${v.version}) references missing case ${v.caseId} in org ${orgId}`,
            ));
        }
    }
    return issues;
}

async function _validateOrg(org, globalStats) {
    // Hardening §5 — classify connection failures distinctly so operators
    // can tell "pool is exhausted" apart from "data violated an invariant".
    let conn;
    try {
        conn = await dbManager.getConnectionAsync(org._id.toString());
    } catch (err) {
        const wrapped = new Error(`DB_CONNECTION_FAILED: ${err.message}`);
        wrapped.cause = err;
        throw wrapped;
    }

    const models = {
        OrthodonticCase:      conn.models[OrthodonticCaseDef.modelName]      || conn.model(OrthodonticCaseDef.modelName,      OrthodonticCaseDef.schema),
        TreatmentPlanVersion: conn.models[TreatmentPlanVersionDef.modelName] || conn.model(TreatmentPlanVersionDef.modelName, TreatmentPlanVersionDef.schema),
    };

    // Fail-fast if the compiled models didn't register — this is structural,
    // not data-integrity, and deserves a MODEL_NOT_REGISTERED classification.
    if (typeof models.OrthodonticCase?.find !== "function" ||
        typeof models.TreatmentPlanVersion?.find !== "function") {
        throw new Error("MODEL_NOT_REGISTERED: per-org models failed to register on the returned connection");
    }

    const cases = await models.OrthodonticCase
        .find({})
        .select({ _id: 1, organizationId: 1, approvedPlanVersionId: 1, activePlanVersionId: 1, __planVersionCounter: 1 })
        .lean();

    console.log(`\n[${org.name}] ${cases.length} cases to validate`);
    let orgErrors = 0;
    let orgWarns = 0;

    for (const c of cases) {
        const issues = await _checkCase(models, c);
        for (const i of issues) {
            if (i.level === "ERROR") orgErrors++;
            else                     orgWarns++;
            console.log(`  [${i.level}] ${i.code}: ${i.detail}`);
        }
    }

    // Per-org orphan check (not tied to a specific case).
    const orphanIssues = await _checkOrphans(models, org._id);
    for (const i of orphanIssues) {
        if (i.level === "ERROR") orgErrors++;
        else                     orgWarns++;
        console.log(`  [${i.level}] ${i.code}: ${i.detail}`);
    }

    console.log(`[${org.name}] errors=${orgErrors} warnings=${orgWarns}`);
    globalStats.errors   += orgErrors;
    globalStats.warnings += orgWarns;
    globalStats.cases    += cases.length;
}

async function run() {
    if (!process.env.MONGO_URI) throw new Error("MONGO_URI is not set");
    await mongoose.connect(process.env.MONGO_URI);
    console.log("Connected — validating plan integrity");

    const orgQuery = ORG_ID ? { _id: ORG_ID } : {};
    const orgs = await Organization.find(orgQuery).select("_id name slug").lean();
    console.log(`Found ${orgs.length} organization(s) to validate`);

    const globalStats = { cases: 0, errors: 0, warnings: 0 };
    for (const org of orgs) {
        try { await _validateOrg(org, globalStats); }
        catch (err) { console.error(`[${org.name}] FAILED: ${err.message}`); globalStats.errors++; }
    }

    console.log("\n═══════════════════════════════════════");
    console.log("TOTALS");
    console.log("═══════════════════════════════════════");
    console.log(`  cases inspected : ${globalStats.cases}`);
    console.log(`  ERRORS          : ${globalStats.errors}`);
    console.log(`  warnings        : ${globalStats.warnings}`);

    await mongoose.disconnect();

    const failing = globalStats.errors > 0 || (FAIL_ON_WARN && globalStats.warnings > 0);
    process.exit(failing ? 1 : 0);
}

run().catch((err) => {
    console.error(err);
    process.exit(1);
});
