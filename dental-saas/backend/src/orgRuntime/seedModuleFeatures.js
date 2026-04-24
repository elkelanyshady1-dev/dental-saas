/**
 * seedModuleFeatures.js — OrgRuntime FeatureDefinition Seeds
 *
 * Idempotently seeds FeatureDefinition records for all MODULE_REGISTRY entries.
 * Safe to run multiple times — uses upsert by key.
 *
 * Run via:
 *   node backend/src/orgRuntime/seedModuleFeatures.js
 *
 * Or call programmatically from server startup (optional):
 *   require("./seedModuleFeatures").seed();
 *
 * ── CRITICAL ──────────────────────────────────────────────────────────────────
 * This script ONLY upserts module-level feature records.
 * It does NOT modify:
 *   - Organization records
 *   - Platform routes
 *   - Stripe or billing logic
 *   - Audit chains
 *   - JWT structure
 * ──────────────────────────────────────────────────────────────────────────────
 */

"use strict";

const getPlatformModel = require("@core/db/getPlatformModel");
const mongoose = require("mongoose");
const FeatureDefinitionDef = require("../shared/models/FeatureDefinition");
const FeatureDefinition = getPlatformModel(FeatureDefinitionDef);
const {
  MODULE_REGISTRY
} = require("../platform/featureRegistry");

/**
 * Module → FeatureDefinition seed data
 * Maps registry keys to their feature metadata for the platform admin UI.
 */
const MODULE_FEATURE_SEEDS = [{
  key: "module.patients",
  name: "Patient Management",
  description: "Core patient registration, clinical records, documents, and portal access",
  category: "clinical",
  defaultEnabled: true,
  isCore: true,
  allowedPlans: ["basic", "pro", "enterprise"]
}, {
  key: "module.notifications",
  name: "Notification Engine",
  description: "Real-time org notifications, bell alerts, delivery tracking",
  category: "admin",
  defaultEnabled: true,
  isCore: true,
  allowedPlans: ["basic", "pro", "enterprise"]
}, {
  key: "module.booking",
  name: "Patient Booking Portal",
  description: "Patient self-scheduling, slot management, staff approval workflow",
  category: "clinical",
  defaultEnabled: false,
  isCore: false,
  allowedPlans: ["pro", "enterprise"]
}, {
  key: "module.analytics",
  name: "Business Analytics",
  description: "Revenue dashboards, appointment analytics, patient trend reports",
  category: "financial",
  defaultEnabled: false,
  isCore: false,
  allowedPlans: ["pro", "enterprise"]
}, {
  key: "module.inventory",
  name: "Inventory Management",
  description: "Stock tracking, supply orders, consumption reporting",
  category: "admin",
  defaultEnabled: false,
  isCore: false,
  allowedPlans: ["enterprise"]
}];

/**
 * seed() — Idempotent upsert of all module FeatureDefinition records.
 * @returns {Promise<void>}
 */
async function seed() {
  let ownConnection = false;
  if (mongoose.connection.readyState !== 1) {
    // CLI seed — connects via the platform URI in v9.4 (legacy MONGO_URI removed).
    const uri = process.env.MONGO_URI_PLATFORM || process.env.MONGO_URI_DEV_SINGLE;
    if (!uri) {
      throw new Error("[seedModuleFeatures] MONGO_URI_PLATFORM (or MONGO_URI_DEV_SINGLE) is required");
    }
    await mongoose.connect(uri, {
      serverSelectionTimeoutMS: 5000
    });
    ownConnection = true;
  }
  console.log("[seedModuleFeatures] Starting FeatureDefinition upserts…");
  for (const seedData of MODULE_FEATURE_SEEDS) {
    await FeatureDefinition.findOneAndUpdate({
      key: seedData.key
    }, {
      $set: seedData
    }, {
      upsert: true,
      new: true,
      setDefaultsOnInsert: true
    });
    console.log(`  ✓ ${seedData.key} — ${seedData.name}`);
  }
  console.log("[seedModuleFeatures] Done.");
  if (ownConnection) {
    await mongoose.disconnect();
  }
}

// Support direct execution
if (require.main === module) {
  require("dotenv").config({
    path: require("path").join(__dirname, "../../../.env")
  });
  seed().catch(err => {
    console.error("[seedModuleFeatures] Fatal error:", err);
    process.exit(1);
  });
}
module.exports = {
  seed
};