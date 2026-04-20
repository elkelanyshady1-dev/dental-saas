/**
 * DentalSaaS Backend — ESLint Architecture Guard (CommonJS)
 * ──────────────────────────────────────────────────────────
 * Enforces Sentinel architecture invariants using eslint-plugin-boundaries.
 *
 * Plane Isolation Rules:
 *   ✅ Org Plane    → may import: @shared, @core, @utils, @infra, @events, @config, @middleware, @rbac
 *   ❌ Org Plane    → MUST NOT import: @platform/*, @billing/*
 *
 *   ✅ Platform     → may import: @shared, @core, @utils, @infra, @events, @config, @billing, @finance
 *   ❌ Platform     → MUST NOT import: @modules/*
 *
 *   ✅ Portal       → may import: shared utilities only
 *   ❌ Portal       → MUST NOT import from Org Plane modules outside portal scope
 *
 * Usage:
 *   npx eslint src/                   # full scan
 *   npx eslint src/platform/          # platform plane only
 *   npx eslint src/modules/           # org plane only
 */

"use strict";

const boundaries = require("eslint-plugin-boundaries");

/** @type {import("eslint").Linter.FlatConfig[]} */
module.exports = [
  // ── Ignore compiled and temporary files ───────────────────────────────────
  {
    ignores: [
      "node_modules/**",
      "dist/**",
      "coverage/**",
      "__alias_test.js",
      "__platform_migrate.js",
      "__inject_bootstrap.js",
      "__inject_gov_bootstrap.js",
    ],
  },

  // ── Architecture boundary enforcement ─────────────────────────────────────
  {
    files: ["src/**/*.js"],

    plugins: {
      boundaries,
    },

    settings: {
      "boundaries/elements": [
        // ── Organization Plane ────────────────────────────────────────────────
        {
          type: "org-modules",
          pattern: "src/modules",
          mode: "folder",
        },

        // ── Patient Portal (subset of org, but isolated) ───────────────────
        {
          type: "portal",
          pattern: "src/modules/patientDomain/access",
          mode: "folder",
        },
        {
          type: "portal",
          pattern: "src/modules/patientPortal",
          mode: "folder",
        },

        // ── Platform Plane ────────────────────────────────────────────────────
        {
          type: "platform",
          pattern: "src/platform",
          mode: "folder",
        },

        // ── Shared cross-cutting concerns ─────────────────────────────────────
        { type: "shared", pattern: "src/shared", mode: "folder" },
        { type: "core", pattern: "src/core", mode: "folder" },
        { type: "utils", pattern: "src/utils", mode: "folder" },
        { type: "infra", pattern: "src/infrastructure", mode: "folder" },
        { type: "middleware", pattern: "src/middleware", mode: "folder" },
        { type: "rbac", pattern: "src/rbac", mode: "folder" },
        { type: "config", pattern: "src/config", mode: "folder" },
        { type: "events", pattern: "src/events", mode: "folder" },
        { type: "governance", pattern: "src/governance", mode: "folder" },
      ],
    },

    rules: {
      /**
       * boundaries/element-types
       * ─────────────────────────
       * Cross-plane import isolation enforcement.
       *
       * Violation triggers:
       *   • Org module imports from src/platform/**
       *   • Platform module imports from src/modules/**
       *   • Portal imports from Org modules
       */
      "boundaries/element-types": [
        "error",
        {
          default: "allow",
          rules: [
            // ── Org Plane cannot import Platform Plane ────────────────────
            {
              from: ["org-modules"],
              disallow: ["platform"],
              message:
                "[SentinelGuard] Org Plane must not import from Platform Plane. " +
                "Use @shared, @core, @utils, @infra, or @middleware instead.",
            },

            // ── Platform Plane cannot import Org Modules ───────────────────
            {
              from: ["platform"],
              disallow: ["org-modules"],
              message:
                "[SentinelGuard] Platform Plane must not import from Org Modules. " +
                "Use @shared, @core, @utils, or @infra instead.",
            },

            // ── Portal cannot cross into Org Plane ─────────────────────────
            {
              from: ["portal"],
              disallow: ["org-modules"],
              message:
                "[SentinelGuard] Patient Portal must not import from Org Plane modules. " +
                "Portal is an isolated plane — use @shared, @core, @utils, @config only.",
            },
          ],
        },
      ],

      // ── RLS Decommission Guard (Phase 4) + Redis Eradication (Phase 6) ─
      // Permanently block legacy RLS imports and the removed Redis/BullMQ
      // stack. Reintroducing these is an architectural rollback — Phase 6
      // moved all async flows to QStash, locks to MongoDB, and rate limits
      // to in-memory lru-cache. If you hit a blocker because of this rule,
      // the right answer is to design around it, not to unblock the import.
      "no-restricted-modules": [
        "error",
        {
          paths: [
            { name: "@core/rls", message: "RLS removed (Phase 4). Use getModel(req.dbConnection, Def) + @core/guards." },
            { name: "@core/rls/secureModel", message: "secureModel removed. Use getModel(req.dbConnection, Def)." },
            { name: "@core/rls/systemContext", message: "systemContext removed. Use req.dbConnection for per-org access." },
            { name: "@core/rls/queryScoper", message: "queryScoper removed. Per-org mode uses DB-level isolation." },
            { name: "@core/rls/rlsAssertions", message: "Use @core/guards/tenantAssertions instead." },
            { name: "@core/rls/secureFlowAssertion", message: "Use @core/guards/flowMarkers instead." },
            { name: "ioredis", message: "Redis was removed in Phase 6. Use QStash for async jobs, MongoDB for durable state, and lru-cache for per-process caches." },
            { name: "bullmq", message: "BullMQ was removed in Phase 6. Async delivery flows through QStash webhooks (see src/infrastructure/communication/handlers/async.handler.js)." },
            { name: "bull", message: "Redis/BullMQ was removed in Phase 6 — see ioredis/bullmq messages above." },
            { name: "redis", message: "Redis was removed in Phase 6 — see ioredis message above." },
            { name: "@socket.io/redis-adapter", message: "Redis was removed in Phase 6. Socket.io runs single-instance; multi-instance needs a different pub/sub backend." },
            { name: "connect-redis", message: "Redis was removed in Phase 6. Sessions use JWT + plane-isolated stores, not a server-side session cache." },
            { name: "rate-limit-redis", message: "Redis was removed in Phase 6. Rate limits are per-process via lru-cache." },
            // QStash encapsulation: the ONLY sanctioned importers are
            // src/infrastructure/communication/handlers/async.handler.js (Client / publishJSON)
            // and src/jobs/controllers/job.controller.js (Receiver / signature verify).
            // Both files carry a scoped `eslint-disable-next-line no-restricted-modules`
            // on the require() line so the exception is reviewable at the point of use.
            // Any new caller should route through async.handler instead of adding another
            // disable comment.
            { name: "@upstash/qstash", message: "QStash is encapsulated. Route async delivery through src/infrastructure/communication/handlers/async.handler.js. Signature-verify only inside src/jobs/controllers/job.controller.js." },
          ],
        },
      ],

      // Companion guard for ESM `import` syntax (no-restricted-modules only covers CommonJS require()).
      // Defense-in-depth: if any file migrates to ESM, the Phase 6 Redis/BullMQ block still holds.
      "no-restricted-imports": [
        "error",
        {
          paths: [
            { name: "ioredis", message: "Redis was removed in Phase 6. Use QStash for async jobs, MongoDB for durable state, and lru-cache for per-process caches." },
            { name: "bullmq", message: "BullMQ was removed in Phase 6. Async delivery flows through QStash webhooks (see src/infrastructure/communication/handlers/async.handler.js)." },
            { name: "bull", message: "Redis/BullMQ was removed in Phase 6 — see ioredis/bullmq messages above." },
            { name: "redis", message: "Redis was removed in Phase 6 — see ioredis message above." },
            { name: "@socket.io/redis-adapter", message: "Redis was removed in Phase 6. Socket.io runs single-instance; multi-instance needs a different pub/sub backend." },
            { name: "connect-redis", message: "Redis was removed in Phase 6. Sessions use JWT + plane-isolated stores, not a server-side session cache." },
            { name: "rate-limit-redis", message: "Redis was removed in Phase 6. Rate limits are per-process via lru-cache." },
            { name: "@upstash/qstash", message: "QStash is encapsulated. Route async delivery through src/infrastructure/communication/handlers/async.handler.js. Signature-verify only inside src/jobs/controllers/job.controller.js." },
          ],
        },
      ],

      // ── Unsafe Model Access Guard (C0 Hardening) ──────────────────────
      // Direct model access via `require('./foo.model')` is unsafe:
      // our model files export `{ modelName, schema, default }` — not a
      // Mongoose model. Callers must bind through `getModel(conn, Def)` or
      // via `.default` (shared-DB only).
      //
      // The authoritative check runs as `scripts/scan-unsafe-models.js`
      // during `npm run check:models` and CI — ESLint's AST language isn't
      // expressive enough to ban *only* the misuse without flagging safe
      // patterns, so we keep enforcement in the scanner.

      // ── Zod v4 Migration Guard ────────────────────────────────────────
      // Zod v4 changed `z.record(value)` → `z.record(keySchema, valueSchema)`.
      // Single-arg form silently produces a malformed schema — the constructor
      // does not throw, but `.parse()`/`.safeParse()` crashes with
      // `TypeError: Cannot read properties of undefined (reading '_zod')`.
      // Caught a production 500 in PATCH /orthodontic-cases/:id/workflow.
      "no-restricted-syntax": [
        "error",
        {
          selector:
            "CallExpression[callee.object.name='z'][callee.property.name='record'][arguments.length<2]",
          message:
            "Zod v4: z.record requires (keySchema, valueSchema). Single-arg form silently produces a malformed schema. Use z.record(z.string(), valueSchema).",
        },
      ],
    },
  },
];
