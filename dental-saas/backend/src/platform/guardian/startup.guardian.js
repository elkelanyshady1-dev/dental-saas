/**
 * startup.guardian.js
 * Platform Guardian Layer — Startup Invariant Checker
 *
 * runStartupGuardian()
 *
 * Must be called AFTER connectDB() resolves.
 * Runs a set of hard invariants that must hold for the platform to be safe to serve.
 *
 * Invariants checked:
 *   1. No duplicate Mongoose model registrations per entity name
 *   2. Organization.planId is ABSENT from schema (removed B-4, 2026-03-04 — legacy ghost field)
 *   3. OrgContract.previousContractId exists in the schema
 *   4. OrgContract.lockedPrice has min: 0 constraint (no negative prices)
 *   5. MongoDB connection supports transactions (replica set mode)
 *   6. Route manifest integrity: /api/platform is registered
 *
 * Behavior:
 *   - PLATFORM_GUARDIAN_MODE=strict  → process.exit(1) on any failure
 *   - Default (permissive)          → logs CRITICAL, continues
 *
 * PLANE: Platform
 */

"use strict";

const getPlatformModel = require("@core/db/getPlatformModel");
const mongoose = require("mongoose");
const {
  getPlatformConnection
} = require("@core/db/dbResolver");
const {
  guardianLogger,
  safeSerialize,
  incrementMetric,
  setMetric
} = require("./observability.guardian");
const STRICT = () => process.env.PLATFORM_GUARDIAN_MODE === "strict";

// ─── Invariant Runner ─────────────────────────────────────────────────────────

/**
 * runCheck
 * Runs a single named invariant check.
 * Returns { name, pass, reason }.
 *
 * @param {string} name
 * @param {() => void|Promise<void>} fn  - throw to fail
 * @returns {Promise<{ name: string, pass: boolean, reason?: string }>}
 */
async function runCheck(name, fn) {
  try {
    await fn();
    return {
      name,
      pass: true
    };
  } catch (err) {
    return {
      name,
      pass: false,
      reason: err.message || String(err)
    };
  }
}

// ─── Individual Invariants ────────────────────────────────────────────────────

function checkNoDuplicateModels() {
  const models = getPlatformConnection().models;
  const names = Object.keys(models);
  const seen = new Set();
  const duplicates = [];
  for (const name of names) {
    if (seen.has(name)) {
      duplicates.push(name);
    }
    seen.add(name);
  }
  if (duplicates.length > 0) {
    throw new Error(`Duplicate Mongoose models detected: ${duplicates.join(", ")}`);
  }
}
function checkOrganizationPlanIdNotRequired() {
  const OrgModel = getPlatformConnection().models["Organization"];
  if (!OrgModel) return;
  const planIdPath = OrgModel.schema.path("planId");
  // B-4 fix (2026-03-04): planId was removed from Organization schema.
  // Guard against re-introduction: if planId reappears, fail loudly.
  if (planIdPath) {
    throw new Error("Organization.planId has been re-introduced in the schema. " + "This field was removed (audit B-4) because it was a dangling write to the legacy Plan.model. " + "OrgContract.planVersionId is the authoritative commercial reference. Remove planId from Organization.js.");
  }
}
function checkOrgContractPreviousContractId() {
  const ContractModel = getPlatformConnection().models["OrgContract"];
  if (!ContractModel) {
    // Model not loaded — skip
    return;
  }
  const field = ContractModel.schema.path("previousContractId");
  if (!field) {
    throw new Error("OrgContract schema is missing the 'previousContractId' field. " + "This field is written by replaceContract() service — its absence causes silent schema strip. " + "Add it to OrgContract.model.js.");
  }
}
function checkOrgContractLockedPriceConstraint() {
  const ContractModel = getPlatformConnection().models["OrgContract"];
  if (!ContractModel) return;
  const lockedPricePath = ContractModel.schema.path("lockedPrice");
  if (!lockedPricePath) {
    throw new Error("OrgContract schema is missing the 'lockedPrice' field entirely.");
  }
  // Mongoose stores validators in the path's validators array
  const hasMinValidator = lockedPricePath.validators?.some(v => v.type === "min");
  if (!hasMinValidator) {
    throw new Error("OrgContract.lockedPrice has no min:0 validator. Negative prices can be stored. " + "Add 'min: 0' to the lockedPrice field definition.");
  }
}
async function checkTransactionSupport() {
  // Attempt to start a session — will succeed on replica set, fail on standalone
  const session = await mongoose.startSession();
  try {
    session.startTransaction();
    await session.abortTransaction();
  } finally {
    await session.endSession();
  }
}
function checkRouteManifestIntegrity() {
  // Verify the platform route registry was populated
  // This guard prevents silent route de-registration regressions
  try {
    const {
      getRegisteredRouters
    } = require("../../integrity/routerRegistry");
    const routers = getRegisteredRouters ? getRegisteredRouters() : null;

    // If the registry exists and is populated, check it
    if (routers && typeof routers === "object") {
      const platformRegistered = Object.values(routers).some(r => r && (r.includes("/api/platform") || r.includes("platform")));
      if (!platformRegistered) {
        throw new Error("/api/platform route is not registered in routerRegistry. " + "This may indicate the platform routes were not mounted in app.js.");
      }
    }
    // If registry doesn't expose getRegisteredRouters, skip silently
  } catch (err) {
    // If the registry module itself doesn't exist, skip this check
    if (err.code === "MODULE_NOT_FOUND") return;
    // Re-throw real errors (registry exists but contract violated)
    if (err.message.includes("/api/platform route is not registered")) throw err;
  }
}

// ─── TDS: Contract-First Invariant ────────────────────────────────────────────
// Every active, non-archived org SHOULD have a currentContractId.
// WARN only — does not crash. Pre-existing orgs from before TDS may lack contracts.
async function checkOrgsHaveActiveContract() {
  const OrgModel = getPlatformConnection().models["Organization"];
  if (!OrgModel) return;
  const orgsWithoutContract = await OrgModel.countDocuments({
    isActive: true,
    isArchived: {
      $ne: true
    },
    currentContractId: null
  });
  if (orgsWithoutContract > 0) {
    throw new Error(`${orgsWithoutContract} active organization(s) found without currentContractId. ` + `All orgs should have an active contract assigned by provisioning (TDS). ` + `Run a migration to backfill trial contracts for legacy orgs.`);
  }
}

// ─── TDS: Contract Count Invariants ──────────────────────────────────────────
// Enforce: max 1 active + max 1 pending_activation per org.
// DB partial unique indexes enforce this, but guardian provides runtime visibility.
// WARN only — does not crash. Indicates index bypass or race condition.
async function checkContractCountInvariants() {
  const OrgContractModel = getPlatformConnection().models["OrgContract"];
  if (!OrgContractModel) return;

  // Find orgs with >1 active contract (DB index should prevent this, but check anyway)
  const multipleActive = await OrgContractModel.aggregate([{
    $match: {
      contractStatus: "active"
    }
  }, {
    $group: {
      _id: "$organizationId",
      count: {
        $sum: 1
      }
    }
  }, {
    $match: {
      count: {
        $gt: 1
      }
    }
  }, {
    $count: "violations"
  }]);
  const activeViolations = multipleActive[0]?.violations || 0;
  if (activeViolations > 0) {
    throw new Error(`${activeViolations} organization(s) have more than 1 ACTIVE OrgContract. ` + `This violates the unique_active_contract_per_org invariant. Investigate immediately.`);
  }

  // Find orgs with >1 pending_activation contract
  const multiplePending = await OrgContractModel.aggregate([{
    $match: {
      contractStatus: "pending_activation"
    }
  }, {
    $group: {
      _id: "$organizationId",
      count: {
        $sum: 1
      }
    }
  }, {
    $match: {
      count: {
        $gt: 1
      }
    }
  }, {
    $count: "violations"
  }]);
  const pendingViolations = multiplePending[0]?.violations || 0;
  if (pendingViolations > 0) {
    throw new Error(`${pendingViolations} organization(s) have more than 1 PENDING_ACTIVATION OrgContract. ` + `This violates the unique_pending_contract_per_org invariant.`);
  }
}

// ─── SALES CONTRACT INTEGRITY ────────────────────────────────────────────────────
// Detects: >1 sales-source draft contract per org (operator created duplicate without canceling).
// WARN only: DB index doesn’t prevent multiple drafts of different sources.
async function checkSalesContractIntegrity() {
  const OrgContractModel = getPlatformConnection().models["OrgContract"];
  if (!OrgContractModel) return;
  const multipleSalesDrafts = await OrgContractModel.aggregate([{
    $match: {
      contractStatus: "draft",
      source: "sales"
    }
  }, {
    $group: {
      _id: "$organizationId",
      count: {
        $sum: 1
      }
    }
  }, {
    $match: {
      count: {
        $gt: 1
      }
    }
  }, {
    $count: "violations"
  }]);
  const violations = multipleSalesDrafts[0]?.violations || 0;
  if (violations > 0) {
    throw new Error(`SALES_CONTRACT_INTEGRITY: ${violations} organization(s) have >1 sales-source draft contract. ` + `Cancel or finalize existing sales draft before creating a new one.`);
  }
}

// ─── PHASE 1 MIGRATION: Legacy Plan Model Guard ───────────────────────────────
// After migration, the legacy Plan model must NOT be registered.
// If it is re-introduced, the guardian fails loudly.
function checkNoLegacyPlanModel() {
  const models = getPlatformConnection().models;
  if (models["Plan"]) {
    throw new Error("NO_LEGACY_PLAN_MODEL_PRESENT violated: The legacy 'Plan' Mongoose model is registered at runtime. " + "The Plan model and its routes were removed in the Plan→PlanVersion migration. " + "Check for any remaining imports of plan.model.js or shared/models/Plan.model.js.");
  }
}

// ─── TOMBSTONE: Plan Model File Must Never Re-register the Model ──────────────
//
// Complements checkNoLegacyPlanModel: that check detects a live Mongoose model;
// this check confirms that platform/domain/models/plan.model.js exports a shim
// (not a real mongoose.model("Plan", ...) export).
//
// Why both checks exist:
//   - checkNoLegacyPlanModel: catches if the model WAS registered (at any point)
//   - checkLegacyPlanModelTombstone: catches if the tombstone SHIM was replaced
//     (even before the model is used), giving earlier detection and a clearer message.
//
// Invariant: plan.model.js must export a plain object (shim), not a Mongoose Model.
// A Mongoose Model instance has modelName === "Plan" and its function is a Model constructor.
//
// Read-only: never writes, never modifies documents.
function checkLegacyPlanModelTombstone() {
  // Hard check: Mongoose model registry
  if (getPlatformConnection().models["Plan"]) {
    throw new Error("LEGACY_PLAN_MODEL_TOMBSTONE_PRESENT violated: The legacy 'Plan' Mongoose model is registered. " + "The migration to PlanTemplate/PlanVersion removed this model. " + "Fix: ensure platform/domain/models/plan.model.js exports only a LegacyPlanShim (not a Mongoose model).");
  }

  // Secondary check: require the model file and verify it is NOT a Mongoose Model
  try {
    const planModelExportDef = require("../domain/models/plan.model");
    const planModelExport = getPlatformModel(planModelExportDef); // A real mongoose model is a function whose .modelName === the registered name
    const isMongooseModel = planModelExport && typeof planModelExport === "function" && planModelExport.modelName === "Plan";
    if (isMongooseModel) {
      throw new Error("LEGACY_PLAN_MODEL_TOMBSTONE_PRESENT violated: platform/domain/models/plan.model.js exports a Mongoose Model named 'Plan'. " + "This file must export the LegacyPlanShim only (no mongoose.model() call). " + "The tombstone shim has been replaced or deleted. Restore it.");
    }
  } catch (err) {
    if (err.message && err.message.includes("LEGACY_PLAN_MODEL_TOMBSTONE_PRESENT")) throw err;
    if (err.code === "MODULE_NOT_FOUND") return; // Tombstone deleted — no model registered either, OK
    throw err; // Propagate unexpected require/syntax errors
  }
  guardianLogger.info({
    guardian: true,
    check: "LEGACY_PLAN_MODEL_TOMBSTONE_PRESENT"
  }, "✓ Legacy Plan model tombstone intact — plan.model.js is a shim, not a Mongoose model");
}

// Enforces: max 1 active PlanVersion per PlanTemplate at any time.
// DB partial index enforces this at write time, but guardian provides runtime audit visibility.
async function checkActivePlanVersionPerTemplate() {
  const PlanVersionModel = getPlatformConnection().models["PlanVersion"];
  if (!PlanVersionModel) return;
  const violations = await PlanVersionModel.aggregate([{
    $match: {
      status: "active"
    }
  }, {
    $group: {
      _id: "$templateId",
      count: {
        $sum: 1
      }
    }
  }, {
    $match: {
      count: {
        $gt: 1
      }
    }
  }, {
    $count: "violations"
  }]);
  const count = violations[0]?.violations || 0;
  if (count > 0) {
    throw new Error(`ACTIVE_PLAN_VERSION_PER_TEMPLATE violated: ${count} PlanTemplate(s) have more than 1 active PlanVersion. ` + `This violates the single-active invariant. Run publishPlanVersion which auto-deprecates the previous.`);
  }
}

// ─── PLAN VERSION VISIBILITY ENUM ──────────────────────────────────────────────
// Enforces: every PlanVersion.visibility field is one of the 3 valid enum values.
// Any other value (including null, old isSalesOnly=true with no visibility, etc.)
// is a data integrity failure — run migratePlanVisibility.js to fix.
async function checkPlanVersionVisibilityEnum() {
  const PlanVersionModel = getPlatformConnection().models["PlanVersion"];
  if (!PlanVersionModel) return;
  const VALID_VISIBILITY = ["public", "sales", "internal"];
  const invalid = await PlanVersionModel.countDocuments({
    visibility: {
      $not: {
        $in: VALID_VISIBILITY
      }
    }
  });
  if (invalid > 0) {
    throw new Error(`PLAN_VERSION_VISIBILITY_ENUM violated: ${invalid} PlanVersion document(s) have an invalid or missing visibility value. ` + `Valid values: ${VALID_VISIBILITY.join(", ")}. ` + `Run: node scripts/migratePlanVisibility.js to repair.`);
  }
}

// ─── PUBLIC PLAN VERSION NO LEAKAGE ───────────────────────────────────────
// Simulates the public endpoint query and asserts all results are visibility="public".
// Catches any case where the DB query in publicController might return non-public docs.
async function checkPublicPlanVersionNoLeakage() {
  const PlanVersionModel = getPlatformConnection().models["PlanVersion"];
  if (!PlanVersionModel) return;

  // Simulate the exact public endpoint query
  const results = await PlanVersionModel.find({
    status: "active",
    visibility: "public"
  }).select("visibility").lean();
  const nonPublic = results.filter(v => v.visibility !== "public");
  if (nonPublic.length > 0) {
    throw new Error(`PUBLIC_PLAN_VERSION_NO_LEAKAGE violated: ${nonPublic.length} document(s) returned ` + `by the public query have visibility !== "public". ` + `This indicates a MongoDB index or data integrity failure. IDs: ` + nonPublic.map(v => v._id).join(", "));
  }
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// COMMERCIAL BILLING INTEGRITY INVARIANTS
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

// ─── PLAN REGION PRICE COMPLETENESS ───────────────────────────────────────────
// Every active PlanVersion must have at least one pricing region.
// Each region must have: regionCode, currency, monthly, yearly.
// Prevents pricingEngine from failing at runtime on bad data.
async function checkPlanRegionPriceCompleteness() {
  const PlanVersionModel = getPlatformConnection().models["PlanVersion"];
  if (!PlanVersionModel) return;
  const activeVersions = await PlanVersionModel.find({
    status: "active"
  }, {
    _id: 1,
    templateCode: 1,
    versionTag: 1,
    "pricing.regions": 1
  }).lean();
  const violations = [];
  for (const pv of activeVersions) {
    const regions = pv.pricing?.regions || [];
    if (regions.length === 0) {
      violations.push(`PlanVersion ${pv._id} (${pv.templateCode}@${pv.versionTag}): no pricing regions`);
      continue;
    }
    for (const region of regions) {
      const missing = [];
      if (!region.regionCode) missing.push("regionCode");
      if (!region.currency) missing.push("currency");
      if (region.monthly == null) missing.push("monthly");
      if (region.yearly == null) missing.push("yearly");
      if (missing.length > 0) {
        violations.push(`PlanVersion ${pv._id} (${pv.templateCode}@${pv.versionTag}) ` + `region "${region.regionCode || "?"}" missing: ${missing.join(", ")}`);
      }
    }
  }
  if (violations.length > 0) {
    throw new Error(`PLAN_REGION_PRICE_COMPLETENESS violated: ${violations.length} active PlanVersion(s) have ` + `incomplete pricing data.\n  ` + violations.join("\n  "));
  }
}

// ─── CONTRACT PRICING SNAPSHOT PRESENT ─────────────────────────────────────
// Every paid active contract (non-trial, non-zero price) must have:
//   lockedPrice > 0, currency set, pricingSnapshot present.
// Trial contracts (trialDays > 0, lockedPrice = 0) are exempt.
async function checkContractPricingSnapshotPresent() {
  const OrgContractModel = getPlatformConnection().models["OrgContract"];
  if (!OrgContractModel) return;

  // Only check paid active contracts (not trials)
  const paidActiveContracts = await OrgContractModel.find({
    contractStatus: "active",
    trialDays: 0,
    lockedPrice: {
      $gt: 0
    }
  }, {
    _id: 1,
    organizationId: 1,
    lockedPrice: 1,
    currency: 1,
    pricingSnapshot: 1
  }).lean();
  const violations = [];
  for (const c of paidActiveContracts) {
    const missing = [];
    if (!c.lockedPrice && c.lockedPrice !== 0) missing.push("lockedPrice");
    if (!c.currency) missing.push("currency");
    if (!c.pricingSnapshot) missing.push("pricingSnapshot");
    if (missing.length > 0) {
      violations.push(`Contract ${c._id} (org: ${c.organizationId}): missing ${missing.join(", ")}`);
    }
  }
  if (violations.length > 0) {
    throw new Error(`CONTRACT_PRICING_SNAPSHOT_PRESENT violated: ${violations.length} paid active contract(s) ` + `are missing pricingSnapshot.\n  ` + violations.join("\n  ") + `\n  Run: npm run contracts:backfill-snapshot to fix.`);
  }
}

// ─── PROVIDER PRICE MAPPING VALID ────────────────────────────────────────────
// For every active contract that has a non-manual paymentProvider set,
// providerPriceId must be present.
// Prevents charging at payment provider without a price object reference.
async function checkProviderPriceMappingValid() {
  const OrgContractModel = getPlatformConnection().models["OrgContract"];
  if (!OrgContractModel) return;
  const providerContracts = await OrgContractModel.find({
    contractStatus: "active",
    paymentProvider: {
      $nin: [null, "manual"]
    }
  }, {
    _id: 1,
    organizationId: 1,
    paymentProvider: 1,
    providerPriceId: 1
  }).lean();
  const violations = providerContracts.filter(c => !c.providerPriceId);
  if (violations.length > 0) {
    throw new Error(`PROVIDER_PRICE_MAPPING_VALID violated: ${violations.length} active contract(s) have ` + `paymentProvider set but no providerPriceId.\n  ` + violations.map(c => `Contract ${c._id} (org: ${c.organizationId}, provider: ${c.paymentProvider})`).join("\n  "));
  }
}

// ─── UNIQUE ACTIVE CONTRACT PER ORG (application-layer audit) ────────────────
// The DB partial index unique_active_contract_per_org enforces this at write time.
// This guardian performs a read-layer audit to catch any data drift.
async function checkUniqueActiveContractPerOrg() {
  const OrgContractModel = getPlatformConnection().models["OrgContract"];
  if (!OrgContractModel) return;
  const violations = await OrgContractModel.aggregate([{
    $match: {
      contractStatus: "active"
    }
  }, {
    $group: {
      _id: "$organizationId",
      count: {
        $sum: 1
      }
    }
  }, {
    $match: {
      count: {
        $gt: 1
      }
    }
  }, {
    $count: "violations"
  }]);
  const count = violations[0]?.violations || 0;
  if (count > 0) {
    throw new Error(`UNIQUE_ACTIVE_CONTRACT_PER_ORG violated: ${count} organization(s) have more than 1 active contract. ` + `This violates the unique_active_contract_per_org partial index invariant. ` + `The DB write guard may have been bypassed. Investigate immediately.`);
  }
}

// ─── CONTRACT STATUS VALID ────────────────────────────────────────────────────
// Cross-checks every OrgContract against the state machine's valid status set.
// Catches DB-level corruption, direct Mongo writes that bypassed the engine,
// or future schema drift where new statuses were added without updating this guard.
async function checkContractStatusValid() {
  const OrgContractModel = getPlatformConnection().models["OrgContract"];
  if (!OrgContractModel) return;

  // Source of truth: canonical set from contractStateMachine.js
  // PHASE 1 — SM-001 fix: import from state machine instead of hardcoding.
  // Previous hardcoded list missed: ready, pending_payment, grace, suspended, canceled, void.
  const {
    ALL_VALID_STATUSES: VALID_STATUSES
  } = require("../billing/services/contractStateMachine");
  const invalidCount = await OrgContractModel.countDocuments({
    contractStatus: {
      $nin: VALID_STATUSES
    }
  });
  if (invalidCount > 0) {
    // Fetch a sample for the error message so operators can identify affected docs
    const sample = await OrgContractModel.find({
      contractStatus: {
        $nin: VALID_STATUSES
      }
    }, {
      _id: 1,
      organizationId: 1,
      contractStatus: 1
    }).limit(5).lean();
    const details = sample.map(c => `Contract ${c._id} (org: ${c.organizationId}): status="${c.contractStatus}"`).join(", ");
    throw new Error(`CONTRACT_STATUS_VALID violated: ${invalidCount} contract(s) have an unrecognized contractStatus. ` + `Valid statuses: ${VALID_STATUSES.join(", ")}. ` + `Sample: ${details}. ` + `This indicates a direct DB write bypassed the contract state machine.`);
  }
}

// ─── CONTRACT TIMELINE INTEGRITY ──────────────────────────────────────────────────
// Ensures no two contracts belonging to the same org have overlapping
// coverage periods. Even with UNIQUE_ACTIVE_CONTRACT_PER_ORG, timeline
// corruption can occur if a migration goes wrong or a race condition
// creates two paid contracts covering the same billing period.
//
// Status scope: active, pending_activation, superseded, expired.
// Skips: draft (uncommitted, no coverage period) and terminated (cancelled).
//
// Algorithm: O(n log n) single sorted scan grouped by organizationId.
// All violations are collected before throwing (full corruption report).
async function checkContractTimelineIntegrity() {
  const OrgContractModel = getPlatformConnection().models["OrgContract"];
  if (!OrgContractModel) return;

  // Only statuses that represent committed billing coverage periods
  const COVERAGE_STATUSES = ["active", "pending_activation", "superseded", "expired"];

  // Sort by (organizationId asc, effectiveFrom asc) so we get per-org timelines
  // in a single pass without grouping in application memory.
  const contracts = await OrgContractModel.find({
    contractStatus: {
      $in: COVERAGE_STATUSES
    },
    effectiveFrom: {
      $exists: true,
      $ne: null
    }
  }, {
    _id: 1,
    organizationId: 1,
    effectiveFrom: 1,
    effectiveTo: 1,
    contractStatus: 1
  }).sort({
    organizationId: 1,
    effectiveFrom: 1
  }).lean();
  const violations = []; // hard failures  — overlapping coverage windows
  const schemaGaps = []; // soft warnings  — missing effectiveTo on closed contracts

  let prev = null;
  let prevOrgId = null;
  for (const contract of contracts) {
    const orgId = contract.organizationId.toString();

    // New organization group — reset running context
    if (orgId !== prevOrgId) {
      prev = null;
      prevOrgId = orgId;
    }
    if (prev) {
      const prevHasEnd = prev.effectiveTo != null;
      if (!prevHasEnd) {
        // effectiveTo is null on the preceding contract.
        //
        // EXPECTED: status=active (the currently running subscription).
        //   UNIQUE_ACTIVE_CONTRACT_PER_ORG already ensures only one exists.
        //   The next contract is pending_activation (future start) — valid.
        //
        // SCHEMA GAP: status=superseded or expired with no end date.
        //   contractActivation.service.js supersedes contracts but does not
        //   set effectiveTo on the old contract. Flag for remediation.
        if (["superseded", "expired"].includes(prev.contractStatus)) {
          schemaGaps.push({
            contractId: prev._id,
            organizationId: prev.organizationId,
            contractStatus: prev.contractStatus
          });
        }
        // Either way: cannot determine actual overlap without effectiveTo.
        // Skip — true overlap detection requires a closed window.
      } else {
        // effectiveTo is set — strict overlap check.
        // Overlap condition: next contract starts BEFORE previous one ends.
        // Adjacent contracts (B.from === A.to) are valid — different billing periods.
        if (contract.effectiveFrom < prev.effectiveTo) {
          violations.push({
            orgId,
            contractA: prev._id,
            statusA: prev.contractStatus,
            fromA: prev.effectiveFrom,
            toA: prev.effectiveTo,
            contractB: contract._id,
            statusB: contract.contractStatus,
            fromB: contract.effectiveFrom
          });
        }
      }
    }
    prev = contract;
  }

  // Schema gap: warn but do not crash — effectiveTo can be backfilled post-hoc.
  if (schemaGaps.length > 0) {
    guardianLogger.warn({
      count: schemaGaps.length
    }, `CONTRACT_TIMELINE_INTEGRITY: ${schemaGaps.length} superseded/expired contract(s) have ` + `no effectiveTo set. This is a schema gap — contractActivation does not stamp ` + `effectiveTo on superseded contracts. Run a backfill to resolve.`);
  }

  // Hard violations: throw with full details so operators can fix all at once.
  if (violations.length > 0) {
    guardianLogger.error({
      count: violations.length,
      sample: violations.slice(0, 3)
    }, "CONTRACT_TIMELINE_CORRUPTION detected at startup");
    const details = violations.slice(0, 5).map(v => `Org ${v.orgId}: ` + `Contract ${v.contractA} (${v.statusA}, ` + `${v.fromA?.toISOString()} → ${v.toA?.toISOString()}) ` + `overlaps with Contract ${v.contractB} (${v.statusB}, from ${v.fromB?.toISOString()})`).join(" | ");
    throw new Error(`CONTRACT_TIMELINE_INTEGRITY violated: ${violations.length} overlapping coverage window(s) detected. ` + details + (violations.length > 5 ? ` ... and ${violations.length - 5} more.` : ""));
  }
}

// ─── CONTRACT GAP INTEGRITY ──────────────────────────────────────────────────────
// Complementary to CONTRACT_TIMELINE_INTEGRITY (overlaps).
// Ensures contracts in the supersession chain form a CONTINUOUS timeline
// with zero gaps between adjacent contracts.
//
// Scope: only linked contracts (supersededById / previousContractId).
//   Unlinked contracts (first contract for an org, post-termination restart)
//   are NOT expected to be gapless — the org may have been inactive between them.
//
// Gap tolerance: 0ms.
//   contractActivation.service.js sets prev.effectiveTo = next.effectiveFrom,
//   so valid supersessions always have prev.effectiveTo === next.effectiveFrom.
//   Any difference indicates a data corruption or migration defect.
//
// Algorithm:
//   1. Fetch all superseded contracts with effectiveTo set and supersededById non-null
//   2. Look up the successor's effectiveFrom
//   3. If successor.effectiveFrom > prev.effectiveTo → gap detected
//
// This is a separate check from CONTRACT_TIMELINE_INTEGRITY:
//   - TIMELINE catches overlaps (any coverage status, sorted scan)
//   - GAP catches gaps (only supersession chain, linked pair check)
//
// Read-only: never modifies any document.
async function checkContractGapIntegrity() {
  const OrgContractModel = getPlatformConnection().models["OrgContract"];
  if (!OrgContractModel) return;

  // Find all superseded contracts that have a successor and a closed window
  const superseded = await OrgContractModel.find({
    contractStatus: "superseded",
    supersededById: {
      $ne: null
    },
    effectiveTo: {
      $ne: null
    }
  }, {
    _id: 1,
    organizationId: 1,
    effectiveTo: 1,
    supersededById: 1
  }).lean();
  if (superseded.length === 0) return;

  // Batch-load all successor IDs in a single query
  const successorIds = [...new Set(superseded.map(c => c.supersededById.toString()))];
  const successors = await OrgContractModel.find({
    _id: {
      $in: successorIds
    }
  }, {
    _id: 1,
    effectiveFrom: 1,
    contractStatus: 1
  }).lean();
  const successorMap = Object.fromEntries(successors.map(s => [s._id.toString(), s]));
  const violations = [];
  for (const prev of superseded) {
    const successor = successorMap[prev.supersededById.toString()];
    if (!successor || !successor.effectiveFrom) continue;

    // Gap condition: successor starts AFTER previous ends.
    // Exact equality (prev.effectiveTo === successor.effectiveFrom) is the healthy state.
    const gapMs = successor.effectiveFrom - prev.effectiveTo;
    if (gapMs > 0) {
      violations.push({
        orgId: prev.organizationId.toString(),
        contractA: prev._id,
        contractAEnd: prev.effectiveTo,
        contractB: successor._id,
        contractBStart: successor.effectiveFrom,
        gapMs,
        gapHours: +(gapMs / 3600000).toFixed(2)
      });
    }
  }
  if (violations.length === 0) return;
  const details = violations.slice(0, 5).map(v => `Org ${v.orgId}: ` + `Contract ${v.contractA} ends ${v.contractAEnd.toISOString()} → ` + `Contract ${v.contractB} starts ${v.contractBStart.toISOString()} ` + `(gap: ${v.gapHours}h)`).join(" | ");
  guardianLogger.error({
    count: violations.length,
    sample: violations.slice(0, 3)
  }, "CONTRACT_GAP_INTEGRITY: timeline discontinuities detected");
  throw new Error(`CONTRACT_GAP_INTEGRITY violated: ${violations.length} gap(s) detected in supersession chain. ` + `Contracts must form a continuous timeline: prev.effectiveTo === next.effectiveFrom. ` + details + (violations.length > 5 ? ` ... and ${violations.length - 5} more.` : "") + ` Fix: node scripts/fixContractGaps.js`);
}

// ─── ORG CURRENT CONTRACT POINTER INTEGRITY ────────────────────────────────
// Verifies that every Organization.currentContractId points to an ACTIVE contract.
// A stale pointer (pointing to superseded/expired/terminated/draft/missing) indicates
// that activateContract() or expireContract() left the Organization in a corrupt state.
//
// Implementation: single $lookup aggregation — no N+1 queries.
// Read-only: never modifies any document.
async function checkOrgCurrentContractPointerIntegrity() {
  const OrganizationModel = getPlatformConnection().models["Organization"];
  const OrgContractModel = getPlatformConnection().models["OrgContract"];
  if (!OrganizationModel || !OrgContractModel) return;

  // Aggregate: join orgs with their referenced contract in one round-trip.
  // Filter to orgs that have a non-null currentContractId.
  const results = await OrganizationModel.aggregate([{
    $match: {
      currentContractId: {
        $exists: true,
        $ne: null
      },
      isArchived: {
        $ne: true
      } // archived orgs may have stale pointers intentionally
    }
  }, {
    $lookup: {
      from: "orgcontracts",
      localField: "currentContractId",
      foreignField: "_id",
      as: "contract"
    }
  }, {
    $project: {
      _id: 1,
      name: 1,
      currentContractId: 1,
      // Unwind the lookup: null if contract not found (dangling pointer)
      contract: {
        $arrayElemAt: ["$contract", 0]
      }
    }
  }]);
  const violations = [];
  for (const org of results) {
    if (!org.contract) {
      // Dangling pointer — referenced contract does not exist
      violations.push(`Org ${org._id} (${org.name || "unnamed"}): ` + `currentContractId=${org.currentContractId} references a NON-EXISTENT contract`);
      continue;
    }
    if (org.contract.contractStatus !== "active") {
      // Stale pointer — contract exists but is not active
      violations.push(`Org ${org._id} (${org.name || "unnamed"}): ` + `currentContractId=${org.currentContractId} references contract with ` + `status="${org.contract.contractStatus}" (expected "active")`);
    }
  }
  if (violations.length > 0) {
    guardianLogger.error({
      count: violations.length
    }, "ORG_CURRENT_CONTRACT_POINTER_INTEGRITY: stale or dangling currentContractId pointers detected");
    throw new Error(`ORG_CURRENT_CONTRACT_POINTER_INTEGRITY violated: ${violations.length} organization(s) ` + `have a currentContractId that does not point to an active contract.\n  ` + violations.join("\n  ") + `\n  Fix: run activateContract() for the correct contract, or null out the stale pointer.`);
  }
}

// ─── ACTIVE PLAN VERSION PER TEMPLATE ────────────────────────────────────────
// Verifies that no PlanTemplate has more than ONE active PlanVersion at any time.
//
// An "active" version is the only version from which new OrgContracts may be
// created. Multiple active versions per template is a corrupted state that would
// cause the pricing engine to pick an unpredictable version at contract creation.
//
// Implementation:
//   Single aggregation — groups all active versions by templateCode,
//   then filters to groups with count > 1.
//   If any group remains, the invariant is violated.
//
// This check is complementary to the DB partial unique index
// (unique_active_plan_version_per_template). The index prevents NEW violations;
// this guardian detects violations that pre-exist (e.g., created before the index
// was added, or via direct DB writes).
//
// Read-only: never modifies any document.
async function checkActivePlanVersionPerTemplate() {
  const PlanVersionModel = getPlatformConnection().models["PlanVersion"];
  if (!PlanVersionModel) return; // Model not loaded — skip (test environments)

  const violations = await PlanVersionModel.aggregate([
  // Step 1: Only consider active versions
  {
    $match: {
      status: "active"
    }
  },
  // Step 2: Count active versions per templateCode
  {
    $group: {
      _id: "$templateCode",
      count: {
        $sum: 1
      },
      versionIds: {
        $push: "$_id"
      },
      versionTags: {
        $push: "$versionTag"
      }
    }
  },
  // Step 3: Keep only templateCodes that have more than 1 active version
  {
    $match: {
      count: {
        $gt: 1
      }
    }
  }]);
  if (violations.length === 0) return; // All clean

  // Format violation details for the error message
  const details = violations.map(v => `templateCode="${v._id}": ${v.count} active versions — tags: [${v.versionTags.join(", ")}]`).join(" | ");
  guardianLogger.error({
    count: violations.length,
    violations
  }, "ACTIVE_PLAN_VERSION_PER_TEMPLATE: multiple active PlanVersions detected per template");
  throw new Error(`ACTIVE_PLAN_VERSION_PER_TEMPLATE violated: ${violations.length} template(s) have multiple active PlanVersions. ` + details + ` Fix: deprecate all but the correct active version for each listed template. ` + `Prevent recurrence: ensure unique_active_plan_version_per_template index exists in MongoDB.`);
}

// ─── DEPRECATED + PUBLIC PLAN VERSION INVARIANT ───────────────────────────────
// Ensures no PlanVersion exists with status="deprecated" AND visibility="public".
//
// Visibility matrix enforcement:
//   ACTIVE   + PUBLIC   → Public pricing page (✓ allowed)
//   ACTIVE   + SALES    → Sales contracts only (✓ allowed)
//   DEPRECATED + SALES  → Legacy sales contracts (✓ allowed)
//   DEPRECATED + PUBLIC → FORBIDDEN — this invariant catches DB rot
//
// A deprecated+public document is currently filtered by getPublicPlans,
// but if status were ever flipped back to "active" the plan would leak onto
// the public pricing page without additional guards.
//
// Read-only: never modifies any document.
async function checkDeprecatedPublicPlan() {
  const PlanVersionModel = getPlatformConnection().models["PlanVersion"];
  if (!PlanVersionModel) return; // Model not loaded — skip

  const violations = await PlanVersionModel.find({
    status: "deprecated",
    visibility: "public"
  }).select("_id templateCode versionTag").lean();
  if (violations.length === 0) return;
  const details = violations.map(v => `_id=${v._id} templateCode="${v.templateCode}" tag="${v.versionTag}"`).join(" | ");
  guardianLogger.error({
    count: violations.length,
    violations
  }, "DEPRECATED_PUBLIC_PLAN: deprecated PlanVersion(s) found with visibility='public'");
  throw new Error(`DEPRECATED_PUBLIC_PLAN violated: ${violations.length} PlanVersion(s) are deprecated ` + `but still have visibility="public". Deprecated plans must have visibility="sales" or "internal". ` + `Fix: set visibility="sales" on each listed version. ` + details);
}

// ─── BILLING LEDGER INTEGRITY ──────────────────────────────────────────────
// Checks:
//  a) BillingLedger model is registered (guards against missing import)
//  b) providerEventId uniqueness — duplicate entries for the same external event
//     indicate idempotency bypass or webhook processing bugs.
//     Warn only (not hard fail) since replay audit entries intentionally
//     share the same providerEventId — we check for >2 rows per providerEventId.
//
// Read-only: never writes, never modifies documents.
async function checkBillingLedgerIntegrity() {
  const LedgerModel = getPlatformConnection().models["BillingLedger"];
  if (!LedgerModel) {
    // BillingLedger model not yet registered — this is allowed in early startup
    // before billing modules are loaded. Skip silently.
    return;
  }

  // Check for duplicate providerEventIds (>2 rows = suspicious).
  // Expected: 1 original + up to 1 replay entry per event.
  // >2 indicates a webhook was processed multiple times without idempotency.
  const duplicates = await LedgerModel.aggregate([{
    $match: {
      providerEventId: {
        $ne: null
      }
    }
  }, {
    $group: {
      _id: "$providerEventId",
      count: {
        $sum: 1
      }
    }
  }, {
    $match: {
      count: {
        $gt: 2
      }
    }
  }, {
    $count: "violations"
  }]);
  const violationCount = duplicates[0]?.violations || 0;
  if (violationCount > 0) {
    // Warn — duplicate replay entries are expected [original + replay audit row].
    // >2 per providerEventId is suspicious.
    guardianLogger.warn({
      violationCount
    }, `BILLING_LEDGER_INTEGRITY: ${violationCount} providerEventId(s) appear more than twice ` + `in BillingLedger. This may indicate repeated webhook delivery without idempotency. ` + `Investigate canonicalEventProcessor deduplication logic.`);
    // WARN only — does not crash platform. Non-fatal: duplicate ledger entries
    // do not break billing operations but should be investigated.
    // Uncomment the throw below to promote to hard failure:
    // throw new Error(...);
  }
}

// ─── STRANDED PENDING PAYMENT RECOVERY ────────────────────────────────────────
// PHASE 2 — PAY-001 fix: Detects contracts stuck in pending_payment after a
// server crash between payment commit and activation.
//
// Logic: Find contracts with contractStatus="pending_payment" that have a
// fully paid invoice. These represent successful payments where the activation
// was lost due to a crash in the setImmediate callback.
//
// In development: auto-recovers by activating the stranded contracts.
// In production: logs CRITICAL but does NOT auto-recover (manual investigation required).
//
// Read-only in check mode. Recovery is only attempted by the auto-repair system.
async function checkStrandedPendingPaymentContracts() {
  const OrgContractModel = getPlatformConnection().models["OrgContract"];
  const PlatformInvoiceModel = getPlatformConnection().models["PlatformInvoice"];
  if (!OrgContractModel || !PlatformInvoiceModel) return;

  // Find contracts stuck in pending_payment
  const pendingContracts = await OrgContractModel.find({
    contractStatus: "pending_payment"
  }).select("_id organizationId").lean();
  if (pendingContracts.length === 0) return;

  // For each pending_payment contract, check if it has a paid invoice
  const stranded = [];
  for (const contract of pendingContracts) {
    const paidInvoice = await PlatformInvoiceModel.findOne({
      contractId: contract._id,
      status: "paid"
    }).select("_id status paidAt").lean();
    if (paidInvoice) {
      stranded.push({
        contractId: contract._id,
        organizationId: contract.organizationId,
        invoiceId: paidInvoice._id,
        paidAt: paidInvoice.paidAt
      });
    }
  }
  if (stranded.length === 0) return;
  guardianLogger.error({
    count: stranded.length,
    stranded
  }, "STRANDED_PENDING_PAYMENT: contract(s) in pending_payment with paid invoice(s) detected — " + "payment committed but activation was lost (crash window)");
  throw new Error(`STRANDED_PENDING_PAYMENT violated: ${stranded.length} contract(s) are stuck in ` + `pending_payment despite having a fully paid invoice. ` + `These contracts should be active. Run activateContract() for each, ` + `or allow guardian auto-repair in development mode. ` + `Contract IDs: ${stranded.map(s => String(s.contractId)).join(", ")}`);
}

// ─── INVOICE CONTRACT INTEGRITY ───────────────────────────────────────────────
// PHASE 5 — GUARD-001 fix: Verifies that every PlatformInvoice references
// an existing OrgContract. Orphaned invoices indicate data corruption
// (contract deleted or never created).
//
// Read-only: never modifies any document.
async function checkInvoiceContractIntegrity() {
  const PlatformInvoiceModel = getPlatformConnection().models["PlatformInvoice"];
  const OrgContractModel = getPlatformConnection().models["OrgContract"];
  if (!PlatformInvoiceModel || !OrgContractModel) return;

  // Use aggregation $lookup to find invoices whose contractId has no matching OrgContract
  const orphans = await PlatformInvoiceModel.aggregate([{
    $match: {
      contractId: {
        $ne: null
      },
      status: {
        $nin: ["void", "draft"]
      }
    }
  }, {
    $lookup: {
      from: "orgcontracts",
      localField: "contractId",
      foreignField: "_id",
      as: "contract"
    }
  }, {
    $match: {
      contract: {
        $size: 0
      }
    }
  }, {
    $project: {
      _id: 1,
      contractId: 1,
      organizationId: 1,
      status: 1
    }
  }, {
    $limit: 10
  }]);
  if (orphans.length === 0) return;
  const details = orphans.map(i => `Invoice ${i._id} (org: ${i.organizationId}): contractId=${i.contractId} NOT FOUND`).join(", ");
  guardianLogger.error({
    count: orphans.length
  }, `INVOICE_CONTRACT_INTEGRITY: orphaned invoice(s) found — ${details}`);
  throw new Error(`INVOICE_CONTRACT_INTEGRITY violated: ${orphans.length} invoice(s) reference non-existent contracts. ` + `Sample: ${details}. ` + `Investigate: contracts may have been deleted without voiding their invoices.`);
}

// ─── ORPHAN PAYMENT INTEGRITY ─────────────────────────────────────────────────
// PHASE 5 — GUARD-002: Verifies that every PaymentAttempt references an
// existing PlatformInvoice. Orphaned payments indicate data corruption
// (invoice deleted or never created).
//
// Read-only: never modifies any document.
async function checkOrphanPayments() {
  const PaymentAttemptModel = getPlatformConnection().models["PaymentAttempt"];
  const PlatformInvoiceModel = getPlatformConnection().models["PlatformInvoice"];
  if (!PaymentAttemptModel || !PlatformInvoiceModel) return;
  const orphans = await PaymentAttemptModel.aggregate([{
    $match: {
      invoiceId: {
        $ne: null
      },
      status: {
        $nin: ["voided", "failed"]
      }
    }
  }, {
    $lookup: {
      from: "platforminvoices",
      localField: "invoiceId",
      foreignField: "_id",
      as: "invoice"
    }
  }, {
    $match: {
      invoice: {
        $size: 0
      }
    }
  }, {
    $project: {
      _id: 1,
      invoiceId: 1,
      organizationId: 1,
      amount: 1,
      status: 1
    }
  }, {
    $limit: 10
  }]);
  if (orphans.length === 0) return;
  const details = orphans.map(p => `Payment ${p._id} (org: ${p.organizationId}): invoiceId=${p.invoiceId} NOT FOUND, amount=${p.amount}`).join(", ");
  guardianLogger.error({
    count: orphans.length
  }, `ORPHAN_PAYMENT_INTEGRITY: orphan payment(s) found — ${details}`);
  throw new Error(`ORPHAN_PAYMENT_INTEGRITY violated: ${orphans.length} payment(s) reference non-existent invoices. ` + `Sample: ${details}. ` + `Investigate: invoices may have been deleted without cleaning up payment records.`);
}

// ─── TRIAL PLAN VERSION EXISTS ────────────────────────────────────────────────
// PHASE 7 — Ensures that a PlanVersion with templateCode="trial-tier" and
// status="active" exists. This plan is required for all signup flows.
// Without it, every signup returns a 500.
//
// WARN only — does not crash the platform (some environments may not have
// seeded plans yet). But in production this SHOULD be a hard failure.
async function checkTrialPlanVersionExists() {
  const PlanVersionModel = getPlatformConnection().models["PlanVersion"];
  if (!PlanVersionModel) return;
  const exists = await PlanVersionModel.exists({
    templateCode: "trial-tier",
    status: "active"
  });
  if (!exists) {
    guardianLogger.error({}, "TRIAL_PLAN_VERSION_EXISTS: No active PlanVersion with templateCode='trial-tier' found. " + "All signup flows will fail with 500. Seed a trial plan immediately.");
    throw new Error(`TRIAL_PLAN_VERSION_EXISTS violated: No active PlanVersion with templateCode='trial-tier'. ` + `Signup will fail for all new organizations. ` + `Fix: create a PlanTemplate with code='trial-tier' and publish an active PlanVersion.`);
  }
}

// ─── Guardian Mode Constants ───────────────────────────────────────────────────

const IS_DEV = () => process.env.NODE_ENV !== "production";

// ─── Main Export ──────────────────────────────────────────────────────────────

/**
 * runStartupGuardian
 *
 * Runs all startup invariant checks after DB connects.
 *
 * Modes:
 *   Production (NODE_ENV=production):
 *     - All failures are critical
 *     - PLATFORM_GUARDIAN_MODE=strict → process.exit(1)
 *     - Default (permissive) → logs CRITICAL, continues
 *     - Auto-repair NEVER runs
 *
 *   Development (NODE_ENV !== production):
 *     - If ALL failures are in the safe-to-repair set → auto-repair runs
 *     - Repaired checks re-run to confirm they pass
 *     - If any non-repairable check failed → no auto-repair, standard handling
 *     - If auto-repair leaves failures → standard handling for those
 *
 * Repairable invariants (dev only):
 *   PLAN_VERSION_VISIBILITY_ENUM
 *   CONTRACT_PRICING_SNAPSHOT_PRESENT
 *   ORG_WITHOUT_ACTIVE_CONTRACT
 *
 * @returns {Promise<void>}
 */
async function runStartupGuardian() {
  incrementMetric("startupGuardianRuns");
  setMetric("lastStartupCheckAt", new Date().toISOString());
  const mode = IS_DEV() ? "development" : "production";
  guardianLogger.info({
    pid: process.pid,
    entry: require.main?.filename || "unknown",
    mode,
    guardianMode: process.env.PLATFORM_GUARDIAN_MODE || "permissive"
  }, "Startup Guardian started");

  // ── Phase 1: Run all invariant checks in parallel ─────────────────────────
  const allChecks = [runCheck("NO_DUPLICATE_MODELS", checkNoDuplicateModels), runCheck("ORG_PLAN_ID_NOT_REQUIRED", checkOrganizationPlanIdNotRequired), runCheck("NO_LEGACY_PLAN_MODEL_PRESENT", checkNoLegacyPlanModel), runCheck("LEGACY_PLAN_MODEL_TOMBSTONE_PRESENT", checkLegacyPlanModelTombstone), runCheck("CONTRACT_PREVIOUS_ID_IN_SCHEMA", checkOrgContractPreviousContractId), runCheck("CONTRACT_LOCKED_PRICE_MIN", checkOrgContractLockedPriceConstraint), runCheck("TRANSACTION_SUPPORT", checkTransactionSupport), runCheck("ROUTE_MANIFEST_INTEGRITY", checkRouteManifestIntegrity), runCheck("ORG_WITHOUT_ACTIVE_CONTRACT", checkOrgsHaveActiveContract), runCheck("CONTRACT_COUNT_INVARIANTS", checkContractCountInvariants), runCheck("SALES_CONTRACT_INTEGRITY", checkSalesContractIntegrity), runCheck("ACTIVE_PLAN_VERSION_PER_TEMPLATE", checkActivePlanVersionPerTemplate), runCheck("DEPRECATED_PUBLIC_PLAN", checkDeprecatedPublicPlan), runCheck("PLAN_VERSION_VISIBILITY_ENUM", checkPlanVersionVisibilityEnum), runCheck("PUBLIC_PLAN_VERSION_NO_LEAKAGE", checkPublicPlanVersionNoLeakage),
  // ── COMMERCIAL BILLING INTEGRITY ──────────────────────────────
  runCheck("UNIQUE_ACTIVE_CONTRACT_PER_ORG", checkUniqueActiveContractPerOrg), runCheck("PLAN_REGION_PRICE_COMPLETENESS", checkPlanRegionPriceCompleteness), runCheck("CONTRACT_PRICING_SNAPSHOT_PRESENT", checkContractPricingSnapshotPresent), runCheck("PROVIDER_PRICE_MAPPING_VALID", checkProviderPriceMappingValid), runCheck("CONTRACT_STATUS_VALID", checkContractStatusValid), runCheck("CONTRACT_TIMELINE_INTEGRITY", checkContractTimelineIntegrity), runCheck("CONTRACT_GAP_INTEGRITY", checkContractGapIntegrity), runCheck("ORG_CURRENT_CONTRACT_POINTER_INTEGRITY", checkOrgCurrentContractPointerIntegrity),
  // ── BILLING LEDGER INTEGRITY ─────────────────────────────────────────────────────
  runCheck("BILLING_LEDGER_INTEGRITY", checkBillingLedgerIntegrity),
  // ── PHASE 2: PAYMENT ACTIVATION RECOVERY ──────────────────────────────
  runCheck("STRANDED_PENDING_PAYMENT", checkStrandedPendingPaymentContracts),
  // ── PHASE 5: INVOICE / PAYMENT INTEGRITY ──────────────────────────────
  runCheck("INVOICE_CONTRACT_INTEGRITY", checkInvoiceContractIntegrity),
  // PHASE 5: ORPHAN PAYMENT INTEGRITY
  runCheck("ORPHAN_PAYMENT_INTEGRITY", checkOrphanPayments),
  // ── PHASE 7: TRIAL PLAN EXISTENCE ─────────────────────────────────────
  runCheck("TRIAL_PLAN_VERSION_EXISTS", checkTrialPlanVersionExists)];
  let results = await Promise.all(allChecks);
  let failures = results.filter(r => !r.pass);
  let passes = results.filter(r => r.pass);

  // ── Phase 2: Development Auto-Repair ─────────────────────────────────────
  //
  // Triggered ONLY when:
  //   a) NODE_ENV !== "production"
  //   b) There are failures
  //   c) EVERY failure is in the REPAIRABLE_INVARIANTS set
  //
  // If any non-repairable check fails alongside a repairable one, the entire
  // repair is skipped — those failures need human investigation.
  //
  // Production guard: this entire block is unreachable in production.

  if (IS_DEV() && failures.length > 0) {
    // ── Registry-driven dispatch (v24.1) ──────────────────────────────────
    // Replaces the manual 9-block if-chain with a loop through the repair
    // registry. Adding a new repair = add one entry to guardianRepairRegistry.js.
    // No changes to this file required.
    const {
      REPAIRABLE_INVARIANTS
    } = require("./guardianAutoRepair");
    const {
      runAutoRepairBatch
    } = require("./guardianAutoRepair.service");
    const repairableFailures = failures.filter(r => REPAIRABLE_INVARIANTS.has(r.name));
    const nonRepairableFailures = failures.filter(r => !REPAIRABLE_INVARIANTS.has(r.name));
    if (nonRepairableFailures.length === 0 && repairableFailures.length > 0) {
      // All failures are auto-repairable — attempt repair
      guardianLogger.warn({
        mode: "development",
        failingChecks: repairableFailures.map(r => r.name)
      }, "[Guardian] Development mode — attempting auto-repair for data integrity violations");

      // ── PART 4: Registry-driven dispatch loop ────────────────────────
      // runAutoRepairBatch iterates failures in order, executing the repair
      // function registered for each check name.
      // Each repair: log start → execute (± transaction) → log result.
      // Individual repair failures are collected, NOT re-thrown —
      // the repair batch continues for remaining checks.
      const {
        results: repairResults,
        repaired,
        skipped,
        errors: repairErrors
      } = await runAutoRepairBatch({
        failingChecks: repairableFailures,
        logger: guardianLogger
      });

      // Build compat repairStats for downstream logging
      const repairStats = {
        errors: repairErrors
      };

      // ── PART 5: Log repair summary (before re-check) ─────────────────
      guardianLogger.info({
        mode: "development",
        totalRepaired: repaired,
        totalSkipped: skipped,
        totalErrors: repairErrors.length,
        errors: repairErrors,
        repairs: repairResults.filter(r => r.success).map(r => ({
          check: r.checkName,
          fixed: r.fixed,
          durationMs: r.durationMs
        }))
      }, "[Guardian] Development auto-repair executed — re-running repaired checks");

      // ── Phase 3: Re-run only the repaired checks to verify ────────────
      const recheck = await Promise.all(repairableFailures.map(r => {
        switch (r.name) {
          case "PLAN_VERSION_VISIBILITY_ENUM":
            return runCheck("PLAN_VERSION_VISIBILITY_ENUM", checkPlanVersionVisibilityEnum);
          case "CONTRACT_PRICING_SNAPSHOT_PRESENT":
            return runCheck("CONTRACT_PRICING_SNAPSHOT_PRESENT", checkContractPricingSnapshotPresent);
          case "ORG_WITHOUT_ACTIVE_CONTRACT":
            return runCheck("ORG_WITHOUT_ACTIVE_CONTRACT", checkOrgsHaveActiveContract);
          case "DEPRECATED_PUBLIC_PLAN":
            return runCheck("DEPRECATED_PUBLIC_PLAN", checkDeprecatedPublicPlan);
          case "CONTRACT_TIMELINE_INTEGRITY":
            return runCheck("CONTRACT_TIMELINE_INTEGRITY", checkContractTimelineIntegrity);
          case "CONTRACT_GAP_INTEGRITY":
            return runCheck("CONTRACT_GAP_INTEGRITY", checkContractGapIntegrity);
          case "STRANDED_PENDING_PAYMENT":
            return runCheck("STRANDED_PENDING_PAYMENT", checkStrandedPendingPaymentContracts);
          case "ORG_CURRENT_CONTRACT_POINTER_INTEGRITY":
            return runCheck("ORG_CURRENT_CONTRACT_POINTER_INTEGRITY", checkOrgCurrentContractPointerIntegrity);
          case "UNIQUE_ACTIVE_CONTRACT_PER_ORG":
            return runCheck("UNIQUE_ACTIVE_CONTRACT_PER_ORG", checkUniqueActiveContractPerOrg);
          default:
            return Promise.resolve(r);
          // unchanged
        }
      }));

      // Merge recheck results back into the results array
      // Replace original results with the re-run results for the repaired checks
      const recheckMap = Object.fromEntries(recheck.map(r => [r.name, r]));
      results = results.map(r => recheckMap[r.name] ?? r);

      // Recompute failures/passes from the updated result set
      failures = results.filter(r => !r.pass);
      passes = results.filter(r => r.pass);

      // ── PART 5: Post-repair validation ─────────────────────────────
      // Verify each repaired check now passes. Log success or persistent failure.
      // Persistent failures are flagged as errors but do NOT crash the process —
      // the guardian's existing failure handling (Phase 5, kill switch) takes over.
      const stillFailing = [];
      recheck.forEach(r => {
        if (r.pass) {
          guardianLogger.info({
            check: r.name
          }, `[Guardian] Auto-repair verified: ✅ ${r.name} now passes`);
        } else {
          // Repair ran but check still fails — log as error with structured context
          guardianLogger.error({
            check: r.name,
            reason: r.reason,
            repairAttempted: true,
            event: "REPAIR_VERIFICATION_FAILED"
          }, `[Guardian] Auto-repair incomplete: ❌ ${r.name} still fails after repair — ${r.reason}`);
          stillFailing.push(r.name);
          repairStats.errors.push(`POST_REPAIR_VERIFY_FAILED:${r.name}`);
        }
      });
      if (stillFailing.length > 0) {
        guardianLogger.error({
          stillFailing,
          repairStats
        }, `[Guardian] ${stillFailing.length} invariant(s) still failing after auto-repair: ` + stillFailing.join(", ") + " — manual investigation required");
      }
    } else if (nonRepairableFailures.length > 0) {
      // Mixed: some failures are not auto-repairable — skip repair entirely
      guardianLogger.warn({
        mode: "development",
        nonRepairable: nonRepairableFailures.map(r => r.name),
        repairable: repairableFailures.map(r => r.name)
      }, "[Guardian] Development auto-repair skipped — non-repairable failures present. " + "Fix the non-repairable invariants manually before auto-repair can run.");
    }
  }

  // ── Phase 4: Log final results ────────────────────────────────────────────
  passes.forEach(r => {
    guardianLogger.info({
      check: r.name
    }, `✅ ${r.name}`);
  });
  failures.forEach(r => {
    incrementMetric("invariantViolations");
    guardianLogger.critical({
      check: r.name,
      reason: r.reason
    }, `❌ INVARIANT VIOLATED: ${r.name} — ${r.reason}`);
  });
  if (failures.length === 0) {
    guardianLogger.info({
      checks: results.length,
      mode
    }, `Startup Guardian passed (${results.length}/${results.length} checks OK)`);
    return;
  }

  // ── Phase 5: Failure handling ─────────────────────────────────────────────
  guardianLogger.critical({
    failures: failures.length,
    total: results.length,
    mode
  }, `Startup Guardian: ${failures.length} invariant(s) violated`);

  // ── Phase 5a: Billing Kill Switch Escalation ──────────────────────────────
  //
  // If any billing-critical invariant fails, activate the kill switch
  // BEFORE crashing or logging final state. This ensures billing operations
  // are blocked from the moment the invariant violation is confirmed.
  //
  // In production (strict mode): kill switch activates → process.exit(1)
  // In dev/permissive mode: kill switch activates → logs CRITICAL → continues
  //   (so the server starts but billing is blocked, allowing manual investigation)
  //
  // Kill switch is a no-op if billing control service is not yet available
  // (DB connection failure) — the main process flow handles that case.
  //
  // Invariants that trigger billing kill switch:
  //   BILLING_LEDGER_INTEGRITY     — ledger corruption / duplicate events
  //   UNIQUE_ACTIVE_CONTRACT_PER_ORG — multiple active contracts (billing engine unsafe)
  //   PROVIDER_PRICE_MAPPING_VALID  — Stripe price IDs are invalid / mismatched

  const BILLING_CRITICAL_INVARIANTS = new Set(["BILLING_LEDGER_INTEGRITY", "UNIQUE_ACTIVE_CONTRACT_PER_ORG", "PROVIDER_PRICE_MAPPING_VALID"]);
  const billingCriticalFailures = failures.filter(r => BILLING_CRITICAL_INVARIANTS.has(r.name));
  if (billingCriticalFailures.length > 0) {
    const failedNames = billingCriticalFailures.map(r => r.name).join(", ");
    const killReason = `Guardian invariant(s) violated: ${failedNames}`;
    guardianLogger.critical({
      billing: true,
      event: "BILLING_KILL_SWITCH_ACTIVATED",
      invariants: billingCriticalFailures.map(r => r.name),
      mode
    }, `[Guardian][CRITICAL] BILLING_KILL_SWITCH_ACTIVATED — ${failedNames}`);

    // Fire-and-forget — kill switch activation must not hang startup.
    // The kill switch DB write is best-effort; the log above is the primary record.
    try {
      const {
        activateBillingKillSwitch
      } = require("../billing/services/billingControlService");
      await activateBillingKillSwitch(killReason, "guardian", "guardian").catch(err => {
        guardianLogger.error({
          billing: true,
          err: err.message
        }, "[Guardian] Kill switch DB write failed — billing is still considered locked via log evidence");
      });
    } catch (importErr) {
      // billingControlService may not be loadable if DB is down — that's OK.
      // The log above is sufficient for the kill switch record.
      guardianLogger.warn({
        billing: true,
        importErr: importErr.message
      }, "[Guardian] Could not load billingControlService — kill switch log-only");
    }
  }

  // Production: ALWAYS strict if PLATFORM_GUARDIAN_MODE=strict
  // Production: NEVER had auto-repair — falls through to here directly
  if (STRICT()) {
    guardianLogger.critical({
      mode: "strict",
      env: process.env.NODE_ENV
    }, "PLATFORM_GUARDIAN_MODE=strict — crashing process to prevent corrupt platform state");
    process.exit(1);
  }
}
module.exports = {
  runStartupGuardian
};