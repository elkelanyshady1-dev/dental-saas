"use strict";

/**
 * castAnalysis.service.js
 * Domain: clinical-snapshots
 * Layer: Application › Service
 *
 * Pure deterministic calculation engine — zero DB calls.
 * Returns a structured result object to be persisted by the controller.
 *
 * DETERMINISTIC RULES:
 *   - No async / no DB reads
 *   - All arithmetic uses Number() coercion to avoid NaN propagation
 *   - null is returned for any ratio where the denominator is 0 or missing
 *   - Results carry a "label" for direct UI rendering (DTO-ready)
 */

// ── Helpers ───────────────────────────────────────────────────────────────────

const toNum = (v) => Number(v) || 0;

/** Sum an array of raw values */
const sumArr = (arr) =>
    Array.isArray(arr) ? arr.reduce((acc, v) => acc + toNum(v), 0) : 0;

/** Sum all values of an object (segment map) */
const sumObj = (obj) =>
    obj && typeof obj === "object"
        ? Object.values(obj).reduce((acc, v) => acc + toNum(v), 0)
        : 0;

/** Safe ratio × 100, to 2dp — null if denominator falsy */
const ratio = (numerator, denominator) => {
    const d = toNum(denominator);
    if (!d) return null;
    return parseFloat(((toNum(numerator) / d) * 100).toFixed(2));
};

/** Format a net discrepancy with clinical label */
function classifyDiscrepancy(net) {
    const n = parseFloat(net.toFixed(2));
    if (n >= 2)       return { net: n, status: "spacing",           severity: "positive" };
    if (n >= 0)       return { net: n, status: "adequate",          severity: "adequate" };
    if (n >= -4)      return { net: n, status: "mild crowding",     severity: "mild"     };
    if (n >= -8)      return { net: n, status: "moderate crowding", severity: "moderate" };
    return             { net: n, status: "severe crowding",          severity: "severe"   };
}

/** Bolton normal reference values */
const BOLTON = {
    anterior: { norm: 77.2, label: "Anterior (77.2% ± 1.5)" },
    total:    { norm: 91.3, label: "Total (91.3% ± 1.5)"    },
};

/** Ashley Howe classification thresholds */
function ashleyClass(pct) {
    if (pct === null) return null;
    if (pct >= 45)   return "Favourable — arch expansion indicated";
    if (pct >= 37)   return "Borderline — expansion may be feasible";
    return            "Unfavourable — extraction likely required";
}

// ── Main Engine ───────────────────────────────────────────────────────────────

/**
 * runCastAnalysis(input) → result
 *
 * @param {object} input — raw form payload from frontend
 * @returns {object}      — fully structured result (safe to persist + render)
 */
function runCastAnalysis(input = {}) {
    const { upper = {}, lower = {}, toothSize = {}, ashley = {} } = input;

    // ── Arch Analysis (Upper + Lower) ──────────────────────────────────────
    function calcArch(arch) {
        const req = arch.required || {};
        const avl = arch.available || {};

        const rightReq = sumArr(req.right);
        const leftReq  = sumArr(req.left);
        const rightAvl = sumObj(avl.right);
        const leftAvl  = sumObj(avl.left);

        const rightNet = rightAvl - rightReq;
        const leftNet  = leftAvl  - leftReq;
        const totalNet = rightNet + leftNet;

        return {
            right:        classifyDiscrepancy(rightNet),
            left:         classifyDiscrepancy(leftNet),
            total:        parseFloat(totalNet.toFixed(2)),
            classification: classifyDiscrepancy(totalNet).status,
            severity:       classifyDiscrepancy(totalNet).severity,
        };
    }

    // ── Bolton Analysis ────────────────────────────────────────────────────
    const boltonAnterior = ratio(toothSize.lowerAnterior, toothSize.upperAnterior);
    const boltonTotal    = ratio(toothSize.lowerTotal,    toothSize.upperTotal);

    const bolton = {
        anterior: {
            value:      boltonAnterior,
            norm:       BOLTON.anterior.norm,
            label:      BOLTON.anterior.label,
            deviation:  boltonAnterior !== null ? parseFloat((boltonAnterior - BOLTON.anterior.norm).toFixed(2)) : null,
            status:     boltonAnterior !== null
                ? (Math.abs(boltonAnterior - BOLTON.anterior.norm) <= 1.5 ? "normal" : "discrepancy")
                : null,
        },
        total: {
            value:      boltonTotal,
            norm:       BOLTON.total.norm,
            label:      BOLTON.total.label,
            deviation:  boltonTotal !== null ? parseFloat((boltonTotal - BOLTON.total.norm).toFixed(2)) : null,
            status:     boltonTotal !== null
                ? (Math.abs(boltonTotal - BOLTON.total.norm) <= 1.5 ? "normal" : "discrepancy")
                : null,
        },
    };

    // ── Ashley Howe Analysis ───────────────────────────────────────────────
    const ashleyUpper = ratio(ashley.upperPM, ashley.upperBasal);
    const ashleyLower = ratio(ashley.lowerPM, ashley.lowerBasal);

    const ashleyResult = {
        upper: {
            value:          ashleyUpper,
            interpretation: ashleyClass(ashleyUpper),
        },
        lower: {
            value:          ashleyLower,
            interpretation: ashleyClass(ashleyLower),
        },
    };

    // ── Clinical Insight Generator ─────────────────────────────────────────
    const insights = [];
    const upperTotal = calcArch(upper).total;
    const lowerTotal = calcArch(lower).total;

    if (upperTotal < -5 || lowerTotal < -5) {
        insights.push("Severe crowding detected — extraction or surgical intervention may be required.");
    }
    if (bolton.anterior.status === "discrepancy") {
        const excess = bolton.anterior.deviation > 0 ? "lower" : "upper";
        insights.push(`Bolton anterior discrepancy — ${excess} teeth excess. Consider IPR or composite.`);
    }
    if (ashleyUpper !== null && ashleyUpper < 37) {
        insights.push("Ashley Howe index unfavourable — arch expansion not recommended for upper arch.");
    }
    if (!insights.length) {
        insights.push("Cast analysis within acceptable clinical range.");
    }

    return {
        upper: calcArch(upper),
        lower: calcArch(lower),
        bolton,
        ashley:   ashleyResult,
        insights,
        computedAt: new Date().toISOString(),
    };
}

module.exports = { runCastAnalysis };
