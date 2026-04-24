/**
 * eslint-rules/index.js — Ortho Domain Enforcement Plugin
 *
 * Custom ESLint rules that enforce architectural invariants:
 *   1. no-controller-direct-model        — Controllers must use service layer
 *   2. require-route-rbac                — Write routes must have RBAC middleware
 *   3. no-hardcoded-query-keys           — React Query keys must use QK registry
 *   4. no-unsafe-zod-record              — Block untyped Zod records
 *
 * Write Contract Enforcement System v2.0 (Rules 2/3/5/6/8):
 *   5. require-transaction-multi-write   — Multi-step writes MUST use withTransaction
 *   6. no-unsafe-setimmediate-write      — Block setImmediate(async => DB_WRITE)
 *   7. no-find-then-create               — Block find+create race condition
 *   8. no-mongoose-start-session         — Org plane must use req.dbConnection.startSession()
 *   9. require-idempotency-financial     — Financial writes MUST have idempotency protection
 *
 * Usage in eslint.config.js:
 *   const orthoRules = require("./eslint-rules");
 *   { plugins: { "ortho-enforce": orthoRules }, rules: { ... } }
 */

"use strict";

module.exports = {
    rules: {
        // ── Original Rules ───────────────────────────────────────────────────
        "no-controller-direct-model":    require("./no-controller-direct-model"),
        "require-route-rbac":            require("./require-route-rbac"),
        "no-hardcoded-query-keys":       require("./no-hardcoded-query-keys"),
        "no-unsafe-zod-record":          require("./no-unsafe-zod-record"),

        // ── Write Contract Enforcement System v2.0 ───────────────────────────
        "require-transaction-multi-write":  require("./require-transaction-multi-write"),
        "no-unsafe-setimmediate-write":     require("./no-unsafe-setimmediate-write"),
        "no-find-then-create":              require("./no-find-then-create"),
        "no-mongoose-start-session":        require("./no-mongoose-start-session"),
        "require-idempotency-financial":    require("./require-idempotency-financial"),
    },
};
