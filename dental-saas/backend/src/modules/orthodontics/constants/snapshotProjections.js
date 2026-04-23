/**
 * snapshotProjections.js — ClinicalSnapshot Projection Constants
 * Domain: orthodontic-visits
 * Layer: Constants
 *
 * Centralizes MongoDB projections for ClinicalSnapshot queries.
 * ClinicalSnapshot documents are LARGE (chartState alone is a full dental chart).
 * Every consumer MUST use the appropriate projection to avoid over-fetching.
 *
 * HARD RULE: Never fetch ClinicalSnapshot without a projection unless the
 * consumer genuinely needs the full document (e.g., snapshot viewer, restore).
 */

"use strict";

/**
 * Projection for timeline / visit-card queries.
 *
 * Includes ONLY the fields needed by `buildVisitCardDTO`:
 *   - procedures  → wires extraction + key actions
 *   - notes       → alert extraction (warnings, tags)
 *   - thumbnail   → visual preview in card
 *   - chartState.upperArchwire / lowerArchwire → wire fallback
 *
 * Excludes:
 *   - chartState (full)    → ~100KB+ per document
 *   - diagnosticData       → ~50KB+ per document
 *   - bondingSnapshot      → array of sub-documents
 *   - tadSnapshot          → array of sub-documents
 *   - attachments          → file metadata array
 */
const SNAPSHOT_TIMELINE_PROJECTION = Object.freeze({
    _id:                       1,
    procedures:                1,
    notes:                     1,
    thumbnail:                 1,
    "chartState.upperArchwire": 1,
    "chartState.lowerArchwire": 1,
});

/**
 * Projection for full visit report (single visit detail view).
 *
 * Excludes only `diagnosticData` — not used by `buildVisitReportDTO`
 * and can be very large for diagnostic snapshots.
 *
 * All other fields are needed for the full report DTO.
 */
const SNAPSHOT_REPORT_PROJECTION = Object.freeze({
    diagnosticData: 0,
});

module.exports = {
    SNAPSHOT_TIMELINE_PROJECTION,
    SNAPSHOT_REPORT_PROJECTION,
};
