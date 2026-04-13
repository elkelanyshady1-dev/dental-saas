/**
 * diagnosticMapper.service.js
 * Domain: orthodontic-cases
 * Layer: Application > Services
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * PURPOSE
 * ═══════════════════════════════════════════════════════════════════════════
 * Extracts ClinicalSnapshot.diagnosticData from OrthodonticCase.workflowData.
 *
 * DATA LOCATION IN workflowData:
 *   workflowData.recordSets[n].records[m].analysis  → ceph, photo, OPG
 *   workflowData.recordSets[n].castAnalysis          → cast analysis
 *
 * RECORD TYPES (PhotoRecord.type):
 *   "ceph"       → ceph analysis (SNA, SNB, ANB, MMP, U1_PP, L1_MP, CVM inputs)
 *   "panoramic"  → OPG (additionalFindings, boneLevel, tmj)
 *   "intraoral"  → photo analysis (canine/molar class, incisor class)
 *   "extraoral"  → photo analysis (profile, smile, frontal)
 *   "occlusal"   → occlusal analysis
 *
 * OUTPUT SHAPE (ClinicalSnapshot.diagnosticData):
 *   {
 *     cephAnalysis:  { SNA, SNB, ANB, MMP, U1_PP, L1_MP, cvmStage, C2_lower_border, ... }
 *     cvmAnalysis:   { stage, growthStatus }   ← deprecated, derived from cephAnalysis
 *     photoAnalysis: { [recordId]: { [key]: value } }
 *     opgFindings:   { additionalFindings, boneLevel, tmj }
 *     castAnalysis:  { input, result, savedAt }
 *   }
 *
 * IMMUTABILITY: This is a pure function — no DB calls, no side effects.
 * ═══════════════════════════════════════════════════════════════════════════
 */

"use strict";

// ─────────────────────────────────────────────────────────────────────────────
// _getLatestRecordSet
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Returns the most relevant RecordSet from workflowData.
 *
 * Priority:
 *   1. RecordSet with type="PRE" (primary diagnostic source)
 *   2. First recordSet if only one exists
 *   3. null if none
 *
 * @param {Object} workflowData
 * @returns {Object|null}
 */
function _getLatestRecordSet(workflowData) {
    const sets = workflowData?.recordSets;
    if (!Array.isArray(sets) || sets.length === 0) return null;

    // Prefer the PRE type (it holds the baseline diagnostic data)
    const preSet = sets.find((rs) => rs.type === "PRE");
    if (preSet) return preSet;

    // Fall back to most recently created (last in array, or use date if available)
    return sets[sets.length - 1] ?? null;
}

// ─────────────────────────────────────────────────────────────────────────────
// _extractCeph
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Extracts cephalometric measurements from records.
 * Finds the record with type="ceph" and returns its analysis.
 *
 * Stored flat in analysis: { sna, snb, anb, mmp, u1_pp, l1_mp, cvmStage, ... }
 * Frontend uses lowercase keys; we preserve as-is.
 *
 * @param {Object[]} records
 * @returns {Object|null}
 */
function _extractCeph(records) {
    if (!Array.isArray(records)) return null;

    const cephRecord = records.find((r) => r.type === "ceph");
    if (!cephRecord || !cephRecord.analysis) return null;

    // Strip empty analysis objects (no measurements entered)
    if (Object.keys(cephRecord.analysis).length === 0) return null;

    return { ...cephRecord.analysis };
}

// ─────────────────────────────────────────────────────────────────────────────
// _extractCVM
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Derives CVM analysis from ceph analysis data.
 * cvmStage is stored inside cephRecord.analysis.cvmStage.
 *
 * @param {Object|null} cephAnalysis
 * @returns {Object|null}
 */
function _extractCVM(cephAnalysis) {
    if (!cephAnalysis) return null;

    const stage = cephAnalysis.cvmStage ?? cephAnalysis.cvm ?? null;
    if (!stage) return null;

    // Map CVMS stage to growth status string
    const growthMap = {
        CVMS1: "Pre-peak growth (significant potential)",
        CVMS2: "Pre-peak growth",
        CVMS3: "Peak growth (optimal intervention window)",
        CVMS4: "Post-peak (some modification possible)",
        CVMS5: "Growth nearly complete",
        CVMS6: "Growth complete",
    };

    return {
        stage,
        growthStatus: growthMap[stage] ?? stage,
    };
}

// ─────────────────────────────────────────────────────────────────────────────
// _extractPhotos
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Extracts photo analysis keyed by record ID.
 * Skips ceph (handled separately) and records with no analysis data.
 *
 * @param {Object[]} records
 * @returns {Object|null}  { [recordId]: analysis } or null if empty
 */
function _extractPhotos(records) {
    if (!Array.isArray(records)) return null;

    const result = {};

    for (const record of records) {
        // Skip ceph — handled by _extractCeph
        if (record.type === "ceph") continue;
        // Skip records with no URL (not uploaded) or empty analysis
        if (!record.url) continue;
        if (!record.analysis || Object.keys(record.analysis).length === 0) continue;

        const key = record.id ?? record.label ?? record.type;
        if (key) {
            result[key] = {
                type:     record.type,
                label:    record.label ?? null,
                analysis: { ...record.analysis },
            };
        }
    }

    if (Object.keys(result).length === 0) return null;
    return result;
}

// ─────────────────────────────────────────────────────────────────────────────
// _extractOPG
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Extracts OPG / panoramic findings.
 * Finds the record with type="panoramic" and returns its analysis.
 *
 * @param {Object[]} records
 * @returns {Object|null}
 */
function _extractOPG(records) {
    if (!Array.isArray(records)) return null;

    const opg = records.find((r) => r.type === "panoramic");
    if (!opg || !opg.analysis || Object.keys(opg.analysis).length === 0) return null;

    return { ...opg.analysis };
}

// ─────────────────────────────────────────────────────────────────────────────
// buildDiagnosticData (PUBLIC)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Maps OrthodonticCase.workflowData → ClinicalSnapshot.diagnosticData.
 *
 * Returns null if no diagnostic data is found (new case, no records yet).
 * Returns partial object if only some modules have data — never throws.
 *
 * @param {Object} workflowData  — from OrthodonticCase.workflowData
 * @returns {Object|null}        — ClinicalSnapshot.diagnosticData shape
 */
function buildDiagnosticData(workflowData) {
    const recordSet = _getLatestRecordSet(workflowData);
    if (!recordSet) return null;

    // Merge records + photos — some versions store in either field
    const records = [
        ...(Array.isArray(recordSet.records) ? recordSet.records : []),
        ...(Array.isArray(recordSet.photos)  ? recordSet.photos  : []),
    ];

    const cephAnalysis  = _extractCeph(records);
    const cvmAnalysis   = _extractCVM(cephAnalysis);
    const photoAnalysis = _extractPhotos(records);
    const opgFindings   = _extractOPG(records);
    const castAnalysis  = recordSet.castAnalysis ?? null;

    // If absolutely nothing is present, return null (no diagnostic data yet)
    if (!cephAnalysis && !photoAnalysis && !opgFindings && !castAnalysis) {
        return null;
    }

    return {
        cephAnalysis:  cephAnalysis  ?? null,
        cvmAnalysis:   cvmAnalysis   ?? null,
        photoAnalysis: photoAnalysis ?? null,
        opgFindings:   opgFindings   ?? null,
        castAnalysis:  castAnalysis  ?? null,
    };
}

// ─────────────────────────────────────────────────────────────────────────────
// hasAnyDiagnosticData (PUBLIC GUARD)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Quick guard — checks if workflowData has enough data to warrant promotion.
 * Used to skip snapshot creation when the workflow is empty.
 *
 * @param {Object} workflowData
 * @returns {boolean}
 */
function hasAnyDiagnosticData(workflowData) {
    const recordSet = _getLatestRecordSet(workflowData);
    if (!recordSet) return false;

    const records = [
        ...(Array.isArray(recordSet.records) ? recordSet.records : []),
        ...(Array.isArray(recordSet.photos)  ? recordSet.photos  : []),
    ];

    const hasPhotos    = records.some((r) => !!r.url);
    const hasCast      = !!recordSet.castAnalysis;
    const hasAnalysis  = records.some((r) => r.analysis && Object.keys(r.analysis).length > 0);

    return hasPhotos || hasCast || hasAnalysis;
}

module.exports = {
    buildDiagnosticData,
    hasAnyDiagnosticData,
};
