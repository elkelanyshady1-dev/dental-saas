/**
 * writeContract.js
 * Write Contract Enforcement Engine v2.0 — Source of Truth
 *
 * Defines the canonical list of write safety rules enforced across:
 *   - Static analysis (ESLint custom rules)
 *   - Runtime guards (writeGuard.js)
 *   - CI invariant tests (writeContract.invariants.test.js)
 *   - AST auto-fix engine (scripts/enforceWriteContract.js)
 *
 * PLANE: Core Infrastructure (used by all planes)
 */

"use strict";

const WRITE_CONTRACT = {
    // R1: Controllers/routes must delegate DB writes to service layer
    NO_CONTROLLER_DB_WRITE: true,

    // R2: 2+ DB writes in same function → MUST use session.withTransaction()
    REQUIRE_TRANSACTION_MULTI_WRITE: true,

    // R3: No DB writes inside setImmediate or async IIFEs
    NO_SETIMMEDIATE_DB_WRITE: true,

    // R5: Financial operations MUST include idempotency protection
    REQUIRE_IDEMPOTENCY_FINANCIAL: true,

    // R6: No find-then-create race condition — use atomic upsert
    NO_FIND_THEN_CREATE: true,

    // R7: Session MUST come from req.dbConnection, not mongoose global
    REQUIRE_SESSION_FROM_REQ: true,

    // R8: mongoose.startSession() forbidden in org-plane code
    NO_MONGOOSE_START_SESSION: true,

    // R9: Critical updates (financial, contract) MUST use optimistic concurrency ($inc / __v)
    REQUIRE_OAV_ON_CRITICAL_UPDATES: true,
};

/**
 * RULE_METADATA — Maps rule keys to their ESLint rule names,
 * severity, and documentation descriptions.
 */
const RULE_METADATA = {
    NO_CONTROLLER_DB_WRITE: {
        eslintRule: "ortho-enforce/no-controller-direct-model",
        severity: "error",
        description: "Controllers must not perform DB writes. Use service layer.",
    },
    REQUIRE_TRANSACTION_MULTI_WRITE: {
        eslintRule: "ortho-enforce/require-transaction-multi-write",
        severity: "error",
        description: "Multi-step writes must be wrapped in session.withTransaction().",
    },
    NO_SETIMMEDIATE_DB_WRITE: {
        eslintRule: "ortho-enforce/no-unsafe-setimmediate-write",
        severity: "error",
        description: "setImmediate cannot contain DB writes.",
    },
    REQUIRE_IDEMPOTENCY_FINANCIAL: {
        eslintRule: "ortho-enforce/require-idempotency-financial",
        severity: "error",
        description: "Financial operations must include idempotency protection.",
    },
    NO_FIND_THEN_CREATE: {
        eslintRule: "ortho-enforce/no-find-then-create",
        severity: "error",
        description: "Use atomic upsert (findOneAndUpdate with upsert) instead of find-then-create.",
    },
    REQUIRE_SESSION_FROM_REQ: {
        eslintRule: "ortho-enforce/no-mongoose-start-session",
        severity: "error",
        description: "Use req.dbConnection.startSession() instead of mongoose.startSession().",
    },
    NO_MONGOOSE_START_SESSION: {
        eslintRule: "ortho-enforce/no-mongoose-start-session",
        severity: "error",
        description: "Org-plane must use req.dbConnection.startSession().",
    },
    REQUIRE_OAV_ON_CRITICAL_UPDATES: {
        eslintRule: null, // Enforced via runtime guard + invariant test
        severity: "error",
        description: "Critical updates must use optimistic concurrency ($inc / __v).",
    },
};

module.exports = { WRITE_CONTRACT, RULE_METADATA };
