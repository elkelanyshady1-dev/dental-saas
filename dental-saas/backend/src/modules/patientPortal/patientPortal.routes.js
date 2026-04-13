/**
 * patientPortal.routes.js
 * Phase 5 — Domain Consolidated: Full Security Stack on All Routes
 *
 * Mounted at: /api/v1/patient/portal
 *
 * Middleware chain:
 *   patientProtect → portalRLSContext → assertPortalRLS
 *   → attachPortalFeatures → [portalPermissionGuard] → [portalFieldFilter] → handler
 *
 * PHASE 5 COMPLETION:
 *   ✅ FLS now applied to ALL routes (dashboard, appointments, invoices, medical-history)
 *   ✅ No more "Phase 5: FLS pending" tags
 *   ✅ Permissions enforced on invoices + medical-history
 *
 * @per-org-transactional — portal data routes — full security stack enforced
 */

"use strict";

const express = require("express");
const router = express.Router();
const patientPortalController = require("./patientPortal.controller");
const patientProtect = require("../patientDomain/access/patientProtect");
const { portalRLSContext, assertPortalRLS } = require("../../middleware/portalContext");
const portalPermissionGuard = require("./middleware/portalPermissionGuard");
const { attachPortalFeatures } = require("./middleware/portalPermissionGuard");
const { portalFieldFilter } = require("./middleware/portalFieldFilter");

// ── Middleware Stack ─────────────────────────────────────────────────────────
// 1. patientProtect:      JWT verification → sets req.user, req.organizationId, req.patientId
// 2. portalRLSContext:    Builds req.rls from JWT claims (frozen, tamper-proof)
// 3. assertPortalRLS:     Safety assertion — fail-closed if req.rls missing
// 4. attachPortalFeatures: Exposes req.features for controller-level checks
router.use(patientProtect);
router.use(portalRLSContext);
router.use(assertPortalRLS);
router.use(attachPortalFeatures);

// ── Routes ───────────────────────────────────────────────────────────────────

// Dashboard — composite view (profile + appointment + financial)
// No permission guard — dashboard is basic portal access
router.get("/dashboard",
    portalFieldFilter("portalProfile"),
    (req, res) => patientPortalController.getDashboard(req, res)
);

// Appointments — list patient's appointments
// No permission guard — read access is basic portal access
router.get("/appointments",
    portalFieldFilter("portalAppointment"),
    (req, res) => patientPortalController.getAppointments(req, res)
);

// Invoices — requires canViewInvoices permission
router.get("/invoices",
    portalPermissionGuard("canViewInvoices"),
    portalFieldFilter("portalFinancial"),
    (req, res) => patientPortalController.getInvoices(req, res)
);

// Medical history — requires canViewMedicalHistory permission
router.get("/medical-history",
    portalPermissionGuard("canViewMedicalHistory"),
    portalFieldFilter("portalProfile"),
    (req, res) => patientPortalController.getMedicalHistory(req, res)
);

module.exports = router;
