/**
 * planVersionDiff.service.js
 * Platform Billing — Plan Version Diff Engine
 *
 * comparePlanVersions(versionAId, versionBId)
 *
 * Produces a structured diff between two PlanVersions.
 * READ-ONLY. Never modifies any document.
 *
 * Return shape:
 * {
 *   versionA: { _id, versionTag, label, templateCode },
 *   versionB: { _id, versionTag, label, templateCode },
 *   pricingChanges: [{ regionCode, currency, field, from, to }],
 *   limitChanges:   [{ field, from, to }],
 *   moduleChanges:  [{ module, from, to }],
 *   trialChange:    { from, to } | null,
 *   inflationChange:{ from, to } | null,
 * }
 *
 * PLANE: Platform
 */

"use strict";

const getPlatformModel = require("@core/db/getPlatformModel");
const mongoose = require("mongoose");
const PlanVersionDef = require("../models/PlanVersion.model");
let _PlanVersion_cache = null;
function PlanVersion() {
    return _PlanVersion_cache || (_PlanVersion_cache = getPlatformModel(PlanVersionDef));
} // ── Helpers ──────────────────────────────────────────────────────────────────
/**
 * Normalize a value for comparison — flatten objects to JSON string
 * so booleans, numbers, and nested objects can all be diffed the same way.
 */
function normalize(val) {
  if (val === undefined || val === null) return null;
  if (typeof val === "object") return JSON.stringify(val);
  return val;
}

/**
 * Compare two flat key→value maps  and return an array of changed entries.
 * @param {object} objA
 * @param {object} objB
 * @param {(key: string, valA: any, valB: any) => object} rowBuilder
 * @returns {Array}
 */
function diffObjects(objA = {}, objB = {}, rowBuilder) {
  const keys = new Set([...Object.keys(objA), ...Object.keys(objB)]);
  const changes = [];
  for (const key of keys) {
    const from = normalize(objA[key]);
    const to = normalize(objB[key]);
    if (from !== to) {
      changes.push(rowBuilder(key, objA[key] ?? null, objB[key] ?? null));
    }
  }
  return changes;
}

// ── Pricing diff ─────────────────────────────────────────────────────────────
// Aligns regions by regionCode so each region can be compared field-by-field.

function diffPricing(pricingA = {}, pricingB = {}) {
  const changes = [];

  // Build map: regionCode → region object
  const regionsA = Object.fromEntries((pricingA.regions || []).map(r => [r.regionCode, r]));
  const regionsB = Object.fromEntries((pricingB.regions || []).map(r => [r.regionCode, r]));
  const regionCodes = new Set([...Object.keys(regionsA), ...Object.keys(regionsB)]);
  for (const regionCode of regionCodes) {
    const rA = regionsA[regionCode] || {};
    const rB = regionsB[regionCode] || {};

    // Compare per-field within the region
    const priceFields = ["monthly", "yearly", "currency"];
    for (const field of priceFields) {
      const vA = rA[field] ?? null;
      const vB = rB[field] ?? null;
      if (normalize(vA) !== normalize(vB)) {
        changes.push({
          regionCode,
          currency: rA.currency || rB.currency || "?",
          field,
          from: vA,
          to: vB
        });
      }
    }

    // Adding / removing a region entirely
    if (!regionsA[regionCode]) {
      changes.push({
        regionCode,
        currency: rB.currency || "?",
        field: "region",
        from: null,
        // didn't exist in A
        to: "added"
      });
    } else if (!regionsB[regionCode]) {
      changes.push({
        regionCode,
        currency: rA.currency || "?",
        field: "region",
        from: "existed",
        to: null // removed in B
      });
    }
  }

  // baseCurrency change
  const bcA = pricingA.baseCurrency ?? null;
  const bcB = pricingB.baseCurrency ?? null;
  if (normalize(bcA) !== normalize(bcB)) {
    changes.push({
      regionCode: "BASE",
      currency: "",
      field: "baseCurrency",
      from: bcA,
      to: bcB
    });
  }
  return changes;
}

// ── Limits diff ──────────────────────────────────────────────────────────────

function diffLimits(limitsA = {}, limitsB = {}) {
  return diffObjects(limitsA, limitsB, (field, from, to) => ({
    field,
    from,
    to
  }));
}

// ── Modules diff ─────────────────────────────────────────────────────────────
// Modules can be boolean, number, or nested object. Normalize them for
// comparison — the UI handles rendering each type differently.

function diffModules(modulesA = {}, modulesB = {}) {
  return diffObjects(modulesA, modulesB, (module, from, to) => ({
    module,
    from,
    to
  }));
}

// ── Main export ───────────────────────────────────────────────────────────────

/**
 * comparePlanVersions
 *
 * @param {string|import('mongoose').Types.ObjectId} versionAId
 * @param {string|import('mongoose').Types.ObjectId} versionBId
 * @returns {Promise<DiffResult>}
 */
async function comparePlanVersions(versionAId, versionBId) {
  const toOid = id => typeof id === "string" ? new mongoose.Types.ObjectId(id) : id;

  // Load both versions in parallel
  const [vA, vB] = await Promise.all([PlanVersion().findById(toOid(versionAId)).select("versionTag label templateCode pricing limits modules trialDays inflationPolicy").lean(), PlanVersion().findById(toOid(versionBId)).select("versionTag label templateCode pricing limits modules trialDays inflationPolicy").lean()]);
  if (!vA) throw new Error(`PlanVersion A not found: ${versionAId}`);
  if (!vB) throw new Error(`PlanVersion B not found: ${versionBId}`);

  // ── trialDays ────────────────────────────────────────────────────────────
  const trialChange = (vA.trialDays ?? null) !== (vB.trialDays ?? null) ? {
    from: vA.trialDays ?? null,
    to: vB.trialDays ?? null
  } : null;

  // ── inflationPolicy ──────────────────────────────────────────────────────
  const ipA = normalize(vA.inflationPolicy);
  const ipB = normalize(vB.inflationPolicy);
  const inflationChange = ipA !== ipB ? {
    from: vA.inflationPolicy ?? null,
    to: vB.inflationPolicy ?? null
  } : null;
  return {
    versionA: {
      _id: vA._id,
      versionTag: vA.versionTag,
      label: vA.label,
      templateCode: vA.templateCode
    },
    versionB: {
      _id: vB._id,
      versionTag: vB.versionTag,
      label: vB.label,
      templateCode: vB.templateCode
    },
    pricingChanges: diffPricing(vA.pricing, vB.pricing),
    limitChanges: diffLimits(vA.limits, vB.limits),
    moduleChanges: diffModules(vA.modules, vB.modules),
    trialChange,
    inflationChange
  };
}
module.exports = {
  comparePlanVersions
};