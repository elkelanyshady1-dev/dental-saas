/**
 * billingSummary.service.js
 * Billing Domain — Analytics Delegation Shim
 *
 * ⚠️  MIGRATION COMPLETE (Phase 3 — accountingDomain)
 * ─────────────────────────────────────────────────────────────────
 * All analytics logic has been MOVED to:
 *   → accountingDomain/services/clinicAnalytics.service.js
 *
 * This file is a BACKWARD-COMPATIBLE SHIM only.
 * It re-exports the canonical service to keep existing imports working
 * without any breaking API changes.
 *
 * CLASSIFICATION: SHIM — zero logic, zero DB access, zero business rules.
 * PLANE: Org only
 *
 * DO NOT add logic here. Modify accountingDomain/services/clinicAnalytics.service.js instead.
 *
 * @deprecated Use accountingDomain/services/clinicAnalytics.service.js directly.
 * @module billingDomain/analytics/services/billingSummary.service (SHIM)
 */

"use strict";

// ── Backward-compatible re-export ────────────────────────────────────────────
// Any code that still imports billingSummary.service.js will transparently
// receive the canonical clinicAnalytics.service.js instance.
module.exports = require("@modules/accountingDomain/services/clinicAnalytics.service");
