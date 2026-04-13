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

      // ── RLS Decommission Guard (Phase 4) ─────────────────────────────
      // Permanently block legacy RLS imports
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
          ],
        },
      ],
    },
  },
];
