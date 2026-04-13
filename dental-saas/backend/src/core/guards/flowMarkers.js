/**
 * flowMarkers.js — Request Flow Markers (lightweight)
 * 
 * Replaces the legacy secureFlowAssertion.js markers.
 * These are simple req property setters used by RBAC middleware
 * to mark that field-level security was applied.
 */

"use strict";

function markFLSReadApplied(req) {
    if (req && typeof req === "object") {
        req._secureFlowMarkers = req._secureFlowMarkers || {};
        req._secureFlowMarkers.flsReadApplied = true;
    }
}

function markFLSWriteApplied(req) {
    if (req && typeof req === "object") {
        req._secureFlowMarkers = req._secureFlowMarkers || {};
        req._secureFlowMarkers.flsWriteApplied = true;
    }
}

module.exports = {
    markFLSReadApplied,
    markFLSWriteApplied,
};
