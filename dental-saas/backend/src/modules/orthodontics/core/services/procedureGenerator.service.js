/**
 * procedureGenerator.service.js
 * Domain: orthodontic-cases
 * Layer: Application > Services
 *
 * SNAPSHOT DIFF ENGINE
 * Derives clinical procedures by comparing two consecutive chartState objects.
 * "What was done this visit" = what changed between prevSnapshot and newSnapshot.
 *
 * RULES:
 *   - Input: prevChartState (can be null for first visit), newChartState
 *   - Output: Procedure[] — structured records of clinical changes
 *   - NO external calls — pure computation
 *   - DETERMINISTIC — same inputs always produce same outputs
 *
 * PROCEDURE TYPES DETECTED:
 *   Teeth:    bonding | debonding | rebonding | extraction | tooth_status_change
 *   Wire:     wire_change | wire_removal | wire_placement
 *   Elastics: elastic_placement | elastic_removal
 *   Appliances: appliance_placement | appliance_removal
 *   Miniscrews: miniscrew_placement | miniscrew_removal
 *   IPR:      ipr
 *   PowerChain: powerchain_change
 */

"use strict";

const { v4: uuid } = require("uuid");
const { PROCEDURE_TYPES } = require("../constants/procedureTypes");

// ── Tooth status categories ───────────────────────────────────────────────────

const BRACKET_STATUSES = new Set([
    "bracket", "molar-tube", "band",
]);

const FIXED_STATUSES = new Set([
    "bracket", "molar-tube", "band", "repositioning",
]);

const MISSING_STATUSES = new Set([
    "missing", "extracted", "impacted",
]);

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function toothKey(tooth) {
    return String(tooth.id);
}

function buildToothMap(teeth = []) {
    const map = new Map();
    for (const t of teeth) {
        map.set(toothKey(t), t);
    }
    return map;
}

function makeProc(type, toothId, metadata = {}) {
    return {
        id:        uuid(),
        type,
        target:    toothId != null ? { toothId: Number(toothId) } : null,
        metadata,
        timestamp: new Date().toISOString(),
    };
}

// ─────────────────────────────────────────────────────────────────────────────
// Tooth diff
// ─────────────────────────────────────────────────────────────────────────────

function diffTeeth(prevTeeth = [], newTeeth = []) {
    const procedures = [];
    const prevMap = buildToothMap(prevTeeth);
    const newMap  = buildToothMap(newTeeth);

    // Iterate over ALL teeth in the new state
    for (const [key, newTooth] of newMap) {
        const prevTooth = prevMap.get(key);
        const prev = prevTooth?.status ?? "healthy";
        const next = newTooth.status;

        if (prev === next) {
            // Same status — check bracket prescription changes (rebonding)
            if (BRACKET_STATUSES.has(next)) {
                const prescriptionChanged =
                    prevTooth?.prescription !== newTooth.prescription ||
                    prevTooth?.slotSize     !== newTooth.slotSize ||
                    prevTooth?.brand        !== newTooth.brand;
                if (prescriptionChanged) {
                    procedures.push(makeProc(PROCEDURE_TYPES.REBONDING, key, {
                        prevPrescription: prevTooth?.prescription,
                        newPrescription:  newTooth.prescription,
                        prevBrand:        prevTooth?.brand,
                        newBrand:         newTooth.brand,
                    }));
                }
            }
            continue;
        }

        // ── Status changed ──

        // Previously had a bracket, now does not → debonding
        if (BRACKET_STATUSES.has(prev) && !BRACKET_STATUSES.has(next)) {
            procedures.push(makeProc(PROCEDURE_TYPES.DEBONDING, key, {
                prevStatus: prev,
                newStatus:  next,
            }));
        }

        // Now has a bracket, previously did not → bonding
        if (BRACKET_STATUSES.has(next) && !BRACKET_STATUSES.has(prev)) {
            procedures.push(makeProc(PROCEDURE_TYPES.BONDING, key, {
                prevStatus: prev,
                newStatus:  next,
                prescription: newTooth.prescription,
                slotSize:     newTooth.slotSize,
                brand:        newTooth.brand,
            }));
        }

        // Extraction / newly missing
        if (
            !MISSING_STATUSES.has(prev) &&
            (next === "extracted" || next === "missing")
        ) {
            procedures.push(makeProc(PROCEDURE_TYPES.EXTRACTION, key, {
                prevStatus: prev,
                newStatus:  next,
            }));
        }

        // Alert placed on tooth
        if (prev !== "alert" && next === "alert" && newTooth.alertNote) {
            procedures.push(makeProc(PROCEDURE_TYPES.TOOTH_ALERT, key, {
                note: newTooth.alertNote,
            }));
        }

        // Generic non-bracket status change (repositioning, torque adjustments, etc.)
        if (
            !BRACKET_STATUSES.has(prev) &&
            !BRACKET_STATUSES.has(next) &&
            !MISSING_STATUSES.has(next) &&
            next !== "alert" &&
            next !== "healthy"
        ) {
            procedures.push(makeProc(PROCEDURE_TYPES.TOOTH_STATUS_CHANGE, key, {
                prevStatus: prev,
                newStatus:  next,
            }));
        }
    }

    return procedures;
}

// ─────────────────────────────────────────────────────────────────────────────
// Archwire diff
// ─────────────────────────────────────────────────────────────────────────────

function diffArchwire(prevWire, newWire, arch) {
    const procedures = [];
    const prevMaterial = prevWire?.material ?? "None";
    const nextMaterial = newWire?.material  ?? "None";
    const prevSize     = prevWire?.size ?? "None";
    const nextSize     = newWire?.size  ?? "None";

    const wasPresent = prevMaterial !== "None";
    const isPresent  = nextMaterial !== "None";

    if (!wasPresent && isPresent) {
        procedures.push(makeProc(PROCEDURE_TYPES.WIRE_PLACEMENT, null, {
            arch,
            material: nextMaterial,
            size:     nextSize,
        }));
    } else if (wasPresent && !isPresent) {
        procedures.push(makeProc(PROCEDURE_TYPES.WIRE_REMOVAL, null, {
            arch,
            prevMaterial,
            prevSize,
        }));
    } else if (wasPresent && isPresent && (prevMaterial !== nextMaterial || prevSize !== nextSize)) {
        procedures.push(makeProc(PROCEDURE_TYPES.WIRE_CHANGE, null, {
            arch,
            prevMaterial,
            prevSize,
            newMaterial: nextMaterial,
            newSize:     nextSize,
        }));
    }

    return procedures;
}

// ─────────────────────────────────────────────────────────────────────────────
// Collection diff (elastics, appliances, miniscrews, powerChains)
// Uses ID-based comparison for presence/removal detection.
// ─────────────────────────────────────────────────────────────────────────────

function diffCollection(prevItems = [], newItems = [], addedType, removedType, getMetadata) {
    const procedures = [];
    const prevIds = new Set(prevItems.map((i) => String(i.id)));
    const newIds  = new Set(newItems.map((i) => String(i.id)));

    for (const item of newItems) {
        if (!prevIds.has(String(item.id))) {
            procedures.push(makeProc(addedType, null, getMetadata ? getMetadata(item) : { item }));
        }
    }
    for (const item of prevItems) {
        if (!newIds.has(String(item.id))) {
            procedures.push(makeProc(removedType, null, getMetadata ? getMetadata(item) : { item }));
        }
    }

    return procedures;
}

// ─────────────────────────────────────────────────────────────────────────────
// IPR markers diff
// ─────────────────────────────────────────────────────────────────────────────

function diffIprMarkers(prevMarkers = [], newMarkers = []) {
    const procedures = [];
    const prevIds = new Set(prevMarkers.map((m) => String(m.id)));

    for (const marker of newMarkers) {
        if (!prevIds.has(String(marker.id))) {
            procedures.push(makeProc(PROCEDURE_TYPES.IPR, marker.toothId, {
                anchorType: marker.anchorType,
                value:      marker.value,
            }));
        }
    }

    return procedures;
}

// ─────────────────────────────────────────────────────────────────────────────
// Bonding snapshot diff (True Clinical Snapshot v2)
// Compares prev vs new bondingSnapshot[] to detect bracket changes at DB level.
// More reliable than chartState teeth-based diff for bonding events.
// ─────────────────────────────────────────────────────────────────────────────

function diffBondingSnapshot(prevBonding = [], newBonding = []) {
    const procedures = [];
    const prevMap = new Map(prevBonding.map((b) => [b.tooth, b]));
    const newMap  = new Map(newBonding.map((b) => [b.tooth, b]));

    for (const [tooth, curr] of newMap) {
        const prev = prevMap.get(tooth);

        if (!prev) {
            // New bracket placed this visit
            if (curr.status === "ACTIVE") {
                procedures.push(makeProc(PROCEDURE_TYPES.BONDING, tooth, {
                    bracketType:  curr.bracketType,
                    prescription: curr.prescription,
                    slotSize:     curr.slotSize,
                    brand:        curr.brand,
                }));
            }
            continue;
        }

        // Was ACTIVE, now DEBONDED
        if (prev.status === "ACTIVE" && curr.status === "DEBONDED") {
            procedures.push(makeProc(PROCEDURE_TYPES.DEBONDING, tooth, {
                prevPrescription: prev.prescription,
            }));
            continue;
        }

        // Was DEBONDED, now ACTIVE (rebonded)
        if (prev.status === "DEBONDED" && curr.status === "ACTIVE") {
            procedures.push(makeProc(PROCEDURE_TYPES.BONDING, tooth, {
                bracketType:  curr.bracketType,
                prescription: curr.prescription,
                slotSize:     curr.slotSize,
                brand:        curr.brand,
                rebonded:     true,
            }));
            continue;
        }

        // Still ACTIVE — check prescription changes
        if (curr.status === "ACTIVE" && (
            prev.prescription !== curr.prescription ||
            prev.slotSize     !== curr.slotSize     ||
            prev.brand        !== curr.brand
        )) {
            procedures.push(makeProc(PROCEDURE_TYPES.REBONDING, tooth, {
                prevPrescription: prev.prescription,
                newPrescription:  curr.prescription,
                prevBrand:        prev.brand,
                newBrand:         curr.brand,
            }));
        }
    }

    // Previously had bracket, no longer listed → debonded
    for (const [tooth, prev] of prevMap) {
        if (!newMap.has(tooth) && prev.status === "ACTIVE") {
            procedures.push(makeProc(PROCEDURE_TYPES.DEBONDING, tooth, {
                prevPrescription: prev.prescription,
            }));
        }
    }

    return procedures;
}

// ─────────────────────────────────────────────────────────────────────────────
// TAD snapshot diff (True Clinical Snapshot v2)
// Detects TAD placement/removal between two visits using snapshot data.
// Keyed by toothNumber+position (same compound unique index as DB).
// ─────────────────────────────────────────────────────────────────────────────

function diffTadSnapshot(prevTads = [], newTads = []) {
    const procedures = [];
    const tadKey = (t) => `${t.toothNumber}|${t.position}`;
    const prevMap = new Map(prevTads.map((t) => [tadKey(t), t]));
    const newMap  = new Map(newTads.map((t) => [tadKey(t), t]));

    for (const [key, tad] of newMap) {
        if (!prevMap.has(key)) {
            // New TAD placed this visit
            procedures.push(makeProc(PROCEDURE_TYPES.MINISCREW_PLACEMENT, tad.toothNumber, {
                position:      tad.position,
                positionLabel: tad.positionLabel,
                brand:         tad.brand,
                diameter:      tad.diameter,
                length:        tad.length,
            }));
        }
    }

    for (const [key, tad] of prevMap) {
        if (!newMap.has(key)) {
            // TAD no longer present → removed this visit
            procedures.push(makeProc(PROCEDURE_TYPES.MINISCREW_REMOVAL, tad.toothNumber, {
                position: tad.position,
                brand:    tad.brand,
            }));
        }
    }

    return procedures;
}

// ─────────────────────────────────────────────────────────────────────────────
// MAIN EXPORT
// generateProcedures(prevChartState, newChartState, opts?) → Procedure[]
// ─────────────────────────────────────────────────────────────────────────────

/**
 * generateProcedures
 *
 * Compares two consecutive chartState objects and derives a structured
 * list of clinical procedures that occurred between them.
 *
 * (True Clinical Snapshot v2)
 * When opts.prevBondingSnapshot + opts.newBondingSnapshot are provided,
 * bonding/debonding procedures are derived from the DB-accurate snapshot diff
 * instead of the chart state tooth status diff. Similarly for TADs.
 *
 * @param {Object|null} prevChartState        Previous visit's chartState (null = first visit)
 * @param {Object}      newChartState         Current visit's chartState (required)
 * @param {Object}      [opts]
 * @param {Array}       [opts.prevBondingSnapshot]  bondingSnapshot from previous ClinicalSnapshot
 * @param {Array}       [opts.newBondingSnapshot]   bondingSnapshot captured for this visit
 * @param {Array}       [opts.prevTadSnapshot]      tadSnapshot from previous ClinicalSnapshot
 * @param {Array}       [opts.newTadSnapshot]       tadSnapshot captured for this visit
 * @returns {Array}                           Procedure[]
 */
function generateProcedures(prevChartState, newChartState, opts = {}) {
    if (!newChartState) return [];

    const prev = prevChartState ?? {};
    const next = newChartState;

    const {
        prevBondingSnapshot,
        newBondingSnapshot,
        prevTadSnapshot,
        newTadSnapshot,
    } = opts;

    // When snapshot data is available, skip chartState bonding teeth diff to avoid
    // double-counting with the more accurate snapshot-based diff.
    const useSnapshotBonding = newBondingSnapshot !== undefined;
    const useSnapshotTads    = newTadSnapshot     !== undefined;

    const procedures = [
        // Teeth — only bonding-related if not using snapshot-level bonding diff
        ...diffTeeth(
            [...(prev.upperTeeth ?? []), ...(prev.lowerTeeth ?? [])],
            [...(next.upperTeeth ?? []), ...(next.lowerTeeth ?? [])]
        ).filter((p) => {
            // If snapshot bonding data is present, skip chartState-derived bonding procedures
            // to avoid double-counting. Non-bonding procedures (extraction, alerts) always pass.
            if (!useSnapshotBonding) return true;
            return ![ "bonding", "debonding", "rebonding" ].includes(p.type);
        }),

        // Archwires
        ...diffArchwire(prev.upperArchwire, next.upperArchwire, "upper"),
        ...diffArchwire(prev.lowerArchwire, next.lowerArchwire, "lower"),

        // Power chains
        ...diffCollection(
            prev.powerChains, next.powerChains,
            PROCEDURE_TYPES.POWERCHAIN_PLACEMENT, PROCEDURE_TYPES.POWERCHAIN_REMOVAL,
            (p) => ({ type: p.type, isUpper: p.isUpper, anchorTeeth: p.anchorTeeth })
        ),

        // Elastics
        ...diffCollection(
            prev.elastics, next.elastics,
            PROCEDURE_TYPES.ELASTIC_PLACEMENT, PROCEDURE_TYPES.ELASTIC_REMOVAL,
            (e) => ({ type: e.type, size: e.size, teethIds: e.toothIds })
        ),

        // Appliances
        ...diffCollection(
            prev.appliances, next.appliances,
            PROCEDURE_TYPES.APPLIANCE_PLACEMENT, PROCEDURE_TYPES.APPLIANCE_REMOVAL,
            (a) => ({ type: a.type, isUpper: a.isUpper })
        ),

        // Miniscrews — use snapshot diff when available (more accurate); fallback to chartState
        ...(useSnapshotTads
            ? diffTadSnapshot(prevTadSnapshot ?? [], newTadSnapshot)
            : diffCollection(
                prev.miniscrews, next.miniscrews,
                PROCEDURE_TYPES.MINISCREW_PLACEMENT, PROCEDURE_TYPES.MINISCREW_REMOVAL,
                (m) => ({ toothId: m.toothId, anchorType: m.anchorType, length: m.length, diameter: m.diameter })
              )
        ),

        // Bonding — use snapshot diff when available (DB-accurate); fallback to chartState teeth
        ...(useSnapshotBonding
            ? diffBondingSnapshot(prevBondingSnapshot ?? [], newBondingSnapshot)
            : []
        ),

        // IPR markers
        ...diffIprMarkers(prev.iprMarkers, next.iprMarkers),
    ];

    return procedures;
}

module.exports = { generateProcedures };
