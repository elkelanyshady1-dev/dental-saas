/**
 * guardianRepairRegistry.js
 * Platform Guardian — Repair Dispatch Registry
 *
 * PURPOSE:
 * Single source of truth mapping Guardian check names → repair adapters.
 * The dispatch engine (guardianAutoRepair.service.js) uses this registry to
 * resolve and execute the correct repair for each failing invariant without
 * a growing if-chain.
 *
 * ── Adding a new repair ───────────────────────────────────────────────────────
 * 1. Implement the repair function in guardianAutoRepair.js
 * 2. Export it from guardianAutoRepair.js
 * 3. Add an entry to REPAIR_REGISTRY here
 * 4. Add the check name to REPAIRABLE_INVARIANTS in guardianAutoRepair.js
 *
 * ── Safety Rules (ABSOLUTE) ───────────────────────────────────────────────────
 * ✅ SAFE to auto-repair:
 *    - Pointer mismatches           (ORG_CURRENT_CONTRACT_POINTER_INTEGRITY)
 *    - Status drift                 (UNIQUE_ACTIVE_CONTRACT_PER_ORG)
 *    - Missing/invalid enum fields  (PLAN_VERSION_VISIBILITY_ENUM)
 *    - Missing metadata/snapshots   (CONTRACT_PRICING_SNAPSHOT_PRESENT)
 *    - Missing entity references    (ORG_WITHOUT_ACTIVE_CONTRACT)
 *    - Timeline misalignment        (CONTRACT_TIMELINE_INTEGRITY, CONTRACT_GAP_INTEGRITY)
 *    - Stranded state machine nodes (STRANDED_PENDING_PAYMENT)
 *
 * ❌ NEVER auto-repair (requires human investigation):
 *    - Financial ledger inconsistencies  (BILLING_LEDGER_INTEGRITY)
 *    - Invoice corruption                (INVOICE_CONTRACT_INTEGRITY)
 *    - Payment discrepancies             (ORPHAN_PAYMENT_INTEGRITY)
 *    - Hash chain violations             (LEDGER_HASH_CHAIN_VALID)
 *
 * PLANE: Platform
 */

"use strict";

const {
    repairVisibility,
    repairPricingSnapshot,
    repairOrgContracts,
    repairDeprecatedPublicPlans,
    repairContractTimeline,
    repairContractGaps,
    repairStrandedPendingPayment,
    repairContractPointer,
    repairDuplicateActiveContracts,
} = require("./guardianAutoRepair");

/**
 * REPAIR_REGISTRY
 *
 * Each entry shape:
 * {
 *   fn:            async ({ logger }) => number | object
 *                  The repair function, adapted to uniform signature.
 *                  Returns the count of items repaired (or a result object).
 *
 *   description:   string — human-readable summary for log messages
 *
 *   safetyClass:   "pointer" | "status" | "data" | "metadata"
 *                  Used for structured logging and future safety-gate enforcement.
 *                  NEVER "financial" — financial repairs are forbidden here.
 *
 *   useTransaction: boolean
 *                  When true, runAutoRepair wraps the fn in session.withTransaction().
 *                  Repair functions that manage their own sessions set this false.
 *                  Raw collection.updateMany repairs set this false (sessions are
 *                  irrelevant for single-operation atomic bulk writes).
 * }
 */
const REPAIR_REGISTRY = {

    // ─── Data / enum repairs ─────────────────────────────────────────────────

    PLAN_VERSION_VISIBILITY_ENUM: {
        fn: async ({ logger }) => repairVisibility(),
        description: "Set visibility='public' on PlanVersions with missing/invalid visibility field",
        safetyClass: "data",
        useTransaction: false,  // single collection.updateMany — inherently atomic
    },

    CONTRACT_PRICING_SNAPSHOT_PRESENT: {
        fn: async ({ logger }) => repairPricingSnapshot(),
        description: "Backfill pricingSnapshot on paid active contracts missing it",
        safetyClass: "metadata",
        useTransaction: false,  // collection.updateMany — inherently atomic
    },

    ORG_WITHOUT_ACTIVE_CONTRACT: {
        fn: async ({ logger }) => repairOrgContracts(logger),
        description: "Create active trial contract for orgs that have none",
        safetyClass: "data",
        useTransaction: false,  // repairOrgContracts manages per-org error handling internally
    },

    DEPRECATED_PUBLIC_PLAN: {
        fn: async ({ logger }) => repairDeprecatedPublicPlans(),
        description: "Set visibility='sales' on deprecated plans incorrectly marked public",
        safetyClass: "data",
        useTransaction: false,  // single collection.updateMany — inherently atomic
    },

    // ─── Timeline integrity repairs ──────────────────────────────────────────

    CONTRACT_TIMELINE_INTEGRITY: {
        fn: async ({ logger }) => repairContractTimeline(),
        description: "Align superseded contract effectiveTo to successor effectiveFrom (zero-overlap)",
        safetyClass: "data",
        useTransaction: false,  // per-contract collection.updateOne ops are independent
    },

    CONTRACT_GAP_INTEGRITY: {
        fn: async ({ logger }) => repairContractGaps(),
        description: "Close timeline gaps by adjusting successor effectiveFrom (zero-gap)",
        safetyClass: "data",
        useTransaction: false,  // per-contract collection.updateOne ops are independent
    },

    // ─── State machine recovery ───────────────────────────────────────────────

    STRANDED_PENDING_PAYMENT: {
        fn: async ({ logger }) => repairStrandedPendingPayment(logger),
        description: "Activate pending_payment contracts that already have a paid invoice",
        safetyClass: "status",
        useTransaction: false,  // repairStrandedPendingPayment calls contractActivation.service
                                // which manages its own session internally
    },

    // ─── Pointer integrity repairs (v24.0) ───────────────────────────────────

    ORG_CURRENT_CONTRACT_POINTER_INTEGRITY: {
        fn: async ({ logger }) => repairContractPointer(logger),
        description: "Repoint org.currentContractId to the correct active contract (or null it)",
        safetyClass: "pointer",
        useTransaction: true,   // pointer repair touches two collections (OrgContract + Organization)
                                // per org — wrap in transaction for atomic read-modify-write
    },

    // ─── Duplicate active contract repair (v24.0) ────────────────────────────

    UNIQUE_ACTIVE_CONTRACT_PER_ORG: {
        fn: async ({ logger }) => repairDuplicateActiveContracts(logger),
        description: "Supersede duplicate active contracts, keeping the most recently activated",
        safetyClass: "status",
        useTransaction: true,   // supersession touches OrgContract twice (aggregate read + updateOne)
                                // per org — transaction prevents race with concurrent activations
    },
};

/**
 * FINANCIAL_REPAIR_BLACKLIST
 *
 * Check names that are explicitly forbidden from auto-repair.
 * Any attempt to add them to REPAIR_REGISTRY must be rejected in code review.
 * These require human forensic investigation.
 */
const FINANCIAL_REPAIR_BLACKLIST = new Set([
    "BILLING_LEDGER_INTEGRITY",
    "INVOICE_CONTRACT_INTEGRITY",
    "ORPHAN_PAYMENT_INTEGRITY",
    "LEDGER_HASH_CHAIN_VALID",
]);

// Safety assertion: ensure no financial invariant was accidentally added
for (const checkName of Object.keys(REPAIR_REGISTRY)) {
    if (FINANCIAL_REPAIR_BLACKLIST.has(checkName)) {
        throw new Error(
            `[guardianRepairRegistry] SAFETY_VIOLATION: "${checkName}" is a financial invariant ` +
            `and must NEVER be added to REPAIR_REGISTRY. Remove it immediately.`
        );
    }
}

module.exports = { REPAIR_REGISTRY, FINANCIAL_REPAIR_BLACKLIST };
