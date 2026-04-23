/**
 * snapshot.service.js
 * Domain: orthodontic-cases
 * Layer: Application > Services
 *
 * SNAPSHOT ORCHESTRATION SERVICE — Phase 3.X (Snapshot System V2)
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * PHASE 3.X CHANGES
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * 1. SNAPSHOT TYPES (NEW)
 *    type: "diagnostic" | "pretreatment" | "treatment" | "post-treatment"
 *    - diagnostic:     SINGLETON per case; photo/ceph baseline; NO VisitRecord; NO visitCounter
 *                      → enforced via DIAGNOSTIC_ALREADY_EXISTS (409)
 *                      → sets hasDiagnosticSnapshot = true on OrthodonticCase
 *    - pretreatment:   versioned chart; NO VisitRecord; NO visitCounter
 *    - treatment:      visit-based; ALWAYS creates VisitRecord + increments counter
 *    - post-treatment: retention; same behavior as treatment
 *
 * 2. APPOINTMENT IS OPTIONAL
 *    appointmentId was previously required. Now it is optional.
 *    Snapshots can exist without any linked appointment.
 *
 * 3. snapshotDate — SOURCE OF TRUTH
 *    Resolved in strict priority order:
 *      a. appointment.dateTime  (if appointmentId + no override)
 *      b. visitDateOverride     (explicit client override)
 *      c. new Date()            (server time — fallback)
 *    VisitRecord.visitDate always mirrors snapshotDate.
 *
 * 4. ATOMIC TRANSACTION (from Phase 3.2 — preserved)
 *    All writes use req.dbConnection.startSession() (org-scoped session).
 *    NEVER mongoose.startSession() (would use platform DB — wrong).
 *
 * 5. MONOTONIC visitCounter (from Phase 3.2 — preserved)
 *    visitNumber uses atomic $inc. Gaps may occur on transaction rollback.
 *    Gaps are acceptable for audit integrity.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * INVARIANTS
 * ═══════════════════════════════════════════════════════════════════════════
 *   diagnostic:     Snapshot ONLY — singleton; no VisitRecord; no visitCounter bump
 *   pretreatment:   Snapshot ONLY — versioned; no VisitRecord; no visitCounter bump
 *   treatment/post: Snapshot + VisitRecord in one atomic transaction
 *   snapshotDate:   Always set from server-resolved logic — never client directly
 *   visitDate:      Always equals snapshotDate
 *   diagnosticData: Populated for diagnostic + pretreatment; null for treatment/post
 *   Timeline:       ONLY treatment + post-treatment (never diagnostic or pretreatment)
 */

"use strict";

const crypto = require("crypto");
const logger = require("@utils/logger");

const caseRepo        = require("../repositories/orthodonticCase.repository");
const visitRecordRepo = require("../repositories/visitRecord.repository");
const snapshotRepo    = require("../../clinical/repositories/clinicalSnapshot.repository");
const { generateProcedures }       = require("./procedureGenerator.service");
const { assertValidProcedureType } = require("../constants/procedureTypes");
const getModel               = require("../../../../core/db/getModel");
const BondingDef             = require("../../models/Bonding.model");
const TadDef                 = require("../../models/Tad.model");
const ClinicalEventDef       = require("../../models/ClinicalEvent.model");
const ClinicalSnapshotDef    = require("../../models/ClinicalSnapshot.model");

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

const VISIT_TYPES       = new Set(["treatment", "post-treatment"]);
const NON_VISIT_TYPES   = new Set(["diagnostic", "pretreatment"]);
const VALID_TYPES       = ["diagnostic", "pretreatment", "treatment", "post-treatment"];

// ─────────────────────────────────────────────────────────────────────────────
// _stableStringify — P0-8: deterministic JSON serialisation (no dep on key order)
// ─────────────────────────────────────────────────────────────────────────────
// Recursively sorts object keys before serialising so that two objects with the
// same logical content but different key insertion orders produce the same string.
// This is equivalent to the `json-stable-stringify` package but without the
// external dependency — keeps the hashing deterministic across all Node versions.

function _stableStringify(val) {
    if (val === null || typeof val !== 'object' || Array.isArray(val)) {
        return JSON.stringify(val);
    }
    const sortedKeys = Object.keys(val).sort();
    const parts = sortedKeys.map((k) => `${JSON.stringify(k)}:${_stableStringify(val[k])}`);
    return `{${parts.join(',')}}`;
}

// ─────────────────────────────────────────────────────────────────────────────
// _hashChartState — deterministic SHA-256 fingerprint of chart state
// ─────────────────────────────────────────────────────────────────────────────
// P0-7/P0-8: Uses _stableStringify so hash is key-order-independent.
// Used for idempotency: identical chartState → same hash → skip duplicate save.

function _hashChartState(chartState) {
    try {
        // P0-8: _stableStringify guarantees identical output regardless of key order
        const stable = _stableStringify(chartState ?? {});
        return crypto.createHash("sha256").update(stable).digest("hex");
    } catch {
        return null; // non-fatal — skip idempotency check if hash fails
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// _getLatestEventSequence — Phase 6 checkpoint: latest event sequence for case
// ─────────────────────────────────────────────────────────────────────────────
// Called BEFORE the transaction (read-only — no session needed).
// Returns the sequence number of the most recent ClinicalEvent for this case.
// This becomes snapshot.eventOffset — replay engine uses: sequence > eventOffset
// to skip replaying all prior events (O(k) instead of O(n)).

async function _getLatestEventSequence(req, caseId) {
    try {
        const ClinicalEvent = getModel(req.dbConnection, ClinicalEventDef);
        const latest = await ClinicalEvent.findOne(
            { caseId },
            { sequence: 1 }
        ).sort({ sequence: -1 }).lean();
        return latest?.sequence ?? 0; // 0 means "no events" — replay engine returns empty delta
    } catch (_) {
        return null; // non-fatal — replay falls back to createdAt-based filtering
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// _captureBondingSnapshot — read current bonding state at snapshot time
// ─────────────────────────────────────────────────────────────────────────────
// Called BEFORE the transaction (read-only — no session needed).
// Returns a lightweight array of bonding items for the snapshot.
// Both ACTIVE and DEBONDED records are captured — debonded brackets are
// clinically relevant history at the visit time.

async function _captureBondingSnapshot(req, caseId) {
    try {
        const Bonding = getModel(req.dbConnection, BondingDef);
        const bondings = await Bonding.find(
            { caseId, },
            { tooth: 1, type: 1, prescription: 1, slot: 1, brand: 1, bondingHeight: 1, status: 1 }
        ).lean();

        return bondings.map((b) => ({
            tooth:         b.tooth,
            bracketType:   b.type   ?? null,  // Bonding uses `type` field (BRACKET/BAND/TUBE)
            prescription:  b.prescription ?? null,
            slotSize:      b.slot   ?? null,
            brand:         b.brand  ?? null,
            bondingHeight: b.bondingHeight ?? null,
            status:        b.status ?? "ACTIVE",
        }));
    } catch (err) {
        logger.warn({ err, caseId, event: "BONDING_SNAPSHOT_CAPTURE_FAILED" },
            "[SnapshotService] Failed to capture bonding snapshot — saving without appliance state");
        return [];
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// _captureTadSnapshot — read current TAD state at snapshot time
// ─────────────────────────────────────────────────────────────────────────────
// REMOVED TADs are excluded — they are clinically absent at visit time.

async function _captureTadSnapshot(req, caseId) {
    try {
        const Tad = getModel(req.dbConnection, TadDef);
        const tads = await Tad.find(
            {
                caseId,
                status: { $ne: "REMOVED" }, // REMOVED TADs are absent at visit time
            },
            { toothNumber: 1, position: 1, positionLabel: 1, brand: 1, diameter: 1, length: 1, status: 1, chartPosition: 1 }
        ).lean();

        return tads.map((t) => ({
            toothNumber:   t.toothNumber,
            position:      t.position,
            positionLabel: t.positionLabel ?? null,
            brand:         t.brand         ?? null,
            diameter:      t.diameter      ?? null,
            length:        t.length        ?? null,
            status:        t.status        ?? "ACTIVE",
            chartPosition: {
                toothId:    t.chartPosition?.toothId    ?? null,
                anchorType: t.chartPosition?.anchorType ?? null,
            },
        }));
    } catch (err) {
        logger.warn({ err, caseId, event: "TAD_SNAPSHOT_CAPTURE_FAILED" },
            "[SnapshotService] Failed to capture TAD snapshot — saving without TAD state");
        return [];
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// _resolveAppointment — fetch and validate optional appointment link
// ─────────────────────────────────────────────────────────────────────────────

async function _resolveAppointment(req, appointmentId, caseId, patientId) {
    if (!appointmentId) return null;

    const getModel       = require("../../../../core/db/getModel");
    const AppointmentDef = require("../../../../organization/appointment/models/appointment.model");
    const Appointment    = getModel(req.dbConnection, AppointmentDef);

    const appt = await Appointment.findOne({
        _id:            appointmentId,
        }).select("clinicalCaseId dateTime patientId").lean();

    if (!appt) {
        throw Object.assign(
            new Error("Appointment not found"),
            { statusCode: 404, code: "APPOINTMENT_NOT_FOUND" }
        );
    }

    if (appt.clinicalCaseId && appt.clinicalCaseId.toString() !== caseId.toString()) {
        throw Object.assign(
            new Error("Appointment is linked to a different clinical case"),
            { statusCode: 400, code: "CASE_APPOINTMENT_MISMATCH" }
        );
    }

    // FIX 3: Cross-patient integrity guard
    // An appointment for a different patient must never be linked to this case.
    // Prevents accidental data association across patients.
    if (appt.patientId && patientId && appt.patientId.toString() !== patientId.toString()) {
        throw Object.assign(
            new Error("Appointment belongs to a different patient — cannot link to this case"),
            { statusCode: 400, code: "APPOINTMENT_PATIENT_MISMATCH" }
        );
    }

    return appt; // { clinicalCaseId, dateTime, patientId, ... }
}

// ─────────────────────────────────────────────────────────────────────────────

// ─────────────────────────────────────────────────────────────────────────────
// _resolveSnapshotDate — priority: appointment.dateTime → override → now()
// ─────────────────────────────────────────────────────────────────────────────

function _resolveSnapshotDate(appt, visitDateOverride) {
    if (appt?.dateTime && !visitDateOverride) {
        return new Date(appt.dateTime);
    }

    if (visitDateOverride) {
        return new Date(visitDateOverride);
    }

    return new Date();
}

// ─────────────────────────────────────────────────────────────────────────────
// _runPostSaveIntegrityCheck — non-blocking post-commit validation
// ─────────────────────────────────────────────────────────────────────────────

async function _runPostSaveIntegrityCheck(req, { snapshotId, visitRecordId, caseId }) {
    try {
        const snap  = await snapshotRepo.findById(req, snapshotId);
        const visit = visitRecordId
            ? await visitRecordRepo.findById(req, visitRecordId)
            : null;

        const criticalIssues = [];

        if (!snap) criticalIssues.push("Snapshot missing after commit");

        if (visitRecordId && !visit) {
            criticalIssues.push("VisitRecord missing after commit");
        }

        if (snap && visit && visit.snapshotId?.toString() !== snapshotId.toString()) {
            criticalIssues.push("VisitRecord.snapshotId mismatch");
        }

        if (snap && visit && visit.caseId?.toString() !== caseId.toString()) {
            criticalIssues.push("VisitRecord.caseId mismatch");
        }

        if (criticalIssues.length > 0) {
            logger.error({
                event:          "CRITICAL_ENGINE_INTEGRITY_VIOLATION",
                caseId,
                snapshotId,
                visitRecordId,
                criticalIssues,
                orgId:          req.context.organizationId,
            }, "[SnapshotService] POST-SAVE INTEGRITY VIOLATION — requires investigation");
        }
    } catch (checkErr) {
        logger.error({
            err:   checkErr,
            event: "INTEGRITY_CHECK_ERROR",
            orgId: req.context.organizationId,
        }, "[SnapshotService] Integrity check itself failed — non-fatal");
    }
}

async function saveSnapshot(req, payload) {
    const {
        caseId,
        type,
        visitId          = null,
        appointmentId    = null,
        visitDateOverride = null,
        chartState,
        expectedVersion  = null,
        thumbnail        = null,
        notes            = "",
        attachments      = [],
        diagnosticData   = null,
        visitType        = "adjustment",
        name: payloadName = null,
    } = payload;

    // ── STEP 1: Case + org verification ──────────────────────────────────────
    const orthoCase = await caseRepo.findById(req, caseId);
    if (!orthoCase) {
        throw Object.assign(
            new Error("OrthodonticCase not found or access denied"),
            { statusCode: 404, code: "CASE_NOT_FOUND" }
        );
    }

    if (!type || !VALID_TYPES.includes(type)) {
        throw Object.assign(
            new Error(`Invalid snapshot type. Must be one of: ${VALID_TYPES.join(", ")}`),
            { statusCode: 400, code: "INVALID_SNAPSHOT_TYPE" }
        );
    }

    // ── STEP 2a-ii: Post-treatment phase guard (FIX 1 — Phase 3.X.1) ────────
    // post-treatment (retention) snapshots require the case to be "completed".
    // This prevents premature retention records during active treatment.
    if (type === "post-treatment" && orthoCase.status !== "completed") {
        throw Object.assign(
            new Error(
                `Cannot save a post-treatment snapshot: case status is "${orthoCase.status}". Case must be "completed" first.`
            ),
            { statusCode: 400, code: "INVALID_PHASE" }
        );
    }

    // ── STEP 2b: Diagnostic SINGLETON guard ──────────────────────────────────
    // Only one diagnostic snapshot is allowed per case — enforced BEFORE transaction.
    if (type === "diagnostic") {
        const existing = await snapshotRepo.findDiagnosticByCase(req, caseId);
        if (existing) {
            throw Object.assign(
                new Error("A diagnostic snapshot already exists for this case"),
                {
                    statusCode:          409,
                    code:                "DIAGNOSTIC_ALREADY_EXISTS",
                    existingSnapshotId:  existing._id.toString(),
                }
            );
        }
    }

    // ── STEP 2c: Visit session guard (treatment + post-treatment ONLY) ───────
    // diagnostic and pretreatment snapshots do NOT require an active visit.
    // treatment and post-treatment MUST be linked to an active VisitRecord.
    if (VISIT_TYPES.has(type)) {
        if (!visitId) {
            throw Object.assign(
                new Error("A visit session is required to save a treatment snapshot. Call POST /visit-sessions/:caseId/start first."),
                { statusCode: 400, code: "VISIT_REQUIRED" }
            );
        }
        const activeVisit = await visitRecordRepo.findById(req, visitId);
        if (!activeVisit || activeVisit.status !== "active") {
            throw Object.assign(
                new Error("The referenced visit session is not active. Only snapshots for an active visit can be saved."),
                { statusCode: 409, code: "INVALID_ACTIVE_VISIT" }
            );
        }
    }

    // ── STEP 2d: Idempotency hash check (treatment/post-treatment only) ─────
    // Prevents duplicate snapshots when auto-save + manual save fire in quick
    // succession with identical chart state (e.g., user clicks End Visit twice).
    // Only compares within the SAME visit session — intentional re-saves across
    // visits (or different sessions) are always allowed.
    if (VISIT_TYPES.has(type) && visitId) {
        const newHash = _hashChartState(chartState);
        if (newHash) {
            const ClinicalSnapshot = getModel(req.dbConnection, ClinicalSnapshotDef);
            const lastForVisit = await ClinicalSnapshot.findOne(
                { visitId, isDeleted: false },
                { chartStateHash: 1, _id: 1, version: 1 }
            ).sort({ createdAt: -1 }).lean();

            if (lastForVisit?.chartStateHash && lastForVisit.chartStateHash === newHash) {
                logger.info({
                    event:      "SNAPSHOT_IDEMPOTENT_SKIP",
                    visitId,
                    snapshotId: lastForVisit._id,
                    caseId,
                    orgId:      req.context.organizationId,
                }, "[SnapshotService] Identical chartState — returning existing snapshot (idempotent skip)");

                const existing = await snapshotRepo.findById(req, lastForVisit._id.toString());
                return { snapshot: existing, visitRecord: null };
            }
        }
    }

    // ── STEP 3: Resolve appointment (optional) ────────────────────────────────
    const appt = await _resolveAppointment(req, appointmentId, caseId, orthoCase.patientId);

    // ── STEP 4: Resolve snapshotDate ──────────────────────────────────────────
    const snapshotDate = _resolveSnapshotDate(appt, visitDateOverride);

    // ── STEP 5: Idempotency guard (treatment/post + appointmentId only) ──────-
    const isVisitType = VISIT_TYPES.has(type);
    if (isVisitType && appointmentId) {
        const existingVisit = await visitRecordRepo.findByAppointmentId(req, appointmentId);
        if (existingVisit) {
            throw Object.assign(
                new Error("A visit record already exists for this appointment"),
                { statusCode: 409, code: "DUPLICATE_VISIT_RECORD", existingId: existingVisit._id }
            );
        }
    }

    // ── STEP 6: Optimistic lock ───────────────────────────────────────────────
    const prevSnapshots = await snapshotRepo.findByCase(req, caseId, {
        limit:             1,
        includeChartState: true,
        type:              type, // compare within same type for versioning
    });
    const prevSnapshot   = prevSnapshots[0] ?? null;
    const prevChartState = prevSnapshot?.chartState ?? null;

    if (expectedVersion !== null && prevSnapshot !== null) {
        if (prevSnapshot.version !== expectedVersion) {
            throw Object.assign(
                new Error(
                    `Snapshot conflict: expected version ${expectedVersion} ` +
                    `but current is ${prevSnapshot.version}. Reload and retry.`
                ),
                {
                    statusCode:     409,
                    code:           "SNAPSHOT_CONFLICT",
                    currentVersion: prevSnapshot.version,
                    expectedVersion,
                }
            );
        }
    }

    const newVersion = prevSnapshot ? prevSnapshot.version + 1 : 1;

    // ── STEP 7b: Capture appliance state (bonding + TADs) at this exact moment ─
    // Point-in-time reads OUTSIDE the transaction — reads are safe without session.
    // Captured BEFORE procedure generation so snapshot diffs use DB-accurate state.
    const bondingSnapshot = await _captureBondingSnapshot(req, caseId);
    const tadSnapshot     = await _captureTadSnapshot(req, caseId);

    // ── Phase 6: Capture event offset (sequence checkpoint) ──────────────────
    // Latest event sequence at this exact moment — stored as snapshot.eventOffset.
    // Replay engine uses: events WHERE sequence > eventOffset (partial replay = O(k)).
    // Captured outside transaction (read-only — safe without session).
    const eventOffset = await _getLatestEventSequence(req, caseId);

    logger.info({
        event:        "APPLIANCE_SNAPSHOT_CAPTURED",
        caseId,
        bondingCount: bondingSnapshot.length,
        tadCount:     tadSnapshot.length,
        orgId:        req.context.organizationId,
    }, "[SnapshotService] Appliance state captured for snapshot");

    // ── STEP 7: Generate procedures + hard type validation ────────────────────
    let procedures = [];
    try {
        procedures = generateProcedures(prevChartState, chartState, {
            // True Clinical Snapshot v2: DB-accurate appliance diffs
            prevBondingSnapshot: prevSnapshot?.bondingSnapshot ?? [],
            newBondingSnapshot:  bondingSnapshot,
            prevTadSnapshot:     prevSnapshot?.tadSnapshot ?? [],
            newTadSnapshot:      tadSnapshot,
        });
        for (const proc of procedures) {
            assertValidProcedureType(proc.type);
        }
    } catch (genErr) {
        if (genErr.code === "INVALID_PROCEDURE_TYPE") {
            throw Object.assign(genErr, { statusCode: 500 });
        }
        logger.warn({
            err:   genErr,
            event: "PROCEDURE_DIFF_FAILED",
            caseId,
            orgId: req.context.organizationId,
        }, "[SnapshotService] Procedure generation failed — saving without procedures");
        procedures = [];
    }

    const normalizedNotes = typeof notes === "string"
        ? { text: notes, tags: [], warnings: [] }
        : notes;

    // ── Auto-naming: generate visit label if no name provided ────────────────
    const VISIT_TYPE_LABELS = {
        bonding:    "Bonding Visit",
        adjustment: "Adjustment Visit",
        wire_change: "Wire Change Visit",
        debonding:  "Debonding Visit",
    };
    const dateStr = new Date().toLocaleDateString("en-GB"); // DD/MM/YYYY
    const autoName = `${VISIT_TYPE_LABELS[visitType] ?? "Visit"} #${newVersion} – ${dateStr}`;
    const resolvedName = payloadName?.trim() || autoName;

    // ── STEP 8: ATOMIC TRANSACTION ─────────────────────────────────────────────
    // CRITICAL: req.dbConnection.startSession() — NOT mongoose.startSession()
    let snapshot;
    let visitRecord;
    const session = await req.dbConnection.startSession();

    try {
        await session.withTransaction(async () => {

            // 8a. Create ClinicalSnapshot (all types)
            snapshot = await snapshotRepo.create(req, {
                caseId,
                type,
                // Phase 6C: visit session link — set for treatment/post-treatment; null otherwise
                visitId:        VISIT_TYPES.has(type) ? visitId : null,
                // Phase 6D: chart state fingerprint for idempotency detection
                chartStateHash: _hashChartState(chartState),
                visitType:      visitType ?? "adjustment",
                name:           resolvedName,
                snapshotDate,
                appointmentId:  appointmentId ?? null,
                phaseId:        orthoCase.activePhaseId ?? null,
                chartState,
                thumbnail,
                procedures,
                version:        newVersion,
                notes:          normalizedNotes,
                attachments,
                // diagnosticData: allowed for diagnostic + pretreatment; null for visit types
                diagnosticData: NON_VISIT_TYPES.has(type) ? (diagnosticData ?? null) : null,
                // FIX 2: isActiveVersion only relevant for pretreatment; set after deactivation below
                isActiveVersion: type === "pretreatment",
                // Step 7b: Point-in-time appliance state capture (True Clinical Snapshot v2)
                bondingSnapshot,
                tadSnapshot,
                // Phase 6: sequence checkpoint for efficient partial replay
                eventOffset,
            }, { session });

            // GUARD: snapshotRepo.create() must always return a document with _id.
            // If this is undefined, something is wrong with the session/DB write.
            if (!snapshot || !snapshot._id) {
                throw Object.assign(
                    new Error("[SnapshotService] snapshot.create() returned a document without _id — DB insert may have failed silently inside transaction"),
                    { statusCode: 500, code: "SNAPSHOT_INSERT_FAILED" }
                );
            }

            if (type === "diagnostic") {
                // 8b (diagnostic): Stamp hasDiagnosticSnapshot flag — singleton enforced
                await caseRepo.setHasDiagnosticSnapshot(req, caseId, { session });

                // NO visitCounter increment
                // NO VisitRecord creation

            } else if (type === "pretreatment") {
                // FIX 2 — Phase 3.X.1: Deactivate all prior pretreatment versions atomically
                // Must run BEFORE isActiveVersion=true on the new snapshot is committed.
                // The updateMany targets only docs with isActiveVersion=true — avoids full scans.
                await snapshotRepo.deactivatePriorPretreatmentVersions(req, caseId, { session });

                // 8b (pretreatment): Stamp hasPretreatmentSnapshot flag on OrthodonticCase
                await caseRepo.setHasPretreatmentSnapshot(req, caseId, { session });

                // NO visitCounter increment
                // NO VisitRecord creation

            } else {
                // 8b (treatment/post): Atomic visitCounter increment
                const updatedCase = await caseRepo.incrementVisitCounter(req, caseId, { session });

                // 8c (treatment/post): Create VisitRecord
                visitRecord = await visitRecordRepo.create(req, {
                    caseId,
                    phaseId:       orthoCase.activePhaseId ?? null,
                    appointmentId: appointmentId ?? null,
                    snapshotId:    snapshot._id,
                    visitNumber:   updatedCase.visitCounter,
                    visitDate:     snapshotDate, // Phase 3.X: always equals snapshotDate
                    notes: typeof notes === "string" ? notes : (notes?.text ?? ""),
                }, { session });

                if (!visitRecord || !visitRecord._id) {
                    throw Object.assign(
                        new Error("[SnapshotService] visitRecord.create() returned a document without _id"),
                        { statusCode: 500, code: "VISIT_RECORD_INSERT_FAILED" }
                    );
                }
            }
        });
    } finally {
        await session.endSession();
    }

    logger.info({
        event:           type === "diagnostic" ? "DIAGNOSTIC_SNAPSHOT_SAVED"
                       : type === "pretreatment" ? "PRETREATMENT_SNAPSHOT_SAVED"
                       : "SNAPSHOT_SAVED_ATOMIC",
        snapshotId:      snapshot?._id,
        visitRecordId:   visitRecord?._id ?? null,
        caseId,
        type,
        snapshotDate:    snapshotDate.toISOString(),
        visitNumber:     visitRecord?.visitNumber ?? null,
        snapshotVersion: newVersion,
        procedureCount:  procedures.length,
        orgId:           req.context.organizationId,
    }, `[SnapshotService] ${type} snapshot committed`);

    // ── STEP 9: Post-save integrity check (treatment/post only) ──────────────
    if (isVisitType && visitRecord) {
        setImmediate(() => {
            _runPostSaveIntegrityCheck(req, {
                snapshotId:    snapshot._id.toString(),
                visitRecordId: visitRecord._id.toString(),
                caseId,
            });
        });
    }

    return { snapshot, visitRecord: visitRecord ?? null };
}

// ─────────────────────────────────────────────────────────────────────────────
// getTimeline — treatment + post-treatment visits only
// ─────────────────────────────────────────────────────────────────────────────

/**
 * getTimeline
 *
 * Phase 3.X: Returns ONLY treatment + post-treatment VisitRecords.
 * Pretreatment snapshots are deliberately excluded (they are versioned, not visits).
 *
 * Each entry is enriched with the linked snapshot's procedures, thumbnail, and notes.
 * visitDate (= snapshotDate) is used as the canonical time — not appointment.dateTime.
 *
 * @param {Object} req
 * @param {string} caseId
 * @returns {TimelineEntry[]}
 */
async function getTimeline(req, caseId) {
    const orthoCase = await caseRepo.findById(req, caseId);
    if (!orthoCase) {
        throw Object.assign(
            new Error("OrthodonticCase not found"),
            { statusCode: 404, code: "CASE_NOT_FOUND" }
        );
    }

    // All visit records — VisitRecord only exists for treatment/post-treatment
    // (pretreatment never creates one, so no type filter needed here)
    const visits = await visitRecordRepo.findByCaseId(req, caseId, { limit: 500 });

    const snapshotIds = visits
        .filter((v) => v.snapshotId)
        .map((v) => v.snapshotId.toString());

    const snapshotMap = new Map();
    if (snapshotIds.length > 0) {
        // Phase 3.X: timelineOnly projection includes type + snapshotDate
        const snapshots = await snapshotRepo.findByCase(req, caseId, {
            limit:        visits.length + 10,
            timelineOnly: true,
        });
        for (const s of snapshots) {
            if (s) snapshotMap.set(s._id.toString(), s);
        }
    }

    return visits.map((visit) => {
        const snap = snapshotMap.get(visit.snapshotId?.toString()) ?? null;
        return {
            visitId:         visit._id.toString(),
            visitNumber:     visit.visitNumber,
            // Phase 3.X: use visitDate (= snapshotDate) as canonical time
            visitDate:       visit.visitDate ?? visit.createdAt,
            type:            snap?.type ?? null, // "treatment" | "post-treatment"
            phaseId:         visit.phaseId?.toString() ?? null,
            appointmentId:   visit.appointmentId?.toString() ?? null,
            snapshotId:      visit.snapshotId?.toString() ?? null,
            snapshotVersion: snap?.version ?? null,
            procedures:      snap?.procedures ?? [],
            notes: {
                clinical:       snap?.notes?.text ?? "",
                administrative: visit.notes ?? "",
            },
            thumbnail: snap?.thumbnail ?? null,
        };
    });
}

// ─────────────────────────────────────────────────────────────────────────────
// getPretreatmentVersions — versioned list of pretreatment snapshots
// ─────────────────────────────────────────────────────────────────────────────

/**
 * getPretreatmentVersions
 *
 * Phase 3.X: Returns all pretreatment snapshots for a case, sorted newest first.
 * NOT included in the treatment timeline — this is a separate versioned list.
 *
 * Used by:
 *   - GET /cases/:caseId/snapshots/pretreatment
 *   - SnapshotHistorySidebar (pretreatment section)
 *
 * @param {Object} req
 * @param {string} caseId
 * @returns {PretreatmentVersion[]}
 */
async function getPretreatmentVersions(req, caseId) {
    const orthoCase = await caseRepo.findById(req, caseId);
    if (!orthoCase) {
        throw Object.assign(
            new Error("OrthodonticCase not found"),
            { statusCode: 404, code: "CASE_NOT_FOUND" }
        );
    }

    const versions = await snapshotRepo.findPretreatmentVersions(req, caseId);

    return versions.map((snap) => ({
        snapshotId:     snap._id.toString(),
        version:        snap.version,
        snapshotDate:   snap.snapshotDate ?? snap.createdAt,
        createdAt:      snap.createdAt,
        diagnosticData: snap.diagnosticData ?? null,
        thumbnail:      snap.thumbnail ?? null,
        notes: {
            text:     snap.notes?.text ?? "",
            tags:     snap.notes?.tags ?? [],
            warnings: snap.notes?.warnings ?? [],
        },
        attachments:    snap.attachments ?? [],
    }));
}

// ─────────────────────────────────────────────────────────────────────────────
// getDiagnosticSnapshot — fetch the singleton diagnostic snapshot for a case
// ─────────────────────────────────────────────────────────────────────────────

/**
 * getDiagnosticSnapshot
 *
 * Returns the singleton diagnostic snapshot for a case (with full chartState).
 * Returns null if none exists yet (UI shows "Start Diagnosis").
 *
 * Used by:
 *   - GET /cases/:caseId/snapshots/diagnostic
 *   - DiagnosticSnapshotModal ("View Diagnosis" mode)
 *
 * @param {Object} req
 * @param {string} caseId
 * @returns {DiagnosticSnapshot | null}
 */
async function getDiagnosticSnapshot(req, caseId) {
    const orthoCase = await caseRepo.findById(req, caseId);
    if (!orthoCase) {
        throw Object.assign(
            new Error("OrthodonticCase not found"),
            { statusCode: 404, code: "CASE_NOT_FOUND" }
        );
    }

    // findDiagnosticByCase excludes chartState — for modal open we need full doc
    const snap = await snapshotRepo.findById(req,
        // findById requires _id — use findByCase with type filter to get the _id first
        (await snapshotRepo.findDiagnosticByCase(req, caseId))?._id?.toString() ?? "000000000000000000000000"
    );

    if (!snap) return null;

    return {
        snapshotId:    snap._id.toString(),
        type:          snap.type,
        snapshotDate:  snap.snapshotDate ?? snap.createdAt,
        chartState:    snap.chartState,
        diagnosticData: snap.diagnosticData ?? null,
        attachments:   snap.attachments ?? [],
        notes: {
            text:     snap.notes?.text ?? "",
            tags:     snap.notes?.tags ?? [],
            warnings: snap.notes?.warnings ?? [],
        },
        thumbnail:     snap.thumbnail ?? null,
        createdAt:     snap.createdAt,
        createdBy:     snap.createdBy?.toString() ?? null,
    };
}

module.exports = { saveSnapshot, getTimeline, getPretreatmentVersions, getDiagnosticSnapshot };
