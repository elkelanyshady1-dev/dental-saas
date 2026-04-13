/**
 * index.js
 * Platform Guardian Layer — Unified Entry Point
 *
 * Aggregates and re-exports all guardian module surfaces.
 * Integration point for server.js.
 *
 * Usage:
 *   const { runStartupGuardian, startRuntimeGuardian } = require('./src/platform/guardian');
 *
 * PLANE: Platform
 */

"use strict";

const { runStartupGuardian } = require("./startup.guardian");
const { startRuntimeGuardian, stopRuntimeGuardian, runRuntimeChecks } = require("./runtime.guardian");
const { wrappedProvisionOrganization, ProvisioningViolation } = require("./provisioning.guardian");
const {
    guardActivateContract,
    guardReplaceContract,
    guardTerminateContract,
    guardRenewContract
} = require("./commercial.guardian");
const {
    safeSerialize,
    guardianLogger,
    healthSnapshot,
    getPlatformMetrics
} = require("./observability.guardian");

module.exports = {
    // ── Startup ──────────────────────────────────────────────────────
    runStartupGuardian,

    // ── Runtime ──────────────────────────────────────────────────────
    startRuntimeGuardian,
    stopRuntimeGuardian,
    runRuntimeChecks,

    // ── Provisioning ─────────────────────────────────────────────────
    wrappedProvisionOrganization,
    ProvisioningViolation,

    // ── Commercial ───────────────────────────────────────────────────
    guardActivateContract,
    guardReplaceContract,
    guardTerminateContract,
    guardRenewContract,

    // ── Observability ─────────────────────────────────────────────────
    safeSerialize,
    guardianLogger,
    healthSnapshot,
    getPlatformMetrics
};
