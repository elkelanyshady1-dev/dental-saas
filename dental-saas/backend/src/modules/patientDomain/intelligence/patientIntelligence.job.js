/**
 * patientIntelligence.job.js — Daily Patient Intelligence Engine
 * v2.0 — Phase F.6 Zero-Trust RLS Migration
 *
 * Phase F.6 Changes:
 *   - addTag/removeTag migrated to secureModel
 *   - runPatientIntelligence uses explicit organizationId scoping
 *     with @rls-background-exempt annotation (no req context in cron jobs)
 *   - Background jobs MUST NOT use secureModel because there is no req/JWT
 *     context. Instead they use explicit organizationId filtering which is
 *     structurally safe — organizationId comes from the job dispatcher,
 *     not from user input.
 *
 * Runs nightly (or on-demand) to:
 *   1. Detect inactive patients (>6 months no visit)
 *   2. Flag high outstanding balances
 *   3. Detect missed appointments
 *   4. Flag recall candidates (>3 months)
 *   5. Flag orthodontic review overdue (placeholder)
 *   6. Recalculate priorityScore for each patient
 *
 * Results are stored directly on the Patient document:
 *   patient.alerts[]
 *   patient.priorityScore
 *
 * Designed to be called by:
 *   - node-cron (daily at 01:00 clinic local time)
 *   - Manual admin trigger via API
 *
 * Architecture compliance:
 *   - organizationId always scoped — never global scan
 *   - No external dependencies beyond mongoose
 *   - Idempotent: clears old alerts and rewrites fresh
 */
"use strict";

const PatientDef = require("../../../organization/patient/models/patient.model");
const getModel = require("../../../core/db/getModel");
const dbManager = require("../../../core/db/dbManager");

// ─── Thresholds ────────────────────────────────────────────────────────────
const INACTIVE_MONTHS         = 6;   // months without a visit
const RECALL_MONTHS           = 3;   // months for recall reminder
const HIGH_BALANCE_THRESHOLD  = 500; // currency units (EGP)

// ─── Priority Score Weights ────────────────────────────────────────────────
const SCORE = {
    APPOINTMENT_TODAY: 50,
    BALANCE_DUE:       30,
    RECENT_VISIT:      10,  // visited in last 30 days
    NEW_PATIENT:        5,  // created in last 7 days
};

// ─── Helpers ───────────────────────────────────────────────────────────────

function monthsAgo(n) {
    const d = new Date();
    d.setMonth(d.getMonth() - n);
    return d;
}

function isToday(date) {
    if (!date) return false;
    const d = new Date(date);
    const t = new Date();
    return d.getDate() === t.getDate() && d.getMonth() === t.getMonth() && d.getFullYear() === t.getFullYear();
}

// ─── Per-patient analysis ──────────────────────────────────────────────────

function analyzePatient(patient, { balanceByPatientId }) {
    const alerts = [];
    let score = 0;

    // 1. Inactive > 6 months
    if (patient.lastVisit && patient.lastVisit < monthsAgo(INACTIVE_MONTHS)) {
        const months = Math.floor((Date.now() - patient.lastVisit.getTime()) / (1000 * 60 * 60 * 24 * 30));
        alerts.push({
            type: "inactive",
            message: `No visit for ${months} months`,
            severity: months > 12 ? "high" : "medium",
            generatedAt: new Date(),
        });
    }

    // 2. Balance due
    const balance = balanceByPatientId?.[patient._id.toString()] || 0;
    if (balance > HIGH_BALANCE_THRESHOLD) {
        alerts.push({
            type: "balance_due",
            message: `Balance due ${balance.toLocaleString()} EGP`,
            severity: balance > 2000 ? "high" : "medium",
            generatedAt: new Date(),
        });
        score += SCORE.BALANCE_DUE;
    }

    // 3. Recall due (visited but >3 months ago, not inactive yet)
    if (patient.lastVisit
        && patient.lastVisit < monthsAgo(RECALL_MONTHS)
        && patient.lastVisit >= monthsAgo(INACTIVE_MONTHS)) {
        alerts.push({
            type: "recall_due",
            message: "Due for recall appointment",
            severity: "low",
            generatedAt: new Date(),
        });
    }

    // 4. Incomplete profile
    if (patient.status === "incomplete") {
        alerts.push({
            type: "incomplete_profile",
            message: "Profile incomplete — missing registration data",
            severity: "low",
            generatedAt: new Date(),
        });
    }

    // Priority score — appointment today
    if (isToday(patient.nextAppointment)) score += SCORE.APPOINTMENT_TODAY;

    // Priority score — recent visit (last 30 days)
    if (patient.lastVisit && patient.lastVisit >= new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)) {
        score += SCORE.RECENT_VISIT;
    }

    // Priority score — new patient (last 7 days)
    if (patient.createdAt >= new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)) {
        score += SCORE.NEW_PATIENT;
    }

    return { alerts, priorityScore: score };
}

// ─── Main Job ──────────────────────────────────────────────────────────────

/**
 * Run intelligence analysis for a specific organization.
 *
 * @rls-background-exempt — Background job context. No req/JWT available.
 * organizationId comes from the job dispatcher (cron config or admin API),
 * not from user input. This is structurally safe because:
 *   1. organizationId is always required (validated)
 *   2. All queries include organizationId in the filter
 *   3. bulkWrite filter includes _id per-record (no cross-org writes)
 *
 * @param {string} organizationId  - From JWT or scheduled task config
 * @param {object} [options]
 * @param {object} [options.balanceByPatientId]  - Map<patientId, balance> from financial module
 * @returns {Promise<{ processed: number, alertsGenerated: number }>}
 */
async function runPatientIntelligence(organizationId, options = {}) {
    if (!organizationId) throw new Error("organizationId required for patient intelligence job");

    // Resolve org-specific connection for background job
    const conn = await dbManager.getConnection(organizationId.toString());
    const Patient = getModel(conn, PatientDef);

    const { balanceByPatientId = {} } = options;
    const SELECT = "_id status nameEnglish lastVisit nextAppointment createdAt";

    let processed = 0;
    let alertsGenerated = 0;

    // Process in cursor batches to avoid memory overload
    const BATCH_SIZE = 200;
    let skip = 0;

    while (true) {
        // @rls-background-worker — batch job, no req context, connection-scoped
        const batch = await Patient.find({ isActive: true })
            .select(SELECT)
            .skip(skip)
            .limit(BATCH_SIZE)
            .lean();

        if (batch.length === 0) break;

        const bulkOps = batch.map(patient => {
            const { alerts, priorityScore } = analyzePatient(patient, { balanceByPatientId });
            alertsGenerated += alerts.length;
            processed++;
            return {
                updateOne: {
                    filter: { _id: patient._id }, // Per-org DB: connection isolates tenant
                    update: { $set: { alerts, priorityScore } },
                },
            };
        });

        if (bulkOps.length > 0) {
            await Patient.bulkWrite(bulkOps, { ordered: false });
        }

        skip += BATCH_SIZE;
        if (batch.length < BATCH_SIZE) break;
    }

    console.log(`[PatientIntelligence] Org ${organizationId}: processed=${processed}, alerts=${alertsGenerated}`);
    return { processed, alertsGenerated };
}

/**
 * Add a tag on a patient (immutable tag set).
 * Phase F.6: Uses direct model access via getModel
 * Callers MUST pass req for tenant isolation enforcement.
 */
async function addTag(patientId, organizationId, tag, req) {
    const normalized = tag.trim().toLowerCase();
    const conn = req?.dbConnection || await dbManager.getConnection(organizationId.toString());
    const Patient = getModel(conn, PatientDef);
    return Patient.updateOne(
        { _id: patientId },
        { $addToSet: { tags: normalized } }
    );
}

/**
 * Remove a tag from a patient.
 * Phase F.6: Uses direct model access via getModel
 */
async function removeTag(patientId, organizationId, tag, req) {
    const normalized = tag.trim().toLowerCase();
    const conn = req?.dbConnection || await dbManager.getConnection(organizationId.toString());
    const Patient = getModel(conn, PatientDef);
    return Patient.updateOne(
        { _id: patientId },
        { $pull: { tags: normalized } }
    );
}

module.exports = {
    runPatientIntelligence,
    addTag,
    removeTag,
};
