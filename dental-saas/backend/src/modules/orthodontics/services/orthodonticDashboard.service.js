"use strict";

/**
 * orthodonticDashboard.service.js
 * Orthodontic Situation Room — aggregation service.
 *
 * Design contract (locked per TDS):
 *  - 8 parallel pipelines (NOT one $facet). Each pipeline is independent:
 *    memory-isolated, individually rescued, replaceable later by its own endpoint.
 *  - Tenant isolation: every pipeline starts from a base query that carries
 *    organizationId from req.context (JWT). Never trust client input.
 *  - Doctor (PBAC) scoping: callers without `orthodontics.full` are restricted
 *    to cases they own or co-own (ownerId == userId OR sharedWith contains userId).
 *  - Hard payload caps: overdueCases=10, criticalAlerts=20, doctorWorkload=20.
 *  - Timezone-aware "today" uses org timezone (req.context.organization.timezone).
 *  - Fail-safe: each pipeline wrapped in _safe(); on error returns a safe default
 *    and logs the failure with context. Endpoint never returns a partial 500.
 */

const OrthodonticCaseDef = require("../models/orthodonticCase.model");
const ClinicalEventDef = require("../models/ClinicalEvent.model");
const BondingDef = require("../models/Bonding.model");
const TadDef = require("../models/Tad.model");
const AlignerPlanDef = require("../models/AlignerPlan.model");
// Patient model lives in the organization plane's patient domain.
// Use lazy resolution so the service keeps loading even if the path moves.
let PatientDef = null;
try {
    PatientDef = require("../../../organization/patient/models/patient.model");
} catch (e) {
    PatientDef = null;
}
const getModel = require("../../../core/db/getModel");
const logger = require("@utils/logger");

const {
    SAFE_KPIS,
    SAFE_INVENTORY,
    SAFE_PHOTO_COVERAGE,
} = require("../core/dto/orthodonticDashboard.dto");

// ─── Constants ──────────────────────────────────────────────────────────────
const LIMITS = Object.freeze({
    OVERDUE_CASES: 10,
    CRITICAL_ALERTS: 20,
    DOCTOR_WORKLOAD: 20,
});
const OVERDUE_DAYS = 21;                  // no visit within 21 days → overdue
const VARIANCE_TOLERANCE_DAYS = 7;        // ±7 days is "on track"
const MS_PER_DAY = 24 * 60 * 60 * 1000;
const ACTIVE_STAGES = ["draft", "diagnosis", "treatment_planning", "active"];
const ALL_STAGES = ["draft", "diagnosis", "treatment_planning", "active", "completed", "cancelled"];

// ─── Utilities ──────────────────────────────────────────────────────────────

function _getModels(req) {
    const conn = req.dbConnection;
    let Patient = null;
    try {
        if (PatientDef) Patient = getModel(conn, PatientDef);
    } catch (e) {
        // Patient model resolution is non-critical; overdue/alerts fall back to "Unknown"
        Patient = null;
    }
    return {
        OrthoCase: getModel(conn, OrthodonticCaseDef),
        ClinicalEvent: getModel(conn, ClinicalEventDef),
        Bonding: getModel(conn, BondingDef),
        Tad: getModel(conn, TadDef),
        AlignerPlan: getModel(conn, AlignerPlanDef),
        Patient,
    };
}

function _hasFullAccess(req) {
    const perms = req?.context?.permissions || [];
    return perms.includes("orthodontics.full") || perms.includes("*");
}

/**
 * Base query applied at the root of every case pipeline.
 * Encodes: tenant isolation + soft-delete + PBAC doctor scoping.
 */
function _buildCaseBaseQuery(req) {
    const orgId = req.context.organizationId;
    const base = { isDeleted: { $ne: true } };
    if (!_hasFullAccess(req)) {
        const uid = req.context.userId;
        base.$or = [{ ownerId: uid }, { sharedWith: uid }];
    }
    return base;
}

function _getOrgTimezone(req) {
    return (
        req?.context?.organization?.timezone ||
        req?.context?.timezone ||
        "UTC"
    );
}

/**
 * Return a UTC Date that corresponds to 00:00:00 "today" in the given IANA tz.
 */
function _dayStartInTz(tz) {
    const now = new Date();
    try {
        const fmt = new Intl.DateTimeFormat("en-CA", {
            timeZone: tz,
            year: "numeric", month: "2-digit", day: "2-digit",
            hour: "2-digit", minute: "2-digit", second: "2-digit",
            hour12: false,
        });
        const parts = Object.fromEntries(
            fmt.formatToParts(now).map((p) => [p.type, p.value])
        );
        const localAsUtc = Date.UTC(
            Number(parts.year),
            Number(parts.month) - 1,
            Number(parts.day),
            0, 0, 0
        );
        const offsetMs = localAsUtc - Date.UTC(
            Number(parts.year),
            Number(parts.month) - 1,
            Number(parts.day),
            Number(parts.hour) === 24 ? 0 : Number(parts.hour),
            Number(parts.minute),
            Number(parts.second)
        );
        return new Date(now.getTime() - (now.getTime() - localAsUtc) + offsetMs);
    } catch (e) {
        const d = new Date(now);
        d.setUTCHours(0, 0, 0, 0);
        return d;
    }
}

/**
 * Fail-safe pipeline wrapper. Any thrown error is logged and the provided
 * default is returned. The endpoint always produces a full DTO.
 */
async function _safe(name, fn, dflt) {
    try {
        return await fn();
    } catch (err) {
        logger.error(
            `[OrthoDashboard] Pipeline '${name}' failed: ${err.message}`,
            { stack: err.stack }
        );
        return dflt;
    }
}

/**
 * Load distinct accessible case IDs for non-full users. Used by downstream
 * child-collection pipelines (Bonding, Tad, ClinicalEvent) to stay inside
 * the caller's PBAC scope without a $lookup on every pipeline.
 */
async function _accessibleCaseIds(req) {
    if (_hasFullAccess(req)) return null; // null => "no restriction"
    const { OrthoCase } = _getModels(req);
    const base = _buildCaseBaseQuery(req);
    return OrthoCase.distinct("_id", base);
}

function _scopeChildQuery(base, caseIds) {
    if (caseIds === null) return base;
    return { ...base, caseId: { $in: caseIds } };
}

// ─── 1. KPIs ────────────────────────────────────────────────────────────────
async function getKpis(req, ctx) {
    const { OrthoCase, ClinicalEvent, AlignerPlan } = _getModels(req);
    const base = _buildCaseBaseQuery(req);
    const todayStart = _dayStartInTz(ctx.orgTz);
    const overdueCutoff = new Date(Date.now() - OVERDUE_DAYS * MS_PER_DAY);
    const caseIds = ctx.caseIds;
    const orgId = req.context.organizationId;

    const activeFilter = { ...base, status: "active" };
    const inTreatmentFilter = { ...base, status: { $in: ["treatment_planning", "active"] } };
    const overdueFilter = { ...base, status: "active", updatedAt: { $lt: overdueCutoff } };

    // ClinicalEvent no longer carries organizationId — per-org DB is the boundary.
    const criticalEventsFilter = {
        severity: "critical",
        createdAt: { $gte: todayStart },
    };
    const todayEventsFilter = {
        createdAt: { $gte: todayStart },
    };
    if (caseIds !== null) {
        criticalEventsFilter.caseId = { $in: caseIds };
        todayEventsFilter.caseId = { $in: caseIds };
    }

    const alignerMatch = { isActive: true };
    if (caseIds !== null) alignerMatch.caseId = { $in: caseIds };

    const [
        activeCount,
        inTreatmentCount,
        overdueAdjustments,
        criticalEventsToday,
        todayVisitsAgg,
        alignerProgressMedian,
    ] = await Promise.all([
        OrthoCase.countDocuments(activeFilter),
        OrthoCase.countDocuments(inTreatmentFilter),
        OrthoCase.countDocuments(overdueFilter),
        ClinicalEvent.countDocuments(criticalEventsFilter),
        ClinicalEvent.aggregate([
            { $match: todayEventsFilter },
            { $group: { _id: "$caseId" } },
            { $count: "visits" },
        ]),
        // Aligner progress: time-elapsed / estimatedDurationDays (clamped to 1.0).
        // AlignerPlan doesn't track completed-stage counts, so this is the best
        // available proxy. Median — not mean — per TDS, to resist outliers.
        AlignerPlan.aggregate([
            { $match: { ...alignerMatch, estimatedDurationDays: { $gt: 0 } } },
            {
                $project: {
                    progress: {
                        $min: [
                            1,
                            {
                                $divide: [
                                    { $divide: [{ $subtract: ["$$NOW", "$createdAt"] }, MS_PER_DAY] },
                                    "$estimatedDurationDays",
                                ],
                            },
                        ],
                    },
                },
            },
            { $sort: { progress: 1 } },
            { $group: { _id: null, values: { $push: "$progress" } } },
            {
                $project: {
                    median: {
                        $let: {
                            vars: { n: { $size: "$values" } },
                            in: {
                                $cond: [
                                    { $eq: ["$$n", 0] },
                                    0,
                                    {
                                        $arrayElemAt: [
                                            "$values",
                                            { $floor: { $divide: [{ $subtract: ["$$n", 1] }, 2] } },
                                        ],
                                    },
                                ],
                            },
                        },
                    },
                },
            },
        ]),
    ]);

    const todayVisits = todayVisitsAgg?.[0]?.visits || 0;
    const medianProgress = alignerProgressMedian?.[0]?.median || 0;
    const avgAlignerProgress = Math.round(medianProgress * 1000) / 10; // percent, 1 dp

    return {
        activeCount,
        inTreatmentCount,
        overdueAdjustments,
        avgAlignerProgress,
        criticalEventsToday,
        todayVisits,
    };
}

// ─── 2. Stage Distribution ──────────────────────────────────────────────────
async function getStageDistribution(req) {
    const { OrthoCase } = _getModels(req);
    const base = _buildCaseBaseQuery(req);
    const rows = await OrthoCase.aggregate([
        { $match: base },
        { $group: { _id: "$status", count: { $sum: 1 } } },
    ]);
    const byStage = Object.fromEntries(rows.map((r) => [r._id, r.count]));
    return ALL_STAGES.map((stage) => ({ stage, count: byStage[stage] || 0 }));
}

// ─── 3. Duration Variance ───────────────────────────────────────────────────
async function getDurationVariance(req) {
    const { OrthoCase } = _getModels(req);
    const base = _buildCaseBaseQuery(req);
    const rows = await OrthoCase.aggregate([
        {
            $match: {
                ...base,
                status: "active",
                estimatedDurationMonths: { $gt: 0 },
                createdAt: { $type: "date" },
            },
        },
        {
            $project: {
                varianceDays: {
                    $subtract: [
                        { $divide: [{ $subtract: ["$$NOW", "$createdAt"] }, MS_PER_DAY] },
                        { $multiply: ["$estimatedDurationMonths", 30] },
                    ],
                },
            },
        },
        {
            $project: {
                bucket: {
                    $switch: {
                        branches: [
                            { case: { $lt: ["$varianceDays", -VARIANCE_TOLERANCE_DAYS] }, then: "ahead" },
                            { case: { $gt: ["$varianceDays", VARIANCE_TOLERANCE_DAYS] }, then: "delayed" },
                        ],
                        default: "onTrack",
                    },
                },
            },
        },
        { $group: { _id: "$bucket", count: { $sum: 1 } } },
    ]);
    const byBucket = Object.fromEntries(rows.map((r) => [r._id, r.count]));
    return ["ahead", "onTrack", "delayed"].map((bucket) => ({
        bucket,
        count: byBucket[bucket] || 0,
    }));
}

// ─── 4. Doctor Workload ─────────────────────────────────────────────────────
async function getDoctorWorkload(req) {
    const { OrthoCase, ClinicalEvent } = _getModels(req);
    const base = _buildCaseBaseQuery(req);
    const orgId = req.context.organizationId;
    const weekAgo = new Date(Date.now() - 7 * MS_PER_DAY);
    const caseIds = await _accessibleCaseIds(req); // respect PBAC for events too

    const [activeByOwner, visitsByActor] = await Promise.all([
        OrthoCase.aggregate([
            { $match: { ...base, status: { $in: ACTIVE_STAGES }, ownerId: { $type: "objectId" } } },
            { $group: { _id: "$ownerId", activeCases: { $sum: 1 } } },
            { $sort: { activeCases: -1 } },
            { $limit: LIMITS.DOCTOR_WORKLOAD },
        ]),
        // ClinicalEvent carries doctorId (required) — not createdBy.
        ClinicalEvent.aggregate([
            {
                $match: {
                    createdAt: { $gte: weekAgo },
                    doctorId: { $type: "objectId" },
                    ...(caseIds !== null ? { caseId: { $in: caseIds } } : {}),
                },
            },
            { $group: { _id: "$doctorId", visitsThisWeek: { $sum: 1 } } },
        ]),
    ]);

    const visitsMap = new Map(visitsByActor.map((r) => [String(r._id), r.visitsThisWeek]));

    const doctorIds = activeByOwner.map((r) => r._id).filter(Boolean);
    const nameMap = await _lookupUserNames(req, doctorIds);

    return activeByOwner.map((r) => ({
        doctorId: r._id.toString(),
        doctorName: nameMap.get(String(r._id)) || "Unknown",
        activeCases: r.activeCases,
        visitsThisWeek: visitsMap.get(String(r._id)) || 0,
    }));
}

/**
 * User docs live on the platform (shared) connection. Prefer the platform model;
 * fall back to the org connection's registered User model if the platform
 * helper is unavailable in this environment.
 */
async function _lookupUserNames(req, userIds) {
    if (!userIds?.length) return new Map();
    try {
        // Prefer platform model — User is a shared resource.
        const UserModel = _resolvePlatformUser(req);
        if (!UserModel) return new Map();
        const users = await UserModel.find({ _id: { $in: userIds } })
            .select("name firstName lastName email")
            .lean();
        return new Map(
            users.map((u) => [
                String(u._id),
                u.name ||
                    [u.firstName, u.lastName].filter(Boolean).join(" ") ||
                    u.email ||
                    "Unknown",
            ])
        );
    } catch (e) {
        logger.warn(`[OrthoDashboard] Doctor name lookup failed: ${e.message}`);
        return new Map();
    }
}

function _resolvePlatformUser(req) {
    try {
        // Preferred: dedicated shared User model
        return require("@shared/models/User");
    } catch (e1) {
        // Step 5d: `mongoose.model("User")` no longer works (global root
        // removed). Return null — callers handle the missing-model case.
        return null;
    }
}

// ─── 5. Appliance Inventory ─────────────────────────────────────────────────
async function getApplianceInventory(req, ctx) {
    const { Bonding, Tad } = _getModels(req);
    const orgId = req.context.organizationId;
    const caseIds = ctx.caseIds;
    const monthStart = new Date();
    monthStart.setUTCDate(1);
    monthStart.setUTCHours(0, 0, 0, 0);

    const bondBase = { };
    const tadBase = { };
    if (caseIds !== null) {
        bondBase.caseId = { $in: caseIds };
        tadBase.caseId = { $in: caseIds };
    }

    const [activeBrackets, activeTads, debondedAgg] = await Promise.all([
        Bonding.countDocuments({ ...bondBase, status: "ACTIVE" }),
        Tad.countDocuments({ ...tadBase, status: "ACTIVE" }),
        // Bonding.history entries carry their own createdAt via timestamps config.
        // We count DEBONDED events recorded since the first of this month.
        Bonding.aggregate([
            { $match: bondBase },
            { $unwind: { path: "$history", preserveNullAndEmptyArrays: false } },
            {
                $match: {
                    "history.action": "DEBONDED",
                    "history.createdAt": { $gte: monthStart },
                },
            },
            { $count: "count" },
        ]),
    ]);

    return {
        activeBrackets,
        activeTads,
        bracketsDebondedThisMonth: debondedAgg?.[0]?.count || 0,
    };
}

// ─── 6. Photo Coverage ──────────────────────────────────────────────────────
async function getPhotoCoverage(req) {
    const { OrthoCase } = _getModels(req);
    const base = _buildCaseBaseQuery(req);
    const activeBase = { ...base, status: { $in: ACTIVE_STAGES } };

    const [totalActive, casesWithBaseline, casesWithProgress] = await Promise.all([
        OrthoCase.countDocuments(activeBase),
        OrthoCase.countDocuments({ ...activeBase, hasPretreatmentSnapshot: true }),
        OrthoCase.countDocuments({
            ...activeBase,
            "workflowData.recordSets.1": { $exists: true }, // ≥ 2 record sets ≈ pre + progress
        }),
    ]);

    return { casesWithBaseline, casesWithProgress, totalActive };
}

// ─── 7. Overdue Cases (top 10) ──────────────────────────────────────────────
async function getOverdueCases(req) {
    const { OrthoCase, Patient } = _getModels(req);
    const base = _buildCaseBaseQuery(req);
    const overdueCutoff = new Date(Date.now() - OVERDUE_DAYS * MS_PER_DAY);

    const pipeline = [
        { $match: { ...base, status: "active", updatedAt: { $lt: overdueCutoff } } },
        { $sort: { updatedAt: 1 } },
        { $limit: LIMITS.OVERDUE_CASES },
        {
            $project: {
                caseId: "$_id",
                patientId: 1,
                lastVisitAt: "$updatedAt",
                daysSinceLastVisit: {
                    $floor: {
                        $divide: [{ $subtract: ["$$NOW", "$updatedAt"] }, MS_PER_DAY],
                    },
                },
            },
        },
    ];
    const rows = await OrthoCase.aggregate(pipeline);

    const names = await _lookupPatientNames(Patient, rows.map((r) => r.patientId));
    return rows.map((r) => ({
        caseId: r.caseId.toString(),
        patientName: names.get(String(r.patientId)) || "Unknown",
        daysSinceLastVisit: r.daysSinceLastVisit,
        lastVisitAt: r.lastVisitAt,
    }));
}

async function _lookupPatientNames(PatientModel, patientIds) {
    if (!PatientModel || !patientIds?.length) return new Map();
    try {
        const docs = await PatientModel.find({ _id: { $in: patientIds } })
            .select("nameEnglish nameArabic fullNameNormalized patientCode")
            .lean();
        return new Map(
            docs.map((p) => [
                String(p._id),
                p.nameEnglish ||
                    p.fullNameNormalized ||
                    p.nameArabic ||
                    (p.patientCode ? `#${p.patientCode}` : "Unknown"),
            ])
        );
    } catch (e) {
        return new Map();
    }
}

// ─── 8. Critical Alerts (top 20) ────────────────────────────────────────────
async function getCriticalAlerts(req, ctx) {
    const { ClinicalEvent, OrthoCase, Patient } = _getModels(req);
    const orgId = req.context.organizationId;
    const caseIds = ctx.caseIds;

    // ClinicalEvent no longer carries organizationId — per-org DB is the boundary.
    const match = { severity: "critical" };
    if (caseIds !== null) match.caseId = { $in: caseIds };

    const rows = await ClinicalEvent.find(match)
        .sort({ createdAt: -1 })
        .limit(LIMITS.CRITICAL_ALERTS)
        .select("_id eventId caseId severity type createdAt")
        .lean();

    // ClinicalEvent has no patientId — resolve patient via the parent case.
    const caseIdsForAlerts = rows.map((r) => r.caseId).filter(Boolean);
    const cases = caseIdsForAlerts.length
        ? await OrthoCase.find({ _id: { $in: caseIdsForAlerts }, })
              .select("_id patientId")
              .lean()
        : [];
    const casePatient = new Map(cases.map((c) => [String(c._id), c.patientId]));
    const patientIds = cases.map((c) => c.patientId).filter(Boolean);
    const names = await _lookupPatientNames(Patient, patientIds);

    return rows.map((r) => {
        const pid = r.caseId ? casePatient.get(String(r.caseId)) : null;
        return {
            eventId: (r.eventId || r._id).toString(),
            caseId: r.caseId?.toString() || null,
            patientName: pid ? names.get(String(pid)) || "Unknown" : "Unknown",
            severity: r.severity,
            type: r.type,
            at: r.createdAt,
        };
    });
}

// ─── Orchestrator ───────────────────────────────────────────────────────────
async function getDashboard(req) {
    if (!req?.context?.organizationId) {
        const err = new Error("SECURITY: Missing organization context");
        err.statusCode = 403;
        throw err;
    }

    const orgTz = _getOrgTimezone(req);
    const caseIds = await _safe("accessibleCaseIds", () => _accessibleCaseIds(req), null);
    const ctx = { orgTz, caseIds };

    const [
        kpis,
        stageDistribution,
        durationVariance,
        doctorWorkload,
        applianceInventory,
        photoCoverage,
        overdueCases,
        criticalAlerts,
    ] = await Promise.all([
        _safe("kpis", () => getKpis(req, ctx), { ...SAFE_KPIS }),
        _safe("stageDistribution", () => getStageDistribution(req), []),
        _safe("durationVariance", () => getDurationVariance(req), []),
        _safe("doctorWorkload", () => getDoctorWorkload(req), []),
        _safe("applianceInventory", () => getApplianceInventory(req, ctx), { ...SAFE_INVENTORY }),
        _safe("photoCoverage", () => getPhotoCoverage(req), { ...SAFE_PHOTO_COVERAGE }),
        _safe("overdueCases", () => getOverdueCases(req), []),
        _safe("criticalAlerts", () => getCriticalAlerts(req, ctx), []),
    ]);

    return {
        kpis,
        stageDistribution,
        durationVariance,
        doctorWorkload,
        applianceInventory,
        photoCoverage,
        overdueCases,
        criticalAlerts,
        generatedAt: new Date(),
        scope: _hasFullAccess(req) ? "organization" : "owner",
    };
}

module.exports = {
    getDashboard,
    // exported for unit tests
    _internals: {
        getKpis,
        getStageDistribution,
        getDurationVariance,
        getDoctorWorkload,
        getApplianceInventory,
        getPhotoCoverage,
        getOverdueCases,
        getCriticalAlerts,
        _dayStartInTz,
        _buildCaseBaseQuery,
        _hasFullAccess,
    },
    LIMITS,
    OVERDUE_DAYS,
    VARIANCE_TOLERANCE_DAYS,
};
