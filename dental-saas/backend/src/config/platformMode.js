/**
 * platformMode.js
 * v19.0 — Centralized Platform Mode Resolution
 *
 * Controls whether Enterprise-only features (SSE, capability hash verification,
 * audit chain verification) are active. ALL mode checks must go through this
 * module — never scatter isEnterprise() checks across business logic files.
 *
 * Usage:
 *   const { isEnterprise } = require('./config/platformMode');
 *   if (!isEnterprise()) return; // short-circuit enterprise-only path
 *
 * Set in environment:
 *   PLATFORM_MODE=LEAN        (default — core gating only)
 *   PLATFORM_MODE=ENTERPRISE  (full distributed governance)
 */

const PLATFORM_MODE = process.env.PLATFORM_MODE || "LEAN";

const isEnterprise = () => PLATFORM_MODE === "ENTERPRISE";
const isLean = () => PLATFORM_MODE === "LEAN";

module.exports = { PLATFORM_MODE, isEnterprise, isLean };
