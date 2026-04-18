"use strict";

/**
 * orthodonticDashboard.dto.js
 * Situation Room payload — authoritative contract.
 *
 * Shape is locked per TDS. All timestamps are ISO strings. All counts are numbers.
 * Missing sub-sections are returned as safe defaults (empty arrays / zeroed objects)
 * so the UI can render even when an individual pipeline fails.
 */

const SAFE_KPIS = Object.freeze({
    activeCount: 0,
    inTreatmentCount: 0,
    overdueAdjustments: 0,
    avgAlignerProgress: 0,
    criticalEventsToday: 0,
    todayVisits: 0,
});

const SAFE_INVENTORY = Object.freeze({
    activeBrackets: 0,
    activeTads: 0,
    bracketsDebondedThisMonth: 0,
});

const SAFE_PHOTO_COVERAGE = Object.freeze({
    casesWithBaseline: 0,
    casesWithProgress: 0,
    totalActive: 0,
});

function num(v, dflt = 0) {
    const n = Number(v);
    return Number.isFinite(n) ? n : dflt;
}

function str(v, dflt = null) {
    return v === undefined || v === null ? dflt : String(v);
}

function iso(v) {
    if (!v) return null;
    if (v instanceof Date) return v.toISOString();
    const d = new Date(v);
    return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

function buildKpisDTO(k = {}) {
    return {
        activeCount: num(k.activeCount),
        inTreatmentCount: num(k.inTreatmentCount),
        overdueAdjustments: num(k.overdueAdjustments),
        avgAlignerProgress: num(k.avgAlignerProgress),
        criticalEventsToday: num(k.criticalEventsToday),
        todayVisits: num(k.todayVisits),
    };
}

function buildStageDistributionDTO(rows = []) {
    return rows.map((r) => ({
        stage: str(r.stage),
        count: num(r.count),
    }));
}

function buildDurationVarianceDTO(rows = []) {
    return rows.map((r) => ({
        bucket: str(r.bucket),
        count: num(r.count),
    }));
}

function buildDoctorWorkloadDTO(rows = []) {
    return rows.map((r) => ({
        doctorId: str(r.doctorId),
        doctorName: str(r.doctorName, "Unknown"),
        activeCases: num(r.activeCases),
        visitsThisWeek: num(r.visitsThisWeek),
    }));
}

function buildApplianceInventoryDTO(inv = {}) {
    return {
        activeBrackets: num(inv.activeBrackets),
        activeTads: num(inv.activeTads),
        bracketsDebondedThisMonth: num(inv.bracketsDebondedThisMonth),
    };
}

function buildPhotoCoverageDTO(pc = {}) {
    return {
        casesWithBaseline: num(pc.casesWithBaseline),
        casesWithProgress: num(pc.casesWithProgress),
        totalActive: num(pc.totalActive),
    };
}

function buildOverdueCasesDTO(rows = []) {
    return rows.map((r) => ({
        caseId: str(r.caseId),
        patientName: str(r.patientName, "Unknown"),
        daysSinceLastVisit: num(r.daysSinceLastVisit),
        lastVisitAt: iso(r.lastVisitAt),
    }));
}

function buildCriticalAlertsDTO(rows = []) {
    return rows.map((r) => ({
        eventId: str(r.eventId),
        caseId: str(r.caseId),
        patientName: str(r.patientName, "Unknown"),
        severity: str(r.severity, "critical"),
        type: str(r.type, "UNKNOWN"),
        at: iso(r.at),
    }));
}

function buildDashboardDTO(parts = {}) {
    return {
        kpis: buildKpisDTO(parts.kpis || SAFE_KPIS),
        stageDistribution: buildStageDistributionDTO(parts.stageDistribution || []),
        durationVariance: buildDurationVarianceDTO(parts.durationVariance || []),
        doctorWorkload: buildDoctorWorkloadDTO(parts.doctorWorkload || []),
        applianceInventory: buildApplianceInventoryDTO(parts.applianceInventory || SAFE_INVENTORY),
        photoCoverage: buildPhotoCoverageDTO(parts.photoCoverage || SAFE_PHOTO_COVERAGE),
        overdueCases: buildOverdueCasesDTO(parts.overdueCases || []),
        criticalAlerts: buildCriticalAlertsDTO(parts.criticalAlerts || []),
        generatedAt: iso(parts.generatedAt) || new Date().toISOString(),
        scope: str(parts.scope, "owner"),
    };
}

module.exports = {
    buildDashboardDTO,
    buildKpisDTO,
    buildStageDistributionDTO,
    buildDurationVarianceDTO,
    buildDoctorWorkloadDTO,
    buildApplianceInventoryDTO,
    buildPhotoCoverageDTO,
    buildOverdueCasesDTO,
    buildCriticalAlertsDTO,
    SAFE_KPIS,
    SAFE_INVENTORY,
    SAFE_PHOTO_COVERAGE,
};
