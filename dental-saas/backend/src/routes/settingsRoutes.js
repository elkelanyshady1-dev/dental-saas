/**
 * settingsRoutes.js — Org Settings Hub Sub-Router
 *
 * Phase H.3: Settings Hub Canonicalization — Bridge removed.
 *             moduleLoader now mounts directly at:
 *               /org/settings/security   (featureRegistry: basePath "settings/security")
 *               /org/settings/features   (featureRegistry: basePath "settings/features")
 *             Legacy /org/security and /org/features-control redirect via
 *             legacySettingsRedirect middleware in app.js (307 Temporary → 308 Permanent).
 *
 * MOUNT POINT: /api/v1/org/settings (child of orgV1Routes)
 * INHERITS: orgProtect → organizationContext → dbContext (from orgV1Routes.js)
 *
 * Route surface (this file):
 *   GET    /organization              → org settings read (contract-powered)
 *   PATCH  /organization/language    → language update
 *   use    /billing                  → Billing settings sub-router
 *   use    /support                  → Support sub-router
 *
 * Routes mounted by moduleLoader (NOT duplicated here):
 *   /settings/security/*  → security.routes.js (featureRegistry basePath: settings/security)
 *   /settings/features/*  → featuresControl.routes.js (featureRegistry basePath: settings/features)
 *
 * Branding (profile/logo) and org name update handled directly in orgV1Routes.js.
 * DO NOT add duplicate routes here.
 */

"use strict";

const express = require("express");
const router = express.Router();
const settingsController = require("../organization/controllers/settingsController");
const languageController = require("../modules/organization/settings/language.controller");
const timezoneController = require("../modules/organization/settings/timezone.controller");

// ── Settings Hub: Billing + Support bridges ───────────────────────────────────
const settingsBillingRoutes = require("./org/settingsBilling.routes");
const settingsSupportRoutes = require("./org/settingsSupport.routes");

// ── Organization settings read (contract-powered, Sprint 5) ──────────────────
// GET /api/v1/org/settings/organization
router.get("/organization", settingsController.getOrganizationSettings);

// ── Language update (v1.8.2) — RBAC enforced inside controller ───────────────
// PATCH /api/v1/org/settings/organization/language
router.patch("/organization/language", languageController.updateLanguage);

// ── Timezone update (v1.0) ────────────────────────────────────────────────────
// PATCH /api/v1/org/settings/organization/timezone
router.patch("/organization/timezone", timezoneController.updateTimezone);

// ── Settings Hub: Billing Bridge ─────────────────────────────────────────────
// /api/v1/org/settings/billing/*
router.use("/billing", settingsBillingRoutes);

// ── Settings Hub: Support Bridge ─────────────────────────────────────────────
// /api/v1/org/settings/support/*
router.use("/support", settingsSupportRoutes);

module.exports = router;
